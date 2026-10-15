# Project Overview

A personal collection of standalone browser-based tools, deployed as a static site on GitHub Pages. No build system, no dependencies, no backend.

## Architecture

- `index.html` — Dashboard with search/filter and links to all tools
- Each tool is a single HTML file in `html/`; JS stays inline, CSS now loads from `styles/style.css`

Tools never share JS — each file contains all its own JavaScript. When adding a new tool, add the card to `index.html` and create a new `html/toolname.html`.

## Styling: Minium CSS v0.3.0 (`styles/style.css`)

All tools (in `html/`) link the shared stylesheet:

```html
<link rel="stylesheet" href="../styles/style.css">
```

`styles/style.css` is an unmodified copy of `dist/minium.css` from `@troennes/minium` (fonts in `styles/fonts/`). To upgrade, replace it, `styles/fonts/`, and `styles/llms.txt` from the new npm package. The full usage reference is in `styles/llms.txt`. Key points:

**Approach:** semantic HTML first, then layout classes, then component classes, then local custom-property escape valves. Avoid writing new CSS unless a pattern is truly project-specific.

**Layout primitives:** `.flow`, `.cluster`, `.container`, `.grid`, `.repel`, `.switcher`, `.sidebar`, `.frame`

**Components:** `.card`, `.alert`, `.badge`, `.pill`, `.avatar`, `.icon`, `.dropdown`, `.skeleton`, tooltips via `data-tooltip` + `data-placement` — and native `dialog`, `details`/`summary`, `progress`, `meter`

**Buttons:** default is primary (orange). Tone modifiers: `.accent`, `.danger`, `.success`, `.warning`, `.info`, `.contrast`, `.neutral`. Emphasis: `.secondary`, `.tertiary`. Use `role="button"` on links that should look like buttons.

**Color tokens:** primary = orange, accent = indigo. Full semantic token set: `--color-text`, `--color-surface`, `--color-border-weak`, `--color-primary`, `--color-accent`, `--color-success`, `--color-danger`, `--color-warning`, `--color-info`, etc.

**Fonts:** PT Sans (body), Inconsolata (mono) — loaded from `styles/fonts/`, no network requests needed.

**Theming:** `color-scheme: light dark` by default. Force a mode with `data-theme="dark"` or `data-theme="light"` on `<html>`.

**Escape valves:** tune spacing/sizing with local custom properties (`--flow-space`, `--gap`, `--card-padding`, `--grid-min-size`, etc.) before writing new CSS rules.

**Project CSS:** if a pattern needs custom styles that aren't covered by tokens or escape valves, add them inline in the tool's `<style>` block scoped tightly to that tool.

## Adding a New Tool

1. Create `html/toolname.html` using Minium CSS (link `../styles/style.css`, use semantic HTML + layout/component classes)
2. Add a card entry to the `tools` array in `index.html` with `name`, `file`, `desc`, and `keywords`
3. Add a page header with a `← Tools` back link (`<header><nav class="container slim"><ul><li><a href="../index.html">← Tools</a></li></ul></nav></header>`) and an `hgroup` title
4. Add Playwright tests in `tests/toolname.spec.js`

## Testing

Tools are tested end-to-end with Playwright (dev-only dependency; the deployed site still has none). `tests/server.js` is a tiny static server that Playwright starts automatically.

```sh
npm install && npx playwright install chromium   # once
npm test                                          # run all tests
npx playwright test tests/base64.spec.js          # one tool
```

Tests drive the real UI through accessible locators (`getByLabel`, `getByRole`), so keep form controls properly labelled.
