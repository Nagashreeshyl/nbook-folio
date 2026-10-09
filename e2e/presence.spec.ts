import { expect, test, type Page } from "@playwright/test";
import { createNotebook, unlock } from "./helpers";

/** Collaborator rows on the share page (A + B when both are present). */
function collaborators(page: Page) {
  return page.locator("section", { hasText: "Collaborators" }).locator("li");
}

test.describe("presence", () => {
  test("lists two live sessions and clears the one that leaves", async ({ browser }) => {
    // Heartbeats are 15s and presence expires after 30s, so this one is slow
    // by design.
    test.setTimeout(210_000);

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const { slug, bookId } = await createNotebook(pageA, "Presence");

    const editorKey = await pageA.request
      .post(`/api/books/${bookId}/keys`, { data: { role: "editor" } })
      .then((response) => response.json())
      .then((body) => body.plaintext as string);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await unlock(pageB, slug, editorKey);

    // A learns about B on its next heartbeat (~15s); B reports on mount.
    await pageA.goto(`/b/${slug}/share`);
    await expect.poll(() => collaborators(pageA).count(), { timeout: 40_000 }).toBe(2);

    await pageB.goto(`/b/${slug}/share`);
    await expect.poll(() => collaborators(pageB).count(), { timeout: 40_000 }).toBe(2);
    await expect(collaborators(pageB).filter({ hasText: "you" })).toHaveCount(1);

    // B disappears only once its heartbeat goes stale (30s server TTL) and A
    // polls again — presence is deliberately eventually-consistent.
    await contextB.close();
    await expect.poll(() => collaborators(pageA).count(), { timeout: 75_000 }).toBe(1);
    await expect(collaborators(pageA).filter({ hasText: "you" })).toHaveCount(1);
  });
});
