// Adapted from storybookjs/storybook (MIT). See ATTRIBUTION.md.
// Source: code/core/src/csf-tools/CsfFile.test.ts
// Adapted to Openstory's flatter parser output shape.

import { describe, expect, it } from "vitest";
import { dedent } from "ts-dedent";
import { parseCsf, type ParsedCsf } from "../../../src/csf/parser.js";

const makeTitle = (userTitle?: string): string => userTitle ?? "Default Title";

function parse(code: string): ParsedCsf {
  return parseCsf(code, { filename: "stub.stories.tsx", makeTitle });
}

describe("CsfFile (subset, adapted to Openstory parser shape)", () => {
  describe("basic", () => {
    it("filters out non-story exports", () => {
      const code = dedent`
        export default { title: 'foo/bar', excludeStories: ['invalidStory'] };
        export const invalidStory = {};
        export const validStory = {};
      `;
      const parsed = parse(code);
      expect(parsed.stories.map((s) => s.exportName)).toEqual(["validStory"]);
    });

    it("excludes by name", () => {
      const code = dedent`
        export default { title: 'foo/bar', excludeStories: ['B', 'C'] };
        export const A = () => {};
        export const B = (args) => {};
        export const C = () => {};
      `;
      expect(parse(code).stories.map((s) => s.exportName)).toEqual(["A"]);
    });

    it("includes by name", () => {
      const code = dedent`
        export default { title: 'foo/bar', includeStories: ['IncludeA'] };
        export const SomeHelper = () => {};
        export const IncludeA = () => {};
      `;
      expect(parse(code).stories.map((s) => s.exportName)).toEqual(["IncludeA"]);
    });

    it("derives id from title + story name", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const Primary = {};
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("foo/bar");
      expect(parsed.stories[0]!.id).toBe("foo-bar--primary");
      expect(parsed.stories[0]!.name).toBe("Primary");
    });

    it("uses makeTitle fallback when no title", () => {
      const code = dedent`
        export default { component: 'foo' };
        export const A = () => {};
        export const B = () => {};
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("Default Title");
      expect(parsed.stories.map((s) => s.id)).toEqual(["default-title--a", "default-title--b"]);
    });

    it("supports custom meta id", () => {
      const code = dedent`
        export default { title: 'foo/bar', id: 'custom-id' };
        export const A = () => {};
      `;
      const parsed = parse(code);
      expect(parsed.meta.id).toBe("custom-id");
      expect(parsed.stories[0]!.id.startsWith("custom-id--")).toBe(true);
    });

    it("supports custom parameters.__id override per story", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const A = { parameters: { __id: 'custom-id' } };
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.id).toBe("custom-id");
    });

    it("supports object exports with name", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const A = { name: 'Apple' };
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.name).toBe("Apple");
      expect(parsed.stories[0]!.id).toBe("foo-bar--apple");
    });

    it("supports TS as-cast on meta", () => {
      const code = dedent`
        import type { Meta, StoryFn } from '@storybook/react';
        export default { title: 'foo/bar/baz' } as Meta;
        export const A: StoryFn = () => null;
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("foo/bar/baz");
      expect(parsed.stories[0]!.id).toBe("foo-bar-baz--a");
    });

    it("supports TS satisfies on meta", () => {
      const code = dedent`
        import type { Meta, StoryObj } from '@storybook/react';
        export default { title: 'foo/bar' } satisfies Meta;
        export const A = { name: 'AA' } satisfies StoryObj;
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("foo/bar");
      expect(parsed.stories[0]!.name).toBe("AA");
    });

    it("supports TS satisfies + as on meta", () => {
      const code = dedent`
        import type { Meta } from '@storybook/react';
        export default { title: 'foo/bar' } satisfies Meta as Meta;
        export const A = {};
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("foo/bar");
    });

    it("resolves meta from a variable binding", () => {
      const code = dedent`
        const meta = { title: 'foo/bar/baz' };
        export default meta;
        export const A = () => null;
        export const B = () => null;
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("foo/bar/baz");
      expect(parsed.stories.map((s) => s.exportName)).toEqual(["A", "B"]);
    });

    it("resolves meta from `export { x as default }` specifier", () => {
      const code = dedent`
        const meta = { title: 'foo/bar' };
        const story = { name: 'Story A' };
        export { meta as default, story as A };
      `;
      const parsed = parse(code);
      expect(parsed.meta.title).toBe("foo/bar");
      expect(parsed.stories[0]!.name).toBe("Story A");
      expect(parsed.stories[0]!.exportName).toBe("A");
    });

    it("treats function declaration exports as render-style stories", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export function A() {}
        export function B() {}
      `;
      const parsed = parse(code);
      expect(parsed.stories.map((s) => s.exportName)).toEqual(["A", "B"]);
      expect(parsed.stories.every((s) => s.hasRender)).toBe(true);
    });

    it("treats Template.bind({}) as render-style stories", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        const Template = (args) => {};
        export const A = Template.bind({});
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.exportName).toBe("A");
      expect(parsed.stories[0]!.hasRender).toBe(true);
    });
  });

  describe("error handling", () => {
    it("missing default export", () => {
      expect(() =>
        parse(dedent`
          export const A = () => {};
        `),
      ).toThrow(/default export/);
    });

    it("rejects bad meta (non-object)", () => {
      expect(() =>
        parse(dedent`
          const foo = bar();
          export default foo;
          export const A = () => {};
        `),
      ).toThrow(/object literal/);
    });

    it("rejects dynamic title expressions", () => {
      expect(() =>
        parse(dedent`
          export default { title: 'foo' + 'bar' };
          export const A = () => {};
        `),
      ).toThrow(/title.*string literal/);
    });

    it("rejects storiesOf usage", () => {
      expect(() =>
        parse(dedent`
          import { storiesOf } from '@storybook/react';
          export default { title: 'foo/bar' };
          storiesOf('foo').add('bar', () => null);
        `),
      ).toThrow(/storiesOf.*not supported/);
    });
  });

  describe("CSF3 surface", () => {
    it("object export with render fn", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const A = { render: () => null };
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.hasRender).toBe(true);
      expect(parsed.stories[0]!.hasPlay).toBe(false);
    });

    it("object export with play fn", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const A = { play: async () => {} };
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.hasPlay).toBe(true);
    });

    it("object export with beforeEach", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const A = { beforeEach: () => {} };
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.hasBeforeEach).toBe(true);
    });

    it("object export with default render (no render fn)", () => {
      const code = dedent`
        export default { title: 'foo/bar' };
        export const A = {};
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.hasRender).toBe(false);
    });
  });

  describe("imports", () => {
    it("tracks bare imports", () => {
      const code = dedent`
        import Button from './Button';
        import { Check } from './Check';
        export default { title: 'foo/bar' };
        export const A = {};
      `;
      const parsed = parse(code);
      expect(parsed.imports).toEqual(["./Button", "./Check"]);
    });
  });

  describe("tags", () => {
    it("combines meta + story tags (CSF 3)", () => {
      const code = dedent`
        export default { title: 'foo/bar', tags: ['X'] };
        export const A = { tags: ['Y'] };
      `;
      const parsed = parse(code);
      expect(parsed.meta.tags).toEqual(["X"]);
      expect(parsed.stories[0]!.tags).toEqual(["X", "Y"]);
    });

    it("rejects non-array tags", () => {
      expect(() =>
        parse(dedent`
          export default { title: 'foo/bar', tags: 'X' };
          export const A = {};
        `),
      ).toThrow(/tags array/);
    });

    it("rejects non-string tag elements", () => {
      expect(() =>
        parse(dedent`
          export default { title: 'foo/bar', tags: [10] };
          export const A = {};
        `),
      ).toThrow(/tag to be string/);
    });
  });

  describe("args / argTypes / parameters merge", () => {
    it("story args override meta args", () => {
      const code = dedent`
        export default { title: 'foo/bar', args: { a: 1, b: 2 } };
        export const Primary = { args: { b: 3 } };
      `;
      const parsed = parse(code);
      expect(parsed.stories[0]!.args).toEqual({ a: 1, b: 3 });
    });
  });
});
