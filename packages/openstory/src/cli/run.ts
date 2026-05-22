import { Command } from "commander";
import { DEFAULT_DEV_PORT, OPENSTORY_VERSION } from "../constants.js";
import { OpenstoryError } from "../errors.js";
import type { OpenstoryComponentsOption } from "../plugin/index.js";
import type { Framework } from "../types.js";
import { runBuild } from "./build.js";
import { runDev } from "./dev.js";
import { runInit } from "./init.js";
import { runInspect } from "./inspect.js";
import { runList } from "./list.js";
import { runPreview } from "./preview.js";

const parseFramework = (value: unknown): Framework | undefined => {
  if (value === "react" || value === "solid" || value === "vue" || value === "svelte") {
    return value;
  }
  return undefined;
};

const collectRepeatable = (value: string, previous: string[]): string[] => [...previous, value];

interface ComponentsCliOptions {
  components?: boolean;
  componentsInclude: string[];
  componentsIgnore: string[];
}

const buildComponentsOption = (
  options: ComponentsCliOptions,
): boolean | OpenstoryComponentsOption | undefined => {
  const componentsFlag = Boolean(options.components);
  const includeGlobs = options.componentsInclude;
  const ignoreGlobs = options.componentsIgnore;
  if (!componentsFlag && includeGlobs.length === 0 && ignoreGlobs.length === 0) {
    return undefined;
  }
  if (includeGlobs.length === 0 && ignoreGlobs.length === 0) return true;
  const componentsOption: OpenstoryComponentsOption = {};
  if (includeGlobs.length > 0) componentsOption.include = includeGlobs;
  if (ignoreGlobs.length > 0) componentsOption.ignore = ignoreGlobs;
  return componentsOption;
};

interface DevCliOptions extends ComponentsCliOptions {
  port: string;
  host: string;
  open: boolean;
  framework?: string;
}

interface BuildCliOptions extends ComponentsCliOptions {
  out: string;
  base: string;
  framework?: string;
}

interface PreviewCliOptions {
  port: string;
  out: string;
}

interface InitCliOptions {
  framework?: string;
  force: boolean;
}

interface ListCliOptions {
  json: boolean;
  filter?: string;
}

interface InspectCliOptions {
  json: boolean;
}

const buildProgram = (projectRoot: string): Command => {
  const program = new Command()
    .name("openstory")
    .description("openstory: drop-in Storybook replacement for agents")
    .version(OPENSTORY_VERSION, "-v, --version", "print version")
    .helpOption("-h, --help", "show this message")
    .showHelpAfterError();

  program
    .command("dev")
    .description("start the dev server")
    .option("--port <port>", "dev server port", String(DEFAULT_DEV_PORT))
    .option("--host <host>", "dev server host", "localhost")
    .option("--open", "open the browser on start", false)
    .option("--framework <framework>", "react|solid|vue|svelte (auto-detected by default)")
    .option("--components", "synthesize stories from components on the fly", false)
    .option(
      "--components-include <glob>",
      "component glob (repeatable; defaults to framework)",
      collectRepeatable,
      [],
    )
    .option(
      "--components-ignore <glob>",
      "additional ignore glob (repeatable)",
      collectRepeatable,
      [],
    )
    .action(async (options: DevCliOptions) => {
      await runDev({
        port: Number(options.port),
        host: options.host,
        open: options.open,
        framework: parseFramework(options.framework),
        components: buildComponentsOption(options),
      });
    });

  program
    .command("build")
    .description("build a static deployable site")
    .option("--out <dir>", "output directory", "dist")
    .option("--base <base>", "public base path", "/")
    .option("--framework <framework>", "react|solid|vue|svelte (auto-detected by default)")
    .option("--components", "synthesize stories from components on the fly", false)
    .option(
      "--components-include <glob>",
      "component glob (repeatable; defaults to framework)",
      collectRepeatable,
      [],
    )
    .option(
      "--components-ignore <glob>",
      "additional ignore glob (repeatable)",
      collectRepeatable,
      [],
    )
    .action(async (options: BuildCliOptions) => {
      await runBuild(projectRoot, {
        outDir: options.out,
        base: options.base,
        framework: parseFramework(options.framework),
        components: buildComponentsOption(options),
      });
    });

  program
    .command("preview")
    .description("serve the built site")
    .option("--port <port>", "preview server port", String(DEFAULT_DEV_PORT))
    .option("--out <dir>", "directory to serve", "dist")
    .action(async (options: PreviewCliOptions) => {
      await runPreview(projectRoot, {
        port: Number(options.port),
        outDir: options.out,
      });
    });

  program
    .command("init")
    .description("scaffold preview + vite config (react|solid|vue|svelte)")
    .option("--framework <framework>", "react|solid|vue|svelte (auto-detected by default)")
    .option("--force", "overwrite existing files", false)
    .action(async (options: InitCliOptions) => {
      await runInit(projectRoot, {
        framework: parseFramework(options.framework),
        force: options.force,
      });
    });

  program
    .command("list")
    .description("print manifest")
    .option("--json", "machine-readable output", false)
    .option("--filter <substring>", "filter by id or title substring")
    .action(async (options: ListCliOptions) => {
      await runList(projectRoot, {
        json: options.json,
        filter: options.filter,
      });
    });

  program
    .command("inspect")
    .description("print details for one story")
    .argument("<id>", "story id")
    .option("--json", "machine-readable output", false)
    .action(async (storyId: string, options: InspectCliOptions) => {
      await runInspect(projectRoot, storyId, { json: options.json });
    });

  return program;
};

export const run = async (argv: string[]): Promise<void> => {
  const program = buildProgram(process.cwd());
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (cause) {
    if (cause instanceof OpenstoryError) {
      process.stderr.write(`${cause.toString()}\n`);
      process.exit(cause.exitCode);
    }
    throw cause;
  }
};
