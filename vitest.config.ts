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
  },
})
