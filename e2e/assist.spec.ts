import { expect, test, type Page } from "@playwright/test";
import { controlMockAi, createNotebook, resetMockAi } from "./helpers";

async function openAssist(page: Page) {
  await page.getByRole("button", { name: "Ask NBOOK" }).click();
  const panel = page.getByRole("complementary", { name: "NBOOK Assist" });
  await expect(panel.first()).toBeVisible();
  return panel.first();
}

async function ask(page: Page, question: string) {
  await page.getByPlaceholder("Ask about this notebook…").first().fill(question);
  await page.getByRole("button", { name: "Send" }).first().click();
}

test.describe("Assist panel", () => {
  test.beforeEach(async () => {
    await resetMockAi();
  });

  test.afterEach(async () => {
    await resetMockAi();
  });

  test("answers from the configured provider and names it", async ({ page }) => {
    await createNotebook(page, "Assist answer");
    await openAssist(page);
    await expect(page.getByText("Pick an action, then select text").first()).toBeVisible();

    await ask(page, "What is this notebook about?");
    await expect(page.getByText("What is this notebook about?").first()).toBeVisible();
    await expect(page.getByText("Mocked groq completion for nbook-e2e-groq-model.").first()).toBeVisible();
    await expect(page.getByText("groq · nbook-e2e-groq-model").first()).toBeVisible();
  });

  test("falls back to the second provider when the first fails", async ({ page }) => {
    await controlMockAi({ groq: "fail", openrouter: "ok" });
    await createNotebook(page, "Assist fallback");
    await openAssist(page);

    await ask(page, "Summarise this page");
    await expect(page.getByText("Mocked openrouter completion").first()).toBeVisible();
    await expect(page.getByText(/fell back after \d+ failure/).first()).toBeVisible();
  });

  test("reports both providers failing as a friendly error", async ({ page }) => {
    await controlMockAi({ groq: "fail", openrouter: "fail" });
    await createNotebook(page, "Assist all fail");
    await openAssist(page);

    await ask(page, "Anything here?");
    await expect(
      page.getByText("All AI providers failed. Please try again in a moment.").first(),
    ).toBeVisible();
  });

  test("explains a missing provider instead of failing silently", async ({ page }) => {
    await createNotebook(page, "Assist unconfigured");
    await page.route("**/api/ai", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "not configured", code: "ai_not_configured" }),
      }),
    );

    await openAssist(page);
    await ask(page, "Is anything configured?");
    await expect(
      page
        .getByText(
          "No AI provider is configured. Add GROQ_API_KEY or OPENROUTER_API_KEY to the environment.",
        )
        .first(),
    ).toBeVisible();
  });

  test("shows a loading state while the answer is in flight", async ({ page }) => {
    await controlMockAi({ delayMs: 1500 });
    await createNotebook(page, "Assist loading");
    await openAssist(page);

    await ask(page, "A slow question");
    await expect(page.getByText("Loading…").first()).toBeVisible();
    await expect(page.getByText("Mocked groq completion").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });

  test("asks for a selection before running a text feature", async ({ page }) => {
    await createNotebook(page, "Assist selection");
    await openAssist(page);

    // Explain is the default action; pressing Run with no selection warns.
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("Select some text on the page to use this.").first()).toBeVisible();
    // Nothing was sent: the panel still shows its empty state.
    await expect(page.getByText("Pick an action, then select text").first()).toBeVisible();
  });
});
