import { DEFAULT_IGNORE_GLOBS, DEFAULT_STORY_GLOBS } from "../constants.js";
import { OdeStoryNotFoundError } from "../errors.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { ManifestBuilder } from "../plugin/manifest.js";
import { findPreviewFile } from "../plugin/preview-discovery.js";
import type { ManifestStory } from "../types.js";

export interface InspectOptions {
  json: boolean;
}

const renderStory = (story: ManifestStory): string => {
  const lines = [
    story.id,
    `  Title:       ${story.title}`,
    `  Name:        ${story.name}`,
    `  Import:      ${story.importPath}`,
    `  Export:      ${story.exportName}`,
    `  Args:        ${JSON.stringify(story.initialArgs)}`,
    `  ArgTypes:    ${Object.keys(story.argTypes).join(", ") || "(none)"}`,
    `  Parameters:  ${JSON.stringify(story.parameters)}`,
    `  Tags:        ${story.tags.join(", ") || "(none)"}`,
    `  Play:        ${story.hasPlay ? "yes" : "no"}`,
    `  BeforeEach:  ${story.hasBeforeEach ? "yes" : "no"}`,
    `  Render:      ${story.hasRender ? "yes" : "no"}`,
  ];
  return `${lines.join("\n")}\n`;
};

export const runInspect = async (
  projectRoot: string,
  storyId: string,
  options: InspectOptions,
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

  const story = manifest.stories.find((entry) => entry.id === storyId);
  if (!story) {
    throw new OdeStoryNotFoundError(
      storyId,
      manifest.stories.map((entry) => entry.id),
    );
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(story, null, 2)}\n`);
    return;
  }
  process.stdout.write(renderStory(story));
};
