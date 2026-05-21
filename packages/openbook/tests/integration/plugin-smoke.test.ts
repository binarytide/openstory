// Phase 2 smoke test: boots a Vite dev server with openbook() loaded against the
// react-grab-like fixture, then verifies the manifest + story endpoints.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openbook } from "../../src/plugin/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "react-grab-like");

let server: import("vite").ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
  const { createServer } = await import("vite");
  server = await createServer({
    root: fixtureRoot,
    configFile: false,
    appType: "custom",
    plugins: [
      openbook({
        framework: "solid",
        stories: ["stories/**/*.stories.{ts,tsx}"],
        preview: "./preview.tsx",
      }),
    ],
    server: { port: 0, host: "127.0.0.1", strictPort: false },
    logLevel: "silent",
  });
  await server.listen();
  const addr = server.httpServer?.address();
  if (!addr || typeof addr === "string") {
    throw new TypeError("server.httpServer has no address");
  }
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 60_000);

afterAll(async () => {
  if (!server) return;
  // Vite's watcher + ws server occasionally hang on close in CI; race against
  // a short deadline so a stuck close doesn't fail the whole suite.
  await Promise.race([server.close(), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
}, 10_000);

describe("plugin smoke: dev endpoints", () => {
  it("serves a valid manifest with preview metadata", async () => {
    const res = await fetch(`${baseUrl}/__openbook/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);

    const manifest = (await res.json()) as {
      v: number;
      framework: string;
      stories: Array<{ id: string; title: string; importPath: string }>;
      globalTypes: Record<string, unknown>;
      initialGlobals: Record<string, unknown>;
      parameters: Record<string, unknown>;
    };

    expect(manifest.v).toBe(1);
    expect(manifest.framework).toBe("solid");
    expect(manifest.stories.length).toBeGreaterThan(0);

    const ids = manifest.stories.map((s) => s.id);
    // Title sanitization preserves casing as one word (CSF spec): "ContextMenu"
    // becomes "contextmenu", matching ComponentDriven/csf semantics exactly.
    expect(ids).toContain("components-toolbar--default");
    expect(ids).toContain("components-selectionlabel--idle");
    expect(ids).toContain("components-contextmenu--basic");

    // Preview metadata: globalTypes / initialGlobals / parameters extracted
    // statically by parsePreview() from the fixture's preview.tsx.
    expect(Object.keys(manifest.globalTypes)).toContain("theme");
    expect(manifest.initialGlobals["theme"]).toBe("dark");
    expect(manifest.parameters["layout"]).toBe("fullscreen");
  });

  it("serves story iframe HTML for a known story id", async () => {
    const res = await fetch(`${baseUrl}/__story/components-toolbar--default`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);

    const html = await res.text();
    expect(html).toContain('data-openbook-story="components-toolbar--default"');
    expect(html).toContain("openbook-root");
    expect(html).toContain("window.__OPENBOOK_STORY__");
    // Vite extracts our inline module script into an html-proxy URL.
    expect(html).toMatch(/<script[^>]+type="module"/);
  });

  it("returns 500 for an unknown story id", async () => {
    const res = await fetch(`${baseUrl}/__story/no-such-story`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("OpenbookStoryNotFoundError");
    expect(body.message).toMatch(/no-such-story/);
  });

  it("synthesizes a working virtual entry module via the html-proxy URL", async () => {
    // 1) Fetch the iframe HTML and pluck out the proxy script src.
    // Vite injects its own client script, so filter to the one Vite emitted from
    // our inline `<script type="module">import 'virtual:...'` — its src will
    // contain html-proxy.
    const htmlRes = await fetch(`${baseUrl}/__story/components-toolbar--default`);
    const html = await htmlRes.text();
    const allScripts = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)];
    const proxyMatch = allScripts.find((m) => m[1]!.includes("html-proxy"));
    expect(proxyMatch, "expected an html-proxy <script src> in the iframe HTML").toBeDefined();
    const proxySrc = proxyMatch![1]!;

    // 2) Fetch the proxy script — it should contain a `virtual:openbook-story-entry` import.
    const proxyRes = await fetch(`${baseUrl}${proxySrc}`);
    expect(proxyRes.status).toBe(200);
    const proxyCode = await proxyRes.text();
    expect(proxyCode).toMatch(/virtual:openbook-story-entry/);

    // 3) Vite rewrites the bare `virtual:openbook-story-entry` import to an internal
    // URL (with the `__x00__` null-byte encoding). Pull *any* import target out
    // of the proxy script and verify it resolves to a module containing boot().
    const im = /import\s*(?:[^"';]*\s*from\s*)?["']([^"']+)["']/.exec(proxyCode);
    expect(im, "expected at least one import in the proxy script").not.toBeNull();
    const entryUrl = im![1]!;
    const entryRes = await fetch(`${baseUrl}${entryUrl}`);
    expect(entryRes.status).toBe(200);
    const entryCode = await entryRes.text();
    expect(entryCode).toContain("boot(");
    expect(entryCode).toMatch(/components-toolbar--default/);
  });
});
