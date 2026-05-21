import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Framework } from "../types.js";
import { detectFramework } from "../plugin/framework-detection.js";
import { fileExists } from "../utils/file-exists.js";

export interface InitOptions {
  framework?: Framework;
  force: boolean;
}

interface FrameworkScaffold {
  previewFile: string;
  previewSource: string;
  viteConfigSource: string;
}

const previewSource = (framework: Framework): string =>
  `import type { Preview } from "openstory/${framework}";

const preview: Preview = {
  parameters: { layout: "padded" },
  decorators: [],
};

export default preview;
`;

const viteConfigSource = (
  framework: Framework,
  pluginImport: string,
  pluginCall: string,
): string => `import { defineConfig } from "vite";
${pluginImport}
import { openstory } from "openstory/plugin";

export default defineConfig({
  plugins: [${pluginCall}, openstory({ framework: "${framework}" })],
});
`;

const scaffoldFor = (framework: Framework): FrameworkScaffold => {
  switch (framework) {
    case "react":
      return {
        previewFile: "preview.tsx",
        previewSource: previewSource("react"),
        viteConfigSource: viteConfigSource(
          "react",
          `import react from "@vitejs/plugin-react";`,
          "react()",
        ),
      };
    case "solid":
      return {
        previewFile: "preview.tsx",
        previewSource: previewSource("solid"),
        viteConfigSource: viteConfigSource(
          "solid",
          `import solid from "vite-plugin-solid";`,
          "solid()",
        ),
      };
    case "vue":
      return {
        previewFile: "preview.ts",
        previewSource: previewSource("vue"),
        viteConfigSource: viteConfigSource("vue", `import vue from "@vitejs/plugin-vue";`, "vue()"),
      };
    case "svelte":
      return {
        previewFile: "preview.ts",
        previewSource: previewSource("svelte"),
        viteConfigSource: viteConfigSource(
          "svelte",
          `import { svelte } from "@sveltejs/vite-plugin-svelte";`,
          "svelte()",
        ),
      };
  }
};

export const runInit = async (projectRoot: string, options: InitOptions): Promise<void> => {
  const framework = options.framework ?? (await detectFramework(projectRoot));
  const scaffold = scaffoldFor(framework);

  const previewPath = join(projectRoot, scaffold.previewFile);
  if (!(await fileExists(previewPath)) || options.force) {
    await writeFile(previewPath, scaffold.previewSource, "utf8");
    process.stdout.write(`created ${scaffold.previewFile}\n`);
  } else {
    process.stdout.write(`skipped ${scaffold.previewFile} (exists; pass --force to overwrite)\n`);
  }

  const viteConfigPath = join(projectRoot, "vite.config.ts");
  if (!(await fileExists(viteConfigPath))) {
    await writeFile(viteConfigPath, scaffold.viteConfigSource, "utf8");
    process.stdout.write(`created vite.config.ts\n`);
  } else {
    process.stdout.write(
      `vite.config.ts exists. Add the snippet below to your plugins array:\n\n` +
        `  import { openstory } from "openstory/plugin";\n` +
        `  plugins: [openstory({ framework: "${framework}" }), ...]\n`,
    );
  }

  process.stdout.write(`\nDone. Run \`openstory dev\` to start.\n`);
};
