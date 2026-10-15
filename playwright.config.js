import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  use: {
    baseURL: "http://localhost:4173",
    browserName: "chromium",
  },
  webServer: {
    command: "node tests/server.js",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
