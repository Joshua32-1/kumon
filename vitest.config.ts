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
    exclude: ["node_modules", ".next"],
    coverage: {
      // Report-only: prints a summary and writes HTML, but never fails CI.
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "features/**"],
      exclude: ["**/*.test.ts", "lib/test/**"],
    },
  },
})
