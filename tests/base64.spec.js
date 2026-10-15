import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/base64.html");
});

test("encodes UTF-8 text", async ({ page }) => {
  await page.getByLabel("Text").fill("Blåbær 😀");
  await expect(page.getByLabel("Base64")).toHaveValue("QmzDpWLDpnIg8J+YgA==");
});

test("decodes Base64 to text", async ({ page }) => {
  await page.getByLabel("Base64").fill("QmzDpWLDpnIg8J+YgA==");
  await expect(page.getByLabel("Text")).toHaveValue("Blåbær 😀");
});

test("decodes URL-safe, unpadded and wrapped input", async ({ page }) => {
  await page.getByLabel("Base64").fill("QmzDpWLD\npnIg8J-YgA");
  await expect(page.getByLabel("Text")).toHaveValue("Blåbær 😀");
  await expect(page.getByLabel("Base64")).not.toHaveAttribute("aria-invalid");
});

test("flags invalid Base64", async ({ page }) => {
  const b64 = page.getByLabel("Base64");
  await b64.fill("not base64!");
  await expect(b64).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Not valid Base64.")).toBeVisible();
  await expect(page.getByLabel("Text")).toHaveValue("");

  await b64.fill("aGk=");
  await expect(b64).not.toHaveAttribute("aria-invalid");
  await expect(page.getByText("Not valid Base64.")).toBeHidden();
});

test("reports bytes that are not UTF-8", async ({ page }) => {
  await page.getByLabel("Base64").fill("//79");
  await expect(page.getByText("the 3 bytes are not UTF-8 text")).toBeVisible();
  await expect(page.getByLabel("Text")).toHaveValue("");
});

test("URL-safe switch re-encodes the current value", async ({ page }) => {
  const b64 = page.getByLabel("Base64");
  await page.getByLabel("Text").fill("ÿÿ?>");
  await expect(b64).toHaveValue("w7/Dvz8+");

  await page.getByRole("switch").check();
  await expect(b64).toHaveValue("w7_Dvz8-");

  await page.getByLabel("Text").fill("a");
  await expect(b64).toHaveValue("YQ");

  await page.getByRole("switch").uncheck();
  await expect(b64).toHaveValue("YQ==");
});

test("encodes a file", async ({ page }) => {
  await page.getByLabel("Encode a file").setInputFiles({
    name: "bytes.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 2, 253, 254, 255]),
  });
  await expect(page.getByLabel("Base64")).toHaveValue("AAEC/f7/");
  await expect(page.getByText("Encoded bytes.bin (6 bytes).")).toBeVisible();
  await expect(page.getByLabel("Text")).toHaveValue("");
});

test("copies Base64 to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Text").fill("hello");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("aGVsbG8=");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
