import { expect, type Page } from "@playwright/test";

export interface NotebookFixture {
  slug: string;
  ownerKey: string;
  pageId: string;
  bookId: string;
}

/** Creates a notebook through the UI and lands in edit mode on the seeded page. */
export async function createNotebook(page: Page, name: string): Promise<NotebookFixture> {
  await page.goto("/create");
  await page.getByLabel("Book name").fill(name);

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/books") &&
        candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Create book" }).click(),
  ]);

  expect(response.status()).toBe(201);
  const body = await response.json();
  await page.getByRole("button", { name: "Open NBOOK" }).click();
  await page.waitForURL(`**/b/${body.book.slug}/edit*`);
  await expect(page).toHaveURL(new RegExp(`page=${body.page.id}`));

  return {
    slug: body.book.slug,
    ownerKey: body.ownerKey.plaintext,
    pageId: body.page.id,
    bookId: body.book.id,
  };
}

/** Opens the block palette and picks an option by filtering the palette search box. */
export async function addBlock(page: Page, query: string) {
  const before = await page.locator(".nb-block").count();
  await page.getByRole("button", { name: "Add block" }).last().click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.type(query);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  // Creation is a round trip: typing into `.tiptap` too early lands in the
  // previous block's editor.
  await expect(page.locator(".nb-block")).toHaveCount(before + 1);
}

/** Waits for the per-block autosave debounce to finish and confirm a save. */
export async function waitForSaved(page: Page) {
  await expect(page.locator('span[aria-live="polite"]').first()).toHaveText("saved", {
    timeout: 30_000,
  });
}

/**
 * Exchanges an access key through the unlock gate.
 *
 * `/b/:slug` 307-redirects to `/read`, so the URL alone cannot tell a finished
 * unlock — wait for the key field to disappear instead.
 */
export async function unlock(page: Page, slug: string, key: string) {
  await page.goto(`/b/${slug}`);
  const field = page.getByLabel("Access key");
  await expect(field).toBeVisible();
  await field.fill(key);
  await page.getByRole("button", { name: "Open notebook" }).click();
  await expect(field).toBeHidden();
  await page.waitForURL(`**/b/${slug}/**`);
}

/** Behaviour of the local AI stand-in, one entry per provider. */
export interface MockAiState {
  groq?: "ok" | "fail" | "slow";
  openrouter?: "ok" | "fail" | "slow";
  delayMs?: number;
}

const MOCK_AI_URL = "http://127.0.0.1:8799";

/** Steers the local AI stand-in (see `mock-ai-server.mjs`). */
export async function controlMockAi(state: MockAiState): Promise<void> {
  const response = await fetch(`${MOCK_AI_URL}/_control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(`mock AI control failed: ${response.status}`);
}

/** Back to both providers healthy with no artificial latency. */
export async function resetMockAi(): Promise<void> {
  await controlMockAi({ groq: "ok", openrouter: "ok", delayMs: 0 });
}

