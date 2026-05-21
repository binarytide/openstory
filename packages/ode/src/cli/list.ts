import { DEFAULT_IGNORE_GLOBS, DEFAULT_STORY_GLOBS } from "../constants.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { ManifestBuilder } from "../plugin/manifest.js";
import { findPreviewFile } from "../plugin/preview-discovery.js";
import type { Manifest, ManifestStory } from "../types.js";

export interface ListOptions {
  json: boolean;
  filter?: string;
}

const renderTree = (manifest: Manifest, filter: string | undefined): string => {
  const grouped = new Map<string, ManifestStory[]>();
  for (const story of manifest.stories) {
    if (filter && !story.id.includes(filter) && !story.title.includes(filter)) continue;
    const existing = grouped.get(story.title) ?? [];
    existing.push(story);
    grouped.set(story.title, existing);
  }

  const lines: string[] = [
    `Manifest: ${manifest.stories.length} stories (${manifest.framework})`,
    "",
  ];

  const sortedTitles = [...grouped.keys()].sort();
  for (const title of sortedTitles) {
    lines.push(title);
    for (const story of grouped.get(title)!) {
      lines.push(`  ${story.id.padEnd(50)} ${story.importPath}`);
    }
  }
  return `${lines.join("\n")}\n`;
};

export const runList = async (
  projectRoot: string,
  options: ListOptions,
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
  const manifest = await builder.build();

  if (options.json) {
    const filtered = options.filter
      ? {
          ...manifest,
          stories: manifest.stories.filter(
            (story) => story.id.includes(options.filter!) || story.title.includes(options.filter!),
          ),
        }
      : manifest;
    process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderTree(manifest, options.filter));
};
