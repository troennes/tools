import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/salt_calculator.html");
});

const pot = (page, n) => page.getByRole("region", { name: `Pot ${n}` });
const weight = (page, p, n) => page.getByLabel(`Pot ${p} ingredient ${n} (g)`, { exact: true });
const boiling = (page, p) => pot(page, p).getByRole("switch", { name: "Boiling" });
const water = (page, p) => pot(page, p).getByLabel("Water (g)");
const salt = (page, p) => page.getByLabel(`Salt for pot ${p}`);

test("sums a pot's ingredients and adds fields as you go", async ({ page }) => {
  await expect(pot(page, 1)).toContainText("Enter weights");
  await expect(page.getByRole("button", { name: "Remove pot 1" })).toBeHidden();
  await weight(page, 1, 1).fill("500");
  await weight(page, 1, 2).fill("300");
  await weight(page, 1, 3).fill("50");
  await expect(weight(page, 1, 4)).toHaveValue("");
  await expect(salt(page, 1)).toHaveText("8.5 g");
  await expect(pot(page, 1)).toContainText("850 g of food");
  await expect(pot(page, 1)).toContainText("≈ 1½ tsp");
});

test("an emptied field in the middle goes away when you leave it", async ({ page }) => {
  await weight(page, 1, 1).fill("100");
  await weight(page, 1, 2).fill("200");
  await weight(page, 1, 1).fill("");
  await weight(page, 1, 1).blur();
  await expect(weight(page, 1, 1)).toHaveValue("200");
  await expect(weight(page, 1, 2)).toHaveValue("");
  await expect(weight(page, 1, 3)).toHaveCount(0);
  await expect(salt(page, 1)).toHaveText("2 g");
});

test("a boiling pot salts its water at twice the preference", async ({ page }) => {
  await weight(page, 1, 1).fill("400");
  await page.getByRole("button", { name: "+ Add pot" }).click();
  await expect(weight(page, 2, 1)).toBeFocused();
  await weight(page, 2, 1).fill("300");
  await boiling(page, 2).check();
  await expect(water(page, 2)).toHaveValue("3000");
  await expect(salt(page, 1)).toHaveText("4 g");
  await expect(pot(page, 1)).toContainText("≈ ¾ tsp");
  await expect(salt(page, 2)).toHaveText("60 g");
  await expect(pot(page, 2)).toContainText("3,000 g of water");
  await expect(pot(page, 2)).toContainText("≈ 3½ tbsp");

  // An edited water amount sticks when the food changes.
  await water(page, 2).fill("2000");
  await expect(salt(page, 2)).toHaveText("40 g");
  await weight(page, 2, 1).fill("250");
  await expect(water(page, 2)).toHaveValue("2000");

  // Clearing it makes it follow the food again.
  await water(page, 2).fill("");
  await expect(salt(page, 2)).toHaveText("50 g");
  await weight(page, 2, 1).fill("200");
  await expect(water(page, 2)).toHaveValue("2000");

  await boiling(page, 2).uncheck();
  await expect(water(page, 2)).toBeHidden();
  await expect(salt(page, 2)).toHaveText("2 g");
});

test("removing a pot renumbers the rest", async ({ page }) => {
  await weight(page, 1, 1).fill("100");
  await page.getByRole("button", { name: "+ Add pot" }).click();
  await weight(page, 2, 1).fill("300");
  await page.getByRole("button", { name: "Remove pot 1" }).click();
  await expect(pot(page, 2)).toHaveCount(0);
  await expect(weight(page, 1, 1)).toHaveValue("300");
  await expect(salt(page, 1)).toHaveText("3 g");
  await expect(page.getByRole("button", { name: "Remove pot 1" })).toBeHidden();
});

test("preference is remembered and accepts a decimal comma", async ({ page }) => {
  await page.getByLabel("Salt preference (%)").fill("1,5");
  await weight(page, 1, 1).fill("500");
  await expect(salt(page, 1)).toHaveText("7.5 g");
  await page.reload();
  await expect(page.getByLabel("Salt preference (%)")).toHaveValue("1,5");
});

test("invalid input is flagged", async ({ page }) => {
  await weight(page, 1, 1).fill("abc");
  await expect(weight(page, 1, 1)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter weights in grams")).toBeVisible();
  await weight(page, 1, 1).fill("500");
  await expect(weight(page, 1, 1)).not.toHaveAttribute("aria-invalid");
  await expect(page.getByText("Enter weights in grams")).toBeHidden();

  const pref = page.getByLabel("Salt preference (%)");
  await pref.fill("0");
  await expect(pref).toHaveAttribute("aria-invalid", "true");
  await expect(salt(page, 1)).toBeHidden();
  await expect(pot(page, 1)).toContainText("Fix the salt preference");
});

test("tiny amounts read as a pinch", async ({ page }) => {
  await weight(page, 1, 1).fill("20");
  await expect(salt(page, 1)).toHaveText("0.2 g");
  await expect(pot(page, 1)).toContainText("a pinch");
});
