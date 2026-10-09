import { expect, test } from "@playwright/test";
import { createNotebook } from "./helpers";

test.describe("phone-sized viewports", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hides the desktop sidebar and navigates through the drawer", async ({ page }) => {
    await createNotebook(page, "Pocket edition");
    await expect(page.locator("aside")).toBeHidden();

    await page.getByRole("button", { name: "Contents" }).click();
    const drawer = page.getByRole("navigation", { name: "Contents" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Chapter 1");

    await drawer.getByText("Untitled page").first().click();
    await expect(page).toHaveURL(new RegExp(`page=`));
    await expect(drawer).toBeHidden();

    await expect(page.locator("article")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("keeps the write controls reachable on a narrow screen", async ({ page }) => {
    await createNotebook(page, "Thumb typing");

    const add = page.getByRole("button", { name: "Add block" }).last();
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
  });
});
