# Ode

[![version](https://img.shields.io/npm/v/ode?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/ode)

A lightweight, Vite-native [CSF 3](https://storybook.js.org/docs/api/csf) alternative to Storybook. Drop-in compatible types, single Vite server, sub-second cold start, ~10 dependencies. Agent-first.

> Ode is in alpha (`0.0.x`). Any patch may break the public API.

## Quickstart

```bash
pnpm add -D ode
pnpm exec ode init
pnpm exec ode dev
```

`ode init` scaffolds `preview.tsx` and `vite.config.ts` for the framework detected in `package.json` (React or Solid).

## Migrate from Storybook

```diff
- import type { Meta, StoryObj } from "@storybook/react";
- import { expect, waitFor } from "@storybook/test";
+ import type { Meta, StoryObj } from "ode/react";
+ import { expect, waitFor } from "ode/test";
```

`preview.tsx` keeps the same shape (`decorators`, `parameters`, `globalTypes`, `initialGlobals`).

## Commands

```
ode dev        start the dev server
ode build      write a static deployable site to dist/
ode preview    serve the built site
ode init       scaffold preview + vite config
ode list       print manifest (--json for raw)
ode inspect    print details for one story (--json for raw)
```

## Status

This monorepo ships the `ode` package (lib + CLI + shell). v0.0.1 supports React and Solid via [CSF 3](https://storybook.js.org/blog/component-story-format-3-0).

## Development

```bash
pnpm install
pnpm build      # builds the shell + the lib
pnpm test       # unit + spec + integration
pnpm typecheck
```

## License

MIT
