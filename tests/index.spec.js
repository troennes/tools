import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

const search = (page) => page.getByRole("searchbox", { name: "Search tools" });
const visibleTitles = (page) => page.locator(".card:visible h3");

test("every tool in html/ has a card", async ({ page }) => {
  const files = readdirSync(new URL("../html", import.meta.url)).filter((f) => f.endsWith(".html"));
  const links = await page.locator("a.card").evaluateAll((cards) => cards.map((a) => a.getAttribute("href")));
  expect(links.map((href) => href.replace("./html/", "")).sort()).toEqual(files.sort());
});

test("each card's title matches its tool page heading", async ({ page }) => {
  const cards = await page.locator("a.card").evaluateAll((cards) =>
    cards.map((a) => ({ href: a.getAttribute("href"), title: a.querySelector("h3").textContent.trim() })));
  for (const { href, title } of cards) {
    await page.goto(new URL(href, "http://localhost:4173/").pathname);
    await expect(page.locator("h1")).toHaveText(title);
  }
});

test("cards in the same row have the same height and every card the same width", async ({ page }) => {
  const boxes = await page.locator("a.card").evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect()));
  const rows = Map.groupBy(boxes, (b) => Math.round(b.top));
  for (const row of rows.values()) expect(new Set(row.map((b) => Math.round(b.height))).size).toBe(1);
  expect(new Set(boxes.map((b) => Math.round(b.width))).size).toBe(1);
});

test("search filters cards and hides groups without matches", async ({ page }) => {
  await search(page).fill("pdf");
  await expect(visibleTitles(page)).toHaveText(["PDF splitter", "PDF merger"]);
  await expect(page.getByRole("heading", { name: "Images & PDF" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Color" })).toBeHidden();

  // Matches keywords too, not just the visible text.
  await search(page).fill("sha256");
  await expect(visibleTitles(page)).toHaveText(["Hash text or file"]);
});

test("hidden cards leave no gaps in the grid", async ({ page }) => {
  await search(page).fill("pdf");
  const first = await page.locator(".card:visible").first().boundingBox();
  const fresh = await page.locator("main > section:visible .grid").first().boundingBox();
  expect(first.x).toBe(fresh.x);
  expect(first.y).toBe(fresh.y);
});

test("shows a message when nothing matches", async ({ page }) => {
  await expect(page.getByText("No tools match your search.")).toBeHidden();
  await search(page).fill("zzz");
  await expect(page.getByText("No tools match your search.")).toBeVisible();
  await expect(page.locator(".card:visible")).toHaveCount(0);
});

test("Enter opens the first match, but not with an empty search", async ({ page }) => {
  await search(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveTitle("My tools collection");

  await search(page).fill("pdf m");
  await page.keyboard.press("Enter");
  await expect(page.locator("h1")).toHaveText("PDF merger");
});

test("/ focuses search and Esc clears it", async ({ page }) => {
  await page.keyboard.press("/");
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveValue("");

  await page.keyboard.type("color");
  await expect(visibleTitles(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(search(page)).toHaveValue("");
  await expect(search(page)).not.toBeFocused();
  await expect(page.locator(".card:visible")).toHaveCount(14);
});

test("the / hint sits inside the search box and hides while typing", async ({ page }) => {
  const hint = page.locator(".search kbd");
  const box = await search(page).boundingBox();
  const kbd = await hint.boundingBox();
  expect(kbd.x).toBeGreaterThan(box.x);
  expect(kbd.x + kbd.width).toBeLessThan(box.x + box.width);
  await search(page).focus();
  await expect(hint).toBeHidden();
});
