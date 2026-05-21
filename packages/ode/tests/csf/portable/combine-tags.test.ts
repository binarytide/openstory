// Ported from ComponentDriven/csf (MIT). See ATTRIBUTION.md.
import { describe, expect, it } from "vitest";
import { combineTags } from "../../../src/csf/combine-tags.js";

describe("combineTags", () => {
  const cases: Array<[string[], string[]]> = [
    [[], []],
    [
      ["a", "b"],
      ["a", "b"],
    ],
    [
      ["a", "b", "b"],
      ["a", "b"],
    ],
    [["a", "b", "!b"], ["a"]],
    [["b", "!b", "b"], ["b"]],
  ];

  for (const [input, expected] of cases) {
    it(`combineTags(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(combineTags(...input)).toEqual(expected);
    });
  }
});
