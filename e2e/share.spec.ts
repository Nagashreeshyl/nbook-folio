import { expect, test, type Page } from "@playwright/test";
import { createNotebook, unlock } from "./helpers";

/** Creates a key of the given role as the owner and returns its plaintext. */
async function mintKey(page: Page, bookId: string, role: "editor" | "viewer") {
  const response = await page.request.post(`/api/books/${bookId}/keys`, {
    data: { role },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.plaintext as string;
}

test.describe("share & access", () => {
  test("documents the revocation policy and never offers to revoke the owner key", async ({
    page,
  }) => {
    const { slug } = await createNotebook(page, "Share policy");
    await page.goto(`/b/${slug}/share`);

    const linkSection = page.locator("section", { hasText: "Notebook link" });
    await expect(linkSection).toContainText("a revoked key stops working at once");
    await expect(linkSection).toContainText("12 hours");

    await expect(page.getByText("The owner key was shown once", { exact: false })).toContainText(
      "cannot be revoked",
    );

    // Minting through the UI reveals the plaintext exactly once.
    await page.getByRole("button", { name: "Create key · editor" }).click();
    const shownOnce = page.locator("div.border-dashed", { hasText: "Shown once" });
    await expect(shownOnce).toBeVisible();
    const editorKey = (await shownOnce.locator("code").innerText()).trim();
    expect(editorKey.startsWith("nbkedt_")).toBe(true);

    // The owner key is listed too — but revoking it would lock the notebook
    // out of its own settings, so only editor/viewer rows get the button.
    await expect(page.locator("ul.divide-y li", { hasText: "owner" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(1);
    await expect(page.getByText("No keys yet")).toHaveCount(0);
  });

  test("enforces the role matrix server-side", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "Role matrix");

    const editorKey = await mintKey(pageOwner, bookId, "editor");
    const viewerKey = await mintKey(pageOwner, bookId, "viewer");

    // Owner keeps manage.
    expect((await pageOwner.request.get(`/api/books/${bookId}/keys`)).status()).toBe(200);
    expect(
      (await pageOwner.request.patch(`/api/books/${bookId}`, { data: { name: "Renamed" } }))
        .status(),
    ).toBe(200);

    const anonymous = await browser.newContext();
    expect((await anonymous.request.get(`/api/books/${bookId}/keys`)).status()).toBe(401);
    expect((await anonymous.request.get(`/api/books/${bookId}/tree`)).status()).toBe(401);
    await anonymous.close();

    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await unlock(pageEditor, slug, editorKey);
    expect((await pageEditor.request.get(`/api/books/${bookId}/keys`)).status()).toBe(403);
    expect(
      (await pageEditor.request.post(`/api/books/${bookId}/keys`, { data: { role: "viewer" } }))
        .status(),
    ).toBe(403);
    expect(
      (await pageEditor.request.patch(`/api/books/${bookId}`, { data: { name: "Nope" } })).status(),
    ).toBe(403);
    expect((await pageEditor.request.delete(`/api/books/${bookId}`)).status()).toBe(403);
    // …but structural writes stay open to editors.
    expect(
      (await pageEditor.request.post(`/api/books/${bookId}/chapters`, { data: { title: "Notes" } }))
        .status(),
    ).toBe(201);
    expect((await pageEditor.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    await pageEditor.goto(`/b/${slug}/share`);
    await expect(pageEditor.getByText("Only the notebook owner can see access keys.")).toBeVisible();
    await expect(pageEditor.getByRole("button", { name: "Create key · editor" })).toHaveCount(0);

    const contextViewer = await browser.newContext();
    const pageViewer = await contextViewer.newPage();
    await unlock(pageViewer, slug, viewerKey);
    expect((await pageViewer.request.get(`/api/books/${bookId}/keys`)).status()).toBe(403);
    expect(
      (await pageViewer.request.post(`/api/books/${bookId}/chapters`, { data: { title: "No" } }))
        .status(),
    ).toBe(403);
    expect(
      (await pageViewer.request.post(`/api/books/${bookId}/pages`, { data: { title: "No" } }))
        .status(),
    ).toBe(403);
    expect((await pageViewer.request.patch(`/api/books/${bookId}`, { data: { name: "No" } })).status()).toBe(
      403,
    );
    // Reading stays open to viewers.
    expect((await pageViewer.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    await contextOwner.close();
    await contextEditor.close();
    await contextViewer.close();
  });

  test("stops a revoked key from unlocking while its open session lives on", async ({ browser }) => {
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    const { slug, bookId } = await createNotebook(pageOwner, "Revocation");

    const viewerKey = await mintKey(pageOwner, bookId, "viewer");

    // A viewer session opened *before* the revocation.
    const contextViewer = await browser.newContext();
    const pageViewer = await contextViewer.newPage();
    await unlock(pageViewer, slug, viewerKey);
    expect((await pageViewer.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    // Revoke it.
    const keys = await pageOwner.request
      .get(`/api/books/${bookId}/keys`)
      .then((response) => response.json());
    const viewerRow = (keys.keys as Array<{ id: string; role: string }>).find(
      (key) => key.role === "viewer",
    );
    expect(viewerRow).toBeTruthy();
    const revoked = await pageOwner.request.delete(
      `/api/books/${bookId}/keys/${viewerRow!.id}`,
    );
    expect(revoked.status()).toBe(200);

    // A fresh unlock fails immediately — this is the security boundary.
    const rejected = await contextViewer.request.post("/api/access", {
      data: { slug, key: viewerKey },
    });
    expect(rejected.status()).toBe(401);
    expect((await rejected.json()).error).toContain("revoked");

    // The session signed before revocation keeps working until it expires
    // (12-hour stateless HMAC — no server-side handle to invalidate).
    expect((await pageViewer.request.get(`/api/books/${bookId}/tree`)).status()).toBe(200);

    // The gate shows the same message in the UI.
    const contextFresh = await browser.newContext();
    const pageFresh = await contextFresh.newPage();
    await pageFresh.goto(`/b/${slug}`);
    await pageFresh.getByLabel("Access key").fill(viewerKey);
    await pageFresh.getByRole("button", { name: "Open notebook" }).click();
    await expect(pageFresh.getByText("That access key is not valid or has been revoked.")).toBeVisible();

    // The share page marks it revoked and offers no second revocation.
    await pageOwner.goto(`/b/${slug}/share`);
    const viewerListRow = pageOwner.locator("ul.divide-y li", { hasText: "viewer" }).first();
    await expect(viewerListRow).toContainText("Revoked");
    await expect(viewerListRow.getByRole("button", { name: "Revoke" })).toHaveCount(0);

    await contextOwner.close();
    await contextViewer.close();
    await contextFresh.close();
  });

  test("rate-limits repeated unlock attempts", async ({ page }) => {
    // Created through the API so the UI's own unlock attempts on this slug
    // cannot eat into the window.
    const created = await page.request.post("/api/books", {
      data: { name: "Unlock limits" },
    });
    expect(created.status()).toBe(201);
    const { slug } = (await created.json()).book as { slug: string };

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await page.request.post("/api/access", {
        data: { slug, key: "nbkview_notarealkey000000000000000000" },
      });
      statuses.push(response.status());
    }
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(401));
    expect(statuses[8]).toBe(429);
  });
});
