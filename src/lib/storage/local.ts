import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "node:path";
import type {
  AccessKey,
  Block,
  Book,
  Chapter,
  Page,
  PresenceEntry,
  Role,
} from "@/types/models";
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

interface LocalDb {
  books: Record<string, Book>;
  chapters: Record<string, Chapter>;
  pages: Record<string, Page>;
  blocks: Record<string, Block>;
  keys: Record<string, AccessKey>;
}

const EMPTY_DB: LocalDb = { books: {}, chapters: {}, pages: {}, blocks: {}, keys: {} };

/** Parses db.json, throwing when the shape is unusable (treated as corrupt). */
function parseDb(raw: string): LocalDb {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("db.json is not an object");
  }
  const candidate = parsed as Partial<LocalDb>;
  const db: LocalDb = structuredClone(EMPTY_DB);
  for (const key of ["books", "chapters", "pages", "blocks", "keys"] as const) {
    const value = candidate[key];
    if (value === undefined) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SyntaxError(`db.json field "${key}" is not a map`);
    }
    Object.assign(db, { [key]: value });
  }
  return db;
}

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

/**
 * File-backed persistence used when Firebase is not configured.
 *
 * Writes are atomic (temp file + rename) and awaited, so a response is only
 * returned after the data is durable on disk. Realtime uses an in-process
 * event bus with the same event shapes as the Firestore driver.
 */
class LocalDriver implements StorageDriver {
  readonly kind = "local" as const;

  private readonly dataDir: string;
  private readonly dbFile: string;
  private readonly bus = new EventEmitter();
  private db: LocalDb = structuredClone(EMPTY_DB);
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly presence = new Map<string, Map<string, PresenceEntry>>();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.dbFile = path.join(dataDir, "db.json");
    this.bus.setMaxListeners(0);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        await mkdir(this.dataDir, { recursive: true });
        try {
          const raw = await readFile(this.dbFile, "utf8");
          try {
            this.db = parseDb(raw);
          } catch {
            // A corrupt file must never be silently overwritten: move it aside
            // for manual recovery first, otherwise the next persist() would
            // replace every notebook with an empty store.
            await rename(this.dbFile, `${this.dbFile}.corrupt-${Date.now()}`);
            this.db = structuredClone(EMPTY_DB);
          }
        } catch (error) {
          // Only "file does not exist" means "nothing stored yet". Anything
          // else (EACCES, EIO) must fail loudly instead of starting empty.
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          this.db = structuredClone(EMPTY_DB);
        }
        this.loaded = true;
      })().catch((error: unknown) => {
        // Allow a transient failure to be retried by the next call.
        this.loadPromise = null;
        throw error;
      });
    }
    return this.loadPromise;
  }

  /** Serialised, atomic persistence. */
  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.db);
    // Recover the chain after a failed write so one disk error cannot disable
    // persistence forever; the caller of *this* write still sees the failure.
    const previous = this.writeChain.catch(() => undefined);
    this.writeChain = previous.then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const tmp = `${this.dbFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(tmp, snapshot, "utf8");
        await rename(tmp, this.dbFile);
      } catch (error) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    return this.writeChain;
  }

  private emitBook(event: BookRealtimeEvent): void {
    const bookId =
      event.type === "book" ? event.book.id : (event.items[0]?.bookId ?? "");
    if (bookId) this.bus.emit(`book:${bookId}`, event);
  }

  private emitPage(pageId: string, event: PageRealtimeEvent): void {
    this.bus.emit(`page:${pageId}`, event);
  }

  /* ---------------------------------------------------------------- */
  /* Books                                                             */
  /* ---------------------------------------------------------------- */

  async createBook(input: CreateBookInput): Promise<Book> {
    await this.ensureLoaded();
    const now = Date.now();
    const id = randomUUID();
    let slug = slugify(input.name);
    if (this.db.books && Object.values(this.db.books).some((b) => b.slug === slug)) {
      slug = `${slug}-${id.slice(0, 6)}`;
    }
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
    this.db.books[id] = book;
    await this.persist();
    return book;
  }

  async getBook(bookId: string): Promise<Book | null> {
    await this.ensureLoaded();
    const book = this.db.books[bookId];
    return book ? hydrateBook(book) : null;
  }

  async getBookBySlug(slug: string): Promise<Book | null> {
    await this.ensureLoaded();
    const book = Object.values(this.db.books).find((b) => b.slug === slug);
    return book ? hydrateBook(book) : null;
  }

  async listBooks(): Promise<Book[]> {
    await this.ensureLoaded();
    return Object.values(this.db.books)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(hydrateBook);
  }

  async updateBook(bookId: string, patch: BookPatch): Promise<Book> {
    await this.ensureLoaded();
    const current = this.db.books[bookId];
    if (!current) throw notFound("Book");
    const next: Book = hydrateBook({
      ...current,
      ...patch,
      id: current.id,
      settings: { ...DEFAULT_BOOK_SETTINGS, ...current.settings, ...(patch.settings ?? {}) },
      updatedAt: Date.now(),
    });
    this.db.books[bookId] = next;
    await this.persist();
    this.emitBook({ type: "book", action: "updated", book: next });
    return next;
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.db.books[bookId]) throw notFound("Book");
    delete this.db.books[bookId];
    for (const [id, ch] of Object.entries(this.db.chapters)) {
      if (ch.bookId === bookId) delete this.db.chapters[id];
    }
    const pageIds: string[] = [];
    for (const [id, pg] of Object.entries(this.db.pages)) {
      if (pg.bookId === bookId) {
        pageIds.push(id);
        delete this.db.pages[id];
      }
    }
    for (const [id, bl] of Object.entries(this.db.blocks)) {
      if (bl.bookId === bookId || pageIds.includes(bl.pageId)) delete this.db.blocks[id];
    }
    for (const [id, k] of Object.entries(this.db.keys)) {
      if (k.bookId === bookId) delete this.db.keys[id];
    }
    await this.persist();
    // Attachments live under files/<bookId>/ — deleting the notebook must take
    // its uploads with it, otherwise they are unreachable forever.
    await rm(path.join(this.dataDir, "files", this.safePath(bookId)), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
    const book = { id: bookId } as Book;
    this.bus.emit(`book:${bookId}`, {
      type: "book",
      action: "deleted",
      book,
    } satisfies BookRealtimeEvent);
  }

  /* ---------------------------------------------------------------- */
  /* Chapters                                                          */
  /* ---------------------------------------------------------------- */

  private chaptersOf(bookId: string): Chapter[] {
    return Object.values(this.db.chapters).filter((c) => c.bookId === bookId);
  }

  async listChapters(bookId: string): Promise<Chapter[]> {
    await this.ensureLoaded();
    return sortedByOrder(this.chaptersOf(bookId));
  }

  async getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
    await this.ensureLoaded();
    const chapter = this.db.chapters[chapterId] ?? null;
    return chapter && chapter.bookId === bookId ? chapter : null;
  }

  async createChapter(
    bookId: string,
    input: { title: string; description?: string },
  ): Promise<Chapter> {
    await this.ensureLoaded();
    if (!this.db.books[bookId]) throw notFound("Book");
    const now = Date.now();
    const chapter: Chapter = {
      id: randomUUID(),
      bookId,
      title: input.title.trim() || "Untitled chapter",
      description: input.description?.trim() ?? "",
      order: nextOrder(this.chaptersOf(bookId)),
      createdAt: now,
      updatedAt: now,
    };
    this.db.chapters[chapter.id] = chapter;
    await this.persist();
    this.emitBook({ type: "chapter", action: "upsert", items: [chapter] });
    return chapter;
  }

  async updateChapter(
    bookId: string,
    chapterId: string,
    patch: Partial<Chapter>,
  ): Promise<Chapter> {
    await this.ensureLoaded();
    const current = this.db.chapters[chapterId];
    if (!current || current.bookId !== bookId) throw notFound("Chapter");
    const next: Chapter = {
      ...current,
      ...patch,
      id: current.id,
      bookId: current.bookId,
      updatedAt: Date.now(),
    };
    this.db.chapters[chapterId] = next;
    await this.persist();
    this.emitBook({ type: "chapter", action: "upsert", items: [next] });
    return next;
  }

  async deleteChapter(bookId: string, chapterId: string): Promise<void> {
    await this.ensureLoaded();
    const chapter = this.db.chapters[chapterId];
    if (!chapter || chapter.bookId !== bookId) throw notFound("Chapter");
    delete this.db.chapters[chapterId];
    const pages = Object.values(this.db.pages).filter(
      (p) => p.bookId === bookId && p.chapterId === chapterId,
    );
    for (const page of pages) await this.deletePageInternal(page.id);
    await this.persist();
    this.emitBook({ type: "chapter", action: "deleted", items: [chapter] });
    for (const page of pages) {
      this.emitPage(page.id, { type: "page", action: "deleted" });
    }
  }

  async reorderChapters(bookId: string, orderedIds: string[]): Promise<Chapter[]> {
    await this.ensureLoaded();
    const chapters = this.chaptersOf(bookId);
    const byId = new Map(chapters.map((c) => [c.id, c]));
    const ordered: Chapter[] = [];
    orderedIds.forEach((id, index) => {
      const chapter = byId.get(id);
      if (chapter) {
        byId.delete(id);
        ordered.push({ ...chapter, order: index, updatedAt: Date.now() });
      }
    });
    // Anything not supplied keeps its relative order at the end.
    for (const rest of sortedByOrder([...byId.values()])) {
      ordered.push({ ...rest, order: ordered.length, updatedAt: Date.now() });
    }
    for (const chapter of ordered) this.db.chapters[chapter.id] = chapter;
    await this.persist();
    this.emitBook({ type: "chapter", action: "upsert", items: ordered });
    return ordered;
  }

  /* ---------------------------------------------------------------- */
  /* Pages                                                             */
  /* ---------------------------------------------------------------- */

  private pagesOf(bookId: string): Page[] {
    return Object.values(this.db.pages).filter((p) => p.bookId === bookId);
  }

  async listPages(bookId: string): Promise<Page[]> {
    await this.ensureLoaded();
    return sortedByOrder(this.pagesOf(bookId));
  }

  async getPage(bookId: string, pageId: string): Promise<Page | null> {
    await this.ensureLoaded();
    const page = this.db.pages[pageId] ?? null;
    return page && page.bookId === bookId ? page : null;
  }

  async createPage(bookId: string, chapterId: string, input: { title: string }): Promise<Page> {
    await this.ensureLoaded();
    if (!this.db.books[bookId]) throw notFound("Book");
    const chapter = this.db.chapters[chapterId];
    if (!chapter || chapter.bookId !== bookId) throw notFound("Chapter");
    const now = Date.now();
    const page: Page = {
      id: randomUUID(),
      bookId,
      chapterId,
      title: input.title.trim() || "Untitled page",
      order: nextOrder(this.pagesOf(bookId).filter((p) => p.chapterId === chapterId)),
      createdAt: now,
      updatedAt: now,
    };
    this.db.pages[page.id] = page;
    await this.persist();
    this.emitBook({ type: "page", action: "upsert", items: [page] });
    return page;
  }

  async updatePage(bookId: string, pageId: string, patch: Partial<Page>): Promise<Page> {
    await this.ensureLoaded();
    const current = this.db.pages[pageId];
    if (!current || current.bookId !== bookId) throw notFound("Page");
    const next: Page = {
      ...current,
      ...patch,
      id: current.id,
      bookId: current.bookId,
      updatedAt: Date.now(),
    };
    this.db.pages[pageId] = next;
    await this.persist();
    this.emitBook({ type: "page", action: "upsert", items: [next] });
    return next;
  }

  private async deletePageInternal(pageId: string): Promise<void> {
    const page = this.db.pages[pageId];
    if (!page) return;
    delete this.db.pages[pageId];
    const blocks = Object.values(this.db.blocks).filter((b) => b.pageId === pageId);
    for (const block of blocks) delete this.db.blocks[block.id];
  }

  async deletePage(bookId: string, pageId: string): Promise<void> {
    await this.ensureLoaded();
    const page = this.db.pages[pageId];
    if (!page || page.bookId !== bookId) throw notFound("Page");
    await this.deletePageInternal(pageId);
    // Durability first: subscribers must never be told a page is gone before
    // the write lands (deleteChapter already follows this order).
    await this.persist();
    this.emitBook({ type: "page", action: "deleted", items: [page] });
    this.emitPage(pageId, { type: "page", action: "deleted" });
  }

  async duplicatePage(bookId: string, pageId: string): Promise<Page> {
    await this.ensureLoaded();
    const source = this.db.pages[pageId];
    if (!source || source.bookId !== bookId) throw notFound("Page");
    const now = Date.now();
    const copy: Page = {
      ...source,
      id: randomUUID(),
      title: `${source.title} (copy)`,
      order: nextOrder(this.pagesOf(source.bookId).filter((p) => p.chapterId === source.chapterId)),
      createdAt: now,
      updatedAt: now,
    };
    this.db.pages[copy.id] = copy;
    const blocks = sortedByOrder(
      Object.values(this.db.blocks).filter(
        (b) => b.bookId === bookId && b.pageId === pageId,
      ),
    );
    blocks.forEach((block, index) => {
      const blockId = randomUUID();
      this.db.blocks[blockId] = {
        ...structuredClone(block),
        id: blockId,
        pageId: copy.id,
        order: index,
        rev: 0,
        createdAt: now,
        updatedAt: now,
      };
    });
    await this.persist();
    this.emitBook({ type: "page", action: "upsert", items: [copy] });
    return copy;
  }

  async reorderPages(
    bookId: string,
    chapterId: string,
    orderedIds: string[],
  ): Promise<Page[]> {
    await this.ensureLoaded();
    const pages = Object.values(this.db.pages).filter(
      (p) => p.bookId === bookId && p.chapterId === chapterId,
    );
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
    for (const page of ordered) this.db.pages[page.id] = page;
    await this.persist();
    this.emitBook({ type: "page", action: "upsert", items: ordered });
    return ordered;
  }

  /* ---------------------------------------------------------------- */
  /* Blocks                                                            */
  /* ---------------------------------------------------------------- */

  private blocksOf(bookId: string, pageId: string): Block[] {
    return Object.values(this.db.blocks).filter(
      (b) => b.bookId === bookId && b.pageId === pageId,
    );
  }

  async listBlocks(bookId: string, pageId: string): Promise<Block[]> {
    await this.ensureLoaded();
    return sortedByOrder(this.blocksOf(bookId, pageId));
  }

  async listBlocksForBook(bookId: string): Promise<Block[]> {
    await this.ensureLoaded();
    return sortedByOrder(
      Object.values(this.db.blocks).filter((b) => b.bookId === bookId),
    );
  }

  async getBlock(bookId: string, pageId: string, blockId: string): Promise<Block | null> {
    await this.ensureLoaded();
    const block = this.db.blocks[blockId] ?? null;
    return block && block.bookId === bookId && block.pageId === pageId ? block : null;
  }

  async createBlock(bookId: string, pageId: string, input: CreateBlockInput): Promise<Block> {
    await this.ensureLoaded();
    const page = this.db.pages[pageId];
    if (!page || page.bookId !== bookId) throw notFound("Page");
    const now = Date.now();
    const existing = sortedByOrder(this.blocksOf(bookId, pageId));
    let order: number;
    if (input.afterBlockId) {
      const anchor = existing.find((b) => b.id === input.afterBlockId);
      order = anchor ? anchor.order + 0.5 : nextOrder(existing);
    } else if (typeof input.index === "number") {
      order = input.index;
    } else {
      order = nextOrder(existing);
    }
    const block: Block = {
      id: randomUUID(),
      bookId: page.bookId,
      pageId,
      type: input.type,
      order,
      content: input.content,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.blocks[block.id] = block;
    // Normalise fractional orders caused by mid-inserts.
    const normalised = sortedByOrder(this.blocksOf(bookId, pageId)).map((b, index) => ({
      ...b,
      order: index,
    }));
    for (const b of normalised) this.db.blocks[b.id] = b;
    await this.persist();
    this.emitPage(pageId, { type: "block", action: "upsert", items: normalised });
    return this.db.blocks[block.id] ?? block;
  }

  async updateBlock(
    bookId: string,
    pageId: string,
    blockId: string,
    patch: { content: unknown },
    baseRev: number,
    sessionId?: string,
  ): Promise<Block> {
    await this.ensureLoaded();
    const current = this.db.blocks[blockId];
    if (!current || current.bookId !== bookId || current.pageId !== pageId) {
      throw notFound("Block");
    }
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
    this.db.blocks[blockId] = next;
    await this.persist();
    this.emitPage(next.pageId, { type: "block", action: "upsert", items: [next] });
    return next;
  }

  async deleteBlock(bookId: string, pageId: string, blockId: string): Promise<void> {
    await this.ensureLoaded();
    const block = this.db.blocks[blockId];
    if (!block || block.bookId !== bookId || block.pageId !== pageId) throw notFound("Block");
    delete this.db.blocks[blockId];
    await this.persist();
    this.emitPage(block.pageId, { type: "block", action: "deleted", items: [block] });
  }

  async reorderBlocks(bookId: string, pageId: string, orderedIds: string[]): Promise<Block[]> {
    await this.ensureLoaded();
    const blocks = sortedByOrder(this.blocksOf(bookId, pageId));
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
    for (const block of ordered) this.db.blocks[block.id] = block;
    await this.persist();
    this.emitPage(pageId, { type: "block", action: "upsert", items: ordered });
    return ordered;
  }

  async duplicateBlock(bookId: string, pageId: string, blockId: string): Promise<Block> {
    await this.ensureLoaded();
    const source = this.db.blocks[blockId];
    if (!source || source.bookId !== bookId || source.pageId !== pageId) {
      throw notFound("Block");
    }
    const now = Date.now();
    const copy: Block = {
      ...structuredClone(source),
      id: randomUUID(),
      order: source.order + 0.5,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.blocks[copy.id] = copy;
    const normalised = sortedByOrder(this.blocksOf(bookId, pageId)).map((b, index) => ({
      ...b,
      order: index,
    }));
    for (const b of normalised) this.db.blocks[b.id] = b;
    await this.persist();
    this.emitPage(pageId, { type: "block", action: "upsert", items: normalised });
    return copy;
  }

  /* ---------------------------------------------------------------- */
  /* Access keys                                                       */
  /* ---------------------------------------------------------------- */

  async listAccessKeys(bookId: string): Promise<AccessKey[]> {
    await this.ensureLoaded();
    return Object.values(this.db.keys)
      .filter((k) => k.bookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async createAccessKey(input: {
    bookId: string;
    role: Role;
    label: string;
    keyHash: string;
  }): Promise<AccessKey> {
    await this.ensureLoaded();
    if (!this.db.books[input.bookId]) throw notFound("Book");
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
    this.db.keys[key.id] = key;
    await this.persist();
    return key;
  }

  async revokeAccessKey(bookId: string, keyId: string): Promise<AccessKey> {
    await this.ensureLoaded();
    const key = this.db.keys[keyId];
    if (!key || key.bookId !== bookId) throw notFound("Access key");
    const next: AccessKey = { ...key, revokedAt: Date.now() };
    this.db.keys[keyId] = next;
    await this.persist();
    return next;
  }

  async findActiveKeyByHash(bookId: string, keyHash: string): Promise<AccessKey | null> {
    await this.ensureLoaded();
    const key = Object.values(this.db.keys).find(
      (k) => k.bookId === bookId && k.keyHash === keyHash && k.revokedAt === null,
    );
    return key ?? null;
  }

  async touchAccessKey(bookId: string, keyId: string): Promise<void> {
    await this.ensureLoaded();
    const key = this.db.keys[keyId];
    if (!key || key.bookId !== bookId) return;
    this.db.keys[keyId] = { ...key, lastUsedAt: Date.now() };
    await this.persist();
  }

  /* ---------------------------------------------------------------- */
  /* Files                                                             */
  /* ---------------------------------------------------------------- */

  private safePath(storagePath: string): string {
    const normalised = path.posix.normalize(storagePath).replace(/^\/+/, "");
    if (normalised.includes("..")) throw conflict("Invalid storage path");
    return normalised;
  }

  async putFile(storagePath: string, file: FilePayload): Promise<StoredFile> {
    const relative = this.safePath(storagePath);
    const absolute = path.join(this.dataDir, "files", relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.data);
    return {
      path: relative,
      url: `/api/files/${relative.split("/").map(encodeURIComponent).join("/")}`,
      mime: file.mime,
      size: file.data.byteLength,
    };
  }

  async readFile(storagePath: string): Promise<FilePayload | null> {
    try {
      const absolute = path.join(this.dataDir, "files", this.safePath(storagePath));
      const data = await readFile(absolute);
      return { data, mime: guessMime(storagePath) };
    } catch {
      return null;
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    const absolute = path.join(this.dataDir, "files", this.safePath(storagePath));
    await rm(absolute, { force: true });
  }

  /* ---------------------------------------------------------------- */
  /* Realtime                                                          */
  /* ---------------------------------------------------------------- */

  subscribeBook(bookId: string, cb: (event: BookRealtimeEvent) => void): Unsubscribe {
    const channel = `book:${bookId}`;
    this.bus.on(channel, cb);
    return () => this.bus.off(channel, cb);
  }

  subscribePage(
    bookId: string,
    pageId: string,
    cb: (event: PageRealtimeEvent) => void,
  ): Unsubscribe {
    const channel = `page:${pageId}`;
    // The in-process bus is keyed by pageId alone, so a subscriber that passed
    // a page id from another notebook must still not receive its block events.
    const filtered = (event: PageRealtimeEvent) => {
      if (event.type === "block" && event.items.some((item) => item.bookId !== bookId)) return;
      cb(event);
    };
    this.bus.on(channel, filtered);
    return () => this.bus.off(channel, filtered);
  }

  /* ---------------------------------------------------------------- */
  /* Presence                                                          */
  /* ---------------------------------------------------------------- */

  async setPresence(bookId: string, entry: PresenceEntry): Promise<void> {
    let room = this.presence.get(bookId);
    if (!room) {
      room = new Map();
      this.presence.set(bookId, room);
    }
    room.set(entry.sessionId, entry);
    // Prune stale heartbeats (30s window).
    const cutoff = Date.now() - 30_000;
    for (const [sid, value] of room) {
      if (value.updatedAt < cutoff) room.delete(sid);
    }
  }

  async listPresence(bookId: string): Promise<PresenceEntry[]> {
    const room = this.presence.get(bookId);
    if (!room) return [];
    const cutoff = Date.now() - 30_000;
    return [...room.values()].filter((e) => e.updatedAt >= cutoff);
  }

  async clearPresence(bookId: string, sessionId: string): Promise<void> {
    this.presence.get(bookId)?.delete(sessionId);
  }
}

function guessMime(storagePath: string): string {
  const ext = path.extname(storagePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".zip": "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

const globalStore = globalThis as unknown as { __nbookLocalDriver?: LocalDriver };

/** Process-wide singleton so HMR does not create parallel stores. */
export function getLocalDriver(): LocalDriver {
  if (!globalStore.__nbookLocalDriver) {
    const dataDir =
      process.env.NBOOK_LOCAL_DATA_DIR ?? path.join(process.cwd(), ".nbook-data");
    globalStore.__nbookLocalDriver = new LocalDriver(dataDir);
  }
  return globalStore.__nbookLocalDriver;
}
