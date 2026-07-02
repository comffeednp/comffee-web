import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: false,
    reporters: "default",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only throws outside a React Server Component runtime; tests import
      // server modules directly, so map it to an empty module.
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
    },
  },
});
