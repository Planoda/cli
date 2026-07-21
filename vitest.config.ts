import { defineConfig } from "vitest/config";

/**
 * CLI-scoped vitest config, mirroring `packages/sdk/vitest.config.ts`. This
 * package is standalone (npm-managed, not part of the pnpm workspace), so it
 * picks up `src/**\/*.test.ts` and runs in isolation via `npm test` /
 * `npm run test` from this directory.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
    isolate: true,
  },
});
