import { defineConfig } from "@playwright/test";

const isCi = process.env.CI === "true";

export default defineConfig({
  expect: {
    timeout: 10000,
  },
  reporter: [["list"]],
  retries: isCi ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: {
      height: 900,
      width: 1440,
    },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    reuseExistingServer: !isCi,
    timeout: 120000,
    url: "http://127.0.0.1:4173",
  },
  workers: isCi ? 1 : undefined,
});
