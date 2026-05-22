import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { TSCONFIG_MAX_EXTENDS_HOPS } from "../constants.js";
import { fileExists } from "./file-exists.js";

export interface PathMapping {
  prefix: string;
  isWildcard: boolean;
  targets: string[];
}

export interface TsconfigPaths {
  baseDirectory: string;
  mappings: PathMapping[];
}

const stripJsonComments = (source: string): string => {
  const output: string[] = [];
  const length = source.length;
  let cursor = 0;
  while (cursor < length) {
    const character = source[cursor]!;
    if (character === '"') {
      output.push(character);
      cursor += 1;
      while (cursor < length && source[cursor] !== '"') {
        if (source[cursor] === "\\" && cursor + 1 < length) {
          output.push(source[cursor]!, source[cursor + 1]!);
          cursor += 2;
        } else {
          output.push(source[cursor]!);
          cursor += 1;
        }
      }
      if (cursor < length) {
        output.push(source[cursor]!);
        cursor += 1;
      }
      continue;
    }
    if (character === "/" && source[cursor + 1] === "/") {
      cursor += 2;
      while (cursor < length && source[cursor] !== "\n") cursor += 1;
      continue;
    }
    if (character === "/" && source[cursor + 1] === "*") {
      cursor += 2;
      while (cursor < length && !(source[cursor] === "*" && source[cursor + 1] === "/")) {
        cursor += 1;
      }
      if (cursor < length) cursor += 2;
      continue;
    }
    output.push(character);
    cursor += 1;
  }
  return output.join("");
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsoncObject = (source: string): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(stripJsonComments(source));
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const findNearestTsconfig = async (startDirectory: string): Promise<string | undefined> => {
  let currentDirectory = startDirectory;
  for (;;) {
    const candidate = `${currentDirectory}/tsconfig.json`;
    if (await fileExists(candidate)) return candidate;
    const parent = dirname(currentDirectory);
    if (parent === currentDirectory) return undefined;
    currentDirectory = parent;
  }
};

const buildMappings = (compilerOptions: Record<string, unknown>): PathMapping[] => {
  const paths = compilerOptions.paths;
  if (!isPlainObject(paths)) return [];
  const mappings: PathMapping[] = [];
  for (const [pattern, rawTargets] of Object.entries(paths)) {
    if (!Array.isArray(rawTargets)) continue;
    const targets = rawTargets.filter((target): target is string => typeof target === "string");
    if (targets.length === 0) continue;
    const isWildcard = pattern.endsWith("/*");
    const prefix = isWildcard ? pattern.slice(0, -1) : pattern;
    mappings.push({ prefix, isWildcard, targets });
  }
  return mappings;
};

const resolveExtendsTargetPath = (
  fromTsconfigPath: string,
  extendsValue: string,
): string | undefined => {
  if (extendsValue.startsWith(".") || isAbsolute(extendsValue)) {
    const baseDirectory = dirname(fromTsconfigPath);
    const resolved = isAbsolute(extendsValue) ? extendsValue : resolve(baseDirectory, extendsValue);
    return resolved.endsWith(".json") ? resolved : `${resolved}.json`;
  }
  return undefined;
};

const loadAndMergeTsconfig = async (
  tsconfigPath: string,
  hops: number,
): Promise<{ baseDirectory: string; mappings: PathMapping[] } | undefined> => {
  if (hops > TSCONFIG_MAX_EXTENDS_HOPS) return undefined;
  let rawSource: string;
  try {
    rawSource = await readFile(tsconfigPath, "utf8");
  } catch {
    return undefined;
  }
  const parsed = parseJsoncObject(rawSource);
  if (!parsed) return undefined;

  let inheritedMappings: PathMapping[] = [];
  let inheritedBaseDirectory: string | undefined;
  if (typeof parsed.extends === "string") {
    const extendsPath = resolveExtendsTargetPath(tsconfigPath, parsed.extends);
    if (extendsPath) {
      const extendsResult = await loadAndMergeTsconfig(extendsPath, hops + 1);
      if (extendsResult) {
        inheritedMappings = extendsResult.mappings;
        inheritedBaseDirectory = extendsResult.baseDirectory;
      }
    }
  }

  const compilerOptions = isPlainObject(parsed.compilerOptions) ? parsed.compilerOptions : {};
  const ownMappings = buildMappings(compilerOptions);
  const ownBaseDirectory = dirname(tsconfigPath);
  const baseDirectory =
    ownMappings.length > 0 || !inheritedBaseDirectory ? ownBaseDirectory : inheritedBaseDirectory;
  const mappings = ownMappings.length > 0 ? ownMappings : inheritedMappings;
  return { baseDirectory, mappings };
};

export const loadTsconfigPaths = async (
  startDirectory: string,
  cache: Map<string, TsconfigPaths | null>,
): Promise<TsconfigPaths | undefined> => {
  const cached = cache.get(startDirectory);
  if (cached !== undefined) return cached ?? undefined;
  const tsconfigPath = await findNearestTsconfig(startDirectory);
  if (!tsconfigPath) {
    cache.set(startDirectory, null);
    return undefined;
  }
  const merged = await loadAndMergeTsconfig(tsconfigPath, 0);
  if (!merged || merged.mappings.length === 0) {
    cache.set(startDirectory, null);
    return undefined;
  }
  cache.set(startDirectory, merged);
  return merged;
};

export const resolveSpecifierWithPaths = (specifier: string, paths: TsconfigPaths): string[] => {
  const candidates: string[] = [];
  for (const mapping of paths.mappings) {
    if (mapping.isWildcard) {
      if (!specifier.startsWith(mapping.prefix)) continue;
      const captured = specifier.slice(mapping.prefix.length);
      for (const target of mapping.targets) {
        const expanded = target.replace("*", captured);
        const absolutePath = isAbsolute(expanded)
          ? expanded
          : resolve(paths.baseDirectory, expanded);
        candidates.push(absolutePath);
      }
      continue;
    }
    if (specifier !== mapping.prefix) continue;
    for (const target of mapping.targets) {
      const absolutePath = isAbsolute(target) ? target : resolve(paths.baseDirectory, target);
      candidates.push(absolutePath);
    }
  }
  return candidates;
};
