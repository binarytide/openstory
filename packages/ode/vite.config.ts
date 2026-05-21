import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    // Node-side: vite plugin, CSF parser, MCP, CLI. Runs in Node only.
    {
      entry: {
        index: "./src/index.ts",
        plugin: "./src/plugin/index.ts",
        mcp: "./src/mcp/index.ts",
        cli: "./src/cli/index.ts",
      },
      format: ["esm"],
      platform: "node",
      target: "node20",
      dts: true,
      clean: false,
      sourcemap: true,
      minify: false,
    },
    // Browser-side: iframe boot, framework adapters.
    {
      entry: {
        boot: "./src/boot/index.ts",
        react: "./src/react/index.ts",
        solid: "./src/solid/index.ts",
      },
      format: ["esm"],
      platform: "browser",
      target: "es2022",
      dts: true,
      clean: false,
      sourcemap: true,
      minify: false,
    },
    // ode/test — pure re-export of testing libs. DTS skipped because
    // @testing-library/jest-dom/vitest is a side-effect import the DTS
    // bundler cannot inline; consumers get matcher types via jest-dom's own
    // ambient module augmentation when they import "ode/test".
    {
      entry: { test: "./src/test/index.ts" },
      format: ["esm"],
      platform: "browser",
      target: "es2022",
      dts: false,
      clean: false,
      sourcemap: true,
      minify: false,
    },
  ],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
