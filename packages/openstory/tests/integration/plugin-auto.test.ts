import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openstory } from "../../src/plugin/index.js";

let projectRoot: string;
let server: import("vite").ViteDevServer;
let baseUrl: string;

const writeFixture = async (relativePath: string, contents: string): Promise<void> => {
  const absolutePath = join(projectRoot, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
};

beforeAll(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-plugin-auto-"));
  await writeFixture(
    "package.json",
    JSON.stringify({ name: "auto-fixture", dependencies: { react: "^19.0.0" } }),
  );
  await writeFixture(
    "src/components/Button.tsx",
    `export const Button = () => <button>Click</button>;\n`,
  );
  await writeFixture(
    "src/Card.tsx",
    `export default function Card() { return <div>Card</div>; }\n`,
  );

  const { createServer } = await import("vite");
  server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: "custom",
    plugins: [openstory({ framework: "react", auto: true })],
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
  if (server) {
    await Promise.race([
      server.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  if (projectRoot) {
    await rm(projectRoot, { recursive: true, force: true });
  }
}, 10_000);

describe("plugin auto: dev manifest", () => {
  it("synthesizes manifest entries for components without any .stories file", async () => {
    const response = await fetch(`${baseUrl}/__openstory/manifest.json`);
    expect(response.status).toBe(200);

    const manifest = (await response.json()) as {
      framework: string;
      stories: Array<{
        id: string;
        name: string;
        title: string;
        importPath: string;
        tags: string[];
        auto?: { componentExport: string };
      }>;
    };

    expect(manifest.framework).toBe("react");
    const ids = manifest.stories.map((entry) => entry.id).sort();
    expect(ids).toEqual(["card--card", "components-button--button"]);

    const buttonStory = manifest.stories.find((entry) => entry.id === "components-button--button")!;
    expect(buttonStory.title).toBe("Components/Button");
    expect(buttonStory.tags).toContain("auto");
    expect(buttonStory.auto).toEqual({ componentExport: "Button" });
    expect(buttonStory.importPath).toBe("src/components/Button.tsx");

    const cardStory = manifest.stories.find((entry) => entry.id === "card--card")!;
    expect(cardStory.auto).toEqual({ componentExport: "default" });
  });

  it("returns story iframe HTML for an auto-synthesized story id", async () => {
    const response = await fetch(`${baseUrl}/__story/components-button--button`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-openstory-story="components-button--button"');
    expect(html).toContain("openstory-root");
  });
});
