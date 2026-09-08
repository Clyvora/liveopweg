import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["workers/**/*.test.ts", "packages/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
});
