# openstory

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
