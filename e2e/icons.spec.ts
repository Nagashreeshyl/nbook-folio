import { expect, test } from "@playwright/test";
import { createNotebook } from "./helpers";

/**
 * Material Symbols renders an unknown ligature as literal text, which both
 * looks broken and blows up the layout (a stray word is 100–200px wide).
 */
test("every icon renders as a glyph on the main screens", async ({ page }) => {
  const { slug } = await createNotebook(page, "Icon coverage");
  const paths = [
    "/",
    "/create",
    "/demo",
    `/b/${slug}/read`,
    `/b/${slug}/edit`,
    `/b/${slug}/settings`,
    `/b/${slug}/share`,
  ];

  for (const path of paths) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll(".material-symbols-outlined")]
        .filter((element) => element.getBoundingClientRect().width > 30)
        .map((element) => (element.textContent || "").trim()),
    );
    expect(broken, `unexpected text fallbacks on ${path}`).toEqual([]);
  }
});
