import { expect, test } from "@playwright/test";
import { addBlock, createNotebook, unlock, waitForSaved } from "./helpers";

test.describe("writing in a notebook", () => {
  test("creates a notebook seeded with a chapter and a page", async ({ page }) => {
    const { slug, pageId } = await createNotebook(page, "Field notes");
    const url = page.url();

    await expect(url).toContain(`/b/${slug}/edit`);
    await expect(url).toContain(`page=${pageId}`);
    await expect(page.locator("aside")).toContainText("Chapter 1");
    await expect(page.locator("aside")).toContainText("Untitled page");
    await expect(page.locator("article header input")).toHaveValue("Untitled page");
  });

  test("seeds the first chapter and page through the API", async ({ page }) => {
    const response = await page.request.post("/api/books", {
      data: { name: `API seed ${Date.now()}` },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body.chapter.title).toBe("Chapter 1");
    expect(body.chapter.order).toBe(0);
    expect(body.page.title).toBe("Untitled page");
    expect(body.page.chapterId).toBe(body.chapter.id);
    expect(body.page.bookId).toBe(body.book.id);
    // Shown exactly once, and only its hash is ever persisted.
    expect(body.ownerKey.plaintext).toMatch(/^nbkown_/);
    expect(body.ownerKey).not.toHaveProperty("keyHash");
  });

  test("redirects the bare notebook link to read mode", async ({ page }) => {
    const { slug } = await createNotebook(page, "Redirect check");
    await page.goto(`/b/${slug}`);
    await page.waitForURL(`**/b/${slug}/read*`);
    await expect(page).toHaveURL(new RegExp(`/b/${slug}/read`));
    await expect(page.locator("article h1")).toHaveText("Untitled page");
  });

  test("edits a paragraph and persists it across a reload", async ({ page }) => {
    await createNotebook(page, "Paragraph persistence");

    await addBlock(page, "Text");
    const editor = page.locator(".tiptap").first();
    await editor.click();
    await page.keyboard.type("Archival memory test");
    await waitForSaved(page);

    await page.reload();
    await expect(page.locator(".tiptap").first()).toContainText("Archival memory test");
  });

  test("highlights a code block with Shiki in read mode", async ({ page }) => {
    await createNotebook(page, "Code highlighting");

    await addBlock(page, "Code");
    await page.locator(".cm-content").click();
    await page.keyboard.type("const answer = 42;");
    await page.getByLabel("Language").selectOption("javascript");
    await waitForSaved(page);

    await page.getByRole("button", { name: "View" }).click();
    await expect(page.locator(".code-view")).toContainText("const answer = 42;");
    await expect(page.locator(".code-view pre.shiki")).toBeVisible();
    await expect(page.locator(".code-view pre.shiki span").first()).toBeVisible();
  });

  test("renders math with KaTeX and mounts the tldraw canvas", async ({ page }) => {
    await createNotebook(page, "Math and canvas");

    await addBlock(page, "Math");
    await page.locator("article input").last().fill("E = mc^2");
    await expect(page.locator(".katex").first()).toBeVisible();

    await addBlock(page, "Canvas");
    await expect(page.locator(".tl-container").first()).toBeVisible({ timeout: 45_000 });
  });

  test("searches saved text and downloads a markdown export", async ({ page }) => {
    await createNotebook(page, "Search and export");

    await addBlock(page, "Text");
    await page.locator(".tiptap").first().click();
    await page.keyboard.type("plutonium ledger entry");
    await waitForSaved(page);

    // The shortcut is deliberately ignored while the caret sits in an editor.
    await page.locator('button[title^="Search"]').click();
    const search = page.getByLabel("Search");
    await expect(search).toBeVisible();
    await search.fill("plutonium");
    await expect(page.getByRole("button", { name: /plutonium|Untitled page/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.keyboard.press("Escape");

    await page.locator('button[title^="Export"]').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    // Formats are ordered JSON, Markdown, HTML.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).nth(1).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test("re-reads the notebook after unlocking with the owner key in a fresh browser", async ({
    browser,
  }) => {
    const seed = await browser.newContext();
    const seedPage = await seed.newPage();
    const created = await createNotebook(seedPage, "Fresh unlock");
    await seed.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await unlock(page, created.slug, created.ownerKey);
    await expect(page.locator("aside")).toContainText("Chapter 1");
    await context.close();
  });
});
