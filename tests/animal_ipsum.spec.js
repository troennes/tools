import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/animal_ipsum.html");
});

const ANIMAL = /penguin|octopus|elephant|wolf|wolves|honey bee|axolotl|red panda|snow leopard|blue whale/i;

// Every fact ends with a full stop and none contain abbreviations, so ". " splits sentences.
async function paragraphs(page) {
  const text = await page.getByLabel("Text").inputValue();
  return text.split("\n\n").map((p) => p.split(/(?<=\.) /));
}

test("generates 3 paragraphs of 5 sentences by default", async ({ page }) => {
  const paras = await paragraphs(page);
  expect(paras).toHaveLength(3);
  for (const p of paras) expect(p).toHaveLength(5);
});

test("paragraph and sentence counts follow the inputs", async ({ page }) => {
  await page.getByLabel("Paragraphs").fill("7");
  await page.getByLabel("Sentences").fill("2");
  const paras = await paragraphs(page);
  expect(paras).toHaveLength(7);
  for (const p of paras) expect(p).toHaveLength(2);
});

test("counts are clamped to 1–20", async ({ page }) => {
  await page.getByLabel("Paragraphs").fill("0");
  expect(await paragraphs(page)).toHaveLength(1);
  await page.getByLabel("Paragraphs").fill("99");
  expect(await paragraphs(page)).toHaveLength(20);
});

test("mixed gives each paragraph its own animal, introduced by name", async ({ page }) => {
  await page.getByLabel("Sentences").fill("3");
  await page.getByLabel("Paragraphs").fill("9");
  const animals = (await paragraphs(page)).map(([first]) => first.match(ANIMAL)?.[0].toLowerCase());
  expect(animals.every(Boolean)).toBe(true);
  expect(new Set(animals.map((a) => a.replace("wolves", "wolf"))).size).toBe(9);
});

test("a single animal stays on topic and no paragraph opens with a pronoun", async ({ page }) => {
  await page.getByLabel("Animal").selectOption("octopus");
  await page.getByLabel("Paragraphs").fill("6");
  for (let run = 0; run < 5; run++) {
    await page.getByRole("button", { name: "Regenerate" }).click();
    const paras = await paragraphs(page);
    expect(paras[0][0]).toMatch(/octopus/i);
    for (const [first] of paras) expect(first).not.toMatch(/^(They|Their)\b/);
  }
});

test("Regenerate makes new text", async ({ page }) => {
  const before = await page.getByLabel("Text").inputValue();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByLabel("Text")).not.toHaveValue(before);
});

test("copies the text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const text = await page.getByLabel("Text").inputValue();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("Tools");
});
