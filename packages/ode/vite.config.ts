import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      entry: ["./src/index.ts"],
      format: ["iife"],
      globalName: "Ode",
      dts: false,
      clean: false,
      platform: "browser",
      sourcemap: false,
      minify: process.env.NODE_ENV === "production",
    },
    {
      entry: ["./src/index.ts"],
      format: ["cjs", "esm"],
      dts: true,
      clean: false,
      platform: "node",
      sourcemap: false,
      minify: process.env.NODE_ENV === "production",
    },
  ],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
