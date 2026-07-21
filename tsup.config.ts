import { defineConfig } from "tsup";

/**
 * Single-file, zero-dependency CLI bundle. ESM output; esbuild preserves the
 * `#!/usr/bin/env node` hashbang from the entry file, so `npx @planoda/cli` and
 * a globally-linked `planoda` both run directly.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  minify: false,
});
