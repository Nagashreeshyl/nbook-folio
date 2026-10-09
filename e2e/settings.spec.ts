import { expect, test } from "@playwright/test";
import { addBlock, createNotebook, waitForSaved } from "./helpers";

test.describe("appearance, motion and print", () => {
  test("reaches settings from the notebook header and applies theme + text size", async ({
    page,
  }) => {
    const { slug } = await createNotebook(page, "Appearance");

    await page.locator('a[title="Settings"]').click();
    await expect(page).toHaveURL(new RegExp(`/b/${slug}/settings`));
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.getByRole("button", { name: /Slate night/ }).click();
    await expect(page.locator("div.dark-tactile")).toBeVisible();
    await page.getByRole("button", { name: "Large", exact: true }).click();
    await expect(page.locator("div.nb-fs-large")).toBeVisible();

    await page.reload();
    await expect(page.locator("div.dark-tactile")).toBeVisible();
    await expect(page.locator("div.nb-fs-large")).toBeVisible();
  });

  test("animates page turns with the configured realistic style", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { slug, bookId } = await createNotebook(page, "Page animation");

    const savedSettings = () =>
      page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith(`/api/books/${bookId}`) &&
          candidate.request().method() === "PATCH" &&
          candidate.status() === 200,
      );

    await page.locator('button[title="Add page"]').first().click();
    await page.goto(`/b/${slug}/settings`);
    // The PATCH must land before we navigate away, or the click is lost.
    await Promise.all([
      savedSettings(),
      page.getByRole("button", { name: "Realistic", exact: true }).click(),
    ]);

    await page.goto(`/b/${slug}/edit`);
    await expect(page.locator("article")).toHaveClass(/page-turn--realistic/);
    const animation = await page
      .locator("article")
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toContain("page-flip-in");

    await page.locator("article footer button").last().click();
    await expect(page).toHaveURL(/page=/);
    await expect(page.locator("article")).toHaveClass(/page-turn--realistic/);

    await context.close();
  });

  test("plays the paper sound only when it is enabled", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const store = window as unknown as { __bursts: number };
      store.__bursts = 0;
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function patched(this: AudioContext) {
        store.__bursts += 1;
        return original.call(this);
      };
    });

    const { slug, bookId } = await createNotebook(page, "Page sound");
    const bursts = () =>
      page.evaluate(() => (window as unknown as { __bursts: number }).__bursts);
    const savedSettings = () =>
      page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith(`/api/books/${bookId}`) &&
          candidate.request().method() === "PATCH" &&
          candidate.status() === 200,
      );
    const soundSwitch = page.getByRole("switch", { name: "Page turn sound" });

    await page.locator('button[title="Add page"]').first().click();
    await page.goto(`/b/${slug}/settings`);
    await expect(soundSwitch).toHaveAttribute("aria-checked", "false");
    await Promise.all([savedSettings(), soundSwitch.click()]);
    await expect(soundSwitch).toHaveAttribute("aria-checked", "true");

    // The stored preference must survive a full reload, not just the session.
    await page.reload();
    await expect(soundSwitch).toHaveAttribute("aria-checked", "true");

    await page.goto(`/b/${slug}/edit`);
    await page.locator("article footer button").last().click();
    await page.waitForURL(/page=/);
    await expect.poll(bursts).toBeGreaterThan(0);

    await page.goto(`/b/${slug}/settings`);
    await Promise.all([savedSettings(), soundSwitch.click()]);
    await expect(soundSwitch).toHaveAttribute("aria-checked", "false");
    await page.goto(`/b/${slug}/edit`);
    const after = await bursts();
    await page.locator("article footer button").first().click();
    await page.waitForURL(/page=/);
    expect(await bursts()).toBe(after);

    await context.close();
  });

  test("honours reduced motion even when the sound setting is on", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const store = window as unknown as { __bursts: number };
      store.__bursts = 0;
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function patched(this: AudioContext) {
        store.__bursts += 1;
        return original.call(this);
      };
    });

    const { slug, bookId } = await createNotebook(page, "Reduced motion");
    await page.locator('button[title="Add page"]').first().click();
    await page.goto(`/b/${slug}/settings`);
    await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith(`/api/books/${bookId}`) &&
          candidate.request().method() === "PATCH" &&
          candidate.status() === 200,
      ),
      page.getByRole("switch", { name: "Page turn sound" }).click(),
    ]);

    await page.goto(`/b/${slug}/edit`);
    await page.locator("article footer button").last().click();
    await page.waitForURL(/page=/);

    expect(
      await page.evaluate(() => (window as unknown as { __bursts: number }).__bursts),
    ).toBe(0);
    const animation = await page
      .locator("article")
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toBe("none");

    // Reduced motion must not quietly rewrite the stored preference either.
    await page.goto(`/b/${slug}/settings`);
    await expect(page.getByRole("switch", { name: "Page turn sound" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await context.close();
  });

  test("keeps the sound setting and the animation setting independent", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const store = window as unknown as { __bursts: number };
      store.__bursts = 0;
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function patched(this: AudioContext) {
        store.__bursts += 1;
        return original.call(this);
      };
    });

    const { slug, bookId } = await createNotebook(page, "Sound and animation");
    const savedSettings = () =>
      page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith(`/api/books/${bookId}`) &&
          candidate.request().method() === "PATCH" &&
          candidate.status() === 200,
      );

    await page.locator('button[title="Add page"]').first().click();
    await page.goto(`/b/${slug}/settings`);
    await Promise.all([savedSettings(), page.getByRole("button", { name: "None", exact: true }).click()]);
    await Promise.all([
      savedSettings(),
      page.getByRole("switch", { name: "Page turn sound" }).click(),
    ]);

    await page.goto(`/b/${slug}/edit`);
    await expect(page.locator("article")).toHaveClass(/page-turn-none/);
    await page.locator("article footer button").last().click();
    await page.waitForURL(/page=/);
    await expect.poll(async () => page.evaluate(() => (window as unknown as { __bursts: number }).__bursts)).toBeGreaterThan(0);

    // Both preferences survive the reload independently of each other.
    await page.goto(`/b/${slug}/settings`);
    await expect(page.getByRole("switch", { name: "Page turn sound" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.goto(`/b/${slug}/edit`);
    await expect(page.locator("article")).toHaveClass(/page-turn-none/);

    await context.close();
  });

  test("switches the shell to RTL for Arabic", async ({ page }) => {
    const { slug } = await createNotebook(page, "Arabic layout");
    await page.evaluate(() => window.localStorage.setItem("nbook.locale", "ar"));

    await page.goto(`/b/${slug}/read`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("aside")).toBeVisible();

    // Logical properties must drive the layout: the sidebar rule flips sides.
    const borders = await page
      .locator("aside")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { inlineEnd: style.borderRightWidth, inlineStart: style.borderLeftWidth };
      });
    expect(borders.inlineEnd).toBe("0px");
    expect(borders.inlineStart).not.toBe("0px");
  });

  test("strips chrome in print media and produces a PDF", async ({ page }) => {
    await createNotebook(page, "Print output");
    await addBlock(page, "Text");
    await page.locator(".tiptap").first().click();
    await page.keyboard.type("Something worth printing");
    await waitForSaved(page);

    await page.emulateMedia({ media: "print" });
    await expect(page.locator("header.sticky")).toBeHidden();
    await expect(page.locator(".tactile-folio-sheet")).toBeVisible();

    const pdf = await page.pdf({ format: "A4" });
    expect(pdf.byteLength).toBeGreaterThan(1_500);
    await page.emulateMedia({ media: "screen" });
  });
});
