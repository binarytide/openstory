import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { OdeBuildFailedError } from "../errors.js";
import { ManifestBuilder } from "../plugin/manifest.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { findPreviewFile } from "../plugin/preview-discovery.js";
import { renderStoryIframeHtml } from "../plugin/virtual-modules.js";
import {
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_STORY_GLOBS,
} from "../constants.js";

export interface BuildOptions {
  outDir: string;
  base: string;
}

export const runBuild = async (
  projectRoot: string,
  options: BuildOptions,
): Promise<void> => {
  const framework = await detectFramework(projectRoot);
  const previewPath = await findPreviewFile(projectRoot);

  const builder = new ManifestBuilder({
    projectRoot,
    stories: DEFAULT_STORY_GLOBS,
    ignore: DEFAULT_IGNORE_GLOBS,
    framework,
    previewPath,
  });

  const manifest = await builder.build().catch((cause: unknown) => {
    throw new OdeBuildFailedError(cause instanceof Error ? cause.message : String(cause));
  });

  const absoluteOutDir = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(projectRoot, options.outDir);

  await mkdir(join(absoluteOutDir, "__ode"), { recursive: true });
  await writeFile(
    join(absoluteOutDir, "__ode", "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  for (const story of manifest.stories) {
    const html = renderStoryIframeHtml({
      story,
      previewParameters: manifest.parameters,
      base: options.base,
    });
    const targetPath = join(absoluteOutDir, "__story", story.id, "index.html");
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, html, "utf8");
  }

  process.stdout.write(
    `built ${manifest.stories.length} stories to ${absoluteOutDir}\n`,
  );
};
