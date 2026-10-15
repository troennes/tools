# tools

A personal collection of small, single-purpose, vibe-coded browser tools. Open `index.html` to browse them.

## Project rules

Every tool follows these rules:

- **Local only.** Your data stays in your browser. Tools never upload files or
  send what you type to a server.
- **No tracking.** No analytics, cookies, or third-party requests.
- **Works offline.** Fonts, styles, and libraries are stored in this
  repository, not loaded from a CDN.
- **No build step.** Each tool is one HTML file in `html/` with its own inline
  JavaScript.
- **One job per tool.** Results update as you type, with few controls.

## Test it

The tests use Playwright. To install it and run the tests:

```sh
npm install && npx playwright install chromium
npm test
```

## License

[MIT](LICENSE)
