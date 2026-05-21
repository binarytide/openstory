# Openbook

[![version](https://img.shields.io/npm/v/openbook?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/openbook)

Storybook for Agents.

Openbook is a drop-in replacement for Storybook. Your existing stories work as-is.

> Openbook is in alpha (`0.0.x`). Any patch may break the public API.

## Quick Start

Run this at your project root:

```bash
pnpm exec openbook init
```

`openbook init` scaffolds `preview` and `vite.config.ts` for the framework detected in your `package.json` (React, Solid, Vue, or Svelte). Then:

```bash
pnpm exec openbook dev
```

## How It Works

Openbook turns your existing CSF 3 story files into a browsable component lab served from a single Vite dev server:

1. Write standard CSF 3 stories (`*.stories.{ts,tsx,js,jsx}`).
2. Run `openbook dev`.
3. Browse stories at `http://localhost:6006`.

Stories use the same shape as Storybook. Swap imports, drop addons:

```tsx
import type { Meta, StoryObj } from "openbook/react";
import { expect, waitFor } from "openbook/test";

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

If you cannot use the CLI, configure Openbook manually for your framework:

#### React

Install:

```bash
pnpm add -D openbook @vitejs/plugin-react
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openbook } from "openbook/plugin";

export default defineConfig({
  plugins: [react(), openbook({ framework: "react" })],
});
```

#### Solid

Install:

```bash
pnpm add -D openbook vite-plugin-solid
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { openbook } from "openbook/plugin";

export default defineConfig({
  plugins: [solid(), openbook({ framework: "solid" })],
});
```

#### Vue

Install:

```bash
pnpm add -D openbook @vitejs/plugin-vue
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { openbook } from "openbook/plugin";

export default defineConfig({
  plugins: [vue(), openbook({ framework: "vue" })],
});
```

#### Svelte

Install:

```bash
pnpm add -D openbook @sveltejs/vite-plugin-svelte
```

Then add to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { openbook } from "openbook/plugin";

export default defineConfig({
  plugins: [svelte(), openbook({ framework: "svelte" })],
});
```

## Migrate from Storybook

Swap your story imports. `meta`, `decorators`, `parameters`, `globalTypes`, `initialGlobals`, and `play` functions keep the same shape:

```diff
- import type { Meta, StoryObj } from "@storybook/react";
- import { expect, waitFor } from "@storybook/test";
+ import type { Meta, StoryObj } from "openbook/react";
+ import { expect, waitFor } from "openbook/test";
```

`preview.tsx` keeps the same shape too. No addon dependencies. The shell ships built-in.

## CLI

```
openbook dev        start the dev server
openbook build      write a static deployable site to dist/
openbook preview    serve the built site
openbook init       scaffold preview + vite config (react|solid|vue|svelte)
openbook list       print manifest (--json for raw)
openbook inspect    print details for one story (--json for raw)
```

See [`packages/openbook/src/types.ts`](https://github.com/millionco/openstory/blob/main/packages/openbook/src/types.ts) for the full `Meta`, `StoryObj`, `Preview`, `Decorator`, `PlayFunction`, and `OpenbookRenderer` interfaces.

## Resources & Contributing Back

Looking to contribute back? Check out the [Contributing Guide](https://github.com/millionco/openstory/blob/main/CONTRIBUTING.md).

Find a bug? Head over to our [issue tracker](https://github.com/millionco/openstory/issues) and we'll do our best to help. We love pull requests, too!

[**Start contributing on GitHub**](https://github.com/millionco/openstory/blob/main/CONTRIBUTING.md)

### License

Openbook is MIT-licensed open-source software.
