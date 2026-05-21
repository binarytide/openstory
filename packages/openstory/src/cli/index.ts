#!/usr/bin/env node
import { run } from "./run.js";

run(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
