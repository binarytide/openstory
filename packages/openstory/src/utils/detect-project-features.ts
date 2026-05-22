import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

const detectPackageManager = async (
  projectRoot: string,
  packageJson: PackageJsonShape,
): Promise<DetectedPackageManager> => {
  const declared = typeof packageJson.packageManager === "string" ? packageJson.packageManager : "";
  if (declared.startsWith("pnpm")) return "pnpm";
  if (declared.startsWith("yarn")) return "yarn";
  if (declared.startsWith("npm")) return "npm";
  if (declared.startsWith("bun")) return "bun";
  if (await fileExists(join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(join(projectRoot, "bun.lockb"))) return "bun";
  if (await fileExists(join(projectRoot, "yarn.lock"))) return "yarn";
  return "npm";
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

  return {
    framework,
    packageManager,
    isNext: "next" in allDependencies,
    hasReactQuery: "@tanstack/react-query" in allDependencies,
    hasRadixTooltip: "@radix-ui/react-tooltip" in allDependencies,
    hasShadcnSidebar,
    globalsCssRelativePath,
    pathAliases,
    needsViteInstall: !("vite" in allDependencies),
    needsReactPluginInstall: framework === "react" && !("@vitejs/plugin-react" in allDependencies),
  };
};
