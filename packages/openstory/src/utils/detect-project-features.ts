import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { detectFramework } from "../plugin/framework-detection.js";
import type { Framework } from "../types.js";
import { fileExists } from "./file-exists.js";
import { loadTsconfigPaths, type PathMapping } from "./resolve-tsconfig-paths.js";

export type DetectedPackageManager = "pnpm" | "yarn" | "npm" | "bun";

export interface DetectedProviderHint {
  name: string;
  importStatement: string;
  wrapStart: string;
  wrapEnd: string;
}

export interface DetectedProjectFeatures {
  framework: Framework;
  packageManager: DetectedPackageManager;
  isNext: boolean;
  hasReactQuery: boolean;
  hasRadixTooltip: boolean;
  hasShadcnSidebar: boolean;
  globalsCssRelativePath: string | undefined;
  pathAliases: PathMapping[];
  needsViteInstall: boolean;
  needsReactPluginInstall: boolean;
}

interface PackageJsonShape {
  packageManager?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const COMMON_GLOBALS_CSS_PATHS = [
  "app/globals.css",
  "src/app/globals.css",
  "src/styles/globals.css",
  "styles/globals.css",
  "src/index.css",
  "src/main.css",
];

const COMMON_SHADCN_SIDEBAR_PATHS = ["components/ui/sidebar.tsx", "src/components/ui/sidebar.tsx"];

const fromDeclaredField = (rawValue: unknown): DetectedPackageManager | undefined => {
  if (typeof rawValue !== "string") return undefined;
  if (rawValue.startsWith("pnpm")) return "pnpm";
  if (rawValue.startsWith("yarn")) return "yarn";
  if (rawValue.startsWith("npm")) return "npm";
  if (rawValue.startsWith("bun")) return "bun";
  return undefined;
};

const fromLockfileAtDirectory = async (
  directory: string,
): Promise<DetectedPackageManager | undefined> => {
  if (await fileExists(join(directory, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(join(directory, "bun.lockb"))) return "bun";
  if (await fileExists(join(directory, "yarn.lock"))) return "yarn";
  if (await fileExists(join(directory, "package-lock.json"))) return "npm";
  return undefined;
};

const detectPackageManager = async (
  projectRoot: string,
  packageJson: PackageJsonShape,
): Promise<DetectedPackageManager> => {
  const declared = fromDeclaredField(packageJson.packageManager);
  if (declared) return declared;

  let cursor = projectRoot;
  for (;;) {
    const fromLockfile = await fromLockfileAtDirectory(cursor);
    if (fromLockfile) return fromLockfile;
    try {
      const parentPackageJsonRaw = await readFile(join(cursor, "package.json"), "utf8");
      const parentDeclared = fromDeclaredField(
        (JSON.parse(parentPackageJsonRaw) as PackageJsonShape).packageManager,
      );
      if (parentDeclared) return parentDeclared;
    } catch {
      // package.json missing — keep walking up
    }
    const parent = dirname(cursor);
    if (parent === cursor) return "npm";
    cursor = parent;
  }
};

const readPackageJson = async (projectRoot: string): Promise<PackageJsonShape> => {
  try {
    const text = await readFile(join(projectRoot, "package.json"), "utf8");
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const findGlobalsCss = async (projectRoot: string): Promise<string | undefined> => {
  for (const relativePath of COMMON_GLOBALS_CSS_PATHS) {
    if (await fileExists(join(projectRoot, relativePath))) return relativePath;
  }
  return undefined;
};

const findShadcnSidebar = async (projectRoot: string): Promise<boolean> => {
  for (const relativePath of COMMON_SHADCN_SIDEBAR_PATHS) {
    if (await fileExists(join(projectRoot, relativePath))) return true;
  }
  return false;
};

const isPackageResolvable = (packageName: string, fromDirectory: string): boolean => {
  try {
    const resolveFrom = createRequire(join(fromDirectory, "__openstory_resolve_anchor__.js"));
    resolveFrom.resolve(packageName);
    return true;
  } catch {
    return false;
  }
};

export const detectProjectFeatures = async (
  projectRoot: string,
  frameworkOverride?: Framework,
): Promise<DetectedProjectFeatures> => {
  const framework = frameworkOverride ?? (await detectFramework(projectRoot));
  const packageJson = await readPackageJson(projectRoot);
  const allDependencies: Record<string, string> = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };
  const packageManager = await detectPackageManager(projectRoot, packageJson);
  const tsconfigPaths = await loadTsconfigPaths(projectRoot, new Map());
  const pathAliases = tsconfigPaths?.mappings ?? [];
  const globalsCssRelativePath = await findGlobalsCss(projectRoot);
  const hasShadcnSidebar = await findShadcnSidebar(projectRoot);

  const reactPluginName = framework === "react" ? "@vitejs/plugin-react" : undefined;
  return {
    framework,
    packageManager,
    isNext: "next" in allDependencies,
    hasReactQuery: "@tanstack/react-query" in allDependencies,
    hasRadixTooltip: "@radix-ui/react-tooltip" in allDependencies,
    hasShadcnSidebar,
    globalsCssRelativePath,
    pathAliases,
    needsViteInstall: !("vite" in allDependencies) && !isPackageResolvable("vite", projectRoot),
    needsReactPluginInstall: reactPluginName
      ? !(reactPluginName in allDependencies) && !isPackageResolvable(reactPluginName, projectRoot)
      : false,
  };
};
