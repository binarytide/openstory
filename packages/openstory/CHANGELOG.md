# openstory

## 0.0.6

### Patch Changes

- fix

## 0.0.5

### Patch Changes

- Fix `openstory build` not linking the CSS extracted from story dependencies. Vite was emitting `dist/assets/*.css` (e.g. the styles `import`ed from `preview.tsx`) but the per-story `index.html` only referenced `entry.js`, so the iframe loaded unstyled. The build now enables vite's `build.manifest`, walks each entry's import graph from the emitted manifest, and injects `<link rel="stylesheet">` tags for every transitively-imported CSS asset into the story HTML.

## 0.0.4

### Patch Changes

- `openstory build` now produces a deployable static site. It runs `vite.build()` with the openstory plugin programmatically, bundling each story's virtual entry into a real JS file at `dist/__story/<id>/entry.js`, copying the shell SPA to `dist/index.html` + `dist/assets/`, and writing the static manifest. Before this, the build only emitted HTML stubs that imported `virtual:openstory-story-entry?id=…`, which never resolved off the dev server, so `vercel deploy` produced a 404 at `/` and broken iframes.

  Also adds `--framework <react|solid|vue|svelte>` to `openstory dev` and `openstory build` for projects whose `package.json` lists more than one supported framework.

## 0.0.3

### Patch Changes

- Ship `dist/test.d.ts` for `openstory/test`. The DTS is hand-emitted because the auto-DTS bundler couldn't inline `@testing-library/jest-dom/vitest`'s module augmentation. Consumers no longer need `@ts-expect-error` when importing `expect`, `waitFor`, `userEvent`, `vi`, `step`, etc. jest-dom matchers attach to `expect` via the bundled triple-slash reference.

## 0.0.2

### Patch Changes

- 8a5e700: Initial 0.0.1 alpha. A lightweight, Vite-native CSF 3 alternative to Storybook.
  - `openstory/plugin`: Vite plugin that discovers `*.stories.{ts,tsx,js,jsx}`, serves `/__openstory/manifest.json` and `/__story/:id`, synthesizes per-story virtual entry modules.
  - `openstory/react`, `openstory/solid`, `openstory/vue`, `openstory/svelte`: framework renderer adapters.
  - `openstory/test`: full-parity test toolkit (`expect`, `waitFor`, `within`, `userEvent`, `vi`, jest-dom matchers, `step`).
  - `openstory` CLI: `dev`, `build`, `preview`, `init`, `list`, `inspect`.
  - Shell UI (React + Tailwind v4 + shadcn) served at `/`: story tree, top bar with globalTypes selectors, iframe canvas with status badge, controls panel, dark/light/system theme, keyboard nav.
  - Static CSF parser (`oxc-parser`) drives the manifest; iframe boot imports the real module for rendering.
  - postMessage protocol for live args/globals updates + play status reporting.
  - Storybook-style HMR (Fast Refresh for components; full remount for story/preview file edits).
  - Ported `ComponentDriven/csf` + Storybook `CsfFile` spec tests pass.
  - Drop-in migration for CSF 3 codebases. Swap imports, drop addon dependencies.
