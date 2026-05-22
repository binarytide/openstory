import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Plugin, UserConfig } from "vite";
import { openstory } from "../../src/plugin/index.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-config-hook-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const writePackageJson = async (contents: Record<string, unknown>): Promise<void> => {
  await writeFile(join(projectRoot, "package.json"), JSON.stringify(contents), "utf8");
};

type ConfigHookFn = (
  config: UserConfig,
  env: { command: "serve" | "build"; mode: string },
) => UserConfig | null | undefined;

const callConfigHook = (plugin: Plugin, existingConfig: UserConfig = {}): unknown => {
  const hook = plugin.config;
  if (typeof hook !== "function") return undefined;
  return (hook as ConfigHookFn)(existingConfig, { command: "serve", mode: "development" });
};

describe("openstory plugin config hook", () => {
  it("injects react optimizeDeps + dedupe when framework is explicitly react", () => {
    const plugin = openstory({ framework: "react" });
    const result = callConfigHook(plugin, { root: projectRoot }) as {
      resolve: { dedupe: string[] };
      optimizeDeps: { include: string[] };
    };
    expect(result.optimizeDeps.include).toEqual(
      expect.arrayContaining(["react", "react-dom", "react-dom/client"]),
    );
    expect(result.resolve.dedupe).toEqual(expect.arrayContaining(["react", "react-dom"]));
  });

  it("auto-detects react from package.json when no framework option is passed", async () => {
    await writePackageJson({ dependencies: { react: "^19.0.0" } });
    const plugin = openstory();
    const result = callConfigHook(plugin, { root: projectRoot }) as {
      resolve: { dedupe: string[] };
      optimizeDeps: { include: string[] };
    };
    expect(result.optimizeDeps.include).toContain("react-dom/client");
  });

  it("returns null (no injection) for non-react frameworks", () => {
    const plugin = openstory({ framework: "vue" });
    expect(callConfigHook(plugin, { root: projectRoot })).toBeNull();
  });

  it("auto-detected vue project does not get react deps", async () => {
    await writePackageJson({ dependencies: { vue: "^3.5.0" } });
    const plugin = openstory();
    expect(callConfigHook(plugin, { root: projectRoot })).toBeNull();
  });

  it("merges with existing optimizeDeps.include without duplicating", () => {
    const plugin = openstory({ framework: "react" });
    const result = callConfigHook(plugin, {
      root: projectRoot,
      optimizeDeps: { include: ["react", "lodash"] },
      resolve: { dedupe: ["react"] },
    }) as {
      resolve: { dedupe: string[] };
      optimizeDeps: { include: string[] };
    };
    expect(result.optimizeDeps.include.filter((name) => name === "react")).toHaveLength(1);
    expect(result.optimizeDeps.include).toContain("lodash");
    expect(result.resolve.dedupe.filter((name) => name === "react")).toHaveLength(1);
  });
});
