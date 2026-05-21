import mri from "mri";
import { DEFAULT_DEV_PORT, OPENSTORY_VERSION } from "../constants.js";
import {
  OpenstoryCliMissingArgError,
  OpenstoryCliUnknownCommandError,
  OpenstoryError,
} from "../errors.js";
import type { OpenstoryAutoOption } from "../plugin/index.js";
import type { Framework } from "../types.js";
import { runAuto } from "./auto.js";
import { runBuild } from "./build.js";
import { runDev } from "./dev.js";
import { runInit } from "./init.js";
import { runInspect } from "./inspect.js";
import { runList } from "./list.js";
import { runPreview } from "./preview.js";

const KNOWN_COMMANDS = ["dev", "build", "preview", "init", "auto", "list", "inspect"] as const;
type Command = (typeof KNOWN_COMMANDS)[number];

const isKnownCommand = (value: string): value is Command =>
  (KNOWN_COMMANDS as readonly string[]).includes(value);

const HELP_TEXT = [
  "openstory: drop-in Storybook replacement for agents",
  "",
  "Usage:",
  "  openstory <command> [options]",
  "",
  "Commands:",
  "  dev        start the dev server (--auto to synthesize stories from components)",
  "  build      build a static deployable site (--auto to include synthesized stories)",
  "  preview    serve the built site",
  "  init       scaffold preview + vite config (react|solid|vue|svelte)",
  "  auto       scan repo for components and write stories files to disk",
  "  list       print manifest (--json for raw)",
  "  inspect    print details for one story (--json for raw)",
  "",
  "Flags:",
  "  --version  print version",
  "  --help     show this message",
  "",
  "Examples:",
  "  openstory dev --auto                    # ephemeral stories for every component",
  '  openstory dev --auto --auto-components "src/ui/**/*.tsx"',
  "  openstory build --auto --out dist",
  '  openstory auto "src/**/*.tsx"           # materialize stories files on disk',
  "",
].join("\n");

const parseFramework = (value: unknown): Framework | undefined => {
  if (value === "react" || value === "solid" || value === "vue" || value === "svelte") {
    return value;
  }
  return undefined;
};

const collectStringFlag = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
};

const parseAutoFlag = (
  parsedArgs: Record<string, unknown>,
): boolean | OpenstoryAutoOption | undefined => {
  const autoFlag = Boolean(parsedArgs["auto"]);
  const componentGlobs = collectStringFlag(parsedArgs["auto-components"]);
  const ignoreGlobs = collectStringFlag(parsedArgs["auto-ignore"]);
  if (!autoFlag && componentGlobs.length === 0 && ignoreGlobs.length === 0) {
    return undefined;
  }
  if (componentGlobs.length === 0 && ignoreGlobs.length === 0) return true;
  const option: OpenstoryAutoOption = {};
  if (componentGlobs.length > 0) option.components = componentGlobs;
  if (ignoreGlobs.length > 0) option.ignore = ignoreGlobs;
  return option;
};

export const run = async (argv: string[]): Promise<void> => {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`openstory ${OPENSTORY_VERSION}\n`);
    return;
  }

  const projectRoot = process.cwd();
  const parsedArgs = mri(rest, {
    boolean: ["json", "force", "open", "dry-run", "auto"],
  });

  try {
    if (!isKnownCommand(command)) {
      throw new OpenstoryCliUnknownCommandError(command, [...KNOWN_COMMANDS]);
    }

    switch (command) {
      case "dev": {
        const port = Number(parsedArgs["port"] ?? DEFAULT_DEV_PORT);
        const host = String(parsedArgs["host"] ?? "localhost");
        const open = Boolean(parsedArgs["open"]);
        await runDev({
          port,
          host,
          open,
          framework: parseFramework(parsedArgs["framework"]),
          auto: parseAutoFlag(parsedArgs),
        });
        return;
      }
      case "build": {
        await runBuild(projectRoot, {
          outDir: String(parsedArgs["out"] ?? "dist"),
          base: String(parsedArgs["base"] ?? "/"),
          framework: parseFramework(parsedArgs["framework"]),
          auto: parseAutoFlag(parsedArgs),
        });
        return;
      }
      case "preview": {
        const port = Number(parsedArgs["port"] ?? DEFAULT_DEV_PORT);
        const outDir = String(parsedArgs["out"] ?? "dist");
        await runPreview(projectRoot, { port, outDir });
        return;
      }
      case "init": {
        const framework = parseFramework(parsedArgs["framework"]);
        const force = Boolean(parsedArgs["force"]);
        await runInit(projectRoot, { framework, force });
        return;
      }
      case "auto": {
        const positionalGlobs = parsedArgs._.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        );
        const ignoreFlag = parsedArgs["ignore"];
        const ignoreGlobs = Array.isArray(ignoreFlag)
          ? ignoreFlag.filter((value): value is string => typeof value === "string")
          : typeof ignoreFlag === "string"
            ? [ignoreFlag]
            : [];
        const outDir =
          typeof parsedArgs["out"] === "string" && parsedArgs["out"].length > 0
            ? parsedArgs["out"]
            : undefined;
        await runAuto(projectRoot, {
          globs: positionalGlobs,
          framework: parseFramework(parsedArgs["framework"]),
          outDir,
          force: Boolean(parsedArgs["force"]),
          dryRun: Boolean(parsedArgs["dry-run"]),
          json: Boolean(parsedArgs["json"]),
          ignore: ignoreGlobs,
        });
        return;
      }
      case "list": {
        await runList(projectRoot, {
          json: Boolean(parsedArgs["json"]),
          filter: typeof parsedArgs["filter"] === "string" ? parsedArgs["filter"] : undefined,
        });
        return;
      }
      case "inspect": {
        const storyId = parsedArgs._[0];
        if (typeof storyId !== "string" || storyId === "") {
          throw new OpenstoryCliMissingArgError("inspect", "id");
        }
        await runInspect(projectRoot, storyId, { json: Boolean(parsedArgs["json"]) });
        return;
      }
    }
  } catch (cause) {
    if (cause instanceof OpenstoryError) {
      process.stderr.write(`${cause.toString()}\n`);
      process.exit(cause.exitCode);
    }
    throw cause;
  }
};
