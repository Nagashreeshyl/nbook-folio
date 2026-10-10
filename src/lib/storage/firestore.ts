import { randomUUID } from "crypto";
import type { App } from "firebase-admin/app";
import {
  cert,
  getApps,
  initializeApp,
  type Credential,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type Firestore,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;
import type { AccessKey, Block, Book, Chapter, Page, PresenceEntry, Role } from "@/types/models";
import { DEFAULT_BOOK_SETTINGS } from "@/types/models";
import {
  type BookPatch,
  type BookRealtimeEvent,
  type CreateBlockInput,
  type CreateBookInput,
  type FilePayload,
  type PageRealtimeEvent,
  type StorageDriver,
  type StoredFile,
  type Unsubscribe,
  conflict,
  hydrateBook,
  notFound,
} from "./types";

/**
 * Firestore layout (all access is server-side, never from the browser):
 *
 *   books/{bookId}
 *   books/{bookId}/chapters/{chapterId}
 *   books/{bookId}/pages/{pageId}          (chapterId + order fields)
 *   books/{bookId}/pages/{pageId}/blocks/{blockId}
 *   books/{bookId}/keys/{keyId}
 *   books/{bookId}/presence/{sessionId}
 *
 * Pages are stored directly under the book (not nested under chapters) so that
 * listing/moving pages between chapters never has to rewrite a document path.
 * The logical hierarchy is preserved through `chapterId` + `order`.
 */

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "notebook";
}

function nextOrder(items: Array<{ order: number }>): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.order)) + 1;
}

function sortedByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function stripUndefined<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Firestore NOT_FOUND, whether reported as a gRPC code or a string. */
function isFirestoreNotFound(error: unknown): boolean {
  const code = (error as { code?: number | string } | null)?.code;
  return code === 5 || code === 404 || code === "not-found" || code === "firestore/not-found";
}

let cachedApp: App | null | undefined;

function resolveServiceAccount(): Credential | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  // The value is JSON. `JSON.parse` already turns the `\n` escapes inside the
  // private key into real newlines, so we must NOT pre-replace them in the raw
  // string — doing that injects literal newlines into the JSON and makes it
  // unparseable. If a provider stored the key double-escaped (`\\n`), the
  // parsed `private_key` still carries `\n` text, which we normalise after.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Fallback for values stored with real newlines in the private key (which
    // are invalid JSON): escape bare newlines inside the string, then retry.
    try {
      parsed = JSON.parse(raw.replace(/\n/g, "\\n")) as Record<string, unknown>;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }
  }
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return cert(parsed as ServiceAccount);
}

export function isFirestoreConfigured(): boolean {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_PROJECT_ID,
  );
}

function getApp(): App {
  if (cachedApp !== undefined && cachedApp !== null) return cachedApp;
  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return existing;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
  const credential = resolveServiceAccount();
  const app = initializeApp({
    ...(credential ? { credential } : {}),
    ...(projectId ? { projectId } : {}),
    ...(process.env.FIREBASE_STORAGE_BUCKET
      ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }
      : {}),
  });
  cachedApp = app;
  return app;
}

export class FirestoreDriver implements StorageDriver {
  readonly kind = "firestore" as const;

  private readonly db: Firestore;

  constructor() {
    this.db = getFirestore(getApp());
  }

  private bucket(): Bucket {
    const name =
      process.env.FIREBASE_STORAGE_BUCKET ??
      `${process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT}.appspot.com`;
    return getStorage(getApp()).bucket(name);
  }

  /* ---------------------------------------------------------------- */
  /* Books                                                             */
  /* ---------------------------------------------------------------- */

  private bookRef(bookId: string) {
    return this.db.collection("books").doc(bookId);
  }

  private chaptersCol(bookId: string) {
    return this.bookRef(bookId).collection("chapters");
  }

  private pagesCol(bookId: string) {
    return this.bookRef(bookId).collection("pages");
  }

  private blocksCol(bookId: string, pageId: string) {
    return this.pagesCol(bookId).doc(pageId).collection("blocks");
  }

  private keysCol(bookId: string) {
    return this.bookRef(bookId).collection("keys");
  }

  private presenceCol(bookId: string) {
    return this.bookRef(bookId).collection("presence");
  }

  /** Top-level collection for Firestore-backed file blobs (free Spark plan). */
  private filesCol() {
    return this.db.collection("files");
  }

  /** A storage path contains "/", which is illegal in a Firestore doc id. */
  private fileDocId(storagePath: string): string {
    return storagePath.replace(/\//g, "__");
  }

  async createBook(input: CreateBookInput): Promise<Book> {
    const now = Date.now();
    const id = randomUUID();
    const base = slugify(input.name);
    let slug = base;
    // Slug uniqueness is check-then-write, so verify *after* the write and
    // rename ourselves if a concurrent create won the race — otherwise one
    // notebook's link would unlock the other one.
    for (let attempt = 0; attempt < 5; attempt++) {
      const book: Book = {
        id,
        name: input.name.trim(),
        slug,
        description: input.description?.trim() ?? "",
        cover: null,
        createdAt: now,
        updatedAt: now,
        settings: { ...DEFAULT_BOOK_SETTINGS },
      };
      await this.bookRef(id).set(book);
      const clash = await this.db
        .collection("books")
        .where("slug", "==", slug)
        .limit(5)
        .get();
      if (clash.docs.every((doc) => doc.id === id) || attempt === 4) return book;
      slug = `${base}-${randomUUID().slice(0, 6)}`;
    }
    /* istanbul ignore next — the loop always returns. */
    throw new Error("unreachable");
  }

  async getBook(bookId: string): Promise<Book | null> {
    const snap = await this.bookRef(bookId).get();
    return snap.exists ? hydrateBook({ id: snap.id, ...snap.data() } as Book) : null;
  }

  async getBookBySlug(slug: string): Promise<Book | null> {
    const snap = await this.db.collection("books").where("slug", "==", slug).limit(1).get();
    const doc = snap.docs[0];
    return doc ? hydrateBook({ id: doc.id, ...doc.data() } as Book) : null;
  }

  async listBooks(): Promise<Book[]> {
    // Capped rather than unbounded: past this the library would silently stop
    // listing, but an unbounded read on a large account is worse. LocalDriver
    // has no such cap because it reads one file.
    const snap = await this.db.collection("books").orderBy("updatedAt", "desc").limit(500).get();
    return snap.docs.map((d) => hydrateBook({ id: d.id, ...d.data() } as Book));
  }

  async updateBook(bookId: string, patch: BookPatch): Promise<Book> {
    const ref = this.bookRef(bookId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound("Book");
      const current = hydrateBook({ id: snap.id, ...snap.data() } as Book);
      const next: Book = hydrateBook({
        ...current,
        ...patch,
        id: current.id,
        settings: { ...DEFAULT_BOOK_SETTINGS, ...current.settings, ...(patch.settings ?? {}) },
        updatedAt: Date.now(),
      });
      // Transactional so two tabs patching different fields cannot lose one.
      tx.set(ref, stripUndefined(next as unknown as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.deleteCollection(this.bookRef(bookId).collection("presence"));
    await this.deleteCollection(this.bookRef(bookId).collection("keys"));
    const pages = await this.pagesCol(bookId).get();
    for (const page of pages.docs) {
      await this.deleteCollection(page.ref.collection("blocks"));
    }
    await this.deleteCollection(this.pagesCol(bookId));
    await this.deleteCollection(this.chaptersCol(bookId));
    await this.bookRef(bookId).delete();
    // Attachments live outside Firestore; deleting the notebook must take its
    // uploads with it. Best-effort: storage unavailability must not block the
    // notebook deletion itself.
    try {
      await this.bucket().deleteFiles({ prefix: `${bookId}/` });
    } catch {
      /* nothing to remove, or Storage is unreachable */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Chapters                                                          */
  /* ---------------------------------------------------------------- */

  async listChapters(bookId: string): Promise<Chapter[]> {
    const snap = await this.chaptersCol(bookId).orderBy("order").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Chapter);
  }

  async getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
    const snap = await this.chaptersCol(bookId).doc(chapterId).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as Chapter) : null;
  }

  async createChapter(
    bookId: string,
    input: { title: string; description?: string },
  ): Promise<Chapter> {
    const existing = await this.listChapters(bookId);
    const now = Date.now();
    const chapter: Chapter = {
      id: randomUUID(),
      bookId,
      title: input.title.trim() || "Untitled chapter",
      description: input.description?.trim() ?? "",
      order: nextOrder(existing),
      createdAt: now,
      updatedAt: now,
    };
    await this.chaptersCol(bookId).doc(chapter.id).set(chapter);
    await this.touchBook(bookId);
    return chapter;
  }

  async updateChapter(
    bookId: string,
    chapterId: string,
    patch: Partial<Chapter>,
  ): Promise<Chapter> {
    const ref = this.chaptersCol(bookId).doc(chapterId);
    const next = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound("Chapter");
      const current = { id: snap.id, ...snap.data() } as Chapter;
      const updated: Chapter = {
        ...current,
        ...patch,
        id: current.id,
        bookId,
        updatedAt: Date.now(),
      };
      tx.set(ref, stripUndefined(updated as unknown as Record<string, unknown>), { merge: true });
      return updated;
    });
    await this.touchBook(bookId);
    return next;
  }

  async deleteChapter(bookId: string, chapterId: string): Promise<void> {
    const chapter = await this.getChapter(bookId, chapterId);
    if (!chapter) throw notFound("Chapter");
    const pages = await this.pagesCol(bookId).where("chapterId", "==", chapterId).get();
    for (const page of pages.docs) {
      await this.deletePage(bookId, page.id);
    }
    await this.chaptersCol(bookId).doc(chapterId).delete();
    await this.touchBook(bookId);
  }

  async reorderChapters(bookId: string, orderedIds: string[]): Promise<Chapter[]> {
    const current = await this.listChapters(bookId);
    const byId = new Map(current.map((c) => [c.id, c]));
    const ordered: Chapter[] = [];
    orderedIds.forEach((id, index) => {
      const chapter = byId.get(id);
      if (chapter) {
        byId.delete(id);
        ordered.push({ ...chapter, order: index, updatedAt: Date.now() });
      }
    });
    for (const rest of sortedByOrder([...byId.values()])) {
      ordered.push({ ...rest, order: ordered.length, updatedAt: Date.now() });
    }
    const batch = this.db.batch();
    for (const chapter of ordered) {
      batch.set(this.chaptersCol(bookId).doc(chapter.id), chapter, { merge: true });
    }
    await batch.commit();
    await this.touchBook(bookId);
    return ordered;
  }

  /* ---------------------------------------------------------------- */
  /* Pages                                                             */
  /* ---------------------------------------------------------------- */

  async listPages(bookId: string): Promise<Page[]> {
    const snap = await this.pagesCol(bookId).get();
    return sortedByOrder(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Page));
  }

  async getPage(bookId: string, pageId: string): Promise<Page | null> {
    const snap = await this.pagesCol(bookId).doc(pageId).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as Page) : null;
  }

  async createPage(bookId: string, chapterId: string, input: { title: string }): Promise<Page> {
    const chapter = await this.getChapter(bookId, chapterId);
    if (!chapter) throw notFound("Chapter");
    const siblings = (await this.listPages(bookId)).filter((p) => p.chapterId === chapterId);
    const now = Date.now();
    const page: Page = {
      id: randomUUID(),
      bookId,
      chapterId,
      title: input.title.trim() || "Untitled page",
      order: nextOrder(siblings),
      createdAt: now,
      updatedAt: now,
    };
    await this.pagesCol(bookId).doc(page.id).set(page);
    await this.touchBook(bookId);
    return page;
  }

  async updatePage(bookId: string, pageId: string, patch: Partial<Page>): Promise<Page> {
    const ref = this.pagesCol(bookId).doc(pageId);
    const next = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound("Page");
      const current = { id: snap.id, ...snap.data() } as Page;
      const updated: Page = { ...current, ...patch, id: current.id, bookId, updatedAt: Date.now() };
      tx.set(ref, stripUndefined(updated as unknown as Record<string, unknown>), { merge: true });
      return updated;
    });
    await this.touchBook(bookId);
    return next;
  }

  async deletePage(bookId: string, pageId: string): Promise<void> {
    const page = await this.getPage(bookId, pageId);
    if (!page) throw notFound("Page");
    await this.deleteCollection(this.blocksCol(bookId, pageId));
    await this.pagesCol(bookId).doc(pageId).delete();
    await this.touchBook(bookId);
  }

  async duplicatePage(bookId: string, pageId: string): Promise<Page> {
    const source = await this.getPage(bookId, pageId);
    if (!source) throw notFound("Page");
    const now = Date.now();
    const copy: Page = {
      ...source,
      id: randomUUID(),
      title: `${source.title} (copy)`,
      order: nextOrder(
        (await this.listPages(bookId)).filter((p) => p.chapterId === source.chapterId),
      ),
      createdAt: now,
      updatedAt: now,
    };
    await this.pagesCol(bookId).doc(copy.id).set(copy);

    const blocks = sortedByOrder(await this.listBlocks(bookId, pageId));
    const batch = this.db.batch();
    for (const block of blocks) {
      const id = randomUUID();
      batch.set(this.blocksCol(bookId, copy.id).doc(id), {
        ...structuredClone(block),
        id,
        pageId: copy.id,
        rev: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
    await this.touchBook(bookId);
    return copy;
  }

  async reorderPages(bookId: string, chapterId: string, orderedIds: string[]): Promise<Page[]> {
    const pages = (await this.listPages(bookId)).filter((p) => p.chapterId === chapterId);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const ordered: Page[] = [];
    orderedIds.forEach((id, index) => {
      const page = byId.get(id);
      if (page) {
        byId.delete(id);
        ordered.push({ ...page, order: index, updatedAt: Date.now() });
      }
    });
    for (const rest of sortedByOrder([...byId.values()])) {
      ordered.push({ ...rest, order: ordered.length, updatedAt: Date.now() });
    }
    const batch = this.db.batch();
    for (const page of ordered) {
      batch.set(this.pagesCol(bookId).doc(page.id), page, { merge: true });
    }
    await batch.commit();
    await this.touchBook(bookId);
    return ordered;
  }

  /* ---------------------------------------------------------------- */
  /* Blocks                                                            */
  /* ---------------------------------------------------------------- */

  async listBlocks(bookId: string, pageId: string): Promise<Block[]> {
    const snap = await this.blocksCol(bookId, pageId).get();
    return sortedByOrder(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Block));
  }

  async listBlocksForBook(bookId: string): Promise<Block[]> {
    const snap = await this.db
      .collectionGroup("blocks")
      .where("bookId", "==", bookId)
      .get();
    return sortedByOrder(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Block));
  }

  async getBlock(bookId: string, pageId: string, blockId: string): Promise<Block | null> {
    const snap = await this.blocksCol(bookId, pageId).doc(blockId).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as Block) : null;
  }

  async createBlock(bookId: string, pageId: string, input: CreateBlockInput): Promise<Block> {
    const page = await this.getPage(bookId, pageId);
    if (!page) throw notFound("Page");
    const existing = await this.listBlocks(bookId, pageId);
    let order: number;
    if (input.afterBlockId) {
      const anchor = existing.find((b) => b.id === input.afterBlockId);
      order = anchor ? anchor.order + 0.5 : nextOrder(existing);
    } else if (typeof input.index === "number") {
      order = input.index;
    } else {
      order = nextOrder(existing);
    }
    const now = Date.now();
    const block: Block = {
      id: randomUUID(),
      bookId,
      pageId,
      type: input.type,
      order,
      content: input.content,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.blocksCol(bookId, pageId).doc(block.id).set(block);

    // Keep stored orders dense.
    const normalised = sortedByOrder(await this.listBlocks(bookId, pageId)).map((b, index) => ({
      ...b,
      order: index,
    }));
    const batch = this.db.batch();
    for (const b of normalised) {
      batch.set(this.blocksCol(bookId, pageId).doc(b.id), { order: b.order }, { merge: true });
    }
    await batch.commit();
    await this.touchPage(bookId, pageId);
    return { ...block, order: normalised.find((b) => b.id === block.id)?.order ?? order };
  }

  async updateBlock(
    bookId: string,
    pageId: string,
    blockId: string,
    patch: { content: unknown },
    baseRev: number,
    sessionId?: string,
  ): Promise<Block> {
    const ref = this.blocksCol(bookId, pageId).doc(blockId);
    const result = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound("Block");
      const current = { id: snap.id, ...snap.data() } as Block;
      if (current.rev !== baseRev) {
        throw conflict(
          `Block was modified elsewhere (expected rev ${baseRev}, found ${current.rev}).`,
        );
      }
      const next: Block = {
        ...current,
        content: patch.content as Block["content"],
        rev: current.rev + 1,
        updatedAt: Date.now(),
        ...(sessionId ? { updatedBy: sessionId } : {}),
      };
      tx.set(ref, next);
      return next;
    });
    await this.touchPage(bookId, pageId);
    return result;
  }

  async deleteBlock(bookId: string, pageId: string, blockId: string): Promise<void> {
    const block = await this.getBlock(bookId, pageId, blockId);
    if (!block) throw notFound("Block");
    await this.blocksCol(bookId, pageId).doc(blockId).delete();
    await this.touchPage(bookId, pageId);
  }

  async reorderBlocks(
    bookId: string,
    pageId: string,
    orderedIds: string[],
  ): Promise<Block[]> {
    const blocks = await this.listBlocks(bookId, pageId);
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const ordered: Block[] = [];
    orderedIds.forEach((id, index) => {
      const block = byId.get(id);
      if (block) {
        byId.delete(id);
        ordered.push({ ...block, order: index, updatedAt: Date.now() });
      }
    });
    for (const rest of sortedByOrder([...byId.values()])) {
      ordered.push({ ...rest, order: ordered.length, updatedAt: Date.now() });
    }
    const batch = this.db.batch();
    for (const block of ordered) {
      batch.set(this.blocksCol(bookId, pageId).doc(block.id), block, { merge: true });
    }
    await batch.commit();
    await this.touchPage(bookId, pageId);
    return ordered;
  }

  async duplicateBlock(bookId: string, pageId: string, blockId: string): Promise<Block> {
    const source = await this.getBlock(bookId, pageId, blockId);
    if (!source) throw notFound("Block");
    const now = Date.now();
    const copy: Block = {
      ...structuredClone(source),
      id: randomUUID(),
      order: source.order + 0.5,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.blocksCol(bookId, pageId).doc(copy.id).set(copy);
    const normalised = sortedByOrder(await this.listBlocks(bookId, pageId)).map((b, index) => ({
      ...b,
      order: index,
    }));
    const batch = this.db.batch();
    for (const b of normalised) {
      batch.set(this.blocksCol(bookId, pageId).doc(b.id), { order: b.order }, { merge: true });
    }
    await batch.commit();
    await this.touchPage(bookId, pageId);
    return copy;
  }

  /* ---------------------------------------------------------------- */
  /* Access keys                                                       */
  /* ---------------------------------------------------------------- */

  async listAccessKeys(bookId: string): Promise<AccessKey[]> {
    const snap = await this.keysCol(bookId).orderBy("createdAt", "desc").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AccessKey);
  }

  async createAccessKey(input: {
    bookId: string;
    role: Role;
    label: string;
    keyHash: string;
  }): Promise<AccessKey> {
    const key: AccessKey = {
      id: randomUUID(),
      bookId: input.bookId,
      keyHash: input.keyHash,
      role: input.role,
      label: input.label,
      createdAt: Date.now(),
      revokedAt: null,
      lastUsedAt: null,
    };
    await this.keysCol(input.bookId).doc(key.id).set(key);
    return key;
  }

  async revokeAccessKey(bookId: string, keyId: string): Promise<AccessKey> {
    const ref = this.keysCol(bookId).doc(keyId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Access key");
    const key: AccessKey = {
      id: snap.id,
      ...(snap.data() as Omit<AccessKey, "id">),
      revokedAt: Date.now(),
    };
    await ref.set(key);
    return key;
  }

  async findActiveKeyByHash(bookId: string, keyHash: string): Promise<AccessKey | null> {
    const snap = await this.keysCol(bookId).where("keyHash", "==", keyHash).limit(1).get();
    const doc = snap.docs[0];
    if (!doc) return null;
    const key = { id: doc.id, ...doc.data() } as AccessKey;
    return key.revokedAt === null ? key : null;
  }

  async touchAccessKey(bookId: string, keyId: string): Promise<void> {
    try {
      await this.keysCol(bookId).doc(keyId).update({ lastUsedAt: Date.now() });
    } catch (error) {
      if (!isFirestoreNotFound(error)) throw error;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Files                                                             */
  /* ---------------------------------------------------------------- */

  async putFile(storagePath: string, file: FilePayload): Promise<StoredFile> {
    // Firebase Storage needs a paid (Blaze) plan, so by default we keep file
    // bytes in Firestore itself as base64 — this works on the free Spark plan.
    // Firestore caps a document at ~1 MiB; base64 inflates by ~33%, so the raw
    // payload must stay under ~700 KB. Set FIREBASE_STORAGE_BUCKET to opt into
    // real Storage for larger media.
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      const fileRef = this.bucket().file(storagePath);
      await fileRef.save(file.data, { contentType: file.mime, resumable: false });
      await fileRef.makePublic().catch(() => undefined);
      return {
        path: storagePath,
        url: `https://storage.googleapis.com/${this.bucket().name}/${storagePath}`,
        mime: file.mime,
        size: file.data.byteLength,
      };
    }

    const MAX_FIRESTORE_BYTES = 700 * 1024;
    if (file.data.byteLength > MAX_FIRESTORE_BYTES) {
      throw conflict(
        "This file is too large for free storage (max ~700 KB). Compress it or enable Firebase Storage billing.",
      );
    }
    await this.filesCol()
      .doc(this.fileDocId(storagePath))
      .set({
        path: storagePath,
        mime: file.mime,
        size: file.data.byteLength,
        data: file.data.toString("base64"),
        createdAt: Date.now(),
      });
    return {
      path: storagePath,
      url: `/api/files/${storagePath.split("/").map(encodeURIComponent).join("/")}`,
      mime: file.mime,
      size: file.data.byteLength,
    };
  }

  async readFile(storagePath: string): Promise<FilePayload | null> {
    // Firestore-backed blob first (the free default).
    try {
      const snap = await this.filesCol().doc(this.fileDocId(storagePath)).get();
      if (snap.exists) {
        const row = snap.data() as { data?: string; mime?: string };
        if (typeof row.data === "string") {
          return {
            data: Buffer.from(row.data, "base64"),
            mime: row.mime ?? "application/octet-stream",
          };
        }
      }
    } catch {
      /* fall through to Storage if configured */
    }
    if (!process.env.FIREBASE_STORAGE_BUCKET) return null;
    try {
      const fileRef = this.bucket().file(storagePath);
      const [exists] = await fileRef.exists();
      if (!exists) return null;
      const [data] = await fileRef.download();
      const [meta] = await fileRef.getMetadata();
      return {
        data,
        mime: meta.contentType ?? "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    await this.filesCol()
      .doc(this.fileDocId(storagePath))
      .delete()
      .catch(() => undefined);
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      await this.bucket().file(storagePath).delete({ ignoreNotFound: true });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Realtime                                                          */
  /* ---------------------------------------------------------------- */

  subscribeBook(bookId: string, cb: (event: BookRealtimeEvent) => void): Unsubscribe {
    const unsubs: Unsubscribe[] = [];
    unsubs.push(
      this.bookRef(bookId).onSnapshot((snap) => {
        if (!snap.exists) {
          cb({
            type: "book",
            action: "deleted",
            book: { id: bookId } as Book,
          });
          return;
        }
        cb({
          type: "book",
          action: "updated",
          // Hydrate like every read path: the raw doc can still carry legacy
          // values (e.g. pageAnimation "flip") that must never reach the client.
          book: hydrateBook({ id: snap.id, ...snap.data() } as Book),
        });
      }),
    );
    unsubs.push(
      this.chaptersCol(bookId).onSnapshot((snap) => {
        const upserts = snap
          .docChanges()
          .filter((c) => c.type !== "removed")
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as Chapter);
        const removals = snap
          .docChanges()
          .filter((c) => c.type === "removed")
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as Chapter);
        if (upserts.length) cb({ type: "chapter", action: "upsert", items: upserts });
        if (removals.length) cb({ type: "chapter", action: "deleted", items: removals });
      }),
    );
    unsubs.push(
      this.pagesCol(bookId).onSnapshot((snap) => {
        const upserts = snap
          .docChanges()
          .filter((c) => c.type !== "removed")
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as Page);
        const removals = snap
          .docChanges()
          .filter((c) => c.type === "removed")
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as Page);
        if (upserts.length) cb({ type: "page", action: "upsert", items: upserts });
        if (removals.length) cb({ type: "page", action: "deleted", items: removals });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }

  subscribePage(
    bookId: string,
    pageId: string,
    cb: (event: PageRealtimeEvent) => void,
  ): Unsubscribe {
    const unsubs: Unsubscribe[] = [];
    unsubs.push(
      this.pagesCol(bookId).doc(pageId).onSnapshot((snap) => {
        if (!snap.exists) cb({ type: "page", action: "deleted" });
      }),
    );
    unsubs.push(
      this.blocksCol(bookId, pageId).onSnapshot((snap) => {
        const upserts = snap
          .docChanges()
          .filter((c) => c.type !== "removed")
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as Block);
        const removals = snap
          .docChanges()
          .filter((c) => c.type === "removed")
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as Block);
        if (upserts.length) cb({ type: "block", action: "upsert", items: upserts });
        if (removals.length) cb({ type: "block", action: "deleted", items: removals });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }

  /* ---------------------------------------------------------------- */
  /* Presence                                                          */
  /* ---------------------------------------------------------------- */

  async setPresence(bookId: string, entry: PresenceEntry): Promise<void> {
    await this.presenceCol(bookId).doc(entry.sessionId).set(entry);
    await this.prunePresence(bookId);
  }

  async listPresence(bookId: string): Promise<PresenceEntry[]> {
    const snap = await this.presenceCol(bookId).get();
    const cutoff = Date.now() - 30_000;
    return snap.docs
      .map((d) => ({ ...d.data() }) as PresenceEntry)
      .filter((e) => e.updatedAt >= cutoff);
  }

  async clearPresence(bookId: string, sessionId: string): Promise<void> {
    await this.presenceCol(bookId).doc(sessionId).delete();
  }

  private async prunePresence(bookId: string): Promise<void> {
    const cutoff = Date.now() - 30_000;
    const snap = await this.presenceCol(bookId).where("updatedAt", "<", cutoff).limit(20).get();
    if (snap.empty) return;
    const batch = this.db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * `update()` (never `set(merge)`) so a concurrent deletion stays deleted —
   * a merge-write would resurrect the doc with nothing but an `updatedAt`.
   * NOT_FOUND means "already gone", which is exactly what we want here.
   */
  private async touchBook(bookId: string): Promise<void> {
    try {
      await this.bookRef(bookId).update({ updatedAt: Date.now() });
    } catch (error) {
      if (!isFirestoreNotFound(error)) throw error;
    }
  }

  private async touchPage(bookId: string, pageId: string): Promise<void> {
    try {
      await this.pagesCol(bookId).doc(pageId).update({ updatedAt: Date.now() });
    } catch (error) {
      if (!isFirestoreNotFound(error)) throw error;
    }
    await this.touchBook(bookId);
  }

  private async deleteCollection(
    ref: CollectionReference,
    batchSize = 400,
  ): Promise<void> {
    for (;;) {
      const snap = await ref.limit(batchSize).get();
      if (snap.empty) return;
      const batch = this.db.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      await batch.commit();
      if (snap.size < batchSize) return;
    }
  }
}
