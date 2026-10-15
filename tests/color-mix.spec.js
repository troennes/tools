import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/color-mix.html");
});

const css = (page) => page.locator("#css");

test("builds the default expression", async ({ page }) => {
  await expect(css(page)).toHaveText("color-mix(in oklab, #ff0066, #00d4ff)");
});

test("mixes in sRGB and shows hex and computed value", async ({ page }) => {
  await page.getByLabel("Color A", { exact: true }).fill("red");
  await page.getByLabel("Color B", { exact: true }).fill("blue");
  await page.getByLabel("Color space").selectOption("srgb");
  await expect(css(page)).toHaveText("color-mix(in srgb, red, blue)");
  await expect(page.locator("#hex")).toHaveText("#800080");
  await expect(page.locator("#computed")).toHaveText("color(srgb 0.5 0 0.5)");
});

test("ratio sets the percentage of A", async ({ page }) => {
  await page.getByLabel("Color A", { exact: true }).fill("black");
  await page.getByLabel("Color B", { exact: true }).fill("white");
  await page.getByLabel("Color space").selectOption("srgb");
  await page.getByLabel(/Amount of A/).fill("25");
  await expect(page.locator("#ratio-out")).toHaveText("25%");
  await expect(css(page)).toHaveText("color-mix(in srgb, black 25%, white)");
  await expect(page.locator("#hex")).toHaveText("#bfbfbf");
});

test("hue interpolation is only offered for polar spaces", async ({ page }) => {
  const hue = page.getByLabel("Hue interpolation");
  await expect(hue).toBeHidden();

  await page.getByLabel("Color space").selectOption("oklch");
  await expect(hue).toBeVisible();
  await expect(css(page)).toHaveText("color-mix(in oklch, #ff0066, #00d4ff)");

  await hue.selectOption("longer");
  await expect(css(page)).toHaveText("color-mix(in oklch longer hue, #ff0066, #00d4ff)");

  await page.getByLabel("Color space").selectOption("lab");
  await expect(hue).toBeHidden();
  await expect(css(page)).toHaveText("color-mix(in lab, #ff0066, #00d4ff)");
});

test("accepts any CSS color and syncs the picker", async ({ page }) => {
  await page.getByLabel("Color A", { exact: true }).fill("oklch(0.7 0.1 200)");
  await expect(page.getByLabel("Color A", { exact: true })).not.toHaveAttribute("aria-invalid");
  await page.getByLabel("Color A", { exact: true }).fill("rebeccapurple");
  await expect(page.getByLabel("Pick color A", { exact: true })).toHaveValue("#663399");
});

test("picker updates the text field", async ({ page }) => {
  await page.getByLabel("Pick color B", { exact: true }).fill("#123456");
  await expect(page.getByLabel("Color B", { exact: true })).toHaveValue("#123456");
  await expect(css(page)).toHaveText("color-mix(in oklab, #ff0066, #123456)");
});

test("flags an invalid color", async ({ page }) => {
  const b = page.getByLabel("Color B", { exact: true });
  await b.fill("nope");
  await expect(b).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#b-error")).toBeVisible();
  await expect(page.locator("#a-error")).toBeHidden();
  await expect(page.getByRole("img", { name: "Mixed color" })).toBeHidden();
  for (const name of ["Copy hex", "Copy computed", "Copy CSS"]) {
    await expect(page.getByRole("button", { name })).toBeDisabled();
  }

  await b.fill("teal");
  await expect(b).not.toHaveAttribute("aria-invalid");
  await expect(page.getByRole("img", { name: "Mixed color" })).toBeVisible();
});

for (const [name, expected] of [
  ["Copy hex", "#c693b2"],
  ["Copy computed", "oklab(0.721502 0.0692806 -0.0231263)"],
  ["Copy CSS", "color-mix(in oklab, #ff0066, #00d4ff)"],
]) {
  test(`${name} copies the value`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const button = page.getByRole("button", { name });
    await button.click();
    await expect(button).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  });
}

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("Tools");
});
