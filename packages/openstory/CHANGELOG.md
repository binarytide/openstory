# openstory

## 0.0.11

### Patch Changes

- `openstory setup`: package-manager detection now walks up from the project directory to the workspace root, so monorepo packages (where the `pnpm-lock.yaml` / `bun.lockb` / `yarn.lock` lives at the workspace root, not in the subpackage) get the correct package manager. Previously a pnpm workspace's `apps/web` subpackage would fall through to `npm` and trigger `npm install` — which often re-runs install across the whole workspace and trips on unrelated `prepare`/`postinstall` hooks (e.g. `husky: command not found`). Pnpm projects now correctly use `pnpm add -D`, yarn uses `yarn add -D`, bun uses `bun add -d`.

## 0.0.10

### Patch Changes

- fix

## 0.0.9

### Patch Changes

- `openstory setup`: detect already-resolvable peer deps (transitively installed via `node_modules`) using `require.resolve`, not just `package.json`. Previously a project that had `vite` or `@vitejs/plugin-react` available transitively (common in monorepos) would still be told to install them, and `npm install --save-dev vite @vitejs/plugin-react` would `ERESOLVE`-fail because of conflicting peer ranges already pinned elsewhere in the tree.

- `openstory setup`: when the install step fails, warn with the exact command and continue scaffolding files + generating stories instead of bailing. Lets the user resolve the install separately without re-running setup.

## 0.0.8

### Patch Changes

- fix

## 0.0.7

### Patch Changes

- Add `openstory generate` command. Walks oxc-parsed TSX with full type resolution (cross-file imports, tsconfig `paths` aliases with `extends` chains, interface heritage, intersections, discriminated unions of object types, `Partial`/`Required`/`Readonly`/`Pick`/`Omit`, `React.FC<P>`, `forwardRef<_, P>`, cva `VariantProps<typeof X>` including cross-file and indexed access, TS enums, JSDoc descriptions and `@default`). Falls back to synthesizing prop schemas from destructure patterns when the surrounding type is opaque (e.g. Radix `ComponentProps<typeof Primitive>`). Emits CSF 3 source with Default plus one story per enum option (capped at 12), and adds `Loading`/`Disabled`/`WithError`/`Open`/`Pressed`/`Selected` stories when matching boolean props are present. Required `array` and `object` props default to `[]` / `{}` respectively so generated stories don't crash on `undefined.map()`.

- Fix `openstory dev` rendering "Functions are not valid as a React child" / "Objects are not valid as a React child (found: object with keys {$$typeof, render})" for stories that rely on the default render fallback (i.e. `export const Default: Story = {};`). `OpenstoryRenderer` gains an optional `defaultRender(component)` hook that the boot uses when neither story nor meta defines a `render`; the React adapter implements it to return `(args) => createElement(component, args)`. This also fixes the same error path inside decorators that inline `{storyFn()}` (e.g. `QueryClientProvider`, `TooltipProvider`), since the inner render now produces a real element instead of leaking a bare component reference.

- Generator: date-named props (`date`, `createdAt`, `updatedAt`, `timestamp`, etc.) with opaque types now default to an ISO 8601 string so `new Date(value)` works. Fixes "Invalid time value" crashes in `date-fns`-style consumers.

- Generator: classify generic `Array<T>`, `ReadonlyArray<T>`, `Iterable<T>`, `ArrayLike<T>`, `Set<T>`, `ReadonlySet<T>` as `kind: "array"` and `Record<K,V>`, `Map<K,V>`, `ReadonlyMap<K,V>`, `WeakMap<K,V>`, `WeakSet<K,V>` as `kind: "object"`. Fixes "X is not iterable" / "Cannot read properties of undefined (reading 'map')" crashes on components that destructure or iterate these collection-typed props.

- Generator: `const Alias = Namespace.Member` (shadcn-style `const Dialog = DialogPrimitive.Root`) is now recognized as a valid component during primary-component selection. Previously the orchestrator skipped the alias and picked a compound subpart (e.g. `DialogPortal`, `MenuItem`, `SelectContent`, `PopoverPortal`), which crashes standalone with "X must be used within Y". The root alias is the right primary for an `openstory generate`-produced default story.

- Generator: ref-typed props (`RefObject<T>`, `MutableRefObject<T>`, etc., or any name ending in `Ref` for required props) are now filled with `{ current: null }` so consumer code reading `ref.current` doesn't throw "Cannot read properties of undefined".

- React adapter wraps every story render in a `StoryErrorBoundary`. When a story throws during render, the iframe stays alive and shows a friendly red error panel with message + stack trace instead of going blank or breaking subsequent navigation. Resets when the story or args change.

- `document.title` now reflects the consumer's project (read from `manifest.projectName`). The shell page shows `"<project name>"` and per-story iframe pages show `"<story id> · <project name>"`. Both `openstory dev` and `openstory build` honor this.

- Story module imports inside the virtual story entry are now dynamic (`import()` wrapped in `try/catch`) so module-evaluation-time errors (e.g. `t3-env`'s "Attempted to access a server-side environment variable on the client" at top-level import time) surface in the iframe via the existing `surfaceFatalMessage` path instead of escaping as an uncaught `ReferenceError`. Pairs with the React render-time error boundary so both classes of failure show the user a clean diagnostic panel.

- Add `openstory setup` — single command that detects framework / Next / React Query / Radix Tooltip / shadcn sidebar / globals.css / tsconfig path aliases / package manager, installs missing peer deps (`vite`, framework plugin), scaffolds a project-aware `vite.config.ts` + `preview.tsx` (path aliases, React dedupe, `next/navigation` mock, `process.env` polyfill, `require` polyfill, provider decorators, globals.css import — whatever's relevant), and runs `openstory generate`. Zero-to-stories in one step. Existing `openstory init` is unchanged for users who only want the bare scaffold.

- Fix JSONC parser in `loadTsconfigPaths`: the previous regex-based comment stripper would eat content between `/*` inside `"@/*"` string keys and `*/` inside `"**/*.ts"` string values in tsconfig `paths` and `include` arrays, silently dropping all path-alias detection on real-world tsconfigs. Replaced with a string-aware scanner.

- Fix `PLUGIN_ERROR: Missing field 'moduleType'` on Vite 8 / Rolldown. The plugin's `load` hook returned a bare string for the virtual story entry — Rolldown's stricter plugin API requires returning `{ code, moduleType }` when the load result is an object. Now returns `{ code, moduleType: "js" }`. Rollup-based Vite (≤7) ignores the extra field.

- Read `OPENSTORY_VERSION` from `package.json` at runtime so the CLI's `--version` flag and manifest output stay in sync with the published package.

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
