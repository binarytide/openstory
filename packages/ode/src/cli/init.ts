import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Framework } from "../types.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { fileExists } from "../utils/file-exists.js";

export interface InitOptions {
  framework?: Framework;
  force: boolean;
}

const previewTemplate = (framework: Framework): string => {
  if (framework === "react") {
    return `import type { Preview } from "ode/react";

const preview: Preview = {
  parameters: { layout: "padded" },
  decorators: [],
};

export default preview;
`;
  }
  return `import type { Preview } from "ode/solid";

const preview: Preview = {
  parameters: { layout: "padded" },
  decorators: [],
};

export default preview;
`;
};

const viteConfigTemplate = (framework: Framework): string => {
  if (framework === "react") {
    return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ode } from "ode/plugin";

export default defineConfig({
  plugins: [react(), ode({ framework: "react" })],
});
`;
  }
  return `import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { ode } from "ode/plugin";

export default defineConfig({
  plugins: [solid(), ode({ framework: "solid" })],
});
`;
};

export const runInit = async (
  projectRoot: string,
  options: InitOptions,
): Promise<void> => {
  const framework = options.framework ?? (await detectFramework(projectRoot));

  const previewPath = join(projectRoot, "preview.tsx");
  if (!(await fileExists(previewPath)) || options.force) {
    await writeFile(previewPath, previewTemplate(framework), "utf8");
    process.stdout.write(`created preview.tsx\n`);
  } else {
    process.stdout.write(`skipped preview.tsx (exists; pass --force to overwrite)\n`);
  }

  const viteConfigPath = join(projectRoot, "vite.config.ts");
  if (!(await fileExists(viteConfigPath))) {
    await writeFile(viteConfigPath, viteConfigTemplate(framework), "utf8");
    process.stdout.write(`created vite.config.ts\n`);
  } else {
    process.stdout.write(
      `vite.config.ts exists — add the snippet below to your plugins array:\n\n` +
        `  import { ode } from "ode/plugin";\n` +
        `  plugins: [ode({ framework: "${framework}" }), ...]\n`,
    );
  }

  process.stdout.write(`\nDone. Run \`ode dev\` to start.\n`);
};
