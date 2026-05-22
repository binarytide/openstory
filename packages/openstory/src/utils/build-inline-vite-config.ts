import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import type { InlineConfig, PluginOption } from "vite";
import { detectFramework } from "../plugin/framework-detection.js";
import { openstory, type OpenstoryComponentsOption } from "../plugin/index.js";
import type { Framework } from "../types.js";
import { loadTsconfigPaths, type PathMapping } from "./resolve-tsconfig-paths.js";

export interface BuildInlineViteConfigOptions {
  projectRoot: string;
  framework?: Framework;
  components?: boolean | OpenstoryComponentsOption;
}

export interface BuildInlineViteConfigResult {
  config: InlineConfig;
  framework: Framework;
}

const FRAMEWORK_PLUGIN_PACKAGES: Record<Framework, string> = {
  react: "@vitejs/plugin-react",
  solid: "vite-plugin-solid",
  vue: "@vitejs/plugin-vue",
  svelte: "@sveltejs/vite-plugin-svelte",
};

const requireFromProject = (projectRoot: string, packageName: string): unknown => {
  const projectRequire = createRequire(join(projectRoot, "__openstory_inline_anchor__.js"));
  const resolvedPath = projectRequire.resolve(packageName);
  return projectRequire(resolvedPath);
};

const buildFrameworkPlugin = (projectRoot: string, framework: Framework): PluginOption => {
  const packageName = FRAMEWORK_PLUGIN_PACKAGES[framework];
  let frameworkPluginModule: unknown;
  try {
    frameworkPluginModule = requireFromProject(projectRoot, packageName);
  } catch {
    throw new Error(
      `openstory: missing peer dependency \`${packageName}\` for framework "${framework}". ` +
        `install it: \`pnpm add -D ${packageName}\``,
    );
  }
  const moduleNamespace = frameworkPluginModule as { default?: unknown };
  const pluginFactory =
    typeof moduleNamespace.default === "function" ? moduleNamespace.default : frameworkPluginModule;
  if (typeof pluginFactory !== "function") {
    throw new Error(`openstory: \`${packageName}\` did not export a callable plugin factory.`);
  }
  return (pluginFactory as () => PluginOption)();
};

const buildAliasEntries = (
  projectRoot: string,
  pathAliases: PathMapping[],
): Record<string, string> => {
  const aliasEntries: Record<string, string> = {};
  for (const mapping of pathAliases) {
    const target = mapping.targets[0];
    if (!target) continue;
    const aliasKey = mapping.isWildcard ? mapping.prefix.replace(/\/$/, "") : mapping.prefix;
    const aliasTarget = mapping.isWildcard ? target.replace(/\/\*$/, "") : target;
    const absoluteTarget = isAbsolute(aliasTarget)
      ? aliasTarget
      : resolve(projectRoot, aliasTarget);
    aliasEntries[aliasKey] = absoluteTarget;
  }
  return aliasEntries;
};

export const buildInlineViteConfig = async (
  options: BuildInlineViteConfigOptions,
): Promise<BuildInlineViteConfigResult> => {
  const projectRoot = isAbsolute(options.projectRoot)
    ? options.projectRoot
    : resolve(options.projectRoot);

  const framework = options.framework ?? (await detectFramework(projectRoot));
  const tsconfigPaths = await loadTsconfigPaths(projectRoot, new Map());
  const aliasEntries = buildAliasEntries(projectRoot, tsconfigPaths?.mappings ?? []);
  const frameworkPlugin = buildFrameworkPlugin(projectRoot, framework);

  const config: InlineConfig = {
    root: projectRoot,
    resolve: { alias: aliasEntries },
    plugins: [frameworkPlugin, openstory({ framework, components: options.components })],
  };

  return { config, framework };
};
