import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import fg from "fast-glob";
import {
  COMPONENT_IGNORE_GLOBS,
  DEFAULT_COMPONENT_GLOBS_BY_FRAMEWORK,
  DEFAULT_IGNORE_GLOBS,
} from "../constants.js";
import type { Framework } from "../types.js";
import { extractPropsFromComponent, type ParsedFile } from "./extract-props.js";
import { fileExists } from "./file-exists.js";
import { findComponentsInFile } from "./find-components.js";
import {
  deriveStoryOutputPath,
  renderCsfStory,
  type RenderedStoryFile,
} from "./render-csf-story.js";
import type { TsconfigPaths } from "./resolve-tsconfig-paths.js";

export interface GenerateStoriesOptions {
  projectRoot: string;
  framework: Framework;
  targets: string[];
  force?: boolean;
  dryRun?: boolean;
}

export type GenerateStoryStatus = "written" | "skipped-exists" | "skipped-no-component";

export interface GenerateStoryResult {
  componentName: string;
  componentSourceAbsolutePath: string;
  storyAbsolutePath: string;
  status: GenerateStoryStatus;
  rendered?: RenderedStoryFile;
}

export interface GenerateStoriesReport {
  results: GenerateStoryResult[];
}

const resolveTargetsToAbsoluteFiles = async (
  options: GenerateStoriesOptions,
): Promise<string[]> => {
  const targets =
    options.targets.length > 0
      ? options.targets
      : (DEFAULT_COMPONENT_GLOBS_BY_FRAMEWORK[options.framework] ?? []);
  const absoluteFiles = new Set<string>();
  for (const target of targets) {
    const absoluteTarget = isAbsolute(target) ? target : resolve(options.projectRoot, target);
    if (await fileExists(absoluteTarget)) {
      absoluteFiles.add(absoluteTarget);
      continue;
    }
    const matched = await fg([target], {
      cwd: options.projectRoot,
      absolute: true,
      onlyFiles: true,
      ignore: [...DEFAULT_IGNORE_GLOBS, ...COMPONENT_IGNORE_GLOBS],
      followSymbolicLinks: false,
    });
    for (const match of matched) absoluteFiles.add(match);
  }
  return [...absoluteFiles].sort();
};

export const generateStoriesForProject = async (
  options: GenerateStoriesOptions,
): Promise<GenerateStoriesReport> => {
  const componentFiles = await resolveTargetsToAbsoluteFiles(options);
  const parseCache = new Map<string, ParsedFile>();
  const tsconfigPathsCache = new Map<string, TsconfigPaths | null>();
  const results: GenerateStoryResult[] = [];

  for (const componentFile of componentFiles) {
    const source = await readFile(componentFile, "utf8");
    const detectedComponents = findComponentsInFile(source, componentFile, options.framework);
    if (detectedComponents.length === 0) continue;
    const storyAbsolutePath = deriveStoryOutputPath(componentFile);

    if (!options.force && (await fileExists(storyAbsolutePath))) {
      results.push({
        componentName: detectedComponents[0]!.name,
        componentSourceAbsolutePath: componentFile,
        storyAbsolutePath,
        status: "skipped-exists",
      });
      continue;
    }

    let chosenComponent = detectedComponents[0]!;
    let chosenExtracted = await extractPropsFromComponent(
      source,
      componentFile,
      chosenComponent.name,
      { parseCache, tsconfigPathsCache },
    );
    if (!chosenExtracted.resolvedAsFunction) {
      for (
        let candidateIndex = 1;
        candidateIndex < detectedComponents.length;
        candidateIndex += 1
      ) {
        const candidate = detectedComponents[candidateIndex]!;
        const candidateExtracted = await extractPropsFromComponent(
          source,
          componentFile,
          candidate.name,
          { parseCache, tsconfigPathsCache },
        );
        if (candidateExtracted.resolvedAsFunction) {
          chosenComponent = candidate;
          chosenExtracted = candidateExtracted;
          break;
        }
      }
    }

    if (!chosenExtracted.resolvedAsFunction) {
      results.push({
        componentName: chosenComponent.name,
        componentSourceAbsolutePath: componentFile,
        storyAbsolutePath,
        status: "skipped-no-component",
      });
      continue;
    }

    const rendered = renderCsfStory({
      componentName: chosenComponent.name,
      componentSourceAbsolutePath: componentFile,
      componentIsDefaultExport: chosenComponent.isDefaultExport,
      framework: options.framework,
      projectRoot: options.projectRoot,
      storyOutputAbsolutePath: storyAbsolutePath,
      props: chosenExtracted.props,
    });

    if (!options.dryRun) {
      await writeFile(storyAbsolutePath, rendered.source, "utf8");
    }

    results.push({
      componentName: chosenComponent.name,
      componentSourceAbsolutePath: componentFile,
      storyAbsolutePath,
      status: "written",
      rendered,
    });
  }

  return { results };
};
