import { expect, test } from "@playwright/test";
import { addBlock, createNotebook, unlock, waitForSaved } from "./helpers";

test.describe("collaboration and permissions", () => {
  test("streams a new block to a second tab", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const { slug, ownerKey, pageId } = await createNotebook(pageA, "Realtime");

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await unlock(pageB, slug, ownerKey);
    await pageB.goto(`/b/${slug}/edit?page=${pageId}`);
    await expect(pageB.locator("article")).toBeVisible();
    await expect(pageB.locator("aside")).toContainText("Chapter 1");

    await addBlock(pageA, "Text");
    await pageA.locator(".tiptap").first().click();
    await pageA.keyboard.type("written in the first tab");
    await waitForSaved(pageA);

    await expect(pageB.locator(".tiptap").first()).toContainText(
      "written in the first tab",
      { timeout: 30_000 },
    );

    await contextA.close();
    await contextB.close();
  });

  test("lets an editor reshape chapters but keeps viewers read-only", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "Roles");

    const viewerKey = await pageOwner.request
      .post(`/api/books/${bookId}/keys`, { data: { role: "viewer", label: "Guest" } })
      .then((response) => response.json())
      .then((body) => body.plaintext as string);
    const editorKey = await pageOwner.request
      .post(`/api/books/${bookId}/keys`, { data: { role: "editor", label: "Co-writer" } })
      .then((response) => response.json())
      .then((body) => body.plaintext as string);

    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await unlock(pageEditor, slug, editorKey);
    const chapterCreate = await pageEditor.request.post(`/api/books/${bookId}/chapters`, {
      data: { title: "Editors may do this" },
    });
    expect(chapterCreate.status()).toBe(201);
    await pageEditor.reload();
    await expect(pageEditor.locator("aside")).toContainText("Editors may do this");

    const contextViewer = await browser.newContext();
    const pageViewer = await contextViewer.newPage();
    await unlock(pageViewer, slug, viewerKey);
    await pageViewer.goto(`/b/${slug}/edit`);
    await expect(pageViewer.getByRole("button", { name: "Edit" })).toBeDisabled();
    await expect(pageViewer.getByText("view-only access").first()).toBeVisible();

    const viewerWrite = await pageViewer.request.post(`/api/books/${bookId}/chapters`, {
      data: { title: "Viewers may not" },
    });
    expect(viewerWrite.status()).toBe(403);
    const viewerManage = await pageViewer.request.patch(`/api/books/${bookId}`, {
      data: { name: "Renamed by a viewer" },
    });
    expect(viewerManage.status()).toBe(403);

    await contextOwner.close();
    await contextEditor.close();
    await contextViewer.close();
  });

  test("shows the demo without making any API calls or writing to the library", async ({
    page,
  }) => {
    const before = await (await page.request.get("/api/books")).json();

    const apiCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiCalls.push(request.url());
    });

    await page.goto("/demo");
    await expect(page.getByText("NBOOK Field Guide")).toBeVisible();
    await expect(page.locator("article")).toBeVisible();
    await page.waitForTimeout(1500);

    expect(apiCalls).toEqual([]);
    const after = await (await page.request.get("/api/books")).json();
    expect(after.books).toHaveLength(before.books.length);
  });

  test("keeps the demo read-only", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add block" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });
});
