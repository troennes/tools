import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/npk_calculator.html");
});

const field = (page, who, nutrient) => page.getByLabel(`${who} ${nutrient} (g/kg)`);
const shares = (page) => page.locator("#mix tbody tr td:nth-child(2)");
const amounts = (page) => page.locator("#mix tbody tr td:nth-child(3)");

async function setNpk(page, who, [n, p, k]) {
  await field(page, who, "N").fill(String(n));
  await field(page, who, "P").fill(String(p));
  await field(page, who, "K").fill(String(k));
}

async function useComponents(page, count) {
  await page.getByRole("radio", { name: String(count) }).check();
}

test("starts with presets whose numbers match their names", async ({ page }) => {
  await expect(page.getByLabel("Preset")).toHaveValue("0");
  await expect(page.getByLabel("Preset").locator("option:checked")).toHaveText("Potato (3 · 1.5 · 5)");
  await expect(page.getByLabel("Component 1", { exact: true })).toHaveValue(/\d+/);
  await expect(page.getByLabel("Component 1", { exact: true }).locator("option:checked")).toHaveText("Oslo Compost (~1-1-40)");
  await expect(field(page, "Component 1", "K")).toHaveValue("3.88");
  await expect(page.getByLabel("Component 2", { exact: true }).locator("option:checked")).toHaveText("Chicken Manure");
  await expect(field(page, "Component 2", "N")).toHaveValue("40");
  await expect(shares(page)).toHaveText(["92.0%", "8.0%"]);
});

test("a preset fills its fields, and editing a field switches to Custom", async ({ page }) => {
  await page.getByLabel("Preset").selectOption({ label: "Tomato (2.5 · 0.9 · 5)" });
  await expect(field(page, "Plant", "N")).toHaveValue("2.5");
  await field(page, "Plant", "N").fill("3");
  await expect(page.getByLabel("Preset")).toHaveValue("");

  await page.getByLabel("Component 2", { exact: true }).selectOption({ label: "Industrial Fertilizer 12-4-18" });
  await expect(field(page, "Component 2", "K")).toHaveValue("176");
  await field(page, "Component 2", "K").fill("170");
  await expect(page.getByLabel("Component 2", { exact: true })).toHaveValue("");
  await expect(page.locator("#mix tbody td").first()).toContainText("Oslo Compost");
  await expect(page.locator("#mix tbody tr").nth(1)).toContainText("Component 2 (custom)");
});

test("the third component appears only in 3-component mode", async ({ page }) => {
  await expect(page.getByLabel("Component 3", { exact: true })).toBeHidden();
  await expect(shares(page)).toHaveCount(2);
  await useComponents(page, 3);
  await expect(page.getByLabel("Component 3", { exact: true })).toBeVisible();
  await expect(shares(page)).toHaveCount(3);
});

test("finds an exact two-component mix", async ({ page }) => {
  await setNpk(page, "Plant", [2, 2, 2]);
  await setNpk(page, "Component 1", [0, 0, 0]);
  await setNpk(page, "Component 2", [4, 4, 4]);
  await expect(shares(page)).toHaveText(["50.0%", "50.0%"]);
  await expect(page.locator("#fit")).toContainText("0%");
});

test("weighs N, P and K relative to their targets", async ({ page }) => {
  // Scaled by target: t = (1,1,1), B = (2,2,1) → x = 5/9 = 55.6%.
  // (Absolute g/kg would give 104/108 = 96.3%, dominated by K.)
  await setNpk(page, "Plant", [1, 1, 10]);
  await setNpk(page, "Component 1", [0, 0, 0]);
  await setNpk(page, "Component 2", [2, 2, 10]);
  await expect(shares(page)).toHaveText(["44.4%", "55.6%"]);
});

test("finds an exact three-component mix", async ({ page }) => {
  await useComponents(page, 3);
  await setNpk(page, "Plant", [0.2, 0.3, 0.5]);
  await setNpk(page, "Component 1", [1, 0, 0]);
  await setNpk(page, "Component 2", [0, 1, 0]);
  await setNpk(page, "Component 3", [0, 0, 1]);
  await expect(shares(page)).toHaveText(["20.0%", "30.0%", "50.0%"]);
});

test("leaves out a component that only makes things worse, and says so", async ({ page }) => {
  await useComponents(page, 3);
  await setNpk(page, "Plant", [1, 1, 1]);
  await setNpk(page, "Component 1", [2, 2, 2]);
  await setNpk(page, "Component 2", [0, 0, 0]);
  await setNpk(page, "Component 3", [100, 100, 100]);
  await expect(shares(page)).toHaveText(["50.0%", "50.0%", "0.0%"]);
  await expect(page.getByText("Component 3 (custom) gets 0%")).toBeVisible();
});

test("explains identical components", async ({ page }) => {
  await setNpk(page, "Component 1", [1, 2, 3]);
  await setNpk(page, "Component 2", [1, 2, 3]);
  await expect(page.getByText("The components have the same N, P and K")).toBeVisible();
});

test("shows the nutrient table with relative differences", async ({ page }) => {
  await setNpk(page, "Plant", [2, 2, 2]);
  await setNpk(page, "Component 1", [0, 0, 0]);
  await setNpk(page, "Component 2", [4, 4, 5]);
  const rows = page.locator("#nutrients tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator("td")).toHaveText(["N", "2", /\d/, /^[+-]/]);
  await expect(rows.nth(2).locator("td").last()).toHaveText(/\(\+\d+%\)$/);
});

test("amounts follow the batch size", async ({ page }) => {
  await setNpk(page, "Plant", [2, 2, 2]);
  await setNpk(page, "Component 1", [0, 0, 0]);
  await setNpk(page, "Component 2", [4, 4, 4]);
  await expect(amounts(page)).toHaveText(["5 kg", "5 kg"]);
  await page.getByLabel("Batch size (kg)").fill("1");
  await expect(amounts(page)).toHaveText(["500 g", "500 g"]);
  await page.getByLabel("Batch size (kg)").fill("0.005");
  await expect(amounts(page)).toHaveText(["2.5 g", "2.5 g"]);
});

// Brute force: try every mix on a 0.5% grid and check none beats the tool's answer.
function bestError(comps, target) {
  const scale = target.map((t) => t || 1);
  const err = (w) => target.reduce((s, t, j) => {
    const r = (w.reduce((m, x, i) => m + x * comps[i][j], 0) - t) / scale[j];
    return s + r * r;
  }, 0);
  let best = Infinity;
  for (let a = 0; a <= 200; a++) {
    for (let b = 0; comps.length === 3 ? b <= 200 - a : b === 0; b++) {
      const w = comps.length === 3 ? [a / 200, b / 200, 1 - (a + b) / 200] : [a / 200, 1 - a / 200];
      best = Math.min(best, err(w));
    }
  }
  return { best, err };
}

for (const seed of [1, 2, 3, 4, 5, 6]) {
  test(`matches a brute-force search (case ${seed})`, async ({ page }) => {
    let s = seed;
    const rand = (max) => ((s = (s * 16807) % 2147483647) / 2147483647) * max;
    const r2 = (v) => Math.round(v * 100) / 100;
    const count = seed % 2 ? 2 : 3;
    const target = [r2(rand(6) + 0.5), r2(rand(3) + 0.2), r2(rand(8) + 0.5)];
    // A component below the target and one well above it, so the best mix is a real blend,
    // plus (in 3-component cases) one with a random profile.
    const low = target.map((v) => r2(v * rand(0.6)));
    const high = target.map((v) => r2(v * (2 + rand(8))));
    const comps = [low, high, target.map((v) => r2(v * rand(3)))].slice(0, count);

    await useComponents(page, count);
    await setNpk(page, "Plant", target);
    for (let i = 0; i < count; i++) await setNpk(page, `Component ${i + 1}`, comps[i]);

    const tool = (await shares(page).allTextContents()).map((t) => parseFloat(t) / 100);
    const { best, err } = bestError(comps, target);
    // The tool's mix (rounded to 0.1%) must be at least as good as the best grid point.
    expect(err(tool)).toBeLessThanOrEqual(best + 1e-6);
  });
}

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
