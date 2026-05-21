# Openbook

[![version](https://img.shields.io/npm/v/openbook?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/openbook)

A lightweight, Vite-native [CSF 3](https://storybook.js.org/docs/api/csf) alternative to Storybook. Drop-in compatible types, single Vite server, sub-second cold start, ~10 dependencies. Agent-first.

> Openbook is in alpha (`0.0.x`). Any patch may break the public API.

## Quickstart

```bash
pnpm add -D openbook
pnpm exec openbook init
pnpm exec openbook dev
```

`openbook init` scaffolds `preview` + `vite.config.ts` for the framework detected in `package.json` (React, Solid, Vue, or Svelte).

## Migrate from Storybook

```diff
- import type { Meta, StoryObj } from "@storybook/react";
- import { expect, waitFor } from "@storybook/test";
+ import type { Meta, StoryObj } from "openbook/react";
+ import { expect, waitFor } from "openbook/test";
```

`preview.tsx` keeps the same shape (`decorators`, `parameters`, `globalTypes`, `initialGlobals`).

## Commands

```
openbook dev        start the dev server
openbook build      write a static deployable site to dist/
openbook preview    serve the built site
openbook init       scaffold preview + vite config
openbook list       print manifest (--json for raw)
openbook inspect    print details for one story (--json for raw)
```

## Status

This monorepo ships the `openbook` package (lib + CLI + shell). v0.0.1 supports React, Solid, Vue, and Svelte via [CSF 3](https://storybook.js.org/blog/component-story-format-3-0).

## Development

```bash
pnpm install
pnpm build      # builds the shell + the lib
pnpm test       # unit + spec + integration
pnpm typecheck
```

## License

MIT
