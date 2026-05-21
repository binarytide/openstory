// Validates the static CSF parser against the real react-grab story files.
// The fixture under tests/integration/fixtures/react-grab-like/ mirrors the
// upstream Storybook setup; parsing it must produce a usable manifest for
// every story without errors.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";
import { parseCsf } from "../../src/csf/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "react-grab-like");

function defaultMakeTitle(userTitle: string | undefined, importPath: string): string {
  if (userTitle) return userTitle;
  // file-path fallback: strip `stories/` prefix + `.stories.tsx` suffix
  return importPath.replace(/\.stories\.(tsx|jsx|ts|js)$/, "").replace(/^stories\//, "");
}

describe("integration: parse react-grab fixture stories", () => {
  it("parses every *.stories.tsx without throwing", async () => {
    const files = await fg(["**/*.stories.{ts,tsx,js,jsx}"], {
      cwd: fixtureRoot,
      ignore: ["**/node_modules/**"],
    });
    expect(files.length).toBeGreaterThan(0);

    const reports: Array<{ file: string; storyIds: string[] }> = [];
    for (const file of files) {
      const abs = join(fixtureRoot, file);
      const source = await readFile(abs, "utf8");
      const relPath = relative(fixtureRoot, abs);
      const parsed = parseCsf(source, {
        filename: relPath,
        makeTitle: (t) => defaultMakeTitle(t, relPath),
      });
      expect(parsed.meta.title.length, `meta.title for ${relPath}`).toBeGreaterThan(0);
      expect(parsed.stories.length, `stories[] for ${relPath}`).toBeGreaterThan(0);
      reports.push({ file: relPath, storyIds: parsed.stories.map((s) => s.id) });
    }

    // Print summary on failure for debuggability
    if (reports.some((r) => r.storyIds.length === 0)) {
      console.error(JSON.stringify(reports, null, 2));
    }
    const total = reports.reduce((acc, r) => acc + r.storyIds.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("derives well-formed ids for known react-grab stories", async () => {
    const toolbar = await readFile(join(fixtureRoot, "stories/toolbar.stories.tsx"), "utf8");
    const parsed = parseCsf(toolbar, {
      filename: "stories/toolbar.stories.tsx",
      makeTitle: (t) => defaultMakeTitle(t, "stories/toolbar.stories.tsx"),
    });
    expect(parsed.meta.title).toBe("Components/Toolbar");
    expect(parsed.stories.map((s) => s.id)).toEqual([
      "components-toolbar--default",
      "components-toolbar--active",
      "components-toolbar--collapsed",
      "components-toolbar--context-menu-open",
    ]);
  });

  it("extracts hasPlay / hasBeforeEach correctly from toolbar story", async () => {
    const source = await readFile(join(fixtureRoot, "stories/toolbar.stories.tsx"), "utf8");
    const parsed = parseCsf(source, {
      filename: "stories/toolbar.stories.tsx",
      makeTitle: (t) => defaultMakeTitle(t, "stories/toolbar.stories.tsx"),
    });
    // meta.play and meta.beforeEach should be detected on the toolbar fixture
    expect(parsed.meta.hasPlay).toBe(true);
    expect(parsed.meta.hasBeforeEach).toBe(true);
  });
});
