import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/unit_converter.html");
});

const first = (page) => page.getByLabel("First value");
const second = (page) => page.getByLabel("Second value");
const firstUnit = (page) => page.getByLabel("First unit");
const secondUnit = (page) => page.getByLabel("Second unit");
const tab = (page, name) => page.getByRole("button", { name, exact: true });

test("starts on weight, converting 1 kg to pounds", async ({ page }) => {
  await expect(tab(page, "Weight")).toHaveAttribute("aria-current", "page");
  await expect(first(page)).toHaveValue("1");
  await expect(firstUnit(page)).toHaveValue("kg");
  await expect(secondUnit(page)).toHaveValue("lb");
  await expect(second(page)).toHaveValue("2.20462");
});

test("converts both ways as you type", async ({ page }) => {
  await first(page).fill("12,5");
  await expect(second(page)).toHaveValue("27.5578");
  await second(page).fill("1");
  await expect(first(page)).toHaveValue("0.453592");
  await second(page).fill("");
  await expect(first(page)).toHaveValue("");
});

test("changing a unit keeps the number last typed", async ({ page }) => {
  await second(page).fill("10");
  await firstUnit(page).selectOption("g");
  await expect(second(page)).toHaveValue("10");
  await expect(first(page)).toHaveValue("4535.92");
  await secondUnit(page).selectOption("oz");
  await expect(first(page)).toHaveValue("283.495");
});

test("temperature uses offsets and stops at absolute zero", async ({ page }) => {
  await tab(page, "Temperature").click();
  await expect(second(page)).toHaveValue("33.8");
  await first(page).fill("-40");
  await expect(second(page)).toHaveValue("-40");
  await secondUnit(page).selectOption("K");
  await expect(second(page)).toHaveValue("233.15");
  await second(page).fill("-1");
  await expect(second(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("That's below absolute zero.")).toBeVisible();
  await expect(first(page)).toHaveValue("");
  await second(page).fill("0");
  await expect(second(page)).not.toHaveAttribute("aria-invalid");
  await expect(first(page)).toHaveValue("-273.15");
});

test("rejects text and negative amounts", async ({ page }) => {
  await first(page).fill("abc");
  await expect(first(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a number, like 12.5.")).toBeVisible();
  await expect(second(page)).toHaveValue("");
  await first(page).fill("-2");
  await expect(page.getByText("Enter a number of 0 or more.")).toBeVisible();
  await first(page).fill("2");
  await expect(first(page)).not.toHaveAttribute("aria-invalid");
  await expect(page.getByText("Enter a number of 0 or more.")).toBeHidden();
});

test("each tab keeps its own values", async ({ page }) => {
  await first(page).fill("3");
  await tab(page, "Length").click();
  await expect(firstUnit(page)).toHaveValue("m");
  await expect(second(page)).toHaveValue("3.28084");
  await secondUnit(page).selectOption("mi");
  await first(page).fill("5000");
  await tab(page, "Weight").click();
  await expect(first(page)).toHaveValue("3");
  await expect(second(page)).toHaveValue("6.61387");
  await tab(page, "Length").click();
  await expect(secondUnit(page)).toHaveValue("mi");
  await expect(second(page)).toHaveValue("3.10686");
});

test("area, volume and time", async ({ page }) => {
  await tab(page, "Area").click();
  await firstUnit(page).selectOption("ha");
  await secondUnit(page).selectOption("daa");
  await expect(second(page)).toHaveValue("10");
  await secondUnit(page).selectOption("ac");
  await expect(second(page)).toHaveValue("2.47105");

  await tab(page, "Volume").click();
  await expect(secondUnit(page)).toHaveValue("imp gal");
  await expect(second(page)).toHaveValue("0.219969");
  await firstUnit(page).selectOption("cup");
  await secondUnit(page).selectOption("tbsp");
  await expect(second(page)).toHaveValue("16.6667");
  await firstUnit(page).selectOption("US cup");
  await secondUnit(page).selectOption("US tbsp");
  await expect(second(page)).toHaveValue("16");
  await firstUnit(page).selectOption("imp pt");
  await secondUnit(page).selectOption("US pt");
  await expect(second(page)).toHaveValue("1.20095");
  await expect(secondUnit(page).locator("option:checked")).toHaveText("Pint (US pt)");
  await expect(firstUnit(page).locator("optgroup")).toHaveText([/Litre/, /Pint/, /Pint/]);

  await tab(page, "Time").click();
  await expect(second(page)).toHaveValue("60");
  await firstUnit(page).selectOption("yr");
  await secondUnit(page).selectOption("d");
  await expect(second(page)).toHaveValue("365.243");
});

test("uses e-notation for very large and small numbers", async ({ page }) => {
  await tab(page, "Length").click();
  await firstUnit(page).selectOption("mm");
  await secondUnit(page).selectOption("km");
  await expect(second(page)).toHaveValue("0.000001");
  await first(page).fill("0.5");
  await expect(second(page)).toHaveValue("5e-7");
  await first(page).fill("1e21");
  await expect(second(page)).toHaveValue("1e15");
  await first(page).fill("1 234 567");
  await expect(second(page)).toHaveValue("1.23457");
});

test("swapping units keeps the number last typed", async ({ page }) => {
  await tab(page, "Length").click();
  await expect(second(page)).toHaveValue("3.28084");
  await page.getByRole("button", { name: "Swap units" }).click();
  await expect(firstUnit(page)).toHaveValue("ft");
  await expect(secondUnit(page)).toHaveValue("m");
  await expect(first(page)).toHaveValue("1");
  await expect(second(page)).toHaveValue("0.3048");

  await second(page).fill("2");
  await page.getByRole("button", { name: "Swap units" }).click();
  await expect(second(page)).toHaveValue("2");
  await expect(secondUnit(page)).toHaveValue("ft");
  await expect(first(page)).toHaveValue("0.6096");
});
