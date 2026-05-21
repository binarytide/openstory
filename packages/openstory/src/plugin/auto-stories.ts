import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import fg from "fast-glob";
import { toId } from "../csf/to-id.js";
import type { Framework, ManifestStory } from "../types.js";
import { deriveTitleFromPath } from "../utils/derive-title-from-path.js";
import { findComponentsInFile } from "../utils/find-components.js";

export interface AutoStoriesConfig {
  componentGlobs: string[];
  ignoreGlobs: string[];
}

export interface BuildAutoStoriesOptions {
  projectRoot: string;
  framework: Framework;
  config: AutoStoriesConfig;
}

export interface AutoStoryCacheEntry {
  mtime: number;
  stories: ManifestStory[];
}

const buildStoriesForFile = (
  source: string,
  absolutePath: string,
  importPath: string,
  framework: Framework,
): ManifestStory[] => {
  const components = findComponentsInFile(source, absolutePath, framework);
  if (components.length === 0) return [];
  const title = deriveTitleFromPath(importPath);
  return components.map((component) => {
    const componentExport = component.isDefaultExport ? "default" : component.name;
    return {
      id: toId(title, component.name),
      name: component.name,
      title,
      importPath,
      exportName: "Default",
      componentPath: component.name,
      argTypes: {},
      initialArgs: {},
      parameters: {},
      tags: ["auto"],
      hasPlay: false,
      hasBeforeEach: false,
      hasRender: true,
      auto: { componentExport },
    } satisfies ManifestStory;
  });
};

export class AutoStoriesBuilder {
  private cache = new Map<string, AutoStoryCacheEntry>();

  invalidate = (absolutePath?: string): void => {
    if (absolutePath === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(absolutePath);
  };

  has = (absolutePath: string): boolean => this.cache.has(absolutePath);

  build = async (options: BuildAutoStoriesOptions): Promise<ManifestStory[]> => {
    const componentFiles = await fg(options.config.componentGlobs, {
      cwd: options.projectRoot,
      ignore: options.config.ignoreGlobs,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    const allStories: ManifestStory[] = [];
    for (const absolutePath of componentFiles.sort()) {
      const entry = await this.parseFile(absolutePath, options);
      allStories.push(...entry.stories);
    }
    return allStories;
  };

  private parseFile = async (
    absolutePath: string,
    options: BuildAutoStoriesOptions,
  ): Promise<AutoStoryCacheEntry> => {
    const mtime = (await stat(absolutePath)).mtimeMs;
    const cached = this.cache.get(absolutePath);
    if (cached && cached.mtime === mtime) return cached;

    const source = await readFile(absolutePath, "utf8");
    const importPath = relative(options.projectRoot, absolutePath).split("\\").join("/");
    const stories = buildStoriesForFile(source, absolutePath, importPath, options.framework);
    const entry: AutoStoryCacheEntry = { mtime, stories };
    this.cache.set(absolutePath, entry);
    return entry;
  };
}
