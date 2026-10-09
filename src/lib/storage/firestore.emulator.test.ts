import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { generateAccessKey, hashAccessKey } from "@/lib/access/keys";
import { defaultContentFor } from "@/lib/blocks/schema";
import type {
  BlockContentByType,
  BlockType,
  Book,
  BookSettings,
  Chapter,
  Page,
} from "@/types/models";
import { FirestoreDriver } from "./firestore";
import { StorageError } from "./types";

/**
 * Real-driver coverage against the Firestore emulator.
 *
 * `npm run test:firestore` wraps this file in `firebase emulators:exec`, which
 * exports FIRESTORE_EMULATOR_HOST — without it the suite skips, so the plain
 * unit-test run stays emulator-free. Firebase Storage is deliberately not
 * exercised: `putFile` needs the storage emulator, which this suite does not
 * start, and uploads are covered by the browser suite instead.
 */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

function contentFor<T extends BlockType>(type: T): BlockContentByType[T] {
  return defaultContentFor(type) as BlockContentByType[T];
}

function asStorageError(error: unknown): StorageError {
  expect(error).toBeInstanceOf(StorageError);
  return error as StorageError;
}

describe.skipIf(!emulated)("FirestoreDriver (emulator)", () => {
  let driver: FirestoreDriver;
  let book: Book;

  beforeAll(async () => {
    process.env.GCLOUD_PROJECT ??= "demo-nbook";
    driver = new FirestoreDriver();
    expect(driver.kind).toBe("firestore");
    book = await driver.createBook({ name: `Emulator notebook ${Date.now()}` });
  });

  afterAll(async () => {
    if (book) await driver.deleteBook(book.id);
  });

  it("creates notebooks with unique slugs and default settings", async () => {
    expect(book.slug).toMatch(/emulator-notebook/);
    expect(book.settings.pageSound).toBe(false);
    expect(book.settings.pageAnimation).toBe("subtle");

    const twin = await driver.createBook({ name: book.name });
    expect(twin.slug).not.toBe(book.slug);
    await driver.deleteBook(twin.id);

    expect((await driver.getBookBySlug(book.slug))?.id).toBe(book.id);
    expect(await driver.getBook("missing-book")).toBeNull();
  });

  it("reads back through a fresh driver instance", async () => {
    const fresh = new FirestoreDriver();
    const loaded = await fresh.getBook(book.id);
    expect(loaded?.name).toBe(book.name);
    expect((await fresh.listBooks()).some((entry) => entry.id === book.id)).toBe(true);
  });

  it("normalises the legacy flip animation while merging settings", async () => {
    const updated = await driver.updateBook(book.id, {
      name: `${book.name} (renamed)`,
      // Deliberately the pre-V1 value: the driver must normalise it on read.
      settings: { pageAnimation: "flip" as BookSettings["pageAnimation"], theme: "dark" },
    });
    expect(updated.name).toBe(`${book.name} (renamed)`);
    expect(updated.settings.pageAnimation).toBe("realistic");
    expect(updated.settings.theme).toBe("dark");
    expect(updated.settings.pageSound).toBe(false);

    const stored = await driver.getBook(book.id);
    expect(stored?.settings.pageAnimation).toBe("realistic");
    expect(stored?.settings.fontScale).toBe(book.settings.fontScale);
  });

  it("creates, reorders, renames and deletes chapters", async () => {
    const first = await driver.createChapter(book.id, { title: "First" });
    const second = await driver.createChapter(book.id, { title: "Second" });
    const third = await driver.createChapter(book.id, { title: "Third" });
    expect([first, second, third].map((chapter) => chapter.order)).toEqual([0, 1, 2]);

    const reordered = await driver.reorderChapters(book.id, [
      third.id,
      first.id,
      second.id,
    ]);
    expect(reordered.map((chapter) => chapter.id)).toEqual([
      third.id,
      first.id,
      second.id,
    ]);

    const renamed = await driver.updateChapter(book.id, second.id, {
      title: "Second (edited)",
    });
    expect(renamed.title).toBe("Second (edited)");

    await driver.deleteChapter(book.id, first.id);
    const remaining = await driver.listChapters(book.id);
    expect(remaining.map((chapter) => chapter.id)).not.toContain(first.id);
    expect(await driver.getChapter(book.id, first.id)).toBeNull();
    expect(remaining).toHaveLength(2);
  });

  it("keeps pages ordered inside their chapter and copies them whole", async () => {
    const chapters = await driver.listChapters(book.id);
    const chapterA = chapters[0] as Chapter;
    const chapterB = chapters[1] as Chapter;

    const alpha = await driver.createPage(book.id, chapterA.id, { title: "Alpha" });
    const beta = await driver.createPage(book.id, chapterA.id, { title: "Beta" });
    const other = await driver.createPage(book.id, chapterB.id, { title: "Elsewhere" });
    expect([alpha.order, beta.order]).toEqual([0, 1]);
    expect(other.order).toBe(0);

    const inA = (await driver.listPages(book.id)).filter((page) => page.chapterId === chapterA.id);
    expect(inA.map((page) => page.title)).toEqual(["Alpha", "Beta"]);

    const swapped = await driver.reorderPages(book.id, chapterA.id, [beta.id, alpha.id]);
    expect(swapped.map((page) => page.id)).toEqual([beta.id, alpha.id]);

    await driver.createBlock(book.id, alpha.id, {
      type: "paragraph",
      content: contentFor("paragraph"),
    });
    const copy = await driver.duplicatePage(book.id, alpha.id);
    expect(copy.id).not.toBe(alpha.id);
    expect(copy.title).toBe("Alpha (copy)");
    expect(copy.chapterId).toBe(chapterA.id);
    expect(await driver.listBlocks(book.id, copy.id)).toHaveLength(1);

    const moved = await driver.updatePage(book.id, copy.id, { chapterId: chapterB.id });
    expect(moved.chapterId).toBe(chapterB.id);

    await driver.deletePage(book.id, copy.id);
    expect(await driver.getPage(book.id, copy.id)).toBeNull();
  });

  it("enforces optimistic concurrency on block writes", async () => {
    const chapters = await driver.listChapters(book.id);
    const chapterA = chapters[0] as Chapter;
    const page: Page = await driver.createPage(book.id, chapterA.id, { title: "Concurrency" });

    const one = await driver.createBlock(book.id, page.id, {
      type: "paragraph",
      content: contentFor("paragraph"),
    });
    const two = await driver.createBlock(book.id, page.id, {
      type: "heading",
      content: contentFor("heading"),
    });
    const three = await driver.createBlock(book.id, page.id, {
      type: "heading",
      content: contentFor("heading"),
      afterBlockId: one.id,
    });
    expect(one.rev).toBe(0);

    // `afterBlockId` inserts between the two, and creation re-densifies.
    const stored = await driver.listBlocks(book.id, page.id);
    const orderOf = (id: string) => stored.find((block) => block.id === id)?.order ?? -1;
    expect(orderOf(one.id)).toBe(0);
    expect(orderOf(three.id)).toBe(1);
    expect(orderOf(two.id)).toBe(2);

    const patched = await driver.updateBlock(
      book.id,
      page.id,
      one.id,
      { content: { html: "<p>Saved by the editor</p>" } },
      0,
      "session-a",
    );
    expect(patched.rev).toBe(1);
    expect(patched.updatedBy).toBe("session-a");

    const stale = await driver
      .updateBlock(
        book.id,
        page.id,
        one.id,
        { content: { html: "<p>Lost race</p>" } },
        0,
        "session-b",
      )
      .catch((error: unknown) => error);
    expect(asStorageError(stale).code).toBe("conflict");

    const reordered = await driver.reorderBlocks(book.id, page.id, [
      three.id,
      one.id,
      two.id,
    ]);
    expect(reordered.map((block) => block.id)).toEqual([three.id, one.id, two.id]);
    expect(reordered.map((block) => block.order)).toEqual([0, 1, 2]);

    const duplicate = await driver.duplicateBlock(book.id, page.id, one.id);
    expect(duplicate.id).not.toBe(one.id);
    expect(duplicate.rev).toBe(0);

    const forBook = await driver.listBlocksForBook(book.id);
    expect(forBook.some((block) => block.id === duplicate.id)).toBe(true);

    await driver.deleteBlock(book.id, page.id, duplicate.id);
    expect(await driver.getBlock(book.id, page.id, duplicate.id)).toBeNull();
    expect(await driver.getBlock(book.id, "missing-page", duplicate.id)).toBeNull();
    await expect(driver.deleteBlock(book.id, page.id, duplicate.id)).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it("stores only hashes and honours revocation", async () => {
    const plaintext = generateAccessKey("viewer");
    const keyHash = hashAccessKey(plaintext);
    const key = await driver.createAccessKey({
      bookId: book.id,
      role: "viewer",
      label: "Emulator viewer",
      keyHash,
    });

    // Straight from Firestore: no plaintext, no near-miss field names.
    const app = getApps()[0];
    if (!app) throw new Error("firebase app was not initialised");
    const raw = getFirestore(app);
    const doc = await raw
      .collection("books")
      .doc(book.id)
      .collection("keys")
      .doc(key.id)
      .get();
    const data = doc.data() ?? {};
    expect(Object.keys(data).sort()).toEqual([
      "bookId",
      "createdAt",
      "id",
      "keyHash",
      "label",
      "lastUsedAt",
      "revokedAt",
      "role",
    ]);
    expect(JSON.stringify(data)).not.toContain(plaintext);
    expect(data.keyHash).toBe(keyHash);

    const found = await driver.findActiveKeyByHash(book.id, keyHash);
    expect(found?.id).toBe(key.id);
    expect(await driver.findActiveKeyByHash(book.id, "no-such-hash")).toBeNull();

    await driver.touchAccessKey(book.id, key.id);
    const touched = (await driver.listAccessKeys(book.id)).find((entry) => entry.id === key.id);
    expect(touched?.lastUsedAt ?? 0).toBeGreaterThan(0);

    const revoked = await driver.revokeAccessKey(book.id, key.id);
    expect(revoked.revokedAt ?? 0).toBeGreaterThan(0);
    // The security boundary: a revoked key can no longer be exchanged.
    expect(await driver.findActiveKeyByHash(book.id, keyHash)).toBeNull();

    const missing = await driver.revokeAccessKey(book.id, "missing-key").catch((error) => error);
    expect(asStorageError(missing).code).toBe("not_found");
  });

  it("prunes stale presence and clears sessions explicitly", async () => {
    const now = Date.now();
    await driver.setPresence(book.id, {
      sessionId: "stale-session",
      name: "Gone",
      role: "viewer",
      pageId: null,
      color: "#000000",
      updatedAt: now - 60_000,
    });
    expect(await driver.listPresence(book.id)).toHaveLength(0);

    await driver.setPresence(book.id, {
      sessionId: "live-session",
      name: "Here",
      role: "editor",
      pageId: null,
      color: "#111111",
      updatedAt: now,
    });
    const live = await driver.listPresence(book.id);
    expect(live.map((entry) => entry.sessionId)).toEqual(["live-session"]);

    await driver.clearPresence(book.id, "live-session");
    expect(await driver.listPresence(book.id)).toHaveLength(0);
  });

  it("streams book and page events to subscribers", async () => {
    const chapters = await driver.listChapters(book.id);
    const chapterA = chapters[0] as Chapter;
    const pages = (await driver.listPages(book.id)).filter(
      (page) => page.chapterId === chapterA.id,
    );
    const page = pages[0] as Page;

    const streamedChapterIds: string[] = [];
    const streamedBlockIds: string[] = [];
    const unsubscribeBook = driver.subscribeBook(book.id, (event) => {
      if (event.type === "chapter" && event.action === "upsert") {
        streamedChapterIds.push(...event.items.map((item) => item.id));
      }
    });
    const unsubscribePage = driver.subscribePage(book.id, page.id, (event) => {
      if (event.type === "block" && event.action === "upsert") {
        streamedBlockIds.push(...event.items.map((item) => item.id));
      }
    });

    try {
      const streamed = await driver.createChapter(book.id, { title: "Streamed" });
      const block = await driver.createBlock(book.id, page.id, {
        type: "paragraph",
        content: contentFor("paragraph"),
      });

      await vi.waitFor(
        () => {
          expect(streamedChapterIds).toContain(streamed.id);
          expect(streamedBlockIds).toContain(block.id);
        },
        { timeout: 10_000, interval: 100 },
      );
    } finally {
      unsubscribeBook();
      unsubscribePage();
    }
  });
});
