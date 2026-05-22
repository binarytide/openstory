import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractPropsFromComponent } from "../../src/utils/extract-props.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openstory-extract-props-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const writeFixture = async (relativePath: string, contents: string): Promise<string> => {
  const absolutePath = join(projectRoot, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
  return absolutePath;
};

describe("extractPropsFromComponent - primitives and optionality", () => {
  it("extracts string, number, boolean, and function props from an inline type", async () => {
    const source = `
      export const Widget = (props: { label: string; count: number; active: boolean; onClick: () => void }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props).toEqual([
      { name: "label", optional: false, kind: "string" },
      { name: "count", optional: false, kind: "number" },
      { name: "active", optional: false, kind: "boolean" },
      { name: "onClick", optional: false, kind: "function" },
    ]);
  });

  it("treats `?` and `| undefined` as optional", async () => {
    const source = `
      interface Props { a?: string; b: string | undefined; c: string }
      export const Widget = (props: Props) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "a")?.optional).toBe(true);
    expect(result.props.find((prop) => prop.name === "b")?.optional).toBe(true);
    expect(result.props.find((prop) => prop.name === "c")?.optional).toBe(false);
  });
});

describe("extractPropsFromComponent - enums", () => {
  it("classifies string-literal unions as enums with options", async () => {
    const source = `
      export const Widget = (props: { variant: "primary" | "ghost" | "danger" }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toEqual({
      name: "variant",
      optional: false,
      kind: "enum",
      options: ["primary", "ghost", "danger"],
    });
  });

  it("classifies numeric-literal unions as enums", async () => {
    const source = `
      export const Widget = (props: { n: 1 | 2 | 3 }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({ kind: "enum", options: [1, 2, 3] });
  });

  it("resolves TS enum references to options with autoincrement", async () => {
    const source = `
      enum Size { Small, Medium, Large }
      enum Color { Red = "red", Blue = "blue" }
      export const Widget = (props: { size: Size; color: Color }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "size")).toMatchObject({
      kind: "enum",
      options: [0, 1, 2],
    });
    expect(result.props.find((prop) => prop.name === "color")).toMatchObject({
      kind: "enum",
      options: ["red", "blue"],
    });
  });

  it("treats `true | false` as boolean", async () => {
    const source = `
      export const Widget = (props: { flag: true | false }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({ kind: "boolean" });
  });

  it("classifies primitive unions like `number | string` using the most permissive kind", async () => {
    const source = `
      export const Widget = (props: { size: number | string; weight: number | string }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "size")?.kind).toBe("string");
    expect(result.props.find((prop) => prop.name === "weight")?.kind).toBe("string");
  });

  it("prefers the literal enum when literals coexist with a primitive in a union", async () => {
    const source = `
      export const Widget = (props: { size?: "sm" | "default" | "lg" | number }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({
      kind: "enum",
      options: ["sm", "default", "lg"],
    });
  });

  it("falls back to the destructure default's primitive type when the type itself is opaque", async () => {
    const source = `
      type Opaque = ImportedThing;
      interface Props { tally?: Opaque }
      export const Widget = ({ tally = 14 }: Props) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    const tally = result.props.find((prop) => prop.name === "tally");
    expect(tally?.kind).toBe("number");
    expect(tally?.defaultValue).toBe(14);
  });
});

describe("extractPropsFromComponent - node-like and event handler heuristics", () => {
  it("classifies React.ReactNode as node", async () => {
    const source = `
      export const Widget = (props: { content: React.ReactNode }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]?.kind).toBe("node");
  });

  it("classifies `children` named props as node even when the type is opaque", async () => {
    const source = `
      export const Widget = (props: { children: UnknownThing }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]?.kind).toBe("node");
  });

  it("classifies onSomething props as functions even with opaque types", async () => {
    const source = `
      export const Widget = (props: { onChange: ChangeHandler }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]?.kind).toBe("function");
  });
});

describe("extractPropsFromComponent - utility types and intersections", () => {
  it("applies Partial<>, Required<>, Readonly<> to optionality", async () => {
    const source = `
      interface Base { a: string; b?: number }
      export const Soft = (props: Partial<Base>) => null;
      export const Hard = (props: Required<Base>) => null;
      export const Frozen = (props: Readonly<Base>) => null;
    `;
    const componentPath = await writeFixture("variants.tsx", source);
    const soft = await extractPropsFromComponent(source, componentPath, "Soft");
    const hard = await extractPropsFromComponent(source, componentPath, "Hard");
    const frozen = await extractPropsFromComponent(source, componentPath, "Frozen");
    expect(soft.props.every((prop) => prop.optional)).toBe(true);
    expect(hard.props.every((prop) => !prop.optional)).toBe(true);
    expect(frozen.props.find((prop) => prop.name === "b")?.optional).toBe(true);
  });

  it("applies Pick<> and Omit<> with string-literal keys", async () => {
    const source = `
      interface Base { a: string; b: number; c: boolean }
      export const Slim = (props: Pick<Base, "a" | "b">) => null;
      export const Without = (props: Omit<Base, "c">) => null;
    `;
    const componentPath = await writeFixture("pick.tsx", source);
    const slim = await extractPropsFromComponent(source, componentPath, "Slim");
    const without = await extractPropsFromComponent(source, componentPath, "Without");
    expect(slim.props.map((prop) => prop.name)).toEqual(["a", "b"]);
    expect(without.props.map((prop) => prop.name)).toEqual(["a", "b"]);
  });

  it("merges intersection types and lets the later branch override", async () => {
    const source = `
      interface A { x: string; y: number }
      interface B { y: string; z: boolean }
      export const Widget = (props: A & B) => null;
    `;
    const componentPath = await writeFixture("intersect.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    const yProp = result.props.find((prop) => prop.name === "y");
    expect(yProp?.kind).toBe("string");
    expect(result.props.map((prop) => prop.name).sort()).toEqual(["x", "y", "z"]);
  });

  it("merges members across a discriminated union of object types, marking branch-only props optional", async () => {
    const source = `
      interface ButtonProps { variant: "primary" | "ghost"; href?: undefined }
      interface ButtonLinkProps { variant: "primary" | "ghost"; href: string; target?: string }
      export const Button = (props: ButtonProps | ButtonLinkProps) => null;
    `;
    const componentPath = await writeFixture("union.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Button");
    const variant = result.props.find((prop) => prop.name === "variant");
    const href = result.props.find((prop) => prop.name === "href");
    const target = result.props.find((prop) => prop.name === "target");
    expect(variant?.optional).toBe(false);
    expect(href?.kind).toBe("string");
    expect(href?.optional).toBe(true);
    expect(target?.optional).toBe(true);
  });

  it("drops members whose entire type is `undefined` or `null`", async () => {
    const source = `
      interface Props { stripMe: undefined; alsoStrip: null; keepMe: string }
      export const Widget = (props: Props) => null;
    `;
    const componentPath = await writeFixture("strip.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.map((prop) => prop.name)).toEqual(["keepMe"]);
  });

  it("merges interface extends and drops DOM-attribute heritage", async () => {
    const source = `
      interface Base { id: string }
      export interface WidgetProps extends Base, React.ButtonHTMLAttributes<HTMLButtonElement> {
        variant: "primary" | "ghost";
      }
      export const Widget = (props: WidgetProps) => null;
    `;
    const componentPath = await writeFixture("extends.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    const names = result.props.map((prop) => prop.name).sort();
    expect(names).toEqual(["id", "variant"]);
  });
});

describe("extractPropsFromComponent - component shapes", () => {
  it("resolves React.FC<P> generic argument as the props type", async () => {
    const source = `
      interface Props { label: string }
      export const Widget: React.FC<Props> = (props) => null;
    `;
    const componentPath = await writeFixture("fc.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props).toEqual([{ name: "label", optional: false, kind: "string" }]);
  });

  it("resolves forwardRef<Ref, Props> generic argument as the props type", async () => {
    const source = `
      import { forwardRef } from "react";
      interface Props { label: string }
      export const Widget = forwardRef<HTMLButtonElement, Props>((props, ref) => null);
    `;
    const componentPath = await writeFixture("forward.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props).toEqual([{ name: "label", optional: false, kind: "string" }]);
  });

  it('resolves indexed access VariantProps<typeof cvaCall>["key"] to enum options', async () => {
    const source = `
      import { cva, type VariantProps } from "class-variance-authority";
      const widgetVariants = cva("base", {
        variants: {
          variant: { primary: "p", ghost: "g" },
          size: { sm: "s", md: "m", lg: "l" },
        },
        defaultVariants: { variant: "primary", size: "md" },
      });
      interface WidgetProps {
        variant?: VariantProps<typeof widgetVariants>["variant"];
        size?: VariantProps<typeof widgetVariants>["size"];
      }
      export const Widget = (props: WidgetProps) => null;
    `;
    const componentPath = await writeFixture("indexed-cva.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "variant")).toMatchObject({
      kind: "enum",
      options: ["primary", "ghost"],
      defaultValue: "primary",
    });
    expect(result.props.find((prop) => prop.name === "size")).toMatchObject({
      kind: "enum",
      options: ["sm", "md", "lg"],
      defaultValue: "md",
    });
  });

  it("resolves VariantProps<typeof cvaCall> via the cva call definition", async () => {
    const source = `
      import { cva } from "class-variance-authority";
      import type { VariantProps } from "class-variance-authority";

      const widgetVariants = cva("base", {
        variants: {
          variant: { primary: "p", ghost: "g", danger: "d" },
          size: { sm: "s", md: "m" },
        },
        defaultVariants: { variant: "primary" },
      });

      export interface WidgetProps extends VariantProps<typeof widgetVariants> {
        label: string;
      }
      export const Widget = (props: WidgetProps) => null;
    `;
    const componentPath = await writeFixture("cva.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    const variant = result.props.find((prop) => prop.name === "variant");
    const size = result.props.find((prop) => prop.name === "size");
    const label = result.props.find((prop) => prop.name === "label");
    expect(variant).toMatchObject({
      kind: "enum",
      options: ["primary", "ghost", "danger"],
      defaultValue: "primary",
    });
    expect(size).toMatchObject({ kind: "enum", options: ["sm", "md"] });
    expect(label).toMatchObject({ kind: "string" });
  });
});

describe("extractPropsFromComponent - defaults and JSDoc", () => {
  it("captures destructure defaults from the function parameter", async () => {
    const source = `
      interface Props { variant?: "primary" | "ghost"; count?: number }
      export const Widget = ({ variant = "primary", count = 7 }: Props) => null;
    `;
    const componentPath = await writeFixture("defaults.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "variant")?.defaultValue).toBe("primary");
    expect(result.props.find((prop) => prop.name === "count")?.defaultValue).toBe(7);
  });

  it("captures JSDoc descriptions and @default values", async () => {
    const source = `
      interface Props {
        /** Visible label */
        label: string;
        /** Variant of the button. @default 'primary' */
        variant: "primary" | "ghost";
      }
      export const Widget = (props: Props) => null;
    `;
    const componentPath = await writeFixture("jsdoc.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "label")?.description).toBe("Visible label");
    const variant = result.props.find((prop) => prop.name === "variant");
    expect(variant?.description).toContain("Variant of the button");
    expect(variant?.defaultValue).toBe("primary");
  });

  it("destructure default beats JSDoc @default", async () => {
    const source = `
      interface Props {
        /** @default 'primary' */
        variant: "primary" | "ghost";
      }
      export const Widget = ({ variant = "ghost" }: Props) => null;
    `;
    const componentPath = await writeFixture("priority.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "variant")?.defaultValue).toBe("ghost");
  });
});

describe("extractPropsFromComponent - tsconfig path aliases", () => {
  it("resolves `@/...` imports via the nearest tsconfig's paths mapping", async () => {
    await writeFixture(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    await writeFixture("src/lib/types.ts", `export type Tone = "info" | "warning" | "danger";`);
    const source = `
      import type { Tone } from "@/lib/types";
      export const Widget = (props: { tone: Tone }) => null;
    `;
    const componentPath = await writeFixture("src/components/widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({
      kind: "enum",
      options: ["info", "warning", "danger"],
    });
  });

  it("falls back to /index.ts when the alias target is a directory", async () => {
    await writeFixture(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    await writeFixture("src/types/index.ts", `export type Mood = "happy" | "sad";`);
    const source = `
      import type { Mood } from "@/types";
      export const Widget = (props: { mood: Mood }) => null;
    `;
    const componentPath = await writeFixture("src/components/widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({
      kind: "enum",
      options: ["happy", "sad"],
    });
  });

  it("follows tsconfig `extends` chains to inherit paths", async () => {
    await writeFixture(
      "tsconfig.base.json",
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    await writeFixture("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json" }));
    await writeFixture("src/lib/types.ts", `export type Side = "left" | "right";`);
    const source = `
      import type { Side } from "@/lib/types";
      export const Widget = (props: { side: Side }) => null;
    `;
    const componentPath = await writeFixture("src/components/widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({ kind: "enum", options: ["left", "right"] });
  });
});

describe("extractPropsFromComponent - destructure-only synthesis", () => {
  it("synthesizes props from destructure defaults when the type itself is unresolvable", async () => {
    const source = `
      import * as React from "react";
      export function Separator({ orientation = "horizontal", decorative = true, ...rest }: React.ComponentProps<"div">) {
        return null;
      }
    `;
    const componentPath = await writeFixture("sep.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Separator");
    const orientation = result.props.find((prop) => prop.name === "orientation");
    const decorative = result.props.find((prop) => prop.name === "decorative");
    expect(orientation).toMatchObject({ kind: "string", defaultValue: "horizontal" });
    expect(decorative).toMatchObject({ kind: "boolean", defaultValue: true });
  });

  it("does not duplicate destructured props that are already in the resolved type", async () => {
    const source = `
      interface Props { variant: "primary" | "ghost" }
      export const Widget = ({ variant = "primary" }: Props) => null;
    `;
    const componentPath = await writeFixture("nodup.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props).toHaveLength(1);
    expect(result.props[0]).toMatchObject({
      name: "variant",
      kind: "enum",
      defaultValue: "primary",
    });
  });
});

describe("extractPropsFromComponent - cross-file VariantProps cva", () => {
  it("resolves VariantProps<typeof importedVariants>['key'] across files", async () => {
    await writeFixture(
      "src/ui/button.tsx",
      `import { cva } from "class-variance-authority";
       export const buttonVariants = cva("base", {
         variants: { variant: { primary: "p", ghost: "g" } },
         defaultVariants: { variant: "primary" },
       });`,
    );
    const source = `
      import type { VariantProps } from "class-variance-authority";
      import { buttonVariants } from "./ui/button";
      interface Props { variant?: VariantProps<typeof buttonVariants>["variant"] }
      export const SubmitButton = (props: Props) => null;
    `;
    const componentPath = await writeFixture("src/submit.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "SubmitButton");
    expect(result.props[0]).toMatchObject({
      kind: "enum",
      options: ["primary", "ghost"],
      defaultValue: "primary",
    });
  });
});

describe("extractPropsFromComponent - ref-typed and children fallbacks", () => {
  it("classifies `RefObject<T>` typed props as function (so they are filtered from args)", async () => {
    const source = `
      import type { RefObject } from "react";
      export const Widget = (props: { containerRef: RefObject<HTMLDivElement | null> }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]?.kind).toBe("function");
  });

  it("classifies Array<T>/Set<T>/Iterable<T> generic references as array kind", async () => {
    const source = `
      export const Widget = (props: { rows: Array<string>; tags: ReadonlyArray<number>; bucket: Set<string> }) => null;
    `;
    const componentPath = await writeFixture("collections.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "rows")?.kind).toBe("array");
    expect(result.props.find((prop) => prop.name === "tags")?.kind).toBe("array");
    expect(result.props.find((prop) => prop.name === "bucket")?.kind).toBe("array");
  });

  it("classifies Record<K,V>/Map<K,V> generic references as object kind", async () => {
    const source = `
      export const Widget = (props: { meta: Record<string, unknown>; lookup: Map<string, number> }) => null;
    `;
    const componentPath = await writeFixture("maps.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.find((prop) => prop.name === "meta")?.kind).toBe("object");
    expect(result.props.find((prop) => prop.name === "lookup")?.kind).toBe("object");
  });

  it("recognises `const Alias = Namespace.Member` as a valid component without props", async () => {
    const source = `
      import * as DialogPrimitive from "@radix-ui/react-dialog";
      const Dialog = DialogPrimitive.Root;
      export { Dialog };
    `;
    const componentPath = await writeFixture("dialog-alias.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Dialog");
    expect(result.resolvedAsFunction).toBe(true);
    expect(result.props).toEqual([]);
  });

  it("classifies date-named props with opaque types as string with an ISO placeholder default", async () => {
    const source = `
      type SomeDateAlias = ImportedDate;
      export const Widget = (props: { createdAt: SomeDateAlias; date: SomeDateAlias }) => null;
    `;
    const componentPath = await writeFixture("dates.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    const createdAt = result.props.find((prop) => prop.name === "createdAt");
    const date = result.props.find((prop) => prop.name === "date");
    expect(createdAt?.kind).toBe("string");
    expect(createdAt?.defaultValue).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(date?.kind).toBe("string");
    expect(date?.defaultValue).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("uses node-name hints as the ultimate fallback for opaque types", async () => {
    const source = `
      export const Widget = (props: { children: SomeOpaqueAlias }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]?.kind).toBe("node");
  });
});

describe("extractPropsFromComponent - cross-file resolution", () => {
  it("follows relative type imports to resolve the props type", async () => {
    await writeFixture(
      "types.ts",
      `export interface ExternalProps { label: string; variant: "a" | "b" }`,
    );
    const source = `
      import type { ExternalProps } from "./types";
      export const Widget = (props: ExternalProps) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props.map((prop) => prop.name).sort()).toEqual(["label", "variant"]);
    expect(result.props.find((prop) => prop.name === "variant")?.options).toEqual(["a", "b"]);
  });

  it("follows re-export chains for type aliases", async () => {
    await writeFixture("base.ts", `export type Mood = "happy" | "sad"`);
    await writeFixture("middle.ts", `export { type Mood as Vibe } from "./base"`);
    const source = `
      import type { Vibe } from "./middle";
      export const Widget = (props: { vibe: Vibe }) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props[0]).toMatchObject({
      kind: "enum",
      options: ["happy", "sad"],
    });
  });
});

describe("extractPropsFromComponent - resilience", () => {
  it("returns an empty list for components without a type annotation", async () => {
    const source = `export const Widget = (props) => null;`;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.props).toEqual([]);
    expect(result.resolvedAsFunction).toBe(true);
  });

  it("returns resolvedAsFunction false for namespace-object bindings", async () => {
    const source = `
      const WidgetRoot = (props: { label: string }) => null;
      export const Widget = { Root: WidgetRoot };
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.resolvedAsFunction).toBe(false);
    expect(result.props).toEqual([]);
  });

  it("returns an empty list when the named component is not declared", async () => {
    const source = `export const Other = (props: { a: string }) => null;`;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Missing");
    expect(result.props).toEqual([]);
    expect(result.resolvedAsFunction).toBe(false);
  });

  it("strips noisy wrapper typeNames like Partial / Pick", async () => {
    const source = `
      interface Base { a: string }
      export const Widget = (props: Partial<Base>) => null;
    `;
    const componentPath = await writeFixture("widget.tsx", source);
    const result = await extractPropsFromComponent(source, componentPath, "Widget");
    expect(result.typeName).toBeUndefined();
  });
});
