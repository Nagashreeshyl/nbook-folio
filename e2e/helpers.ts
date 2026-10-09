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
  // The palette mounts its search box and focuses it on the next tick; typing
  // via the page keyboard too early is dropped. Target the input directly and
  // wait for it to be editable so the query always lands.
  const search = page.getByRole("listbox").getByRole("textbox");
  await expect(search).toBeVisible();
  await search.fill(query);
  await search.press("Enter");
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
 * Establishes a session for a notebook using an access key.
 *
 * The gate UI no longer prompts for a key (sharing is PIN-based now), so the
 * exchange goes straight through the API — this sets the same signed cookie
 * the UI used to, then we land on the notebook.
 */
export async function unlock(page: Page, slug: string, key: string) {
  const response = await page.request.post("/api/access", {
    data: { slug, key },
  });
  expect(response.status()).toBe(200);
  await page.goto(`/b/${slug}/read`);
  await page.waitForURL(`**/b/${slug}/**`);
}

/** Opens a PIN-protected notebook through the gate's PIN entry page. */
export async function unlockWithPin(page: Page, slug: string, pin: string) {
  await page.goto(`/b/${slug}`);
  const field = page.getByLabel("PIN", { exact: true });
  await expect(field).toBeVisible();
  await field.fill(pin);
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

