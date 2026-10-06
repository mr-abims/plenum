import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["redteam/**/*.test.ts"],
    globalSetup: ["redteam/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
