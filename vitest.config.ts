import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["packages/domain-rail/station-3d.test.ts"],
    environment: "node",
  },
});
