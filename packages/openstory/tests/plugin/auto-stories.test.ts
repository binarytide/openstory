import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutoStoriesBuilder } from "../../src/plugin/auto-stories.js";
import { AUTO_IGNORE_GLOBS, DEFAULT_IGNORE_GLOBS } from "../../src/constants.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-auto-stories-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const writeFixture = async (relativePath: string, contents: string): Promise<void> => {
  const absolutePath = join(projectRoot, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
};

describe("AutoStoriesBuilder - react", () => {
  it("synthesizes ManifestStory entries for PascalCase exports", async () => {
    await writeFixture(
      "src/components/Button.tsx",
      `export const Button = () => <button>Click</button>;\n`,
    );

    const builder = new AutoStoriesBuilder();
    const stories = await builder.build({
      projectRoot,
      framework: "react",
      config: {
        componentGlobs: ["**/*.tsx"],
        ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
      },
    });

    expect(stories).toHaveLength(1);
    const story = stories[0]!;
    expect(story.id).toBe("components-button--button");
    expect(story.title).toBe("Components/Button");
    expect(story.name).toBe("Button");
    expect(story.exportName).toBe("Default");
    expect(story.importPath).toBe("src/components/Button.tsx");
    expect(story.tags).toEqual(["auto"]);
    expect(story.auto).toEqual({ componentExport: "Button" });
    expect(story.hasRender).toBe(true);
    expect(story.hasPlay).toBe(false);
  });

  it("flags default exports with the 'default' componentExport", async () => {
    await writeFixture("src/Card.tsx", `export default function Card() { return <div />; }\n`);

    const builder = new AutoStoriesBuilder();
    const stories = await builder.build({
      projectRoot,
      framework: "react",
      config: {
        componentGlobs: ["**/*.tsx"],
        ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
      },
    });

    expect(stories).toHaveLength(1);
    expect(stories[0]!.auto).toEqual({ componentExport: "default" });
    expect(stories[0]!.title).toBe("Card");
  });

  it("emits one story per detected component when multiple live in the same file", async () => {
    await writeFixture(
      "src/widgets/Forms.tsx",
      `export const TextField = () => <input />;\nexport const Button = () => <button />;\n`,
    );

    const builder = new AutoStoriesBuilder();
    const stories = await builder.build({
      projectRoot,
      framework: "react",
      config: {
        componentGlobs: ["**/*.tsx"],
        ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
      },
    });

    const ids = stories.map((entry) => entry.id).sort();
    expect(ids).toEqual(["widgets-forms--button", "widgets-forms--textfield"]);
  });

  it("returns empty results for files without PascalCase exports", async () => {
    await writeFixture("src/utils.tsx", `export const helper = () => 1;\n`);

    const builder = new AutoStoriesBuilder();
    const stories = await builder.build({
      projectRoot,
      framework: "react",
      config: {
        componentGlobs: ["**/*.tsx"],
        ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
      },
    });

    expect(stories).toEqual([]);
  });

  it("caches results until a file is invalidated", async () => {
    await writeFixture("src/Button.tsx", `export const Button = () => <button />;\n`);

    const builder = new AutoStoriesBuilder();
    const buildOnce = (): Promise<unknown> =>
      builder.build({
        projectRoot,
        framework: "react",
        config: {
          componentGlobs: ["**/*.tsx"],
          ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
        },
      });

    await buildOnce();
    expect(builder.has(join(projectRoot, "src/Button.tsx"))).toBe(true);

    builder.invalidate(join(projectRoot, "src/Button.tsx"));
    expect(builder.has(join(projectRoot, "src/Button.tsx"))).toBe(false);

    await buildOnce();
    expect(builder.has(join(projectRoot, "src/Button.tsx"))).toBe(true);
  });
});

describe("AutoStoriesBuilder - vue and svelte", () => {
  it("treats each Vue SFC as a single component using its filename", async () => {
    await writeFixture("src/widgets/Counter.vue", `<template><button /></template>\n`);

    const builder = new AutoStoriesBuilder();
    const stories = await builder.build({
      projectRoot,
      framework: "vue",
      config: {
        componentGlobs: ["**/*.vue"],
        ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
      },
    });

    expect(stories).toHaveLength(1);
    expect(stories[0]!.auto).toEqual({ componentExport: "default" });
    expect(stories[0]!.name).toBe("Counter");
    expect(stories[0]!.title).toBe("Widgets/Counter");
  });

  it("treats each Svelte component as a single component using its filename", async () => {
    await writeFixture("src/Counter.svelte", `<script>let x = 0;</script>\n`);

    const builder = new AutoStoriesBuilder();
    const stories = await builder.build({
      projectRoot,
      framework: "svelte",
      config: {
        componentGlobs: ["**/*.svelte"],
        ignoreGlobs: [...DEFAULT_IGNORE_GLOBS, ...AUTO_IGNORE_GLOBS],
      },
    });

    expect(stories).toHaveLength(1);
    expect(stories[0]!.auto).toEqual({ componentExport: "default" });
    expect(stories[0]!.name).toBe("Counter");
  });
});
