import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  webServer: {
    command: "npm run build && node server/index.mjs",
    url: "http://127.0.0.1:5173/api/session",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      GHOST_DATABASE_PATH: "/tmp/the-ghost-e2e/browser-" + Date.now() + ".sqlite",
      PORT: "5173",
      SERVE_DIST: "true",
      NODE_ENV: "development"
    },
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
