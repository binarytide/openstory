import { detectProjectFeatures } from "../utils/detect-project-features.js";
import { generateStoriesForProject, type GenerateStoryResult } from "../utils/generate-stories.js";
import { installMissingPeerDeps } from "../utils/install-missing-peer-deps.js";
import { writeSetupFiles } from "../utils/render-setup-files.js";
import type { Framework } from "../types.js";

export interface SetupCliOptions {
  framework?: Framework;
  force: boolean;
  installDeps: boolean;
}

const summarizeWrite = (entry: { path: string; action: "written" | "skipped-exists" }): string =>
  `  ${entry.action === "written" ? "wrote   " : "kept    "} ${entry.path}`;

const summarizeGenerate = (results: GenerateStoryResult[]): string => {
  const written = results.filter((result) => result.status === "written").length;
  const skipped = results.filter((result) => result.status === "skipped-exists").length;
  const noComponent = results.filter((result) => result.status === "skipped-no-component").length;
  return `  ${written} stories written, ${skipped} kept (already existed), ${noComponent} skipped (no component)`;
};

export const runSetup = async (projectRoot: string, options: SetupCliOptions): Promise<void> => {
  process.stdout.write("openstory setup\n\n");

  const features = await detectProjectFeatures(projectRoot, options.framework);
  process.stdout.write(`detected:\n`);
  process.stdout.write(`  framework        ${features.framework}\n`);
  process.stdout.write(`  package manager  ${features.packageManager}\n`);
  if (features.isNext) process.stdout.write(`  next.js          yes\n`);
  if (features.hasReactQuery) process.stdout.write(`  react query      yes\n`);
  if (features.hasRadixTooltip) process.stdout.write(`  radix tooltip    yes\n`);
  if (features.hasShadcnSidebar) process.stdout.write(`  shadcn sidebar   yes\n`);
  if (features.globalsCssRelativePath) {
    process.stdout.write(`  globals.css      ${features.globalsCssRelativePath}\n`);
  }
  if (features.pathAliases.length > 0) {
    process.stdout.write(
      `  tsconfig paths   ${features.pathAliases.map((mapping) => mapping.prefix).join(" ")}\n`,
    );
  }

  if (options.installDeps) {
    const missing: string[] = [];
    if (features.needsViteInstall) missing.push("vite");
    if (features.needsReactPluginInstall) missing.push("@vitejs/plugin-react");
    if (missing.length > 0) {
      process.stdout.write(`\ninstalling: ${missing.join(", ")}\n`);
      const install = await installMissingPeerDeps({
        projectRoot,
        packageManager: features.packageManager,
        packages: missing,
      });
      if (install.exitCode !== 0) {
        process.stderr.write(
          `\n  warning: \`${install.command}\` exited with ${install.exitCode}.\n` +
            `  continuing — install the missing peer deps yourself, then re-run \`openstory dev\`:\n` +
            `    ${install.command}\n\n`,
        );
      }
    }
  }

  process.stdout.write(`\nscaffolding files:\n`);
  const writes = await writeSetupFiles({ projectRoot, features, force: options.force });
  for (const entry of writes) process.stdout.write(`${summarizeWrite(entry)}\n`);

  process.stdout.write(`\ngenerating stories...\n`);
  const generateReport = await generateStoriesForProject({
    projectRoot,
    framework: features.framework,
    targets: [],
    force: options.force,
  });
  process.stdout.write(`${summarizeGenerate(generateReport.results)}\n`);

  process.stdout.write(`\nrun \`openstory dev\` to browse.\n`);
};
