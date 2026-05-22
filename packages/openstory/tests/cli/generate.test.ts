import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerate } from "../../src/cli/generate.js";

let projectRoot: string;
let writes: string[];
let originalWrite: typeof process.stdout.write;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-cli-generate-"));
  writes = [];
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
});

afterEach(async () => {
  process.stdout.write = originalWrite;
  await rm(projectRoot, { recursive: true, force: true });
});

const writeFixture = async (relativePath: string, contents: string): Promise<void> => {
  const absolutePath = join(projectRoot, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
};

describe("runGenerate", () => {
  it("writes a story file and reports the count to stdout", async () => {
    await writeFixture(
      "package.json",
      JSON.stringify({ name: "demo", dependencies: { react: "*" } }),
    );
    await writeFixture(
      "src/components/Button.tsx",
      `interface Props { variant: "primary" | "ghost" }\nexport const Button = (props: Props) => null;\n`,
    );

    await runGenerate(projectRoot, ["src/components/*.tsx"], { force: false, dryRun: false });

    const combined = writes.join("");
    expect(combined).toContain("Button.stories.tsx");
    expect(combined).toContain("1 stories generated");
    const generated = await readFile(
      join(projectRoot, "src/components/Button.stories.tsx"),
      "utf8",
    );
    expect(generated).toContain("export const Default: Story = {};");
    expect(generated).toContain("export const Ghost: Story = {");
  });

  it("reports `no components matched` when nothing is found", async () => {
    await writeFixture(
      "package.json",
      JSON.stringify({ name: "demo", dependencies: { react: "*" } }),
    );
    await runGenerate(projectRoot, ["src/does-not-exist/*.tsx"], { force: false, dryRun: false });
    expect(writes.join("")).toContain("no components matched");
  });

  it("honors --dry-run by skipping writes and announcing the run", async () => {
    await writeFixture(
      "package.json",
      JSON.stringify({ name: "demo", dependencies: { react: "*" } }),
    );
    await writeFixture("src/Card.tsx", `export const Card = (props: { title: string }) => null;\n`);
    await runGenerate(projectRoot, ["src/*.tsx"], { force: false, dryRun: true });
    const combined = writes.join("");
    expect(combined).toContain("dry run");
    await expect(readFile(join(projectRoot, "src/Card.stories.tsx"), "utf8")).rejects.toThrow();
  });
});
