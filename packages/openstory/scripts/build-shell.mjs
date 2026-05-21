#!/usr/bin/env node
// Builds the embedded shell SPA at src/shell into dist/shell.
// Uses Vite's programmatic build API because the pnpm-workspace override
// maps `vite` → `@voidzero-dev/vite-plus-core` (no bin), so `vite build` from
// the shell would never resolve a CLI. The library export resolves to the
// same code the CLI would have run.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const configFile = resolve(here, "..", "src", "shell", "vite.config.ts");

await build({ configFile });
