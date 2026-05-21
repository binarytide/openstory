import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAuto } from "../../src/cli/auto.js";
import { OpenstoryCliNoComponentsFoundError } from "../../src/errors.js";

let projectRoot: string;
let stdoutWrites: string[];
let originalStdoutWrite: typeof process.stdout.write;

const muteStdout = (): void => {
  stdoutWrites = [];
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdoutWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
};

const restoreStdout = (): void => {
  process.stdout.write = originalStdoutWrite;
};

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-auto-"));
  muteStdout();
});

afterEach(async () => {
  restoreStdout();
  await rm(projectRoot, { recursive: true, force: true });
});

const writeProjectFile = async (relativePath: string, contents: string): Promise<string> => {
  const absolutePath = join(projectRoot, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
  return absolutePath;
};

describe("runAuto - react", () => {
  it("creates a stories file next to a named PascalCase component", async () => {
    await writeProjectFile(
      "src/components/button.tsx",
      `export const Button = () => <button>Click</button>;\n`,
    );

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });

    expect(result.framework).toBe("react");
    expect(result.generated).toHaveLength(1);
    const entry = result.generated[0]!;
    expect(entry.status).toBe("written");
    expect(entry.components.map((component) => component.name)).toEqual(["Button"]);
    expect(entry.title).toBe("Components/Button");

    const written = await readFile(entry.storyFilePath, "utf8");
    expect(written).toContain(`from "openstory/react"`);
    expect(written).toContain(`title: "Components/Button"`);
    expect(written).toContain(`component: Button`);
    expect(written).toContain(`import { Button } from "./button"`);
    expect(written).toContain(`export const Default: StoryObj<typeof meta>`);
  });

  it("detects default export functions", async () => {
    await writeProjectFile("ui/card.tsx", `export default function Card() { return <div />; }\n`);

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });

    expect(result.generated).toHaveLength(1);
    const written = await readFile(result.generated[0]!.storyFilePath, "utf8");
    expect(written).toContain(`import Card from "./card"`);
    expect(written).toContain(`component: Card`);
    expect(written).toContain(`title: "Ui/Card"`);
  });

  it("does not scaffold for files without PascalCase exports", async () => {
    await writeProjectFile("src/util.tsx", `export const helper = () => 1;\n`);

    await expect(
      runAuto(projectRoot, {
        globs: [],
        framework: "react",
        force: false,
        dryRun: false,
        json: false,
        ignore: [],
      }),
    ).rejects.toBeInstanceOf(OpenstoryCliNoComponentsFoundError);
  });

  it("skips existing stories files unless force is set", async () => {
    await writeProjectFile("src/Button.tsx", `export const Button = () => <button />;\n`);
    const storyPath = join(projectRoot, "src/Button.stories.tsx");
    await writeFile(storyPath, "// hand-written\n", "utf8");

    const skipResult = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });
    expect(skipResult.generated[0]!.status).toBe("skipped");
    expect(await readFile(storyPath, "utf8")).toBe("// hand-written\n");

    const forceResult = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: true,
      dryRun: false,
      json: false,
      ignore: [],
    });
    expect(forceResult.generated[0]!.status).toBe("written");
    expect(await readFile(storyPath, "utf8")).toContain(`component: Button`);
  });

  it("supports passing custom glob expressions positionally", async () => {
    await writeProjectFile("src/ui/Button.tsx", `export const Button = () => <button />;\n`);
    await writeProjectFile("other/Hidden.tsx", `export const Hidden = () => <div />;\n`);

    const result = await runAuto(projectRoot, {
      globs: ["src/ui/*.tsx"],
      framework: "react",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });

    expect(result.searchedGlobs).toEqual(["src/ui/*.tsx"]);
    expect(result.generated).toHaveLength(1);
    expect(result.generated[0]!.components[0]!.name).toBe("Button");
  });

  it("dry run does not write files", async () => {
    await writeProjectFile("src/Button.tsx", `export const Button = () => <button />;\n`);

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: false,
      dryRun: true,
      json: false,
      ignore: [],
    });

    expect(result.generated[0]!.status).toBe("planned");
    const storyPath = result.generated[0]!.storyFilePath;
    await expect(readFile(storyPath, "utf8")).rejects.toThrow();
  });

  it("ignores existing story, test, and preview files", async () => {
    await writeProjectFile("src/Button.tsx", `export const Button = () => <button />;\n`);
    await writeProjectFile("src/Button.stories.tsx", `export default {};\n`);
    await writeProjectFile("src/Button.test.tsx", `it("works", () => {});\n`);
    await writeProjectFile("preview.tsx", `export default {};\n`);

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: false,
      dryRun: true,
      json: false,
      ignore: [],
    });

    const sourcePaths = result.generated.map((entry) => entry.componentSourcePath);
    expect(sourcePaths.some((path) => path.endsWith("Button.tsx"))).toBe(true);
    expect(sourcePaths.some((path) => path.endsWith(".stories.tsx"))).toBe(false);
    expect(sourcePaths.some((path) => path.endsWith(".test.tsx"))).toBe(false);
    expect(sourcePaths.some((path) => path.endsWith("preview.tsx"))).toBe(false);
  });

  it("writes stories to outDir when provided", async () => {
    await writeProjectFile("src/Button.tsx", `export const Button = () => <button />;\n`);

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      outDir: "stories",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });

    const storyPath = result.generated[0]!.storyFilePath;
    expect(storyPath.endsWith(join("stories", "Button.stories.tsx"))).toBe(true);
    const written = await readFile(storyPath, "utf8");
    expect(written).toContain("openstory/react");
  });

  it("prints json when requested", async () => {
    await writeProjectFile(
      "src/components/Button.tsx",
      `export const Button = () => <button />;\n`,
    );

    await runAuto(projectRoot, {
      globs: [],
      framework: "react",
      force: false,
      dryRun: true,
      json: true,
      ignore: [],
    });

    const parsed = JSON.parse(stdoutWrites.join(""));
    expect(parsed.framework).toBe("react");
    expect(parsed.generated[0].title).toBe("Components/Button");
  });
});

describe("runAuto - vue", () => {
  it("scaffolds for Vue SFCs using the filename as the component name", async () => {
    await writeProjectFile("src/Counter.vue", `<template><button /></template>\n`);

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "vue",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });

    expect(result.generated).toHaveLength(1);
    const entry = result.generated[0]!;
    expect(entry.components[0]!.name).toBe("Counter");
    const written = await readFile(entry.storyFilePath, "utf8");
    expect(written).toContain(`from "openstory/vue"`);
    expect(written).toContain(`import Counter from "./Counter.vue"`);
    expect(written).toContain(`component: Counter`);
  });
});

describe("runAuto - svelte", () => {
  it("scaffolds for Svelte components using the filename as the component name", async () => {
    await writeProjectFile(
      "src/widgets/Counter.svelte",
      `<script>let count = 0;</script>\n<button>{count}</button>\n`,
    );

    const result = await runAuto(projectRoot, {
      globs: [],
      framework: "svelte",
      force: false,
      dryRun: false,
      json: false,
      ignore: [],
    });

    expect(result.generated).toHaveLength(1);
    const written = await readFile(result.generated[0]!.storyFilePath, "utf8");
    expect(written).toContain(`from "openstory/svelte"`);
    expect(written).toContain(`import Counter from "./Counter.svelte"`);
    expect(written).toContain(`title: "Widgets/Counter"`);
  });
});
