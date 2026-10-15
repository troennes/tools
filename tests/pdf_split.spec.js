import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

// Page n is (100 + n) points wide, so page widths in the output reveal which pages were kept.
async function makePdf(count, { encrypted = false } = {}) {
  const doc = await PDFDocument.create();
  for (let n = 1; n <= count; n++) doc.addPage([100 + n, 200]);
  let bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  // pdf-lib can't encrypt, but it refuses any file whose trailer has an /Encrypt entry.
  if (encrypted) bytes = Buffer.from(bytes.toString("latin1").replace("trailer\n<<", "trailer\n<<\n/Encrypt 1 0 R"), "latin1");
  return { name: "report.pdf", mimeType: "application/pdf", buffer: bytes };
}

const pages = (page) => page.getByLabel("Pages");
const note = (page) => page.locator("#pages-note");

async function load(page, count = 12) {
  await page.getByLabel("PDF", { exact: true }).setInputFiles(await makePdf(count));
  await expect(page.getByText(`report.pdf (${count} page`)).toBeVisible();
}

async function downloadPages(page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const doc = await PDFDocument.load(Buffer.concat(chunks));
  return { name: file.suggestedFilename(), pages: doc.getPages().map((p) => Math.round(p.getWidth()) - 100) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/html/pdf_split.html");
});

test("starts with every page selected", async ({ page }) => {
  await expect(pages(page)).toBeHidden();
  await load(page);
  await expect(pages(page)).toHaveValue("1-12");
  await expect(note(page)).toHaveText("New PDF: 12 pages (1–12), from 12.");
});

const ranges = [
  ["1,3-5,10", "New PDF: 5 pages (1, 3–5, 10), from 12."],
  ["3,1,2", "New PDF: 3 pages (3, 1–2), from 12."],
  ["10-", "New PDF: 3 pages (10–12), from 12."],
  ["-3", "New PDF: 3 pages (1–3), from 12."],
  ["4-2", "New PDF: 3 pages (4, 3, 2), from 12."],
  [" 1 , 1 ,, 2 ", "New PDF: 3 pages (1, 1–2), from 12."],
];

for (const [spec, expected] of ranges) {
  test(`understands "${spec}"`, async ({ page }) => {
    await load(page);
    await pages(page).fill(spec);
    await expect(note(page)).toHaveText(expected);
    await expect(pages(page)).not.toHaveAttribute("aria-invalid");
  });
}

const invalid = [
  ["13", "There is no page 13; the PDF has 12 pages."],
  ["0", "There is no page 0; the PDF has 12 pages."],
  ["2-20", "There is no page 20; the PDF has 12 pages."],
  ["1,two", '"two" isn\'t a page or range.'],
  ["1-2-3", '"1-2-3" isn\'t a page or range.'],
  ["-", '"-" isn\'t a page or range.'],
  ["", "Enter the pages to keep."],
];

for (const [spec, expected] of invalid) {
  test(`rejects "${spec}"`, async ({ page }) => {
    await load(page);
    await pages(page).fill(spec);
    await expect(note(page)).toHaveText(expected);
    await expect(pages(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();
  });
}

test("downloads the pages in the order typed", async ({ page }) => {
  await load(page);
  await pages(page).fill("3,1-2,12,12");
  expect(await downloadPages(page)).toEqual({ name: "report-pages.pdf", pages: [3, 1, 2, 12, 12] });
});

test("downloads a reversed PDF", async ({ page }) => {
  await load(page, 4);
  await pages(page).fill("4-1");
  expect((await downloadPages(page)).pages).toEqual([4, 3, 2, 1]);
});

test("a one-page PDF starts at page 1", async ({ page }) => {
  await load(page, 1);
  await expect(pages(page)).toHaveValue("1");
  await expect(note(page)).toHaveText("New PDF: 1 page (1), from 1.");
});

test("rejects a file that isn't a PDF", async ({ page }) => {
  await page.getByLabel("PDF", { exact: true }).setInputFiles({
    name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByText("That file isn't a PDF this tool can read.")).toBeVisible();
  await expect(page.getByLabel("PDF", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(pages(page)).toBeHidden();
});

test("explains password-protected PDFs", async ({ page }) => {
  await page.getByLabel("PDF", { exact: true }).setInputFiles(await makePdf(3, { encrypted: true }));
  await expect(page.getByText("This PDF is password-protected, so its pages can't be copied.")).toBeVisible();
});

test("loads a dropped PDF", async ({ page }) => {
  const { buffer } = await makePdf(5);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "dropped.pdf", { type: "application/pdf" }));
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, buffer.toString("base64"));
  await expect(page.getByText("dropped.pdf (5 pages).")).toBeVisible();
  await expect(pages(page)).toHaveValue("1-5");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("Tools");
});
