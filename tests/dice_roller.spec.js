import { test, expect } from "@playwright/test";

// Replaces the CSPRNG with a fixed queue of 32-bit values, so a value v rolls face (v % sides) + 1.
async function fixRandom(page, values) {
  await page.evaluate((values) => {
    window.__queue = [...values];
    crypto.getRandomValues = (arr) => {
      arr[0] = window.__queue.shift();
      return arr;
    };
  }, values);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/html/dice_roller.html");
});

const total = (page) => page.getByLabel("Total", { exact: true });
const result = (page) => page.getByRole("region", { name: "Result" });

test("counters and notation stay in sync", async ({ page }) => {
  await page.getByRole("button", { name: "Increase d8" }).click();
  await page.getByRole("button", { name: "Increase d8" }).click();
  await page.getByRole("button", { name: "Increase d6" }).click();
  await page.getByLabel("Modifier", { exact: true }).fill("-2");
  await expect(page.getByLabel("Dice", { exact: true })).toHaveValue("2d8+1d6-2");

  await page.getByLabel("Dice", { exact: true }).fill("12d8 + 11");
  await expect(page.getByLabel("d8", { exact: true })).toHaveValue("12");
  await expect(page.getByLabel("d6", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Modifier", { exact: true })).toHaveValue("11");
});

test("notation merges repeated dice and accepts a bare d20", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("d20+2d6+1d6+3-1");
  await expect(page.getByLabel("d20", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("d6", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Modifier", { exact: true })).toHaveValue("2");
  await page.getByLabel("Dice", { exact: true }).blur();
  await expect(page.getByLabel("Dice", { exact: true })).toHaveValue("1d20+3d6+2");
});

test("flags invalid notation and disables Roll", async ({ page }) => {
  const dice = page.getByLabel("Dice", { exact: true });
  const roll = page.getByRole("button", { name: "Roll" });

  await dice.fill("2d7");
  await expect(dice).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("There's no d7.")).toBeVisible();
  await expect(roll).toBeDisabled();

  await dice.fill("1d8-1d4");
  await expect(page.getByText("Dice can only be added, not subtracted.")).toBeVisible();

  await dice.fill("100d6");
  await expect(page.getByText("At most 99 of each die.")).toBeVisible();

  await dice.fill("2d8+fire");
  await expect(page.getByText('Can\'t read "fire".')).toBeVisible();

  await dice.fill("2d8");
  await expect(dice).not.toHaveAttribute("aria-invalid");
  await expect(roll).toBeEnabled();
});

test("Roll is disabled without dice", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("5");
  await expect(page.getByRole("button", { name: "Roll" })).toBeDisabled();
});

test("rolls 12d8+11 and shows every die and the total", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("12d8+11");
  // Faces 1..8, then 1..4.
  await fixRandom(page, [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3]);
  await page.getByRole("button", { name: "Roll" }).click();

  await expect(total(page)).toHaveText("57"); // 36 + 10 + 11
  await expect(result(page).locator(".die")).toHaveText(["1", "2", "3", "4", "5", "6", "7", "8", "1", "2", "3", "4"]);
  await expect(result(page).getByText("12d8", { exact: true })).toBeVisible();
  await expect(result(page).getByText("+11", { exact: true })).toBeVisible();
});

test("Great Weapon Fighting turns 1s and 2s into 3s on every die", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("2d6+1d20+1");
  await page.getByRole("switch", { name: /Great Weapon Fighting/ }).check();
  // Dice roll largest first: d20 = 2, then d6 = 1, 5.
  await fixRandom(page, [1, 0, 4]);
  await page.getByRole("button", { name: "Roll" }).click();

  await expect(total(page)).toHaveText("12"); // 3 + 3 + 5 + 1
  await expect(result(page).locator(".die del")).toHaveText(["2", "1"]);
  await expect(result(page).locator(".die")).toHaveText(["23", "13", "5"]);
  // Adjusted dice count as 3s, so neither the 1 nor the 2 is flagged red.
  await expect(result(page).locator(".die.min")).toHaveCount(0);
});

test("without Great Weapon Fighting a 1 is flagged red and a 2 is not", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("3d6");
  await fixRandom(page, [0, 1, 5]);
  await page.getByRole("button", { name: "Roll" }).click();
  await expect(result(page).locator(".die.min")).toHaveText("1");
  await expect(result(page).locator(".die.max")).toHaveText("6");
});

test("rejects out-of-range random values instead of biasing low faces", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("1d6");
  // 4294967295 is above the largest multiple of 6, so it is redrawn.
  await fixRandom(page, [4294967295, 2]);
  await page.getByRole("button", { name: "Roll" }).click();
  await expect(total(page)).toHaveText("3");
});

test("real rolls stay within range", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("99d4+99d20+99d100");
  await page.getByRole("button", { name: "Roll" }).click();
  const values = await result(page).locator(".die").allTextContents();
  expect(values).toHaveLength(297);
  const groups = [[100, values.slice(0, 99)], [20, values.slice(99, 198)], [4, values.slice(198)]];
  for (const [sides, faces] of groups) {
    for (const f of faces) {
      expect(Number(f)).toBeGreaterThanOrEqual(1);
      expect(Number(f)).toBeLessThanOrEqual(sides);
    }
  }
});

test("advantage keeps the higher d20 and shows the dropped one", async ({ page }) => {
  const modes = page.getByRole("group", { name: "d20 rolls" });
  await expect(modes).toBeHidden();
  await page.getByLabel("Dice", { exact: true }).fill("1d20+5");
  await expect(modes).toBeVisible();

  await page.getByLabel("Advantage", { exact: true }).check();
  await fixRandom(page, [3, 16]);
  await page.getByRole("button", { name: "Roll" }).click();
  await expect(total(page)).toHaveText("22");
  await expect(result(page).locator(".die.dropped")).toHaveText("4");

  await page.getByLabel("Disadvantage").check();
  await fixRandom(page, [3, 16]);
  await page.getByRole("button", { name: "Roll" }).click();
  await expect(total(page)).toHaveText("9");
  await expect(result(page).locator(".die.dropped")).toHaveText("17");
});

test("keeps setup and history after a reload", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("2d10+4");
  await page.getByRole("switch", { name: /Great Weapon Fighting/ }).check();
  await fixRandom(page, [5, 6]);
  await page.getByRole("button", { name: "Roll" }).click();
  await fixRandom(page, [0, 9]);
  await page.getByRole("button", { name: "Roll" }).click();

  const history = page.locator("#history").getByRole("listitem");
  await expect(history.first()).toBeHidden();
  await page.getByText("History (2)").click();
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText("2d10+4 (1,2→3)");
  await expect(history.first().locator("strong")).toHaveText("17");
  await expect(history.nth(1).locator("strong")).toHaveText("17");

  await page.reload();
  await expect(page.getByLabel("Dice", { exact: true })).toHaveValue("2d10+4");
  await expect(page.getByRole("switch", { name: /Great Weapon Fighting/ })).toBeChecked();
  await expect(page.getByText("History (2)")).toBeVisible();
});

test("history keeps the last 50 rolls", async ({ page }) => {
  await page.getByLabel("Dice", { exact: true }).fill("1d4");
  for (let i = 0; i < 52; i++) await page.getByRole("button", { name: "Roll" }).click();
  await expect(page.getByText("History (50)")).toBeVisible();
  await expect(page.locator("#history li")).toHaveCount(50);
});

test("animates the roll and lands on the result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByLabel("Dice", { exact: true }).fill("12d8+11");
  await page.getByRole("button", { name: "Roll" }).click();
  await expect(result(page).locator(".die.rolling").first()).toBeVisible();
  await expect(result(page).locator(".die.rolling")).toHaveCount(0);
  const sum = (await result(page).locator(".die").allTextContents()).reduce((a, v) => a + Number(v), 11);
  await expect(total(page)).toHaveText(String(sum));
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
