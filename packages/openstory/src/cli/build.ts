import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenstoryBuildFailedError } from "../errors.js";
import { ManifestBuilder } from "../plugin/manifest.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { findPreviewFile } from "../plugin/preview-discovery.js";
import { openstory, type OpenstoryComponentsOption } from "../plugin/index.js";
import {
  COMPONENT_IGNORE_GLOBS,
  DEFAULT_COMPONENT_GLOBS_BY_FRAMEWORK,
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_STORY_GLOBS,
  OPENSTORY_DEFAULT_LAYOUT,
  OPENSTORY_LAYOUT_CLASSES,
  OPENSTORY_ROOT_ELEMENT_ID,
  VIRTUAL_STORY_ENTRY_ID,
} from "../constants.js";
import type { ComponentStoriesConfig } from "../plugin/component-stories.js";
import { escapeAttribute } from "../utils/escape-attribute.js";
import type { Framework, ManifestStory } from "../types.js";

interface ViteManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

type ViteManifest = Record<string, ViteManifestChunk>;

const collectCssForChunk = (
  manifest: ViteManifest,
  chunkKey: string,
  seen: Set<string>,
  cssFiles: Set<string>,
): void => {
  if (seen.has(chunkKey)) return;
  seen.add(chunkKey);
  const chunk = manifest[chunkKey];
  if (!chunk) return;
  for (const cssFile of chunk.css ?? []) cssFiles.add(cssFile);
  for (const importKey of chunk.imports ?? []) {
    collectCssForChunk(manifest, importKey, seen, cssFiles);
  }
};

export interface BuildOptions {
  outDir: string;
  base: string;
  framework?: Framework;
  components?: boolean | OpenstoryComponentsOption;
}

const resolveComponentsConfig = (
  option: boolean | OpenstoryComponentsOption | undefined,
  framework: Framework,
): ComponentStoriesConfig | undefined => {
  if (!option) return undefined;
  const includeSource =
    typeof option === "object" && option.include !== undefined
      ? option.include
      : DEFAULT_COMPONENT_GLOBS_BY_FRAMEWORK[framework];
  const include = Array.isArray(includeSource)
    ? includeSource
    : includeSource !== undefined
      ? [includeSource]
      : [];
  const userIgnore =
    typeof option === "object" && Array.isArray(option.ignore) ? option.ignore : [];
  return {
    include,
    ignore: [...DEFAULT_IGNORE_GLOBS, ...COMPONENT_IGNORE_GLOBS, ...userIgnore],
  };
};

const SHELL_DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "shell");

const pickLayout = (parameters: Record<string, unknown> | undefined): string | undefined => {
  if (!parameters) return undefined;
  const layout = parameters["layout"];
  return typeof layout === "string" ? layout : undefined;
};

const renderStoryHtmlForBuild = (
  story: ManifestStory,
  previewParameters: Record<string, unknown> | undefined,
  bundlePath: string,
  cssPaths: string[],
  base: string,
): string => {
  const layout =
    pickLayout(story.parameters) ?? pickLayout(previewParameters) ?? OPENSTORY_DEFAULT_LAYOUT;
  const bodyClassName =
    OPENSTORY_LAYOUT_CLASSES[layout] ?? OPENSTORY_LAYOUT_CLASSES[OPENSTORY_DEFAULT_LAYOUT];
  const escapedStoryId = escapeAttribute(story.id);
  const initialStoryGlobal = JSON.stringify({
    id: story.id,
    name: story.name,
    title: story.title,
    exportName: story.exportName,
    importPath: story.importPath,
  });
  const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
  const cssLinks = cssPaths
    .map((cssPath) => `  <link rel="stylesheet" href="${baseWithSlash}${cssPath}">`)
    .join("\n");

  return `<!doctype html>
<html lang="en" data-openstory-story="${escapedStoryId}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedStoryId} · Openstory</title>
  <style>
    html, body { margin: 0; padding: 0; min-height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body.openstory-layout-centered  { display: grid; place-items: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
    body.openstory-layout-fullscreen #${OPENSTORY_ROOT_ELEMENT_ID} { min-height: 100vh; }
    body.openstory-layout-padded    #${OPENSTORY_ROOT_ELEMENT_ID} { padding: 16px; }
  </style>
${cssLinks}
  <script>window.__OPENSTORY_STORY__ = ${initialStoryGlobal};</script>
</head>
<body class="${bodyClassName}">
  <div id="${OPENSTORY_ROOT_ELEMENT_ID}"></div>
  <script type="module" src="${bundlePath}"></script>
</body>
</html>
`;
};

export const runBuild = async (projectRoot: string, options: BuildOptions): Promise<void> => {
  const framework = options.framework ?? (await detectFramework(projectRoot));
  const previewPath = await findPreviewFile(projectRoot);
  const componentsConfig = resolveComponentsConfig(options.components, framework);

  const builder = new ManifestBuilder({
    projectRoot,
    stories: DEFAULT_STORY_GLOBS,
    ignore: DEFAULT_IGNORE_GLOBS,
    framework,
    previewPath,
    components: componentsConfig,
  });

  const manifest = await builder.build().catch((cause: unknown) => {
    throw new OpenstoryBuildFailedError(cause instanceof Error ? cause.message : String(cause));
  });

  const absoluteOutDir = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(projectRoot, options.outDir);

  const { build } = await import("vite");

  const storyEntryInputs: Record<string, string> = {};
  for (const story of manifest.stories) {
    storyEntryInputs[`__story/${story.id}/entry`] =
      `${VIRTUAL_STORY_ENTRY_ID}?id=${encodeURIComponent(story.id)}`;
  }

  await build({
    root: projectRoot,
    base: options.base,
    logLevel: "warn",
    plugins: [openstory({ framework, preview: previewPath, components: options.components })],
    build: {
      outDir: absoluteOutDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: "esbuild",
      manifest: true,
      rollupOptions: {
        input: storyEntryInputs,
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "assets/chunk-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  }).catch((cause: unknown) => {
    throw new OpenstoryBuildFailedError(cause instanceof Error ? cause.message : String(cause));
  });

  const viteManifestPath = join(absoluteOutDir, ".vite", "manifest.json");
  const viteManifest: ViteManifest = JSON.parse(await readFile(viteManifestPath, "utf8"));

  await mkdir(join(absoluteOutDir, "__openstory"), { recursive: true });
  await writeFile(
    join(absoluteOutDir, "__openstory", "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const baseWithSlash = options.base.endsWith("/") ? options.base : `${options.base}/`;

  for (const story of manifest.stories) {
    const entryKey = `__story/${story.id}/entry`;
    const cssForStory = new Set<string>();
    for (const [chunkKey, chunk] of Object.entries(viteManifest)) {
      if (chunk.file === `${entryKey}.js`) {
        collectCssForChunk(viteManifest, chunkKey, new Set<string>(), cssForStory);
      }
    }
    const bundleRelativePath = `${baseWithSlash}__story/${story.id}/entry.js`;
    const html = renderStoryHtmlForBuild(
      story,
      manifest.parameters,
      bundleRelativePath,
      [...cssForStory],
      options.base,
    );
    const targetPath = join(absoluteOutDir, "__story", story.id, "index.html");
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, html, "utf8");
  }

  await cp(SHELL_DIST_DIR, absoluteOutDir, { recursive: true });

  process.stdout.write(`built ${manifest.stories.length} stories + shell to ${absoluteOutDir}\n`);
};
