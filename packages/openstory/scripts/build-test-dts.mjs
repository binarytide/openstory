#!/usr/bin/env node
// Emits dist/test.d.ts by hand. The auto-DTS bundler chokes on jest-dom's
// `vitest.d.ts`, which imports `TestingLibraryMatchers` from `./matchers`
// without that file re-exporting the symbol. Re-declaring the same exports
// here and triple-slash-referencing jest-dom/vitest gives consumers full type
// coverage for `expect` (with jest-dom matchers), `waitFor`, `userEvent`, etc.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "dist", "test.d.ts");

const contents = `/// <reference types="@testing-library/jest-dom" />
export { expect, vi } from "vitest";
export {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/dom";
export { userEvent } from "@testing-library/user-event";

export declare const step: (name: string, body: () => void | Promise<void>) => Promise<void>;
`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, contents, "utf8");
process.stdout.write(`wrote ${outPath}\n`);
