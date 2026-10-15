import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/html_entities.html");
});

const text = (page) => page.getByLabel("Text");
const escaped = (page) => page.getByLabel("Escaped HTML");

test("escapes & < > and double quotes", async ({ page }) => {
  await text(page).fill(`<a href="x?a=1&b=2">Tom & Jerry</a>`);
  await expect(escaped(page)).toHaveValue(
    "&lt;a href=&quot;x?a=1&amp;b=2&quot;&gt;Tom &amp; Jerry&lt;/a&gt;"
  );
});

test("leaves apostrophes and non-ASCII alone", async ({ page }) => {
  await text(page).fill("it's blåbær 😀");
  await expect(escaped(page)).toHaveValue("it's blåbær 😀");
});

test("does not double-encode existing entities", async ({ page }) => {
  await text(page).fill("&lt; &amp; &#60; &#x3C; &copy; & &nope");
  await expect(escaped(page)).toHaveValue("&lt; &amp; &#60; &#x3C; &copy; &amp; &amp;nope");
});

test("decodes named and numeric entities", async ({ page }) => {
  await escaped(page).fill("&lt;p class=&quot;x&quot;&gt;caf&eacute; &#x1F600; &#169;&nbsp;&amp;&lt;/p&gt;");
  await expect(text(page)).toHaveValue('<p class="x">café 😀 © &</p>');
});

test("decoding never turns markup into elements", async ({ page }) => {
  await escaped(page).fill('<img src=x onerror="window.pwned=1"><b>bold</b>');
  await expect(text(page)).toHaveValue('<img src=x onerror="window.pwned=1"><b>bold</b>');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});

test("copies the escaped HTML", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await text(page).fill("<b>");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("&lt;b&gt;");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
