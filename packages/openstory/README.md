# Openstory

[![version](https://img.shields.io/npm/v/openstory?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/openstory)

Storybook for Agents.

Openstory is a drop-in replacement for Storybook. Your existing stories work as-is.

> Openstory is in alpha (`0.0.x`). Any patch may break the public API.

## Quick Start

Run this at your project root:

```bash
pnpm exec openstory init
```

`openstory init` scaffolds `preview` and `vite.config.ts` for the framework detected in your `package.json` (React, Solid, Vue, or Svelte). Then:

```bash
pnpm exec openstory dev
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

## Manual Installation

If you cannot use the CLI, configure Openstory manually for your framework:

#### React

Install:

```bash
pnpm add -D openstory @vitejs/plugin-react
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openstory } from "openstory/plugin";

export default defineConfig({
  plugins: [react(), openstory({ framework: "react" })],
});
```

#### Solid

Install:

```bash
pnpm add -D openstory vite-plugin-solid
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { openstory } from "openstory/plugin";

export default defineConfig({
  plugins: [solid(), openstory({ framework: "solid" })],
});
```

#### Vue

Install:

```bash
pnpm add -D openstory @vitejs/plugin-vue
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { openstory } from "openstory/plugin";

export default defineConfig({
  plugins: [vue(), openstory({ framework: "vue" })],
});
```

#### Svelte

Install:

```bash
pnpm add -D openstory @sveltejs/vite-plugin-svelte
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { openstory } from "openstory/plugin";

export default defineConfig({
  plugins: [svelte(), openstory({ framework: "svelte" })],
});
```

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
openstory build      write a static deployable site to dist/
openstory preview    serve the built site
openstory init       scaffold preview + vite config (react|solid|vue|svelte)
openstory auto       scan repo for components and scaffold stories for them
openstory list       print manifest (--json for raw)
openstory inspect    print details for one story (--json for raw)
```

### `openstory auto`

`auto` resolves every component in your repository (not just files that already have stories) and generates a CSF 3 stories file for each one. Use this to bootstrap a "book" from an existing component library.

```bash
pnpm exec openstory auto                     # detect framework + scan default globs
pnpm exec openstory auto "src/**/*.tsx"      # restrict to a custom glob
pnpm exec openstory auto "src/ui/*.tsx" "src/forms/*.tsx" --dry-run
pnpm exec openstory auto --out stories --force
```

By default, `auto` writes the generated `*.stories.{tsx,ts}` files alongside each detected component. Existing stories files are preserved unless you pass `--force`. Detection rules:

- React / Solid: any PascalCase named export, plus default exports, in `.tsx`/`.jsx` files.
- Vue: each `.vue` SFC, named from its filename.
- Svelte: each `.svelte` component, named from its filename.

Flags:

```
--framework <name>   react|solid|vue|svelte (auto-detected by default)
--out <dir>          write all stories to <dir> instead of next to each component
--ignore <glob>      additional ignore glob (repeatable)
--force              overwrite existing stories files
--dry-run            print the plan without writing files
--json               machine-readable summary
```

See [`packages/openstory/src/types.ts`](https://github.com/millionco/openstory/blob/main/packages/openstory/src/types.ts) for the full `Meta`, `StoryObj`, `Preview`, `Decorator`, `PlayFunction`, and `OpenstoryRenderer` interfaces.

## Resources & Contributing Back

Looking to contribute back? Check out the [Contributing Guide](https://github.com/millionco/openstory/blob/main/CONTRIBUTING.md).

Find a bug? Head over to our [issue tracker](https://github.com/millionco/openstory/issues) and we'll do our best to help. We love pull requests, too!

[**Start contributing on GitHub**](https://github.com/millionco/openstory/blob/main/CONTRIBUTING.md)

### License

Openstory is MIT-licensed open-source software.
