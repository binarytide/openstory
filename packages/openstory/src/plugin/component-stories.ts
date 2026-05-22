import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import fg from "fast-glob";
import { toId } from "../csf/to-id.js";
import type { Framework, ManifestStory } from "../types.js";
import { deriveTitleFromPath } from "../utils/derive-title-from-path.js";
import { findComponentsInFile } from "../utils/find-components.js";

export interface ComponentStoriesConfig {
  include: string[];
  ignore: string[];
}

export interface BuildComponentStoriesOptions {
  projectRoot: string;
  framework: Framework;
  config: ComponentStoriesConfig;
}

export interface ComponentStoryCacheEntry {
  mtime: number;
  stories: ManifestStory[];
}

const buildStoriesForFile = (
  source: string,
  absolutePath: string,
  importPath: string,
  framework: Framework,
): ManifestStory[] => {
  const detectedComponents = findComponentsInFile(source, absolutePath, framework);
  if (detectedComponents.length === 0) return [];
  const title = deriveTitleFromPath(importPath);
  return detectedComponents.map((detectedComponent) => {
    const componentExport = detectedComponent.isDefaultExport ? "default" : detectedComponent.name;
    return {
      id: toId(title, detectedComponent.name),
      name: detectedComponent.name,
      title,
      importPath,
      exportName: "Default",
      componentPath: detectedComponent.name,
      argTypes: {},
      initialArgs: {},
      parameters: {},
      tags: ["components"],
      hasPlay: false,
      hasBeforeEach: false,
      hasRender: true,
      synthesized: { componentExport },
    } satisfies ManifestStory;
  });
};

export class ComponentStoriesBuilder {
  private cache = new Map<string, ComponentStoryCacheEntry>();

  invalidate = (absolutePath?: string): void => {
    if (absolutePath === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(absolutePath);
  };

  has = (absolutePath: string): boolean => this.cache.has(absolutePath);

  build = async (options: BuildComponentStoriesOptions): Promise<ManifestStory[]> => {
    const componentFiles = await fg(options.config.include, {
      cwd: options.projectRoot,
      ignore: options.config.ignore,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    const sortedComponentFiles = componentFiles.sort();
    const cacheEntries = await Promise.all(
      sortedComponentFiles.map((absolutePath) => this.parseFile(absolutePath, options)),
    );
    return cacheEntries.flatMap((cacheEntry) => cacheEntry.stories);
  };

  private parseFile = async (
    absolutePath: string,
    options: BuildComponentStoriesOptions,
  ): Promise<ComponentStoryCacheEntry> => {
    const mtime = (await stat(absolutePath)).mtimeMs;
    const cached = this.cache.get(absolutePath);
    if (cached && cached.mtime === mtime) return cached;

    const source = await readFile(absolutePath, "utf8");
    const importPath = relative(options.projectRoot, absolutePath).split("\\").join("/");
    const stories = buildStoriesForFile(source, absolutePath, importPath, options.framework);
    const entry: ComponentStoryCacheEntry = { mtime, stories };
    this.cache.set(absolutePath, entry);
    return entry;
  };
}
