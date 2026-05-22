import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import fg from "fast-glob";
import type { ViteDevServer } from "vite";

import { OPENSTORY_VERSION } from "../constants.js";
import { OpenstoryCsfDuplicateStoryIdError } from "../errors.js";
import { resolveProjectDisplay } from "../utils/resolve-project-display.js";
import { parseCsf, type ParsedStory } from "../csf/parser.js";
import { parsePreview } from "../csf/preview-parser.js";
import type { Framework, GlobalType, Manifest, ManifestStory, StoryParameters } from "../types.js";
import { ComponentStoriesBuilder, type ComponentStoriesConfig } from "./component-stories.js";

export interface BuildManifestOptions {
  projectRoot: string;
  stories: string[];
  ignore: string[];
  framework: Framework;
  previewPath?: string;
  devServer?: ViteDevServer;
  components?: ComponentStoriesConfig;
}

export interface ManifestCacheEntry {
  importPath: string;
  mtime: number;
  stories: ManifestStory[];
}

interface PreviewMetadata {
  globalTypes: Record<string, GlobalType>;
  initialGlobals: Record<string, unknown>;
  parameters: StoryParameters;
}

const EMPTY_PREVIEW_METADATA: PreviewMetadata = {
  globalTypes: {},
  initialGlobals: {},
  parameters: {},
};

const deriveTitleFromImportPath = (userTitle: string | undefined, importPath: string): string => {
  if (userTitle) return userTitle;
  return importPath
    .replace(/\.stories\.(tsx|jsx|ts|js)$/, "")
    .replace(/^src\//, "")
    .replace(/^stories\//, "");
};

const parsedStoryToManifestStory = (
  story: ParsedStory,
  componentPath: string | undefined,
  importPath: string,
): ManifestStory => ({
  id: story.id,
  name: story.name,
  title: story.title,
  importPath,
  exportName: story.exportName,
  componentPath,
  argTypes: story.argTypes,
  initialArgs: story.args,
  parameters: story.parameters,
  tags: story.tags,
  hasPlay: story.hasPlay,
  hasBeforeEach: story.hasBeforeEach,
  hasRender: story.hasRender,
});

export class ManifestBuilder {
  private cache = new Map<string, ManifestCacheEntry>();
  private previewCache: { mtime: number; meta: PreviewMetadata } | undefined;
  private componentStoriesBuilder: ComponentStoriesBuilder | undefined;
  private devServer: ViteDevServer | undefined;
  private readonly options: BuildManifestOptions;

  constructor(options: BuildManifestOptions) {
    this.options = options;
    this.devServer = options.devServer;
    if (options.components) {
      this.componentStoriesBuilder = new ComponentStoriesBuilder();
    }
  }

  attachDevServer = (server: ViteDevServer): void => {
    this.devServer = server;
  };

  invalidate = (absolutePath?: string): void => {
    if (absolutePath === undefined) {
      this.cache.clear();
      this.previewCache = undefined;
      this.componentStoriesBuilder?.invalidate();
      return;
    }
    this.cache.delete(absolutePath);
    if (this.options.previewPath === absolutePath) {
      this.previewCache = undefined;
    }
    this.componentStoriesBuilder?.invalidate(absolutePath);
  };

  build = async (): Promise<Manifest> => {
    const storyFiles = await fg(this.options.stories, {
      cwd: this.options.projectRoot,
      ignore: this.options.ignore,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    const allStories: ManifestStory[] = [];
    for (const absolutePath of storyFiles) {
      const cacheEntry = await this.parseStoryFile(absolutePath);
      allStories.push(...cacheEntry.stories);
    }

    if (this.componentStoriesBuilder && this.options.components) {
      const userStoryIds = new Set(allStories.map((story) => story.id));
      const synthesizedStories = await this.componentStoriesBuilder.build({
        projectRoot: this.options.projectRoot,
        framework: this.options.framework,
        config: this.options.components,
      });
      for (const synthesizedStory of synthesizedStories) {
        if (userStoryIds.has(synthesizedStory.id)) continue;
        allStories.push(synthesizedStory);
      }
    }

    const importPathsById = new Map<string, string[]>();
    for (const story of allStories) {
      const existing = importPathsById.get(story.id);
      if (existing) {
        existing.push(story.importPath);
      } else {
        importPathsById.set(story.id, [story.importPath]);
      }
    }
    for (const [id, paths] of importPathsById) {
      if (paths.length > 1) {
        throw new OpenstoryCsfDuplicateStoryIdError(id, paths);
      }
    }

    const previewMetadata = await this.loadPreviewMetadata();
    const { projectName, projectRoot } = await resolveProjectDisplay(this.options.projectRoot);

    return {
      v: 1,
      generatedAt: new Date().toISOString(),
      framework: this.options.framework,
      projectName,
      projectRoot,
      openstoryVersion: OPENSTORY_VERSION,
      stories: allStories,
      globalTypes: previewMetadata.globalTypes,
      initialGlobals: previewMetadata.initialGlobals,
      parameters: previewMetadata.parameters,
    };
  };

  private parseStoryFile = async (absolutePath: string): Promise<ManifestCacheEntry> => {
    const mtime = (await stat(absolutePath)).mtimeMs;
    const cached = this.cache.get(absolutePath);
    if (cached && cached.mtime === mtime) return cached;

    const source = await readFile(absolutePath, "utf8");
    const importPath = relative(this.options.projectRoot, absolutePath).split("\\").join("/");
    const parsed = parseCsf(source, {
      filename: importPath,
      makeTitle: (userTitle) => deriveTitleFromImportPath(userTitle, importPath),
    });

    const stories = parsed.stories.map((story) =>
      parsedStoryToManifestStory(story, parsed.meta.component, importPath),
    );
    const entry: ManifestCacheEntry = { importPath, mtime, stories };
    this.cache.set(absolutePath, entry);
    return entry;
  };

  private loadPreviewMetadata = async (): Promise<PreviewMetadata> => {
    const previewPath = this.options.previewPath;
    if (!previewPath) return EMPTY_PREVIEW_METADATA;

    const mtime = (await stat(previewPath)).mtimeMs;
    if (this.previewCache && this.previewCache.mtime === mtime) {
      return this.previewCache.meta;
    }

    try {
      const source = await readFile(previewPath, "utf8");
      const parsed = parsePreview(source, previewPath);
      const meta: PreviewMetadata = {
        globalTypes: parsed.globalTypes,
        initialGlobals: parsed.initialGlobals,
        parameters: parsed.parameters,
      };
      this.previewCache = { mtime, meta };
      return meta;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.devServer?.config.logger.warn(
        `[openstory] preview parse failed for ${previewPath}: ${message}`,
      );
      return EMPTY_PREVIEW_METADATA;
    }
  };
}
