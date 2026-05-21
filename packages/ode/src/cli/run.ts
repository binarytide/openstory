import mri from "mri";
import { DEFAULT_DEV_PORT, ODE_VERSION } from "../constants.js";
import {
  OdeCliMissingArgError,
  OdeCliUnknownCommandError,
  OdeError,
} from "../errors.js";
import type { Framework } from "../types.js";
import { runBuild } from "./build.js";
import { runDev } from "./dev.js";
import { runInit } from "./init.js";
import { runInspect } from "./inspect.js";
import { runList } from "./list.js";
import { runPreview } from "./preview.js";

const KNOWN_COMMANDS = ["dev", "build", "preview", "init", "list", "inspect"] as const;
type Command = (typeof KNOWN_COMMANDS)[number];

const isKnownCommand = (value: string): value is Command =>
  (KNOWN_COMMANDS as readonly string[]).includes(value);

const HELP_TEXT = [
  "ode — lightweight, Vite-native CSF 3 component lab",
  "",
  "Usage:",
  "  ode <command> [options]",
  "",
  "Commands:",
  "  dev        start the dev server",
  "  build      build a static deployable site",
  "  preview    serve the built site",
  "  init       scaffold preview + vite config in this project",
  "  list       print manifest (--json for raw)",
  "  inspect    print details for one story (--json for raw)",
  "",
  "Flags:",
  "  --version  print version",
  "  --help     show this message",
  "",
].join("\n");

const parseFramework = (value: unknown): Framework | undefined => {
  if (value === "react" || value === "solid") return value;
  return undefined;
};

export const run = async (argv: string[]): Promise<void> => {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`ode ${ODE_VERSION}\n`);
    return;
  }

  const projectRoot = process.cwd();
  const parsedArgs = mri(rest, { boolean: ["json", "force", "open"] });

  try {
    if (!isKnownCommand(command)) {
      throw new OdeCliUnknownCommandError(command, [...KNOWN_COMMANDS]);
    }

    switch (command) {
      case "dev": {
        const port = Number(parsedArgs["port"] ?? DEFAULT_DEV_PORT);
        const host = String(parsedArgs["host"] ?? "localhost");
        const open = Boolean(parsedArgs["open"]);
        await runDev({ port, host, open });
        return;
      }
      case "build": {
        await runBuild(projectRoot, {
          outDir: String(parsedArgs["out"] ?? "dist"),
          base: String(parsedArgs["base"] ?? "/"),
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
      case "list": {
        await runList(projectRoot, {
          json: Boolean(parsedArgs["json"]),
          filter:
            typeof parsedArgs["filter"] === "string" ? parsedArgs["filter"] : undefined,
        });
        return;
      }
      case "inspect": {
        const storyId = parsedArgs._[0];
        if (typeof storyId !== "string" || storyId === "") {
          throw new OdeCliMissingArgError("inspect", "id");
        }
        await runInspect(projectRoot, storyId, { json: Boolean(parsedArgs["json"]) });
        return;
      }
    }
  } catch (cause) {
    if (cause instanceof OdeError) {
      process.stderr.write(`${cause.toString()}\n`);
      process.exit(cause.exitCode);
    }
    throw cause;
  }
};
