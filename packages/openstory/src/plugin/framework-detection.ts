import { readFile } from "node:fs/promises";
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

export const detectFramework = async (projectRoot: string): Promise<Framework> => {
  const packageJson = await readPackageJson(projectRoot);

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
  if (candidates.length > 1) {
    throw new OpenstoryConfigAmbiguousFrameworkError(candidates);
  }
  return candidates[0]!;
};
