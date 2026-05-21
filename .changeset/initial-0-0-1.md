---
"openbook": patch
---

Initial 0.0.1 alpha. A lightweight, Vite-native CSF 3 alternative to Storybook.

- `openbook/plugin` — Vite plugin: discovers `*.stories.{ts,tsx,js,jsx}`, serves `/__openbook/manifest.json` and `/__story/:id`, synthesizes per-story virtual entry modules.
- `openbook/react`, `openbook/solid`, `openbook/vue`, `openbook/svelte` — framework renderer adapters.
- `openbook/test` — full-parity test toolkit (`expect`, `waitFor`, `within`, `userEvent`, `vi`, jest-dom matchers, `step`).
- `openbook` CLI — `dev`, `build`, `preview`, `init`, `list`, `inspect`.
- Shell UI (React + Tailwind v4 + shadcn) served at `/`: story tree, top bar with globalTypes selectors, iframe canvas with status badge, controls panel, dark/light/system theme, keyboard nav.
- Static CSF parser (`oxc-parser`) drives the manifest; iframe boot imports the real module for rendering.
- postMessage protocol for live args/globals updates + play status reporting.
- Storybook-style HMR (Fast Refresh for components; full remount for story/preview file edits).
- Ported `ComponentDriven/csf` + Storybook `CsfFile` spec tests pass.
- Drop-in migration for CSF 3 codebases — swap imports, drop addon dependencies.
