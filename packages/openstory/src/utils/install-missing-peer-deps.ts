import { spawn } from "node:child_process";
import type { DetectedPackageManager } from "./detect-project-features.js";

export interface InstallMissingPeerDepsOptions {
  projectRoot: string;
  packageManager: DetectedPackageManager;
  packages: string[];
}

export interface InstallResult {
  exitCode: number;
  command: string;
}

const buildInstallCommand = (
  packageManager: DetectedPackageManager,
  packages: string[],
): { command: string; args: string[] } => {
  switch (packageManager) {
    case "pnpm":
      return { command: "pnpm", args: ["add", "-D", ...packages] };
    case "yarn":
      return { command: "yarn", args: ["add", "-D", ...packages] };
    case "bun":
      return { command: "bun", args: ["add", "-d", ...packages] };
    case "npm":
      return { command: "npm", args: ["install", "--save-dev", ...packages] };
  }
};

export const installMissingPeerDeps = async (
  options: InstallMissingPeerDepsOptions,
): Promise<InstallResult> => {
  const { command, args } = buildInstallCommand(options.packageManager, options.packages);
  const renderedCommand = `${command} ${args.join(" ")}`;
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd: options.projectRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (exitCode) => {
      resolveResult({ exitCode: exitCode ?? -1, command: renderedCommand });
    });
    child.on("error", () => {
      resolveResult({ exitCode: -1, command: renderedCommand });
    });
  });
};
