// Ported from ComponentDriven/csf (MIT). See ATTRIBUTION.md.
import { describe, expect, it } from "vitest";
import { storyNameFromExport } from "../../../src/csf/story-name-from-export.js";

describe("storyNameFromExport", () => {
  it("should format CSF exports with sensible defaults", () => {
    const cases: Record<string, string> = {
      name: "Name",
      someName: "Some Name",
      someNAME: "Some NAME",
      some_custom_NAME: "Some Custom NAME",
      someName1234: "Some Name 1234",
      someName1_2_3_4: "Some Name 1 2 3 4",
    };
    for (const [key, val] of Object.entries(cases)) {
      expect(storyNameFromExport(key)).toBe(val);
    }
  });
});
