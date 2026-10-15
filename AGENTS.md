# Project Overview

A personal collection of standalone browser-based tools, deployed as a static site on GitHub Pages. No build step, no backend, and no runtime dependencies beyond the vendored libraries in `vendor/`. npm is only used for dev dependencies (Playwright for tests, plus pdf-lib so tests can build PDFs).

## Architecture

- `index.html` — Dashboard: tool cards in headed groups (Text & code, Color, Images & PDF, Other), with search
- Each dashboard card's `h3` starts with an inline Lucide icon (https://lucide.dev, ISC): copy the icon's inner `path`/`circle`/`rect` elements into `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">`; stroke and colors come from the page's CSS
- Each tool is a single HTML file in `html/`; JS stays inline, CSS now loads from `styles/style.css`

Tools never share JS — each file contains all its own JavaScript. When adding a new tool, add the card to `index.html` and create a new `html/toolname.html`.

The one exception is third-party libraries a tool can't reasonably do without. They are vendored in `vendor/` (never loaded from a CDN) so the site works offline and tests don't hit the network:

- `vendor/pdf-lib/` — pdf-lib 1.17.1 (MIT), used by `html/pdf_split.html` and `html/pdf_merge.html`. It's copied from `node_modules/pdf-lib/dist/pdf-lib.min.js` plus `LICENSE.md`; the same exact version is a dev dependency so tests can build and inspect PDFs. To upgrade, bump the version in `package.json`, `npm install`, and copy both files again.

## Styling: Minium CSS v0.3.0 (`styles/style.css`)

All tools (in `html/`) link the shared stylesheet, then the project theme:

```html
<link rel="stylesheet" href="../styles/style.css">
<link rel="stylesheet" href="../styles/theme.css">
```

`styles/theme.css` holds project token overrides in `@layer theme` (currently: the accent role is Radix green instead of Minium's default indigo, including display-P3 values). Change colors there, never in `style.css`.

`styles/style.css` is an unmodified copy of `dist/minium.css` from `@troennes/minium` (fonts in `styles/fonts/`). To upgrade, replace it, `styles/fonts/`, and `styles/llms.txt` from the new npm package. The full usage reference is in `styles/llms.txt`. Key points:

**Approach:** semantic HTML first, then layout classes, then component classes, then local custom-property escape valves. Avoid writing new CSS unless a pattern is truly project-specific.

**Layout primitives:** `.flow`, `.cluster`, `.container`, `.grid`, `.repel`, `.switcher`, `.sidebar`, `.frame`

**Components:** `.card`, `.alert`, `.badge`, `.pill`, `.avatar`, `.icon`, `.dropdown`, `.skeleton`, tooltips via `data-tooltip` + `data-placement` — and native `dialog`, `details`/`summary`, `progress`, `meter`

**Buttons:** default is primary (orange). Tone modifiers: `.accent`, `.danger`, `.success`, `.warning`, `.info`, `.contrast`, `.neutral`. Emphasis: `.secondary`, `.tertiary`. Use `role="button"` on links that should look like buttons.

**Color tokens:** primary = orange, accent = green (set in `styles/theme.css`). Full semantic token set: `--color-text`, `--color-surface`, `--color-border-weak`, `--color-primary`, `--color-accent`, `--color-success`, `--color-danger`, `--color-warning`, `--color-info`, etc.

**Fonts:** PT Sans (body), Inconsolata (mono) — loaded from `styles/fonts/`, no network requests needed.

**Theming:** `color-scheme: light dark` by default. Force a mode with `data-theme="dark"` or `data-theme="light"` on `<html>`.

**Escape valves:** tune spacing/sizing with local custom properties (`--flow-space`, `--gap`, `--card-padding`, `--grid-min-size`, etc.) before writing new CSS rules.

**Project CSS:** if a pattern needs custom styles that aren't covered by tokens or escape valves, add them inline in the tool's `<style>` block scoped tightly to that tool.

**`hidden` gotcha:** Minium components that set `display` (for example `.badge` and link cards, `a.card`) override the `hidden` attribute, so toggling `hidden` on them does nothing. Add a scoped rule such as `.card[hidden] { display: none; }`. Plain elements (`div`, `section`, `small`, form fields) hide fine.

## Tool Page Conventions

Tools are deliberately small: one job, few controls, no clutter.

- **Skeleton:** `header > nav.container.slim` with the `← Tools` back link, then `main.container.slim.flow` starting with an `hgroup` (`h1` + one-line `p`). Use the regular `.container` only when the tool needs the width (the NPK calculator puts inputs and result side by side in a `.switcher`).
- **Live, linked fields:** results update as you type. Prefer two linked fields that convert both ways (Text ↔ Base64, CSS ↔ Minified) over Encode/Decode/Apply buttons.
- **Validation:** set `aria-invalid="true"` on the field and explain in a `small` right after it; remove the attribute when valid. Disable buttons that can't do anything useful.
- **Copy buttons:** `neutral small`, labelled "Copy", switching to "Copied" for ~1.2 s. When a page has several, give each an `aria-label` ("Copy SHA-256") so they stay distinguishable.
- **Leave out:** toasts, status bars, Clear/Reset/Swap buttons, option toggles nobody needs, help paragraphs and notes. A short hint in a `small` is enough.
- **Text sizes:** monospace `textarea`s use `font-family: var(--font-mono)`; long output can use `font-size: var(--size-small)`.

## Adding a New Tool

1. Create `html/toolname.html` using Minium CSS (link `../styles/style.css` and `../styles/theme.css`, use semantic HTML + layout/component classes)
2. Add a link card to the right group in `index.html`. Its `h3` must match the tool page's `h1` exactly (`tests/index.spec.js` checks this, and that every file in `html/` has a card):

   ```html
   <a href="./html/toolname.html" class="card" data-keywords="extra search words">
     <h3>Tool name</h3>
     <p>One-sentence description.</p>
   </a>
   ```
3. Add a page header with a `← Tools` back link (`<header><nav class="container slim"><ul><li><a href="../index.html">← Tools</a></li></ul></nav></header>`) and an `hgroup` title
4. Add Playwright tests in `tests/toolname.spec.js`

## Improving an Existing Tool

Older tools were generated quickly and tend to be cluttered and subtly broken. When reworking one:

1. **Read it and run it.** Exercise edge cases in a real browser and list actual bugs before proposing changes (past examples: the CSS minifier broke `calc()` and media queries, the SHA3-256 implementation was wrong, presets didn't match their values).
2. **Ask before building.** Agree on the interaction model, which features and options stay (the default is fewer), and any behavior changes. Don't add features that weren't asked for.
3. **Keep data verbatim.** Fact banks, presets and verified algorithm code carry over unchanged; point out suspicious entries instead of silently fixing them.
4. **Check the result visually** in light and dark mode, at about 375 px and desktop width, with no horizontal scrolling.
5. **Finish the job:** write or update `tests/toolname.spec.js`, update the tool's card in `index.html` (title must match the page `h1`), and run `npm test`.

## Testing

Tools are tested end-to-end with Playwright (a dev dependency; nothing from `node_modules` is deployed). `tests/server.js` is a tiny static server that Playwright starts automatically.

```sh
npm install && npx playwright install chromium   # once
npm test                                          # run all tests
npx playwright test tests/base64.spec.js          # one tool
```

Tests drive the real UI through accessible locators (`getByLabel`, `getByRole`), so keep form controls properly labelled.
