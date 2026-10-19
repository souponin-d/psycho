import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: "fixtures",
          environment: "node",
          include: ["tests/*fixtures.test.ts"],
        },
      },
      {
        test: {
          name: "tools",
          environment: "node",
          include: ["scripts/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup.ts"],
        },
      },
    ],
  },
});
