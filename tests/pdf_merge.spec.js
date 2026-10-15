import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

// Pages of a file are (base + n) points wide: a.pdf → 101, 102, …; b.pdf → 201, 202, …
// so the merged output's page widths show which file and page each one came from.
async function makePdf(name, base, count, { encrypted = false } = {}) {
  const doc = await PDFDocument.create();
  for (let n = 1; n <= count; n++) doc.addPage([base + n, 200]);
  let bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  if (encrypted) bytes = Buffer.from(bytes.toString("latin1").replace("trailer\n<<", "trailer\n<<\n/Encrypt 1 0 R"), "latin1");
  return { name, mimeType: "application/pdf", buffer: bytes };
}

const input = (page) => page.getByLabel("PDFs");
const summary = (page) => page.locator("#summary");
const names = (page) => page.locator("#files .name");

async function add(page, ...files) {
  await input(page).setInputFiles(await Promise.all(files));
}

async function downloadMerged(page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const doc = await PDFDocument.load(Buffer.concat(chunks));
  return { name: file.suggestedFilename(), widths: doc.getPages().map((p) => Math.round(p.getWidth())) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/html/pdf_merge.html");
});

test("needs at least two PDFs", async ({ page }) => {
  await expect(page.locator("#files")).toBeHidden();
  await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();

  await add(page, makePdf("a.pdf", 100, 3));
  await expect(names(page)).toHaveText(["a.pdf"]);
  await expect(summary(page)).toHaveText("Add at least one more PDF.");
  await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();
});

test("adds files in the order chosen, and later picks append", async ({ page }) => {
  await add(page, makePdf("a.pdf", 100, 3), makePdf("b.pdf", 200, 2));
  await expect(names(page)).toHaveText(["a.pdf", "b.pdf"]);
  await expect(page.locator("#files .pages")).toHaveText(["3 pages", "2 pages"]);
  await expect(summary(page)).toHaveText("Merged PDF: 5 pages from 2 files.");

  await add(page, makePdf("c.pdf", 300, 1));
  await expect(names(page)).toHaveText(["a.pdf", "b.pdf", "c.pdf"]);
  await expect(summary(page)).toHaveText("Merged PDF: 6 pages from 3 files.");
});

test("downloads all pages, file by file", async ({ page }) => {
  await add(page, makePdf("intro.pdf", 100, 2), makePdf("b.pdf", 200, 3));
  expect(await downloadMerged(page)).toEqual({ name: "intro-merged.pdf", widths: [101, 102, 201, 202, 203] });
});

test("the same file can be added twice", async ({ page }) => {
  await add(page, makePdf("a.pdf", 100, 2));
  await add(page, makePdf("a.pdf", 100, 2));
  expect((await downloadMerged(page)).widths).toEqual([101, 102, 101, 102]);
});

test("moves files up and down", async ({ page }) => {
  await add(page, makePdf("a.pdf", 100, 1), makePdf("b.pdf", 200, 1), makePdf("c.pdf", 300, 1));
  await expect(page.getByRole("button", { name: "Move a.pdf up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move c.pdf down" })).toBeDisabled();

  await page.getByRole("button", { name: "Move c.pdf up" }).click();
  await expect(names(page)).toHaveText(["a.pdf", "c.pdf", "b.pdf"]);
  await page.getByRole("button", { name: "Move a.pdf down" }).click();
  await expect(names(page)).toHaveText(["c.pdf", "a.pdf", "b.pdf"]);

  expect((await downloadMerged(page)).widths).toEqual([301, 101, 201]);
});

test("keeps keyboard focus on the moved file's button", async ({ page }) => {
  await add(page, makePdf("a.pdf", 100, 1), makePdf("b.pdf", 200, 1), makePdf("c.pdf", 300, 1));
  await page.getByRole("button", { name: "Move a.pdf down" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(names(page)).toHaveText(["b.pdf", "c.pdf", "a.pdf"]);
  // a.pdf is now last, so its ↓ is disabled and focus falls back to the file picker.
  await expect(input(page)).toBeFocused();
});

test("removes files", async ({ page }) => {
  await add(page, makePdf("a.pdf", 100, 1), makePdf("b.pdf", 200, 1), makePdf("c.pdf", 300, 1));
  await page.getByRole("button", { name: "Remove b.pdf" }).click();
  await expect(names(page)).toHaveText(["a.pdf", "c.pdf"]);
  await expect(page.getByRole("button", { name: "Remove c.pdf" })).toBeFocused();

  await page.getByRole("button", { name: "Remove a.pdf" }).click();
  await page.getByRole("button", { name: "Remove c.pdf" }).click();
  await expect(page.locator("#files")).toBeHidden();
  await expect(summary(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();
});

test("skips files that aren't PDFs and says why", async ({ page }) => {
  await add(
    page,
    makePdf("a.pdf", 100, 1),
    Promise.resolve({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") }),
    makePdf("locked.pdf", 200, 1, { encrypted: true }),
    makePdf("b.pdf", 300, 1),
  );
  await expect(names(page)).toHaveText(["a.pdf", "b.pdf"]);
  await expect(page.locator("#file-note")).toHaveText(
    "notes.pdf isn't a PDF this tool can read. locked.pdf is password-protected, so its pages can't be copied."
  );
  await expect(input(page)).toHaveAttribute("aria-invalid", "true");

  await add(page, makePdf("c.pdf", 400, 1));
  await expect(input(page)).not.toHaveAttribute("aria-invalid");
});

test("file names are shown as text, not HTML", async ({ page }) => {
  await add(page, makePdf("<b>bold</b>.pdf", 100, 1));
  await expect(names(page)).toHaveText(["<b>bold</b>.pdf"]);
});

test("adds dropped PDFs", async ({ page }) => {
  const files = await Promise.all([makePdf("x.pdf", 100, 2), makePdf("y.pdf", 200, 1)]);
  await page.evaluate((list) => {
    const data = new DataTransfer();
    for (const { name, b64 } of list) {
      data.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: "application/pdf" }));
    }
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, files.map((f) => ({ name: f.name, b64: f.buffer.toString("base64") })));
  await expect(names(page)).toHaveText(["x.pdf", "y.pdf"]);
  await expect(summary(page)).toHaveText("Merged PDF: 3 pages from 2 files.");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
