// Openstory-specific parser tests beyond the ported spec.

import { describe, expect, it } from "vitest";
import { dedent } from "ts-dedent";
import { parseCsf } from "../../src/csf/parser.js";

const makeTitle = (t?: string): string => t ?? "Test/Default";

describe("parseCsf (Openstory-specific)", () => {
  it("returns an empty stories array when no named exports", () => {
    const code = dedent`
      export default { title: 'foo' };
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    expect(parsed.stories).toEqual([]);
  });

  it("extracts literal args from a story object", () => {
    const code = dedent`
      export default { title: 'foo' };
      export const Primary = { args: { label: 'Hi', count: 3, on: true } };
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    expect(parsed.stories[0]!.args).toEqual({ label: "Hi", count: 3, on: true });
  });

  it("marks args as computed when spreads or computed keys appear", () => {
    const code = dedent`
      const shared = { x: 1 };
      export default { title: 'foo' };
      export const Primary = { args: { ...shared, y: 2 } };
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    expect((parsed.stories[0]!.args as Record<string, unknown>).__computed).toBe(true);
  });

  it("respects parameters.__id as the story id", () => {
    const code = dedent`
      export default { title: 'foo/bar' };
      export const Primary = { parameters: { __id: 'override-id' } };
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    expect(parsed.stories[0]!.id).toBe("override-id");
  });

  it("uses object name field over humanized export", () => {
    const code = dedent`
      export default { title: 'foo' };
      export const HelloWorld = { name: 'Hello World!' };
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    expect(parsed.stories[0]!.name).toBe("Hello World!");
    expect(parsed.stories[0]!.id).toBe("foo--hello-world");
  });

  it("captures has* flags on the meta", () => {
    const code = dedent`
      export default {
        title: 'foo',
        render: (a) => a,
        play: async () => {},
        beforeEach: () => () => {},
      };
      export const A = {};
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    expect(parsed.meta.hasRender).toBe(true);
    expect(parsed.meta.hasPlay).toBe(true);
    expect(parsed.meta.hasBeforeEach).toBe(true);
  });

  it("captures has* flags on stories", () => {
    const code = dedent`
      export default { title: 'foo' };
      export const Plain = {};
      export const WithRender = { render: () => null };
      export const WithPlay = { play: async () => {} };
      export const WithBeforeEach = { beforeEach: () => () => {} };
    `;
    const parsed = parseCsf(code, { filename: "x.stories.tsx", makeTitle });
    const byName = Object.fromEntries(parsed.stories.map((s) => [s.exportName, s]));
    expect(byName["Plain"]!.hasRender).toBe(false);
    expect(byName["WithRender"]!.hasRender).toBe(true);
    expect(byName["WithPlay"]!.hasPlay).toBe(true);
    expect(byName["WithBeforeEach"]!.hasBeforeEach).toBe(true);
  });
});
