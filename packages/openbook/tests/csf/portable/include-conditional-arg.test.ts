// Ported from ComponentDriven/csf (MIT). See ATTRIBUTION.md.
// Adapted: error messages now match Openbook's `OpenbookConfigInvalidOptionsError`.

import { describe, expect, it } from "vitest";
import { includeConditionalArg, testValue } from "../../../src/csf/include-conditional-arg.js";
import type { ArgType, ConditionalArg } from "../../../src/types.js";

type CondTestRow = [string, ConditionalArg, unknown, boolean];
type IncludeTestRow = [string, ArgType, Record<string, unknown>, Record<string, unknown>, boolean];

describe("testValue", () => {
  describe("truthy", () => {
    const cases: CondTestRow[] = [
      ["implicit true", {}, true, true],
      ["implicit truthy", {}, 1, true],
      ["implicit falsey", {}, 0, false],
      ["truthy true", { truthy: true }, true, true],
      ["truthy truthy", { truthy: true }, 1, true],
      ["truthy falsey", { truthy: true }, 0, false],
      ["falsey true", { truthy: false }, true, false],
      ["falsey truthy", { truthy: false }, 1, false],
      ["falsey falsey", { truthy: false }, 0, true],
    ];
    it.each(cases)("%s", (_name, cond, value, expected) => {
      expect(testValue(cond, value)).toBe(expected);
    });
  });
  describe("exists", () => {
    const cases: CondTestRow[] = [
      ["exist", { exists: true }, 1, true],
      ["exist false", { exists: true }, undefined, false],
      ["nexist", { exists: false }, undefined, true],
      ["nexist false", { exists: false }, 1, false],
    ];
    it.each(cases)("%s", (_name, cond, value, expected) => {
      expect(testValue(cond, value)).toBe(expected);
    });
  });
  describe("eq", () => {
    const cases: CondTestRow[] = [
      ["true", { eq: 1 }, 1, true],
      ["false", { eq: 1 }, 2, false],
      ["undefined", { eq: undefined }, undefined, false],
      ["undefined false", { eq: 1 }, undefined, false],
      ["object true", { eq: { x: 1 } }, { x: 1 }, true],
      ["object false", { eq: { x: 1 } }, { x: 2 }, false],
    ];
    it.each(cases)("%s", (_name, cond, value, expected) => {
      expect(testValue(cond, value)).toBe(expected);
    });
  });
  describe("neq", () => {
    const cases: CondTestRow[] = [
      ["true", { neq: 1 }, 2, true],
      ["false", { neq: 1 }, 1, false],
      ["undefined true", { neq: 1 }, undefined, true],
      ["undefined false", { neq: undefined }, undefined, false],
      ["object true", { neq: { x: 1 } }, { x: 2 }, true],
      ["object false", { neq: { x: 1 } }, { x: 1 }, false],
    ];
    it.each(cases)("%s", (_name, cond, value, expected) => {
      expect(testValue(cond, value)).toBe(expected);
    });
  });
});

describe("includeConditionalArg", () => {
  describe("errors", () => {
    it("throws if neither arg nor global is specified", () => {
      expect(() => includeConditionalArg({ if: {} as ConditionalArg }, {}, {})).toThrow(
        /exactly one of \{ arg, global \}/,
      );
    });
    it("throws if arg and global are both specified", () => {
      expect(() => includeConditionalArg({ if: { arg: "a", global: "b" } }, {}, {})).toThrow(
        /exactly one of \{ arg, global \}/,
      );
    });
    it("throws if multiple exists / eq / neq are specified", () => {
      expect(() =>
        includeConditionalArg({ if: { arg: "a", exists: true, eq: 1 } }, {}, {}),
      ).toThrow(/at most one of \{ exists, eq, neq, truthy \}/);
      expect(() =>
        includeConditionalArg({ if: { arg: "a", exists: false, neq: 0 } }, {}, {}),
      ).toThrow(/at most one of \{ exists, eq, neq, truthy \}/);
      expect(() => includeConditionalArg({ if: { arg: "a", eq: 1, neq: 0 } }, {}, {})).toThrow(
        /at most one of \{ exists, eq, neq, truthy \}/,
      );
    });
  });

  describe("args", () => {
    const cases: IncludeTestRow[] = [
      ["implicit true", { if: { arg: "a" } }, { a: 1 }, {}, true],
      ["truthy true", { if: { arg: "a", truthy: true } }, { a: 0 }, {}, false],
      ["truthy false", { if: { arg: "a", truthy: false } }, {}, {}, true],
      ["exist", { if: { arg: "a", exists: true } }, { a: 1 }, {}, true],
      ["exist false", { if: { arg: "a", exists: true } }, {}, {}, false],
      ["eq scalar true", { if: { arg: "a", eq: 1 } }, { a: 1 }, {}, true],
      ["eq scalar false", { if: { arg: "a", eq: 1 } }, { a: 2 }, { a: 1 }, false],
      ["neq scalar true", { if: { arg: "a", neq: 1 } }, { a: 2 }, {}, true],
      ["neq scalar false", { if: { arg: "a", neq: 1 } }, { a: 1 }, { a: 2 }, false],
    ];
    it.each(cases)("%s", (_name, argType, args, globals, expected) => {
      expect(includeConditionalArg(argType, args, globals)).toBe(expected);
    });
  });

  describe("globals", () => {
    const cases: IncludeTestRow[] = [
      ["implicit true", { if: { global: "a" } }, {}, { a: 1 }, true],
      ["implicit undefined", { if: { global: "a" } }, {}, {}, false],
      ["truthy false", { if: { global: "a", truthy: true } }, {}, { a: 0 }, false],
      ["truthy true", { if: { global: "a", truthy: false } }, {}, { a: 0 }, true],
      ["exist true", { if: { global: "a", exists: true } }, {}, { a: 1 }, true],
      ["exist false", { if: { global: "a", exists: true } }, { a: 1 }, {}, false],
      ["eq true", { if: { global: "a", eq: 1 } }, {}, { a: 1 }, true],
      ["neq true", { if: { global: "a", neq: 1 } }, {}, { a: 2 }, true],
      ["neq false", { if: { global: "a", neq: 1 } }, { a: 2 }, { a: 1 }, false],
    ];
    it.each(cases)("%s", (_name, argType, args, globals, expected) => {
      expect(includeConditionalArg(argType, args, globals)).toBe(expected);
    });
  });
});
