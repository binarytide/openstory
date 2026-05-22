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

  it("when two openstory plugin instances are present, only the first acts as primary", async () => {
    const primary = openstory({ framework: "react" });
    const secondary = openstory({ framework: "react" });
    const fakeResolved = {
      root: projectRoot,
      plugins: [primary, secondary],
    } as never;
    const callConfigResolved = async (plugin: Plugin): Promise<void> => {
      const hook = plugin.configResolved;
      if (typeof hook !== "function") return;
      await (hook as (config: typeof fakeResolved) => Promise<void> | void)(fakeResolved);
    };
    await writePackageJson({ dependencies: { react: "^19.0.0" } });
    await callConfigResolved(primary);
    await callConfigResolved(secondary);
    const fakeServer = {
      watcher: { on: () => {} },
      middlewares: { use: () => {} },
    } as never;
    const middlewareUses: string[] = [];
    const trackedServer = {
      watcher: { on: () => {} },
      middlewares: { use: (...args: unknown[]) => middlewareUses.push(String(args[0] ?? "fn")) },
    } as never;
    const primaryConfigureServer = primary.configureServer as
      | ((server: typeof fakeServer) => void)
      | undefined;
    const secondaryConfigureServer = secondary.configureServer as
      | ((server: typeof fakeServer) => void)
      | undefined;
    if (primaryConfigureServer) primaryConfigureServer(trackedServer);
    if (secondaryConfigureServer) secondaryConfigureServer(trackedServer);
    expect(middlewareUses.length).toBeGreaterThan(0);
    const primaryMwCount = middlewareUses.length;
    middlewareUses.length = 0;
    if (secondaryConfigureServer) secondaryConfigureServer(trackedServer);
    expect(middlewareUses).toHaveLength(0);
    expect(primaryMwCount).toBeGreaterThan(0);
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
