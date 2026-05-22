import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OpenstoryConfigAmbiguousFrameworkError,
  OpenstoryConfigMissingFrameworkError,
} from "../errors.js";
import type { Framework } from "../types.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const readPackageJson = async (projectRoot: string): Promise<PackageJsonShape> => {
  try {
    const text = await readFile(join(projectRoot, "package.json"), "utf8");
    return JSON.parse(text) as PackageJsonShape;
  } catch {
    return {};
  }
};

const readPackageJsonSync = (projectRoot: string): PackageJsonShape => {
  try {
    return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as PackageJsonShape;
  } catch {
    return {};
  }
};

const pickFramework = (packageJson: PackageJsonShape): Framework | undefined => {
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };
  const candidates: Framework[] = [];
  if ("react" in allDependencies) candidates.push("react");
  if ("solid-js" in allDependencies) candidates.push("solid");
  if ("vue" in allDependencies) candidates.push("vue");
  if ("svelte" in allDependencies) candidates.push("svelte");
  if (candidates.length === 1) return candidates[0];
  return undefined;
};

export const detectFramework = async (projectRoot: string): Promise<Framework> => {
  const packageJson = await readPackageJson(projectRoot);
  const picked = pickFramework(packageJson);
  if (picked) return picked;
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };
  const candidates: Framework[] = [];
  if ("react" in allDependencies) candidates.push("react");
  if ("solid-js" in allDependencies) candidates.push("solid");
  if ("vue" in allDependencies) candidates.push("vue");
  if ("svelte" in allDependencies) candidates.push("svelte");
  if (candidates.length === 0) {
    throw new OpenstoryConfigMissingFrameworkError(Object.keys(allDependencies));
  }
  throw new OpenstoryConfigAmbiguousFrameworkError(candidates);
};

export const detectFrameworkSyncOrFallback = (
  projectRoot: string,
  fallback: Framework,
): Framework => pickFramework(readPackageJsonSync(projectRoot)) ?? fallback;
