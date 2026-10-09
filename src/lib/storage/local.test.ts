import { readFileSync } from "fs";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageRealtimeEvent } from "./types";
import type { StorageDriver } from "./types";

/**
 * The driver is a process-wide singleton keyed on NBOOK_LOCAL_DATA_DIR and
 * cached on globalThis (which survives module resets), so each case clears the
 * cache and loads a fresh module against its own temp directory.
 */
const dirs: string[] = [];

async function loadDriver(dir: string): Promise<StorageDriver> {
  vi.resetModules();
  process.env.NBOOK_LOCAL_DATA_DIR = dir;
  delete (globalThis as { __nbookLocalDriver?: unknown }).__nbookLocalDriver;
  const mod = await import("./local");
  return mod.getLocalDriver();
}

async function freshDriver(): Promise<{ driver: StorageDriver; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "nbook-local-"));
  dirs.push(dir);
  return { driver: await loadDriver(dir), dir };
}

async function seed(driver: StorageDriver) {
  const book = await driver.createBook({ name: `Book ${Date.now()} ${Math.random()}` });
  const chapter = await driver.createChapter(book.id, { title: "Chapter 1" });
  const page = await driver.createPage(book.id, chapter.id, { title: "Page 1" });
  return { book, chapter, page };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalDriver", () => {
  it("stores duplicated blocks under their own id so they stay editable", async () => {
    const { driver } = await freshDriver();
    const { book, page } = await seed(driver);
    await driver.createBlock(book.id, page.id, {
      type: "paragraph",
      content: { html: "<p>source</p>" },
    });

    const copy = await driver.duplicatePage(book.id, page.id);
    const blocks = await driver.listBlocks(book.id, copy.id);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block).toBeDefined();
    if (!block) return;

    // Autosave addresses blocks by id: the map key must match, or every write
    // on a duplicated page 404s.
    await expect(driver.getBlock(book.id, copy.id, block.id)).resolves.toMatchObject({
      id: block.id,
    });
    const updated = await driver.updateBlock(
      book.id,
      copy.id,
      block.id,
      { content: { html: "<p>edited</p>" } },
      0,
    );
    expect(updated.rev).toBe(1);

    // One block, not a ghost copy left behind under the old key.
    const after = await driver.listBlocks(book.id, copy.id);
    expect(after).toHaveLength(1);
    expect(after[0]?.content).toEqual({ html: "<p>edited</p>" });
  });

  it("starts empty when db.json does not exist", async () => {
    const { driver } = await freshDriver();
    await expect(driver.listBooks()).resolves.toEqual([]);
  });

  it("moves a corrupt db.json aside instead of overwriting it", async () => {
    const { dir } = await freshDriver();
    const dbFile = path.join(dir, "db.json");
    await writeFile(dbFile, "{ this is not json", "utf8");

    const reopened = await loadDriver(dir);

    await expect(reopened.listBooks()).resolves.toEqual([]);
    await reopened.createBook({ name: "Fresh" });

    const entries = await readdir(dir);
    const backup = entries.find((entry) => entry.startsWith("db.json.corrupt-"));
    expect(backup).toBeDefined();
    await expect(readFile(path.join(dir, backup ?? ""), "utf8")).resolves.toBe(
      "{ this is not json",
    );

    const written = JSON.parse(await readFile(dbFile, "utf8")) as {
      books: Record<string, unknown>;
    };
    expect(Object.keys(written.books)).toHaveLength(1);
  });

  it("refuses to start when the store is unreadable (not merely missing)", async () => {
    if (process.getuid?.() === 0) return; // root ignores permission bits
    const { dir } = await freshDriver();
    const dbFile = path.join(dir, "db.json");
    await writeFile(dbFile, JSON.stringify({ books: {} }), "utf8");
    await chmod(dbFile, 0o000);
    try {
      const reopened = await loadDriver(dir);
      // Failing loudly is the point: silently starting empty would let the
      // next write replace the store with an empty one.
      await expect(reopened.listBooks()).rejects.toThrow();
    } finally {
      await chmod(dbFile, 0o600);
    }
    // The unreadable store is left exactly as it was.
    expect(await readFile(dbFile, "utf8")).toBe(JSON.stringify({ books: {} }));
  });

  it("does not deliver block events to a subscriber from another notebook", async () => {
    const { driver } = await freshDriver();
    const { book, page } = await seed(driver);
    const block = await driver.createBlock(book.id, page.id, {
      type: "paragraph",
      content: { html: "<p>one</p>" },
    });

    const foreign: PageRealtimeEvent[] = [];
    const mine: PageRealtimeEvent[] = [];
    const stopForeign = driver.subscribePage("another-book-id", page.id, (event) =>
      foreign.push(event),
    );
    const stopMine = driver.subscribePage(book.id, page.id, (event) => mine.push(event));

    await driver.updateBlock(
      book.id,
      page.id,
      block.id,
      { content: { html: "<p>two</p>" } },
      0,
    );

    expect(mine).toHaveLength(1);
    expect(foreign).toHaveLength(0);
    stopForeign();
    stopMine();
  });

  it("persists a page deletion before announcing it", async () => {
    const { driver, dir } = await freshDriver();
    const { book, page } = await seed(driver);
    await driver.createBlock(book.id, page.id, {
      type: "paragraph",
      content: { html: "<p>body</p>" },
    });

    const dbFile = path.join(dir, "db.json");
    const snapshots: string[] = [];
    const stop = driver.subscribeBook(book.id, (event) => {
      if (event.type === "page" && event.action === "deleted") {
        snapshots.push(readFileSync(dbFile, "utf8"));
      }
    });

    await driver.deletePage(book.id, page.id);
    stop();

    expect(snapshots).toHaveLength(1);
    const snapshot = JSON.parse(snapshots[0] ?? "{}") as {
      pages: Record<string, { id: string }>;
      blocks: Record<string, { pageId: string }>;
    };
    expect(Object.values(snapshot.pages).some((entry) => entry.id === page.id)).toBe(false);
    expect(Object.values(snapshot.blocks).some((entry) => entry.pageId === page.id)).toBe(false);
  });
});
