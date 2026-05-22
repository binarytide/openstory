import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveProjectDisplay } from "../../src/utils/resolve-project-display.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-resolve-project-display-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("resolveProjectDisplay", () => {
  it("uses package.json name when present", async () => {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "my-design-system" }),
      "utf8",
    );

    const display = await resolveProjectDisplay(projectRoot);

    expect(display.projectName).toBe("my-design-system");
    expect(display.projectRoot).toBe(projectRoot);
  });

  it("falls back to directory basename without package.json", async () => {
    const display = await resolveProjectDisplay(projectRoot);
    const directoryName = projectRoot.split("/").pop()!;

    expect(display.projectName).toBe(directoryName);
    expect(display.projectRoot).toBe(projectRoot);
  });
});
