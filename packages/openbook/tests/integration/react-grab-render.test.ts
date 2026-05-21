// Phase 6 milestone: render every react-grab story via /__story/<id> URLs.
// Boots a real headless Chromium against the fixture and verifies for each
// story that:
//   1) the iframe HTML loads (200)
//   2) the boot script wires up successfully (no console errors)
//   3) any `play` function passes (status === "passed")
//   4) the visible DOM contains expected react-grab markers

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";
import type { ViteDevServer } from "vite";

import { openbook } from "../../src/plugin/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "react-grab-like");

const REACT_GRAB_LOCAL_PATH = "/Users/aidenybai/Developer/react-grab/packages/react-grab";
const hasReactGrabCheckout = existsSync(REACT_GRAB_LOCAL_PATH);
const describeIfReactGrab = hasReactGrabCheckout ? describe : describe.skip;

let server: ViteDevServer | undefined;
let baseUrl: string;
let browser: Browser | undefined;

interface PlayResult {
  status: "running" | "passed" | "failed" | null;
  errors: string[];
}

async function renderAndCollect(page: Page, url: string, timeoutMs = 10_000): Promise<PlayResult> {
  const result: PlayResult = { status: null, errors: [] };

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") result.errors.push(msg.text());
  });

  // Capture postMessage events from the iframe boot.
  await page.exposeFunction("__capturePlayStatus", (status: string) => {
    if (status === "running" || status === "passed" || status === "failed") {
      result.status = status;
    }
  });

  await page.addInitScript(() => {
    window.addEventListener("message", (event) => {
      const data = event.data as { source?: string; type?: string; status?: string };
      if (data?.source === "openbook" && data.type === "play-status" && data.status) {
        // @ts-expect-error — injected by exposeFunction
        window.__capturePlayStatus(data.status);
      }
    });
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });

  // Give play() up to 5s to settle.
  const deadline = Date.now() + 5_000;
  while (result.status === "running" || result.status === null) {
    if (Date.now() > deadline) break;
    await new Promise<void>((r) => setTimeout(r, 100));
  }
  return result;
}

describeIfReactGrab("Phase 6: react-grab fixture renders end-to-end", () => {
  beforeAll(async () => {
    const { createServer } = await import("vite");
    server = await createServer({
      root: fixtureRoot,
      appType: "custom",
      plugins: [
        openbook({
          framework: "solid",
          stories: ["stories/*.stories.{ts,tsx}"],
          preview: "./preview.tsx",
        }),
      ],
      server: { port: 0, host: "127.0.0.1", strictPort: false },
      logLevel: "silent",
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new TypeError("server.httpServer has no address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (!server) return;
    await Promise.race([
      server.close(),
      new Promise<void>((resolveClose) => setTimeout(resolveClose, 2_000)),
    ]);
  }, 30_000);

  const newPage = async () => {
    if (!browser) throw new Error("browser not initialized");
    return browser.newPage();
  };

  it("renders the Toolbar/Default story with both toolbar buttons and play passes", async () => {
    const page = await newPage();
    const result = await renderAndCollect(page, `${baseUrl}/__story/components-toolbar--default`);
    expect(result.errors.filter((e) => !e.includes("404"))).toEqual([]);
    expect(result.status).toBe("passed");

    const toolbarEl = await page.$("[data-react-grab-toolbar]");
    expect(toolbarEl).not.toBeNull();
    await page.close();
  }, 30_000);

  it("renders the SelectionLabel/Idle story with the label visible", async () => {
    const page = await newPage();
    const result = await renderAndCollect(
      page,
      `${baseUrl}/__story/components-selectionlabel--idle`,
    );
    expect(result.errors.filter((e) => !e.includes("404"))).toEqual([]);
    expect(result.status).toBe("passed");

    const labelEl = await page.$("[data-react-grab-selection-label]");
    expect(labelEl).not.toBeNull();
    await page.close();
  }, 30_000);

  it("renders the ContextMenu/Basic story with menu visible", async () => {
    const page = await newPage();
    const result = await renderAndCollect(page, `${baseUrl}/__story/components-contextmenu--basic`);
    expect(result.errors.filter((e) => !e.includes("404"))).toEqual([]);
    expect(result.status).toBe("passed");

    const menuEl = await page.$("[data-react-grab-context-menu]");
    expect(menuEl).not.toBeNull();
    await page.close();
  }, 30_000);

  it("renders the Playground/Idle story with selection over the Get Started button", async () => {
    const page = await newPage();
    const result = await renderAndCollect(page, `${baseUrl}/__story/playground--idle`);
    expect(result.errors.filter((e) => !e.includes("404"))).toEqual([]);
    expect(result.status).toBe("passed");

    const labelEl = await page.$("[data-react-grab-selection-label]");
    expect(labelEl).not.toBeNull();
    await page.close();
  }, 30_000);

  it("applies parameters.layout='fullscreen' from preview", async () => {
    const page = await newPage();
    await page.goto(`${baseUrl}/__story/components-toolbar--default`, {
      waitUntil: "networkidle",
    });
    const bodyClass = await page.evaluate(() => document.body.className);
    expect(bodyClass).toContain("openbook-layout-fullscreen");
    await page.close();
  }, 30_000);

  it("applies the global theme decorator on the iframe", async () => {
    const page = await newPage();
    await page.goto(`${baseUrl}/__story/components-toolbar--default`, {
      waitUntil: "networkidle",
    });
    const themed = await page.$("[data-rg-theme='dark']");
    expect(themed).not.toBeNull();
    await page.close();
  }, 30_000);
});
