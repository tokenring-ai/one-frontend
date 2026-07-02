import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["**/*.test.{ts,tsx}"],
      // Default jsdom for React tests. Pure-logic .ts tests opt into node via:
      //   // @vitest-environment node
      environment: "jsdom",
      globals: true,
      isolate: true,
      setupFiles: ["./src/test/setup.ts"],
      coverage: {
        provider: "v8",
      },
    },
  }),
);