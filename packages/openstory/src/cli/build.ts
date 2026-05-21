import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenstoryBuildFailedError } from "../errors.js";
import { ManifestBuilder } from "../plugin/manifest.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { findPreviewFile } from "../plugin/preview-discovery.js";
import { openstory } from "../plugin/index.js";
import {
  OPENSTORY_DEFAULT_LAYOUT,
  OPENSTORY_LAYOUT_CLASSES,
  OPENSTORY_ROOT_ELEMENT_ID,
  VIRTUAL_STORY_ENTRY_ID,
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_STORY_GLOBS,
} from "../constants.js";
import { escapeAttribute } from "../utils/escape-attribute.js";
import type { Framework, ManifestStory } from "../types.js";

export interface BuildOptions {
  outDir: string;
  base: string;
  framework?: Framework;
}

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

  const builder = new ManifestBuilder({
    projectRoot,
    stories: DEFAULT_STORY_GLOBS,
    ignore: DEFAULT_IGNORE_GLOBS,
    framework,
    previewPath,
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
    plugins: [openstory({ framework, preview: previewPath })],
    build: {
      outDir: absoluteOutDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: "esbuild",
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

  await mkdir(join(absoluteOutDir, "__openstory"), { recursive: true });
  await writeFile(
    join(absoluteOutDir, "__openstory", "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  for (const story of manifest.stories) {
    const bundleRelativePath = `/__story/${story.id}/entry.js`;
    const html = renderStoryHtmlForBuild(story, manifest.parameters, bundleRelativePath);
    const targetPath = join(absoluteOutDir, "__story", story.id, "index.html");
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, html, "utf8");
  }

  await cp(SHELL_DIST_DIR, absoluteOutDir, { recursive: true });

  process.stdout.write(
    `built ${manifest.stories.length} stories + shell to ${absoluteOutDir}\n`,
  );
};
