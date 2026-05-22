import { detectFramework } from "../plugin/framework-detection.js";
import type { Framework } from "../types.js";
import { generateStoriesForProject, type GenerateStoryResult } from "../utils/generate-stories.js";

export interface GenerateCliOptions {
  framework?: Framework;
  force: boolean;
  dryRun: boolean;
}

const renderResultLine = (result: GenerateStoryResult): string => {
  switch (result.status) {
    case "written":
      return `wrote ${result.storyAbsolutePath} (${result.rendered?.storyExportNames.length ?? 0} stories)`;
    case "skipped-exists":
      return `skipped ${result.storyAbsolutePath} (exists; pass --force to overwrite)`;
    case "skipped-no-component":
      return `skipped ${result.componentSourceAbsolutePath} (no component detected)`;
  }
};

export const runGenerate = async (
  projectRoot: string,
  targets: string[],
  options: GenerateCliOptions,
): Promise<void> => {
  const framework = options.framework ?? (await detectFramework(projectRoot));
  const report = await generateStoriesForProject({
    projectRoot,
    framework,
    targets,
    force: options.force,
    dryRun: options.dryRun,
  });

  if (report.results.length === 0) {
    process.stdout.write("no components matched\n");
    return;
  }

  let writtenCount = 0;
  for (const result of report.results) {
    process.stdout.write(`${renderResultLine(result)}\n`);
    if (result.status === "written") writtenCount += 1;
  }

  process.stdout.write(`\n${writtenCount} stories generated\n`);
  if (options.dryRun) process.stdout.write("(dry run — no files written)\n");
};
