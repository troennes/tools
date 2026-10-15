import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/html/minify_css.html");
});

const css = (page) => page.getByLabel("CSS", { exact: true });
const min = (page) => page.getByLabel("Minified");

const minifies = [
  ["removes comments and whitespace", "/* x */\n.a {\n  color : red ;\n  margin: 0 auto;\n}\n", ".a{color:red;margin:0 auto}"],
  ["keeps /*! license */ comments", "/*! MIT */ .a { color: red }", "/*! MIT */ .a{color:red}"],
  ["tightens combinators and lists", ".a > .b + .c ~ .d , .e { x: y }", ".a>.b+.c~.d,.e{x:y}"],
  ["keeps the space before ( in media queries", "@media screen and (min-width: 600px) { a { color: red } }", "@media screen and (min-width:600px){a{color:red}}"],
  ["keeps spaces around + and - in calc()", ".a { width: calc(100% - 10px + 2px); }", ".a{width:calc(100% - 10px + 2px)}"],
  ["keeps descendant pseudo-class selectors", ".nav :hover { color: red }", ".nav :hover{color:red}"],
  ["does not rewrite ID selectors", "#aabbcc { color: #ffffff }", "#aabbcc{color:#ffffff}"],
  ["does not rewrite units", ".a { transition: opacity 0s; --x: 0px; }", ".a{transition:opacity 0s;--x:0px}"],
  ["leaves strings alone", '.a { content: "a  ;  b" }', '.a{content:"a  ;  b"}'],
  ["keeps unquoted url() intact", ".a { background: url(   data:image/png;base64,AA== ) no-repeat; }", ".a{background:url(data:image/png;base64,AA==) no-repeat}"],
  ["keeps escaped characters", ".sm\\:p-4 { padding: 1rem }", ".sm\\:p-4{padding:1rem}"],
  ["shortens !important", ".a { color: red !important; }", ".a{color:red!important}"],
  ["handles nesting", ".card { color: red; &:hover { color: blue; } }", ".card{color:red;&:hover{color:blue}}"],
];

for (const [name, input, expected] of minifies) {
  test(`minify ${name}`, async ({ page }) => {
    await css(page).fill(input);
    await expect(min(page)).toHaveValue(expected);
  });
}

test("beautifies minified CSS", async ({ page }) => {
  await min(page).fill("@media (min-width:600px){.a>.b,.c{color:red;margin:0 auto!important}}");
  await expect(css(page)).toHaveValue(
    [
      "@media (min-width: 600px) {",
      "  .a > .b, .c {",
      "    color: red;",
      "    margin: 0 auto !important;",
      "  }",
      "}",
    ].join("\n")
  );
});

test("minify → beautify → minify is stable", async ({ page }) => {
  const source = `/*! v1 */
@import url(a.css) screen;
.card { color: red; &:hover { color: blue; } & > .x { margin: 0 } }
li:nth-child(2n + 1) { font: 12px / 1.5 sans-serif; width: calc(1px + 2px) }
:is(.a, .b) :where(.c) { grid-template-areas: "a b" "c d"; }`;
  await css(page).fill(source);
  const minified = await min(page).inputValue();
  await min(page).fill(minified);
  await css(page).fill(await css(page).inputValue());
  await expect(min(page)).toHaveValue(minified);
});

test("shows the size savings", async ({ page }) => {
  await css(page).fill(".a {\n  color: red;\n}\n");
  await expect(page.getByText("21 bytes → 13 bytes (38% smaller)")).toBeVisible();
  await css(page).fill("");
  await expect(page.locator("#savings")).toBeHidden();
});

test("copies the minified CSS", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await css(page).fill(".a { color: red; }");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(".a{color:red}");
});

test("downloads the minified CSS", async ({ page }) => {
  await css(page).fill(".a { color: red; }");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("styles.min.css");
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(".a{color:red}");
});

test("links back to the tool index", async ({ page }) => {
  await page.getByRole("link", { name: "← Tools" }).click();
  await expect(page).toHaveTitle("My tools collection");
});
