import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // Migrates the test database when TEST_DATABASE_URL is set (see the file).
    globalSetup: ["src/test/migrate-test-db.ts"],
  },
});
