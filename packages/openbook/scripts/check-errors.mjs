#!/usr/bin/env node
// Quality bar: every throw in packages/openbook/src/ (excluding errors.ts) must use a typed OpenbookError class.
// This script greps for `throw new Error(` and similar generic throws.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const srcRoot = join(here, "..", "src");
const EXEMPT_FILES = new Set(["errors.ts"]);
const EXEMPT_DIRS = new Set(["shell"]);

/** @type {string[]} */
const violations = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXEMPT_DIRS.has(entry.name)) continue;
      await walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const rel = relative(srcRoot, full);
    if (EXEMPT_FILES.has(rel)) continue;
    const source = await readFile(full, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, i) => {
      // Ban: throw new Error(...), throw new TypeError(...), throw new RangeError(...), throw "literal", throw `tpl`
      if (
        /throw\s+new\s+(Error|TypeError|RangeError|SyntaxError|EvalError|URIError|ReferenceError)\b/.test(
          line,
        )
      ) {
        violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
      if (/throw\s+["'`]/.test(line)) {
        violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

await walk(srcRoot);

if (violations.length > 0) {
  console.error("Found throws that don't use a typed OpenbookError class:\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nAll thrown errors in src/ must be instances of a class declared in src/errors.ts.",
  );
  process.exit(1);
}

console.log("All throws in src/ use typed OpenbookError classes.");
