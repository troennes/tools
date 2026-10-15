import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/hash_tool.html");
});

// Expected values come from Node's crypto module and coreutils cksum.
const HELLO = {
  sha256: "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3",
  sha512: "c1527cd893c124773d811911970c8fe6e857d6df5dc9226bd8a160614c0cd963a4ddea2b94bb7d36021ef9d865d5cea294a82dd49a0bb269f51f6e7a57f79421",
  sha1: "943a702d06f34599aee1f8da8ef9f7296031d699",
  md5: "6cd3556deb0da54bca060b4c39479839",
  sha384: "55bc556b0d2fe0fce582ba5fe07baafff035653638c7ac0d5494c2a64c0bea1cc57331c7c12a45cdbca7f4c34a089eeb",
  sha224: "8552d8b7a7dc5476cb9e25dee69a8091290764b7f2a64fe6e78e9568",
  "sha3-256": "f345a219da005ebe9c1a1eaad97bbf38a10c8473e41d0af7fb617caa0c6aa722",
  cksum: "1403953672 13",
};

const out = (page, id) => page.locator(`#out-${id}`);
const text = (page) => page.getByLabel("Text");
const compare = (page) => page.getByLabel("Compare with");

test("shows a dash for every hash until there is input", async ({ page }) => {
  for (const id of Object.keys(HELLO)) await expect(out(page, id)).toHaveText("–");
  await expect(page.getByRole("button", { name: "Copy SHA-256" })).toBeDisabled();
});

test("hashes text with every algorithm", async ({ page }) => {
  await text(page).fill("Hello, world!");
  for (const [id, value] of Object.entries(HELLO)) await expect(out(page, id)).toHaveText(value);
});

test("hashes text as UTF-8", async ({ page }) => {
  await text(page).fill("blåbær");
  await expect(out(page, "md5")).toHaveText("c4a10e900dc6ef1c582684e633fce604");
});

test("hashes a file, and typing switches back to text", async ({ page }) => {
  await text(page).fill("Hello, world!");
  await page.getByLabel("Or hash a file").setInputFiles({
    name: "bytes.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 2, 253, 254, 255]),
  });
  await expect(out(page, "sha256")).toHaveText("3f2d1552cdc7483f40dd720c80b900225dfecfd5cae7cd168d79ab6ee5959885");
  await expect(out(page, "cksum")).toHaveText("2809817534 6");
  await expect(page.getByText("bytes.bin (6 bytes).")).toBeVisible();
  await expect(text(page)).toHaveValue("");

  await text(page).fill("Hello, world!");
  await expect(out(page, "sha256")).toHaveText(HELLO.sha256);
  await expect(page.locator("#file-note")).toBeHidden();
  await expect(page.getByLabel("Or hash a file")).toHaveValue("");
});

test("compare marks the matching algorithm", async ({ page }) => {
  await text(page).fill("Hello, world!");
  await compare(page).fill(HELLO.md5.toUpperCase());
  await expect(compare(page)).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByText("Matches MD5.")).toBeVisible();
  await expect(page.locator("#match-md5")).toBeVisible();
  await expect(page.locator("#match-sha256")).toBeHidden();
});

test("compare accepts a sha256sum line", async ({ page }) => {
  await text(page).fill("Hello, world!");
  await compare(page).fill(`${HELLO.sha256}  hello.txt`);
  await expect(page.getByText("Matches SHA-256.")).toBeVisible();
});

test("compare reports a mismatch", async ({ page }) => {
  await text(page).fill("Hello, world!");
  await compare(page).fill("deadbeef");
  await expect(compare(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Doesn't match any of the hashes.")).toBeVisible();

  await compare(page).fill("");
  await expect(compare(page)).not.toHaveAttribute("aria-invalid");
  await expect(page.locator("#compare-note")).toBeHidden();
});

test("compare updates when the input changes", async ({ page }) => {
  await compare(page).fill(HELLO.sha1);
  await expect(page.locator("#compare-note")).toBeHidden();
  await text(page).fill("Hello, world!");
  await expect(page.getByText("Matches SHA-1.")).toBeVisible();
  await text(page).fill("Hello, world");
  await expect(page.getByText("Doesn't match any of the hashes.")).toBeVisible();
});

test("copies a hash", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await text(page).fill("Hello, world!");
  const button = page.getByRole("button", { name: "Copy SHA-256" });
  await button.click();
  await expect(button).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(HELLO.sha256);
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
