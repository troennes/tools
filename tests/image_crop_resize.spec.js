import { test, expect } from "@playwright/test";

// A 400×200 PNG: left half red, right half blue. Shown at natural size at this viewport,
// so one screen pixel is one image pixel when dragging.
async function testImage(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f00";
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = "#00f";
    ctx.fillRect(200, 0, 200, 200);
    return c.toDataURL("image/png").split(",")[1];
  });
  return { name: "halves.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

const info = (page) => page.locator("#info");

async function load(page) {
  await page.getByLabel("Image", { exact: true }).setInputFiles(await testImage(page));
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 400 × 200 at 0, 0");
}

async function drag(page, locator, dx, dy) {
  const r = await locator.boundingBox();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

// Downloads the result and decodes it in the page: size, plus the colors at the left and right edges.
async function download(page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const decoded = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const px = (x) => Array.from(ctx.getImageData(x, bmp.height >> 1, 1, 1).data.slice(0, 3));
    return { width: bmp.width, height: bmp.height, left: px(0), right: px(bmp.width - 1) };
  }, bytes.toString("base64"));
  return { name: file.suggestedFilename(), bytes, ...decoded };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/html/image_crop_resize.html");
});

test("the editor stays hidden until an image is loaded", async ({ page }) => {
  await expect(page.getByLabel("Aspect ratio")).toBeHidden();
  await load(page);
  await expect(page.getByLabel("Aspect ratio")).toBeVisible();
  await expect(page.getByLabel("Width (px)")).toHaveValue("400");
  await expect(page.getByLabel("Height (px)")).toHaveValue("200");
});

test("rejects a file that isn't an image", async ({ page }) => {
  await page.getByLabel("Image", { exact: true }).setInputFiles({
    name: "notes.txt", mimeType: "image/png", buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText("That file isn't an image this browser can open.")).toBeVisible();
  await expect(page.getByLabel("Image", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Aspect ratio")).toBeHidden();
});

test("an aspect preset centers the largest box with that ratio", async ({ page }) => {
  await load(page);
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 200 × 200 at 100, 0");
  await page.getByLabel("Aspect ratio").selectOption({ label: "Free" });
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 400 × 200 at 0, 0");
});

test("dragging the box moves it, but not past the image edge", async ({ page }) => {
  await load(page);
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  await drag(page, page.locator("#crop"), -60, 0);
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 200 × 200 at 40, 0");
  await drag(page, page.locator("#crop"), -500, 300);
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 200 × 200 at 0, 0");
});

test("dragging a corner resizes from the opposite corner", async ({ page }) => {
  await load(page);
  await drag(page, page.locator('[data-corner="se"]'), -200, -100);
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 200 × 100 at 0, 0");
  await drag(page, page.locator('[data-corner="nw"]'), 50, 20);
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 150 × 80 at 50, 20");
});

test("corner resizing keeps the aspect ratio", async ({ page }) => {
  await load(page);
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  // The box follows the axis dragged furthest: 200 − 40 = 160 wins over 200 − 120 = 80.
  await drag(page, page.locator('[data-corner="se"]'), -120, -40);
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 160 × 160 at 100, 0");
  // Growing past the image edge stops at the edge, still square.
  await drag(page, page.locator('[data-corner="se"]'), 300, 300);
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 200 × 200 at 100, 0");
});

test("width and height stay linked to the crop proportions", async ({ page }) => {
  await load(page);
  await page.getByLabel("Width (px)").fill("100");
  await expect(page.getByLabel("Height (px)")).toHaveValue("50");
  await page.getByLabel("Height (px)").fill("300");
  await expect(page.getByLabel("Width (px)")).toHaveValue("600");
});

test("the output scale is kept when the crop changes", async ({ page }) => {
  await load(page);
  await page.getByLabel("Width (px)").fill("200");
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  await expect(page.getByLabel("Width (px)")).toHaveValue("100");
  await expect(page.getByLabel("Height (px)")).toHaveValue("100");
});

test("scale percentage is linked to width and height", async ({ page }) => {
  await load(page);
  const percent = page.getByLabel("Scale (%)");
  await expect(percent).toHaveValue("100");

  await percent.fill("50");
  await expect(page.getByLabel("Width (px)")).toHaveValue("200");
  await expect(page.getByLabel("Height (px)")).toHaveValue("100");

  await percent.fill("33.3");
  await expect(page.getByLabel("Width (px)")).toHaveValue("133");
  await expect(page.getByLabel("Height (px)")).toHaveValue("67");

  await page.getByLabel("Width (px)").fill("100");
  await expect(percent).toHaveValue("25");
});

test("the percentage is kept when the crop changes", async ({ page }) => {
  await load(page);
  await page.getByLabel("Scale (%)").fill("50");
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  await expect(page.getByLabel("Width (px)")).toHaveValue("100");
  await expect(page.getByLabel("Scale (%)")).toHaveValue("50");
});

test("downloads at a percentage", async ({ page }) => {
  await load(page);
  await page.getByLabel("Scale (%)").fill("25");
  const file = await download(page);
  expect(file).toMatchObject({ name: "halves-100x50.png", width: 100, height: 50 });
});

test("output size is capped at 16384 px", async ({ page }) => {
  await load(page);
  await page.getByLabel("Scale (%)").fill("10000");
  await expect(page.getByLabel("Width (px)")).toHaveValue("16384");
  await expect(page.getByLabel("Height (px)")).toHaveValue("8192");
});

test("downloads the cropped and resized PNG", async ({ page }) => {
  await load(page);
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  await drag(page, page.locator("#crop"), -100, 0); // red half
  await page.getByLabel("Width (px)").fill("50");
  const file = await download(page);
  expect(file.name).toBe("halves-50x50.png");
  expect(file).toMatchObject({ width: 50, height: 50, left: [255, 0, 0], right: [255, 0, 0] });
});

test("downloads the full image at a new size", async ({ page }) => {
  await load(page);
  await page.getByLabel("Width (px)").fill("100");
  const file = await download(page);
  expect(file).toMatchObject({ name: "halves-100x50.png", width: 100, height: 50 });
  expect(file.left).toEqual([255, 0, 0]);
  expect(file.right).toEqual([0, 0, 255]);
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
  expect(jpeg.name).toBe("halves-400x200.jpg");
  expect(jpeg.bytes.subarray(0, 2).toString("hex")).toBe("ffd8");

  await page.getByLabel("Format").selectOption("image/webp");
  const webp = await download(page);
  expect(webp.name).toBe("halves-400x200.webp");
  expect(webp.bytes.subarray(8, 12).toString()).toBe("WEBP");

  await page.getByLabel("Format").selectOption("image/png");
  await expect(quality).toBeHidden();
});

test("copies the crop to the clipboard as PNG, whatever the format", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(page);
  await page.getByLabel("Aspect ratio").selectOption({ label: "1:1" });
  await drag(page, page.locator("#crop"), 100, 0); // blue half
  await page.getByLabel("Scale (%)").fill("50");
  await page.getByLabel("Format").selectOption("image/jpeg");

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item.getType("image/png");
    const bmp = await createImageBitmap(blob);
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    return { types: item.types, width: bmp.width, height: bmp.height, pixel: Array.from(ctx.getImageData(50, 50, 1, 1).data.slice(0, 3)) };
  });
  expect(copied).toEqual({ types: ["image/png"], width: 100, height: 100, pixel: [0, 0, 255] });
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
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 400 × 200 at 0, 0");
});

test("loads a dropped image", async ({ page }) => {
  await dispatchImage(page, "drop");
  await expect(info(page)).toHaveText("Image 400 × 200 · crop 400 × 200 at 0, 0");
  const file = await download(page);
  expect(file.name).toBe("dropped-400x200.png");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("Tools");
});
