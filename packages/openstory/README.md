# Openstory

[![version](https://img.shields.io/npm/v/openstory?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/openstory)

Storybook for Agents.

Openstory is a drop-in replacement for Storybook. Your existing stories work as-is.

> Openstory is in alpha (`0.0.x`). Any patch may break the public API.

## Install

Install Openstory, Vite, and the Vite plugin for your framework:

```bash
# React
pnpm add -D openstory vite @vitejs/plugin-react

# Solid
pnpm add -D openstory vite vite-plugin-solid

# Vue
pnpm add -D openstory vite @vitejs/plugin-vue

# Svelte
pnpm add -D openstory vite @sveltejs/vite-plugin-svelte
```

Then start the dev server:

```bash
pnpm exec openstory dev
```

No `vite.config.ts` required — Openstory configures Vite in-memory and picks up `tsconfig.json` path aliases automatically. If you'd rather drive Vite yourself, drop the plugin into your own config:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openstory } from "openstory/plugin";

export default defineConfig({
  plugins: [react(), openstory({ framework: "react" })],
});
```

(Optional) Add a `preview.tsx` next to your stories for global decorators, parameters, or providers:

```tsx
import type { Preview } from "openstory/react";

const preview: Preview = {
  parameters: { layout: "padded" },
  decorators: [],
};

export default preview;
```

## How It Works

Openstory turns your existing CSF 3 story files into a browsable component lab served from a single Vite dev server:

1. Write standard CSF 3 stories (`*.stories.{ts,tsx,js,jsx}`).
2. Run `openstory dev`.
3. Browse stories at `http://localhost:6006`.

Stories use the same shape as Storybook. Swap imports, drop addons:

```tsx
import type { Meta, StoryObj } from "openstory/react";
import { expect, waitFor } from "openstory/test";

const meta: Meta = {
  title: "Forms/Button",
  component: Button,
  args: { label: "Click me", variant: "primary" },
};
export default meta;

export const Primary: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector("button")).toBeInTheDocument();
    });
  },
};
```

The shell UI is React + Tailwind + shadcn. Stories render in an iframe via a postMessage protocol for live args/globals updates and play-status reporting.

## Migrate from Storybook

Swap your story imports. `meta`, `decorators`, `parameters`, `globalTypes`, `initialGlobals`, and `play` functions keep the same shape:

```diff
- import type { Meta, StoryObj } from "@storybook/react";
- import { expect, waitFor } from "@storybook/test";
+ import type { Meta, StoryObj } from "openstory/react";
+ import { expect, waitFor } from "openstory/test";
```

`preview.tsx` keeps the same shape too. No addon dependencies. The shell ships built-in.

## CLI

```
openstory dev        start the dev server
openstory build      build a static deployable site
openstory preview    serve the built site
openstory generate   generate CSF 3 stories for components
openstory list       print manifest (--json for raw)
openstory inspect    print details for one story (--json for raw)
```

### Component-driven stories (no files on disk)

Pass `--components` to `dev` or `build` to synthesize a story for every component in the repo **on the fly**. Nothing is written to disk. The manifest, the iframe HTML, and the per-story virtual module are all generated in memory and stay in sync with your source as you edit.

```bash
pnpm exec openstory dev --components
pnpm exec openstory dev --components --components-include "src/ui/**/*.tsx"
pnpm exec openstory build --components --out dist
```

Flags (shared by `dev` and `build`):

```
--components                       enable component-driven story synthesis
--components-include <glob>        custom component glob (repeatable; defaults to framework)
--components-ignore <glob>         additional ignore glob (repeatable)
```

The same option is available programmatically — symmetric with `stories`:

```ts
import { openstory } from "openstory/plugin";

openstory({ stories: ["**/*.stories.tsx"] });
openstory({ components: true });
openstory({ components: { include: ["src/ui/**/*.tsx"], ignore: ["**/*-internal.tsx"] } });
```

Detection rules:

- React / Solid: any PascalCase named export, plus default exports, in `.tsx`/`.jsx` files.
- Vue: each `.vue` SFC, named from its filename.
- Svelte: each `.svelte` component, named from its filename.

Hand-written `*.stories.*` files always win over synthesized ones when their story ids collide.

See [`packages/openstory/src/types.ts`](https://github.com/millionco/openstory/blob/main/packages/openstory/src/types.ts) for the full `Meta`, `StoryObj`, `Preview`, `Decorator`, `PlayFunction`, and `OpenstoryRenderer` interfaces.

## Resources & Contributing Back

Looking to contribute back? Check out the [Contributing Guide](https://github.com/millionco/openstory/blob/main/CONTRIBUTING.md).

Find a bug? Head over to our [issue tracker](https://github.com/millionco/openstory/issues) and we'll do our best to help. We love pull requests, too!

[**Start contributing on GitHub**](https://github.com/millionco/openstory/blob/main/CONTRIBUTING.md)

### License

Openstory is MIT-licensed open-source software.
