import { test, expect } from "@playwright/test";

// A plain white 400×200 PNG. Shown at natural size at this viewport, so one screen pixel
// is one image pixel when dragging. Mark outlines on an image this size are 2 px wide.
async function testImage(page, [width, height] = [400, 200]) {
  const b64 = await page.evaluate(([width, height]) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    return c.toDataURL("image/png").split(",")[1];
  }, [width, height]);
  return { name: "white.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

const info = (page) => page.locator("#info");
const RED = [255, 0, 0], BLACK = [0, 0, 0], WHITE = [255, 255, 255];
const GREEN = [0, 192, 0], BLUE = [0, 102, 255], GRAY = [128, 128, 128];

async function load(page) {
  await page.getByLabel("Image", { exact: true }).setInputFiles(await testImage(page));
  await expect(info(page)).toHaveText("Image 400 × 200 · no boxes");
}

// Drags between two points given in image pixels.
async function drag(page, [x1, y1], [x2, y2]) {
  const r = await page.locator("#img").boundingBox();
  await page.mouse.move(r.x + x1, r.y + y1);
  await page.mouse.down();
  await page.mouse.move(r.x + (x1 + x2) / 2, r.y + (y1 + y2) / 2);
  await page.mouse.move(r.x + x2, r.y + y2);
  await page.mouse.up();
}

// Decodes an image in the page and reads the colors at the given points.
async function pixels(page, bytes, points) {
  return page.evaluate(async ([b64, points]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:;base64,${b64}`)).blob());
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const colors = points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)));
    return { width: bmp.width, height: bmp.height, colors };
  }, [bytes.toString("base64"), points]);
}

async function download(page, points = []) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  return { name: file.suggestedFilename(), bytes, ...(await pixels(page, bytes, points)) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/html/image_redact.html");
});

test("the editor stays hidden until an image is loaded", async ({ page }) => {
  await expect(page.getByLabel("Mark (outline)")).toBeHidden();
  await load(page);
  await expect(page.getByLabel("Mark (outline)")).toBeChecked();
  await expect(page.getByRole("button", { name: "Delete box" })).toBeDisabled();
});

test("rejects a file that isn't an image", async ({ page }) => {
  await page.getByLabel("Image", { exact: true }).setInputFiles({
    name: "notes.txt", mimeType: "image/png", buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText("That file isn't an image this browser can open.")).toBeVisible();
  await expect(page.getByLabel("Image", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Mark (outline)")).toBeHidden();
});

test("draws a red outline inside the marked box", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 100 × 50 at 20, 30");
  const file = await download(page, [[19, 50], [20, 50], [21, 50], [22, 50], [70, 55], [119, 50], [120, 50]]);
  expect(file).toMatchObject({ name: "white-marked.png", width: 400, height: 200 });
  expect(file.colors).toEqual([WHITE, RED, RED, WHITE, WHITE, RED, WHITE]);
});

test("draws a filled black box in censor mode", async ({ page }) => {
  await load(page);
  await page.getByLabel("Censor (filled box)").check();
  await drag(page, [200, 100], [150, 40]); // dragging up and left works too
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 50 × 60 at 150, 40");
  const file = await download(page, [[149, 70], [150, 70], [175, 70], [199, 99], [200, 70]]);
  expect(file.colors).toEqual([WHITE, BLACK, BLACK, BLACK, WHITE]);
});

test("each mode starts with its default color", async ({ page }) => {
  await load(page);
  await expect(page.getByLabel("Red")).toBeChecked();
  await page.getByLabel("Censor (filled box)").check();
  await expect(page.getByLabel("Black")).toBeChecked();
});

test("draws boxes in a preset color, remembered per mode", async ({ page }) => {
  await load(page);
  await page.getByLabel("Green").check();
  await drag(page, [20, 30], [120, 80]);
  await page.getByLabel("Censor (filled box)").check();
  await expect(page.getByLabel("Black")).toBeChecked();
  await page.getByLabel("Gray").check();
  await drag(page, [200, 30], [300, 80]);
  await page.getByLabel("Mark (outline)").check();
  await expect(page.getByLabel("Green")).toBeChecked();
  const file = await download(page, [[20, 50], [250, 50]]);
  expect(file.colors).toEqual([GREEN, GRAY]);
});

test("draws boxes in a custom color", async ({ page }) => {
  await load(page);
  await page.getByLabel("Censor (filled box)").check();
  await page.getByLabel("Custom color").fill("#123456");
  await expect(page.getByLabel("Black")).not.toBeChecked();
  await drag(page, [20, 30], [120, 80]);
  const file = await download(page, [[70, 55]]);
  expect(file.colors).toEqual([[0x12, 0x34, 0x56]]);
});

test("picking a color recolors the selected box only", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await page.getByLabel("Green").check();
  await page.keyboard.press("Escape");
  await page.getByLabel("Blue").check();
  await drag(page, [200, 30], [300, 80]);
  const file = await download(page, [[20, 50], [200, 50]]);
  expect(file.colors).toEqual([GREEN, BLUE]);
});

test("selecting a box switches the controls to its mode and color", async ({ page }) => {
  await load(page);
  await page.getByLabel("Censor (filled box)").check();
  await page.getByLabel("Blue").check();
  await drag(page, [20, 30], [120, 80]);
  await page.keyboard.press("Escape");
  await page.getByLabel("Mark (outline)").check();
  await expect(page.getByLabel("Red")).toBeChecked();
  await drag(page, [70, 55], [70, 55]);
  await expect(page.getByLabel("Censor (filled box)")).toBeChecked();
  await expect(page.getByLabel("Blue")).toBeChecked();
});

test("remembers the colors after a reload", async ({ page }) => {
  await load(page);
  await page.getByLabel("Green").check();
  await page.getByLabel("Censor (filled box)").check();
  await page.getByLabel("White").check();
  await page.reload();
  await load(page);
  await expect(page.getByLabel("Green")).toBeChecked();
  await page.getByLabel("Censor (filled box)").check();
  await expect(page.getByLabel("White")).toBeChecked();
});

test("a click without dragging adds no box and clears the selection", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await expect(page.getByRole("button", { name: "Delete box" })).toBeEnabled();
  await drag(page, [300, 150], [301, 151]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box");
  await expect(page.getByRole("button", { name: "Delete box" })).toBeDisabled();
});

test("dragging a box moves it, but not past the image edge", async ({ page }) => {
  await load(page);
  await page.getByLabel("Censor (filled box)").check();
  await drag(page, [20, 30], [120, 80]);
  await drag(page, [70, 55], [110, 75]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 100 × 50 at 60, 50");
  await drag(page, [100, 75], [500, 300]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 100 × 50 at 300, 150");
});

test("a mark is moved by its outline; drawing inside it adds a new box", async ({ page }) => {
  await load(page);
  await drag(page, [20, 20], [220, 180]);
  await page.getByLabel("Censor (filled box)").check();
  await drag(page, [80, 80], [160, 120]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 2 boxes · selected 80 × 40 at 80, 80");
  await drag(page, [21, 100], [41, 100]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 2 boxes · selected 200 × 160 at 40, 20");
});

test("a corner handle resizes the selected box", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await drag(page, [120, 80], [220, 180]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 200 × 150 at 20, 30");
  await drag(page, [20, 30], [-50, 0]); // past the edge stops at the edge
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 220 × 180 at 0, 0");
});

test("deletes the selected box with the button or the keyboard", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await drag(page, [200, 30], [300, 80]);
  await expect(info(page)).toHaveText("Image 400 × 200 · 2 boxes · selected 100 × 50 at 200, 30");
  await page.getByRole("button", { name: "Delete box" }).click();
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box");

  await drag(page, [20, 50], [20, 50]); // select by clicking the outline
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box · selected 100 × 50 at 20, 30");
  await page.keyboard.press("Delete");
  await expect(info(page)).toHaveText("Image 400 × 200 · no boxes");
  const file = await download(page, [[20, 50]]);
  expect(file.colors).toEqual([WHITE]);
});

test("Escape clears the selection", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await page.keyboard.press("Escape");
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box");
  await page.keyboard.press("Delete");
  await expect(info(page)).toHaveText("Image 400 × 200 · 1 box");
});

test("loading a new image removes the boxes", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await load(page);
});

test("boxes line up with a second image of a different size", async ({ page }) => {
  await load(page);
  await drag(page, [20, 30], [120, 80]);
  await page.getByLabel("Image", { exact: true }).setInputFiles(await testImage(page, [200, 300]));
  await expect(info(page)).toHaveText("Image 200 × 300 · no boxes");
  await page.getByLabel("Censor (filled box)").check();
  await drag(page, [20, 30], [120, 80]);
  const rect = await page.locator("#boxes rect").boundingBox();
  const selection = await page.locator("#selection").boundingBox();
  expect(rect).toEqual(selection);
  const file = await download(page, [[19, 50], [20, 50], [119, 79], [120, 50]]);
  expect(file).toMatchObject({ width: 200, height: 300, colors: [WHITE, BLACK, BLACK, WHITE] });
});

test("JPEG and WebP show a quality setting", async ({ page }) => {
  await load(page);
  const quality = page.getByLabel(/Quality/);
  await expect(quality).toBeHidden();

  await page.getByLabel("Format").selectOption("image/jpeg");
  await expect(quality).toBeVisible();
  await quality.fill("60");
  await expect(page.locator("#quality-out")).toHaveText("60");
  const jpeg = await download(page);
  expect(jpeg.name).toBe("white-marked.jpg");
  expect(jpeg.bytes.subarray(0, 2).toString("hex")).toBe("ffd8");

  await page.getByLabel("Format").selectOption("image/webp");
  const webp = await download(page);
  expect(webp.name).toBe("white-marked.webp");
  expect(webp.bytes.subarray(8, 12).toString()).toBe("WEBP");

  await page.getByLabel("Format").selectOption("image/png");
  await expect(quality).toBeHidden();
});

test("copies the result to the clipboard as PNG", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(page);
  await page.getByLabel("Censor (filled box)").check();
  await drag(page, [0, 0], [100, 100]);
  await page.getByLabel("Format").selectOption("image/jpeg");

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const b64 = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bytes = new Uint8Array(await (await item.getType("image/png")).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  const copied = await pixels(page, Buffer.from(b64, "base64"), [[50, 50], [150, 50]]);
  expect(copied).toEqual({ width: 400, height: 200, colors: [BLACK, WHITE] });
});

async function dispatchImage(page, type) {
  const { buffer } = await testImage(page);
  await page.evaluate(([b64, type]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], type === "paste" ? "image.png" : "dropped.png", { type: "image/png" }));
    document.dispatchEvent(type === "paste"
      ? new ClipboardEvent("paste", { clipboardData: data, bubbles: true })
      : new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [buffer.toString("base64"), type]);
}

test("loads a pasted image", async ({ page }) => {
  await dispatchImage(page, "paste");
  await expect(info(page)).toHaveText("Image 400 × 200 · no boxes");
});

test("loads a dropped image", async ({ page }) => {
  await dispatchImage(page, "drop");
  await expect(info(page)).toHaveText("Image 400 × 200 · no boxes");
  const file = await download(page);
  expect(file.name).toBe("dropped-marked.png");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
