import { defineConfig } from "vitest/config"

// Vitest runs the pure billing/utils/auth/midtrans helpers directly. The
// `@/*` → `./*` alias from tsconfig.json is resolved natively via
// resolve.tsconfigPaths so tests import modules the same way the app does. All
// targeted code is server-side/pure, so the `node` environment is sufficient.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Globs, not bare names: setting `exclude` replaces Vitest's defaults, and bare
    // "node_modules" only matches the top-level dir — nested ones (git worktrees under
    // .claude/) would otherwise have their bundled *.test.ts files collected.
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/**"],
    coverage: {
      // Report-only: prints a summary and writes HTML, but never fails CI.
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "features/**"],
      exclude: ["**/*.test.ts", "lib/test/**"],
    },
  },
})
