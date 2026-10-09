import { expect, test, type Page } from "@playwright/test";
import { createNotebook, unlockWithPin } from "./helpers";

/** Sets share PINs as the owner through the API. */
async function setPins(
  page: Page,
  bookId: string,
  pins: { readPin?: string; editPin?: string },
) {
  const response = await page.request.patch(`/api/books/${bookId}`, { data: pins });
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe("share & access (PIN based)", () => {
  test("an open notebook (no PIN) opens straight to reading", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug } = await createNotebook(pageOwner, "Open notebook");

    // A brand-new visitor with no session and no PIN set lands in read mode.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/b/${slug}`);
    await anonPage.waitForURL(`**/b/${slug}/read*`);
    // No PIN prompt is shown.
    await expect(anonPage.getByLabel("PIN", { exact: true })).toHaveCount(0);

    await contextOwner.close();
    await anon.close();
  });

  test("the share page lets the owner set read and edit PINs", async ({ page }) => {
    const { slug } = await createNotebook(page, "PIN share");
    await page.goto(`/b/${slug}/share`);

    await expect(page.getByText("Share with a PIN")).toBeVisible();
    await page.getByLabel("Read PIN (4 digits)").fill("4821");
    await page.getByLabel("Edit PIN (5 digits)").fill("73920");
    await page.getByRole("button", { name: "Save PINs" }).click();

    await expect(page.getByText("Read link active")).toBeVisible();
    await expect(page.getByText("Edit link active")).toBeVisible();
  });

  test("a PIN-protected notebook prompts and grants the matching role", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "PIN roles");
    await setPins(pageOwner, bookId, { readPin: "4821", editPin: "73920" });

    // 4-digit PIN → viewer (read).
    const readerCtx = await browser.newContext();
    const readerPage = await readerCtx.newPage();
    await unlockWithPin(readerPage, slug, "4821");
    expect((await readerPage.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);
    // Viewer cannot write.
    expect(
      (await readerPage.request.post(`/api/books/${bookId}/chapters`, { data: { title: "No" } }))
        .status(),
    ).toBe(403);

    // 5-digit PIN → editor (write).
    const editorCtx = await browser.newContext();
    const editorPage = await editorCtx.newPage();
    await unlockWithPin(editorPage, slug, "73920");
    expect(
      (await editorPage.request.post(`/api/books/${bookId}/chapters`, { data: { title: "Yes" } }))
        .status(),
    ).toBe(201);

    await contextOwner.close();
    await readerCtx.close();
    await editorCtx.close();
  });

  test("the /b/:slug/:pin link unlocks directly", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "PIN link");
    await setPins(pageOwner, bookId, { readPin: "1234", editPin: "56789" });

    const ctx = await browser.newContext();
    const linkPage = await ctx.newPage();
    await linkPage.goto(`/b/${slug}/1234`);
    await linkPage.waitForURL(`**/b/${slug}/read*`);
    expect((await linkPage.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    const ctx2 = await browser.newContext();
    const editLinkPage = await ctx2.newPage();
    await editLinkPage.goto(`/b/${slug}/56789`);
    await editLinkPage.waitForURL(`**/b/${slug}/edit*`);

    await contextOwner.close();
    await ctx.close();
    await ctx2.close();
  });

  test("enforces the role matrix server-side", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "Role matrix");
    await setPins(pageOwner, bookId, { readPin: "4821", editPin: "73920" });

    // Owner keeps manage.
    expect(
      (await pageOwner.request.patch(`/api/books/${bookId}`, { data: { name: "Renamed" } }))
        .status(),
    ).toBe(200);

    // Anonymous (notebook has PINs) cannot read without unlocking.
    const anonymous = await browser.newContext();
    expect((await anonymous.request.get(`/api/books/${bookId}/tree`)).status()).toBe(401);
    await anonymous.close();

    // Editor (5-digit PIN): structural writes OK, manage denied.
    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await unlockWithPin(pageEditor, slug, "73920");
    expect(
      (await pageEditor.request.patch(`/api/books/${bookId}`, { data: { name: "Nope" } })).status(),
    ).toBe(403);
    expect((await pageEditor.request.delete(`/api/books/${bookId}`)).status()).toBe(403);
    expect(
      (await pageEditor.request.post(`/api/books/${bookId}/chapters`, { data: { title: "Notes" } }))
        .status(),
    ).toBe(201);
    expect((await pageEditor.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    // Viewer (4-digit PIN): read only.
    const contextViewer = await browser.newContext();
    const pageViewer = await contextViewer.newPage();
    await unlockWithPin(pageViewer, slug, "4821");
    expect(
      (await pageViewer.request.post(`/api/books/${bookId}/chapters`, { data: { title: "No" } }))
        .status(),
    ).toBe(403);
    expect(
      (await pageViewer.request.patch(`/api/books/${bookId}`, { data: { name: "No" } })).status(),
    ).toBe(403);
    expect((await pageViewer.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    // Share PINs are owner-only.
    await pageEditor.goto(`/b/${slug}/share`);
    await expect(pageEditor.getByText("Only the notebook owner can set share PINs.")).toBeVisible();

    await contextOwner.close();
    await contextEditor.close();
    await contextViewer.close();
  });

  test("a wrong PIN is rejected and rate-limited", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "PIN limits");
    await setPins(pageOwner, bookId, { readPin: "4821" });

    const anon = await browser.newContext();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await anon.request.post("/api/access/pin", {
        data: { slug, pin: "0000" },
      });
      statuses.push(response.status());
    }
    // First eight are rejected (401), the ninth trips the limiter (429).
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(401));
    expect(statuses[8]).toBe(429);

    await contextOwner.close();
    await anon.close();
  });
});
