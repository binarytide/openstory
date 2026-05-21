// Ported from ComponentDriven/csf (MIT). See ATTRIBUTION.md.
import { describe, expect, it } from "vitest";
import { toId } from "../../../src/csf/to-id.js";

describe("toId", () => {
  const cases: Array<[string, string, string | undefined, string]> = [
    ["handles simple cases", "kind", "story", "kind--story"],
    ["handles kind without story", "kind", undefined, "kind"],
    ["handles basic substitution", "a b$c?d😀e", "1-2:3", "a-b-c-d😀e--1-2-3"],
    ["handles runs of non-url chars", "a?&*b", "story", "a-b--story"],
    ["removes non-url chars from start and end", "?ab-", "story", "ab--story"],
    ["downcases", "KIND", "STORY", "kind--story"],
    ["non-latin", "Кнопки", "нормальный", "кнопки--нормальный"],
    ["korean", "kind", "바보 (babo)", "kind--바보-babo"],
    ["all punctuation", "kind", 'unicorns,’–—―′¿`"<>()!.!!!{}[]%^&$*#&', "kind--unicorns"],
  ];

  for (const [name, kind, story, output] of cases) {
    it(name, () => {
      expect(toId(kind, story)).toBe(output);
    });
  }

  it("does not allow kind with *no* url chars", () => {
    expect(() => toId("?", "asdf")).toThrow(/Invalid title/);
  });

  it("does not allow empty kind", () => {
    expect(() => toId("", "asdf")).toThrow(/Invalid title/);
  });

  it("does not allow story with *no* url chars", () => {
    expect(() => toId("kind", "?")).toThrow(/Invalid story name/);
  });

  it("allows empty story", () => {
    expect(() => toId("kind", "")).not.toThrow();
  });
});
