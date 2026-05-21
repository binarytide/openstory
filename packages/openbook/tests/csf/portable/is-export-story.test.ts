// Ported from ComponentDriven/csf (MIT). See ATTRIBUTION.md.
import { describe, expect, it } from "vitest";
import { isExportStory } from "../../../src/csf/is-export-story.js";

describe("isExportStory", () => {
  it("should exclude __esModule", () => {
    expect(isExportStory("__esModule", {})).toBeFalsy();
  });

  it("should include all stories when there are no filters", () => {
    expect(isExportStory("a", {})).toBeTruthy();
  });

  it("should filter stories by arrays", () => {
    expect(isExportStory("a", { includeStories: ["a"] })).toBeTruthy();
    expect(isExportStory("a", { includeStories: [] })).toBeFalsy();
    expect(isExportStory("a", { includeStories: ["b"] })).toBeFalsy();

    expect(isExportStory("a", { excludeStories: ["a"] })).toBeFalsy();
    expect(isExportStory("a", { excludeStories: [] })).toBeTruthy();
    expect(isExportStory("a", { excludeStories: ["b"] })).toBeTruthy();

    expect(isExportStory("a", { includeStories: ["a"], excludeStories: ["a"] })).toBeFalsy();
    expect(isExportStory("a", { includeStories: [], excludeStories: [] })).toBeFalsy();
    expect(isExportStory("a", { includeStories: ["a"], excludeStories: ["b"] })).toBeTruthy();
  });

  it("should filter stories by regex", () => {
    expect(isExportStory("a", { includeStories: /a/ })).toBeTruthy();
    expect(isExportStory("a", { includeStories: /.*/ })).toBeTruthy();
    expect(isExportStory("a", { includeStories: /b/ })).toBeFalsy();

    expect(isExportStory("a", { excludeStories: /a/ })).toBeFalsy();
    expect(isExportStory("a", { excludeStories: /.*/ })).toBeFalsy();
    expect(isExportStory("a", { excludeStories: /b/ })).toBeTruthy();

    expect(isExportStory("a", { includeStories: /a/, excludeStories: ["a"] })).toBeFalsy();
    expect(isExportStory("a", { includeStories: /.*/, excludeStories: /.*/ })).toBeFalsy();
    expect(isExportStory("a", { includeStories: /a/, excludeStories: /b/ })).toBeTruthy();
  });
});
