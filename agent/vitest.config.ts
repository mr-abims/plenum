import { defineConfig } from "vitest/config";

// Unit tests only; the red-team suite has its own config (redteam/vitest.config.ts) with a local chain.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
