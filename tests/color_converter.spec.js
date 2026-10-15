import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/color_converter.html");
});

const input = (page) => page.getByLabel("Color", { exact: true });
const out = (page, id) => page.locator(`#out-${id}`);

test("converts the default color to every format", async ({ page }) => {
  await expect(out(page, "hex")).toHaveText("#7aa2ff");
  await expect(out(page, "rgb")).toHaveText("rgb(122 162 255)");
  await expect(out(page, "hsl")).toHaveText("hsl(222 100% 73.9%)");
  await expect(out(page, "oklch")).toHaveText("oklch(0.7231 0.1429 265.39)");
  await expect(out(page, "oklab")).toHaveText("oklab(0.7231 -0.0115 -0.1424)");
  await expect(out(page, "lab")).toHaveText("lab(66.7 5.7 -51.2)");
  await expect(out(page, "lch")).toHaveText("lch(66.7 51.6 276.4)");
  await expect(out(page, "display-p3")).toHaveText("color(display-p3 0.511 0.631 0.973)");
  await expect(page.getByText("Outside the sRGB gamut")).toBeHidden();
});

test("accepts any CSS color syntax", async ({ page }) => {
  await input(page).fill("hsl(200 50% 40%)");
  await expect(out(page, "hex")).toHaveText("#337799");
  await input(page).fill("rebeccapurple");
  await expect(out(page, "rgb")).toHaveText("rgb(102 51 153)");
});

test("shows alpha only when below 1", async ({ page }) => {
  await input(page).fill("rgb(255 0 0 / 50%)");
  await expect(out(page, "hex")).toHaveText("#ff000080");
  await expect(out(page, "rgb")).toHaveText("rgb(255 0 0 / 50%)");
  await expect(out(page, "oklch")).toHaveText("oklch(0.628 0.2577 29.23 / 50%)");
});

test("greys get a clean zero chroma and hue", async ({ page }) => {
  await input(page).fill("grey");
  await expect(out(page, "hsl")).toHaveText("hsl(0 0% 50.2%)");
  await expect(out(page, "oklch")).toHaveText("oklch(0.5999 0 0)");
  await expect(out(page, "lch")).toHaveText("lch(53.6 0 0)");
});

test("maps out-of-gamut colors into sRGB and warns", async ({ page }) => {
  await input(page).fill("oklch(0.7 0.3 150)");
  await expect(page.getByText("Outside the sRGB gamut")).toBeVisible();
  await expect(out(page, "hex")).toHaveText("#00be58");
  await expect(out(page, "oklch")).toHaveText("oklch(0.7 0.3 150)");

  await input(page).fill("green");
  await expect(page.getByText("Outside the sRGB gamut")).toBeHidden();
});

test("picker and text field stay in sync", async ({ page }) => {
  await input(page).fill("rebeccapurple");
  await expect(page.getByLabel("Pick color")).toHaveValue("#663399");
  await page.getByLabel("Pick color").fill("#123456");
  await expect(input(page)).toHaveValue("#123456");
  await expect(out(page, "rgb")).toHaveText("rgb(18 52 86)");
});

test("flags an invalid color", async ({ page }) => {
  await input(page).fill("nope");
  await expect(input(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Not a valid CSS color.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Color preview" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Copy Hex" })).toBeDisabled();

  await input(page).fill("teal");
  await expect(input(page)).not.toHaveAttribute("aria-invalid");
  await expect(page.getByRole("button", { name: "Copy Hex" })).toBeEnabled();
});

for (const [name, expected] of [
  ["Copy Hex", "#7aa2ff"],
  ["Copy OKLCH", "oklch(0.7231 0.1429 265.39)"],
  ["Copy Display P3", "color(display-p3 0.511 0.631 0.973)"],
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
