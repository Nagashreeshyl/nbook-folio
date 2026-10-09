import { defineConfig } from "@playwright/test";

const MOCK_AI_PORT = 8799;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // The app talks to the mock only server-side (providers are called from the
  // Node runtime), so the second server is an endpoint override, not a stub
  // inside production code.
  webServer: [
    {
      command: "npm start",
      url: "http://localhost:3000/",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SESSION_SECRET: "nbook-e2e-session-secret-0123456789abcdef",
        NBOOK_LOCAL_DATA_DIR: ".nbook-e2e",
        APP_URL: "http://localhost:3000",
        GROQ_API_KEY: "nbook-e2e-groq-key",
        GROQ_MODEL: "nbook-e2e-groq-model",
        GROQ_BASE_URL: `http://127.0.0.1:${MOCK_AI_PORT}`,
        OPENROUTER_API_KEY: "nbook-e2e-openrouter-key",
        OPENROUTER_MODEL: "nbook-e2e-openrouter-model",
        OPENROUTER_BASE_URL: `http://127.0.0.1:${MOCK_AI_PORT}`,
      },
    },
    {
      command: "node e2e/mock-ai-server.mjs",
      url: `http://127.0.0.1:${MOCK_AI_PORT}/_health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_AI_PORT: String(MOCK_AI_PORT) },
    },
  ],
});
