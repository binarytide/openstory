import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../../src/cli/init.js";
import type { Framework } from "../../src/types.js";

let projectRoot: string;
let writes: string[];
let originalWrite: typeof process.stdout.write;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-init-"));
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

interface FrameworkExpectation {
  framework: Framework;
  previewFile: string;
  previewMustContain: string;
  viteMustContain: string;
}

const cases: FrameworkExpectation[] = [
  {
    framework: "react",
    previewFile: "preview.tsx",
    previewMustContain: `from "openstory/react"`,
    viteMustContain: `from "@vitejs/plugin-react"`,
  },
  {
    framework: "solid",
    previewFile: "preview.tsx",
    previewMustContain: `from "openstory/solid"`,
    viteMustContain: `from "vite-plugin-solid"`,
  },
  {
    framework: "vue",
    previewFile: "preview.ts",
    previewMustContain: `from "openstory/vue"`,
    viteMustContain: `from "@vitejs/plugin-vue"`,
  },
  {
    framework: "svelte",
    previewFile: "preview.ts",
    previewMustContain: `from "openstory/svelte"`,
    viteMustContain: `from "@sveltejs/vite-plugin-svelte"`,
  },
];

describe("runInit", () => {
  for (const expectation of cases) {
    it(`scaffolds preview + vite.config for ${expectation.framework}`, async () => {
      await runInit(projectRoot, { framework: expectation.framework, force: false });

      const preview = await readFile(join(projectRoot, expectation.previewFile), "utf8");
      expect(preview).toContain(expectation.previewMustContain);
      expect(preview).toContain("export default preview");

      const viteConfig = await readFile(join(projectRoot, "vite.config.ts"), "utf8");
      expect(viteConfig).toContain(expectation.viteMustContain);
      expect(viteConfig).toContain(`openstory({ framework: "${expectation.framework}" })`);
    });
  }

  it("skips preview when it already exists without --force", async () => {
    const previewPath = join(projectRoot, "preview.tsx");
    await writeFile(previewPath, "// pre-existing", "utf8");

    await runInit(projectRoot, { framework: "react", force: false });

    expect(await readFile(previewPath, "utf8")).toBe("// pre-existing");
    expect(writes.join("")).toContain("skipped preview.tsx");
  });

  it("overwrites preview when --force is set", async () => {
    const previewPath = join(projectRoot, "preview.tsx");
    await writeFile(previewPath, "// pre-existing", "utf8");

    await runInit(projectRoot, { framework: "react", force: true });

    const next = await readFile(previewPath, "utf8");
    expect(next).not.toBe("// pre-existing");
    expect(next).toContain(`from "openstory/react"`);
  });

  it("prints a snippet instead of overwriting vite.config.ts when one already exists", async () => {
    const vitePath = join(projectRoot, "vite.config.ts");
    await writeFile(vitePath, "// pre-existing vite config", "utf8");

    await runInit(projectRoot, { framework: "svelte", force: true });

    expect(await readFile(vitePath, "utf8")).toBe("// pre-existing vite config");
    const output = writes.join("");
    expect(output).toContain("vite.config.ts exists");
    expect(output).toContain(`openstory({ framework: "svelte" })`);
  });
});
