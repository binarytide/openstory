import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

interface PackageJsonShape {
  name?: string;
}

export const resolveProjectDisplay = async (
  projectRoot: string,
): Promise<{ projectName: string; projectRoot: string }> => {
  let projectName = basename(projectRoot);

  try {
    const text = await readFile(join(projectRoot, "package.json"), "utf8");
    const packageJson = JSON.parse(text) as PackageJsonShape;
    if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
      projectName = packageJson.name;
    }
  } catch {
    // keep directory basename
  }

  return { projectName, projectRoot };
};
