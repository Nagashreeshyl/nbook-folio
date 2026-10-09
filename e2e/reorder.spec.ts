import { expect, test } from "@playwright/test";
import { addBlock, createNotebook, unlock, waitForSaved } from "./helpers";

/** Titles of the visible drag handles (see `SortableItem`). */
const BLOCK_HANDLE = 'button[title="Reorder block"]';
const CHAPTER_HANDLE = 'button[title="Reorder chapter"]';
const PAGE_HANDLE = 'button[title="Reorder page"]';

test.describe("drag and drop reordering", () => {
  test("moves a block above its siblings and keeps the order after a reload", async ({
    page,
  }) => {
    await createNotebook(page, "Block order");

    for (const text of ["alpha block", "beta block", "gamma block"]) {
      await addBlock(page, "Text");
      await page.locator(".tiptap").last().click();
      await page.keyboard.type(text);
    }
    await waitForSaved(page);

    const order = () =>
      page
        .locator(".nb-block")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
    const before = await order();
    expect(before[0]).toContain("alpha block");
    expect(before[2]).toContain("gamma block");

    const gamma = page.locator(".nb-block").nth(2);
    await gamma.hover();
    await gamma
      .locator(BLOCK_HANDLE)
      .dragTo(page.locator(".nb-block").first(), { steps: 12 });

    await expect.poll(order).toHaveLength(3);
    const after = await order();
    expect(after[0]).toContain("gamma block");
    expect(after[1]).toContain("alpha block");
    expect(after[2]).toContain("beta block");

    await page.reload();
    await expect(page.locator(".nb-block")).toHaveCount(3);
    const reloaded = await order();
    expect(reloaded[0]).toContain("gamma block");
    expect(reloaded[1]).toContain("alpha block");
    expect(reloaded[2]).toContain("beta block");
  });

  test("drags a chapter above another and persists it", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { bookId } = await createNotebook(page, "Chapter order");

    await page.request.post(`/api/books/${bookId}/chapters`, {
      data: { title: "Field notes" },
    });
    await page.reload();
    await expect(page.locator("aside ol").first().locator(":scope > li")).toHaveCount(2);

    const chapterItems = page.locator("aside ol").first().locator(":scope > li");
    const chapterTitles = () =>
      chapterItems.evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            node.querySelector(":scope > div > span[title]")?.getAttribute("title") ?? "",
        ),
      );
    expect(await chapterTitles()).toEqual(["Chapter 1", "Field notes"]);

    const second = chapterItems.filter({ hasText: "Field notes" }).first();
    await second.hover();
    await second
      .locator(CHAPTER_HANDLE)
      .dragTo(chapterItems.filter({ hasText: "Chapter 1" }).first(), { steps: 12 });

    await expect.poll(chapterTitles).toEqual(["Field notes", "Chapter 1"]);
    await page.reload();
    await expect(chapterItems).toHaveCount(2);
    expect(await chapterTitles()).toEqual(["Field notes", "Chapter 1"]);

    await context.close();
  });

  test("drags a page above its sibling inside the same chapter", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { slug, bookId } = await createNotebook(page, "Page order");

    const tree = await page.request
      .get(`/api/books/${bookId}/tree`)
      .then((response) => response.json());
    await page.request.post(`/api/books/${bookId}/pages`, {
      data: { chapterId: tree.chapters[0].id, title: "Second page" },
    });
    await page.goto(`/b/${slug}/edit`);
    await expect(page.locator("aside ol ol > li")).toHaveCount(2);

    const pageTitles = () =>
      page
        .locator("aside ol ol > li")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.querySelector("span.truncate")?.textContent?.trim() ?? ""),
        );
    expect(await pageTitles()).toEqual(["Untitled page", "Second page"]);

    const second = page
      .locator("aside ol ol > li")
      .filter({ hasText: "Second page" })
      .first();
    await second.hover();
    await second.locator(PAGE_HANDLE).dragTo(
      page.locator("aside ol ol > li").filter({ hasText: "Untitled page" }).first(),
      { steps: 12 },
    );

    await expect.poll(pageTitles).toEqual(["Second page", "Untitled page"]);
    await page.reload();
    await expect(page.locator("aside ol ol > li")).toHaveCount(2);
    expect(await pageTitles()).toEqual(["Second page", "Untitled page"]);

    await context.close();
  });

  test("hides drag handles from viewers and refuses viewer reorder requests", async ({
    browser,
  }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "Reorder permissions");

    const viewerKey = await pageOwner.request
      .post(`/api/books/${bookId}/keys`, { data: { role: "viewer" } })
      .then((response) => response.json())
      .then((body) => body.plaintext as string);
    const editorKey = await pageOwner.request
      .post(`/api/books/${bookId}/keys`, { data: { role: "editor" } })
      .then((response) => response.json())
      .then((body) => body.plaintext as string);

    const tree = await pageOwner.request
      .get(`/api/books/${bookId}/tree`)
      .then((response) => response.json());

    const contextViewer = await browser.newContext();
    const pageViewer = await contextViewer.newPage();
    await unlock(pageViewer, slug, viewerKey);
    await pageViewer.goto(`/b/${slug}/edit`);
    await expect(pageViewer.locator(CHAPTER_HANDLE)).toHaveCount(0);
    await expect(pageViewer.locator(PAGE_HANDLE)).toHaveCount(0);
    await expect(pageViewer.locator(BLOCK_HANDLE)).toHaveCount(0);

    const viewerReorder = await pageViewer.request.patch(`/api/books/${bookId}/chapters`, {
      data: { orderedIds: [tree.chapters[0].id] },
    });
    expect(viewerReorder.status()).toBe(403);

    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await unlock(pageEditor, slug, editorKey);
    await pageEditor.goto(`/b/${slug}/edit`);
    await expect(pageEditor.locator(CHAPTER_HANDLE).first()).toBeVisible();

    const editorReorder = await pageEditor.request.patch(`/api/books/${bookId}/chapters`, {
      data: { orderedIds: [tree.chapters[0].id] },
    });
    expect(editorReorder.status()).toBe(200);

    await contextOwner.close();
    await contextViewer.close();
    await contextEditor.close();
  });
});
