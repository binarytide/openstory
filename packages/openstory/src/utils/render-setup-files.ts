import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Framework } from "../types.js";
import type { DetectedProjectFeatures } from "./detect-project-features.js";
import { fileExists } from "./file-exists.js";

export interface WriteSetupFilesOptions {
  projectRoot: string;
  features: DetectedProjectFeatures;
  force: boolean;
}

export interface SetupFileWrite {
  path: string;
  action: "written" | "skipped-exists";
}

const previewFilename = (framework: Framework): string =>
  framework === "vue" || framework === "svelte" ? "preview.ts" : "preview.tsx";

const reactPluginImportFor = (framework: Framework): { importLine: string; pluginCall: string } => {
  switch (framework) {
    case "react":
      return {
        importLine: `import react from "@vitejs/plugin-react";`,
        pluginCall: "react()",
      };
    case "solid":
      return {
        importLine: `import solid from "vite-plugin-solid";`,
        pluginCall: "solid()",
      };
    case "vue":
      return {
        importLine: `import vue from "@vitejs/plugin-vue";`,
        pluginCall: "vue()",
      };
    case "svelte":
      return {
        importLine: `import { svelte } from "@sveltejs/vite-plugin-svelte";`,
        pluginCall: "svelte()",
      };
  }
};

const renderAliasEntries = (features: DetectedProjectFeatures): string => {
  if (features.pathAliases.length === 0) return "";
  const lines: string[] = [];
  for (const mapping of features.pathAliases) {
    const target = mapping.targets[0];
    if (!target) continue;
    const aliasKey = mapping.isWildcard ? mapping.prefix.replace(/\/$/, "") : mapping.prefix;
    const targetExpression = mapping.isWildcard
      ? `resolve(projectRoot, ${JSON.stringify(target.replace(/\/\*$/, ""))})`
      : `resolve(projectRoot, ${JSON.stringify(target)})`;
    lines.push(`      ${JSON.stringify(aliasKey)}: ${targetExpression},`);
  }
  return lines.join("\n");
};

const renderViteConfigSource = (features: DetectedProjectFeatures): string => {
  const plugin = reactPluginImportFor(features.framework);
  const aliasBlock = renderAliasEntries(features);
  const aliasSection = aliasBlock
    ? `    alias: {\n${aliasBlock}\n    },\n    dedupe: ["react", "react-dom"],`
    : `    dedupe: ["react", "react-dom"],`;
  const nextNavigationAlias = features.isNext
    ? `\n      "next/navigation": resolve(projectRoot, ".openstory/next-navigation-mock.tsx"),`
    : "";
  const aliasSectionWithNext =
    features.isNext && aliasBlock
      ? aliasSection.replace(/(\s+)},\n    dedupe/, `${nextNavigationAlias}$1},\n    dedupe`)
      : aliasSection;

  return `import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
${plugin.importLine}
import { openstory } from "openstory/plugin";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
${aliasSectionWithNext}
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client"],
  },
  plugins: [${plugin.pluginCall}, openstory({ framework: "${features.framework}" })],
});
`;
};

const renderPreviewSource = (features: DetectedProjectFeatures): string => {
  const lines: string[] = [];
  lines.push(`import type { Preview } from "openstory/${features.framework}";`);
  const decoratorImports: string[] = [];
  const decoratorWrappers: string[] = [];

  if (
    (features.framework === "react" || features.framework === "solid") &&
    (features.hasReactQuery || features.hasRadixTooltip || features.hasShadcnSidebar)
  ) {
    decoratorImports.push(`import type { ReactNode } from "react";`);
  }
  if (features.hasReactQuery) {
    decoratorImports.push(
      `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";`,
    );
  }
  if (features.hasRadixTooltip) {
    decoratorImports.push(`import { TooltipProvider } from "@radix-ui/react-tooltip";`);
  }
  if (features.hasShadcnSidebar) {
    decoratorImports.push(`import { SidebarProvider } from "@/components/ui/sidebar";`);
  }

  lines.push(...decoratorImports);
  if (features.globalsCssRelativePath) {
    const cssAlias = features.pathAliases.some((mapping) => mapping.prefix === "@/")
      ? `@/${features.globalsCssRelativePath.replace(/^src\//, "")}`
      : `./${features.globalsCssRelativePath}`;
    lines.push("");
    lines.push(`import ${JSON.stringify(cssAlias)};`);
  }

  if (features.isNext) {
    lines.push("");
    lines.push(`if (typeof window !== "undefined") {`);
    lines.push(`  const browserGlobal = window as unknown as {`);
    lines.push(`    process?: { env?: Record<string, string> };`);
    lines.push(`    require?: unknown;`);
    lines.push(`  };`);
    lines.push(`  if (!browserGlobal.process) {`);
    lines.push(`    browserGlobal.process = { env: { NODE_ENV: "development" } };`);
    lines.push(`  } else if (!browserGlobal.process.env) {`);
    lines.push(`    browserGlobal.process.env = { NODE_ENV: "development" };`);
    lines.push(`  }`);
    lines.push(`  if (!browserGlobal.require) {`);
    lines.push(`    browserGlobal.require = (id: unknown) => {`);
    lines.push(
      `      throw new Error(\`openstory: require(\${JSON.stringify(id)}) is not available in the browser\`);`,
    );
    lines.push(`    };`);
    lines.push(`  }`);
    lines.push(`}`);
  }

  if (features.hasReactQuery) {
    decoratorWrappers.push("QueryClientProvider");
  }
  if (features.hasRadixTooltip) {
    decoratorWrappers.push("TooltipProvider");
  }
  if (features.hasShadcnSidebar) {
    decoratorWrappers.push("SidebarProvider");
  }

  if (features.hasReactQuery) {
    lines.push("");
    lines.push(`const queryClient = new QueryClient({`);
    lines.push(`  defaultOptions: {`);
    lines.push(`    queries: { retry: false, staleTime: Infinity },`);
    lines.push(`    mutations: { retry: false },`);
    lines.push(`  },`);
    lines.push(`});`);
  }

  lines.push("");
  if (decoratorWrappers.length > 0) {
    const opens: string[] = [];
    const closes: string[] = [];
    if (features.hasReactQuery) {
      opens.push(`<QueryClientProvider client={queryClient}>`);
      closes.unshift(`</QueryClientProvider>`);
    }
    if (features.hasRadixTooltip) {
      opens.push(`<TooltipProvider>`);
      closes.unshift(`</TooltipProvider>`);
    }
    if (features.hasShadcnSidebar) {
      opens.push(`<SidebarProvider>`);
      closes.unshift(`</SidebarProvider>`);
    }
    lines.push(`const withProviders = (storyFn: () => ReactNode): ReactNode => (`);
    lines.push(`  ${opens.join("")}`);
    lines.push(`    {storyFn()}`);
    lines.push(`  ${closes.join("")}`);
    lines.push(`);`);
    lines.push("");
  }

  lines.push(`const preview: Preview = {`);
  lines.push(`  parameters: { layout: "padded" },`);
  if (decoratorWrappers.length > 0) {
    lines.push(`  decorators: [withProviders],`);
  } else {
    lines.push(`  decorators: [],`);
  }
  lines.push(`};`);
  lines.push("");
  lines.push(`export default preview;`);
  lines.push("");
  return lines.join("\n");
};

const renderNextNavigationMockSource = (): string =>
  `export const useRouter = () => ({
  push: () => Promise.resolve(true),
  replace: () => Promise.resolve(true),
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => Promise.resolve(),
});

export const usePathname = () => "/";

class OpenstoryReadonlySearchParams {
  get() {
    return null;
  }
  getAll() {
    return [];
  }
  has() {
    return false;
  }
  keys() {
    return [][Symbol.iterator]();
  }
  values() {
    return [][Symbol.iterator]();
  }
  entries() {
    return [][Symbol.iterator]();
  }
  forEach() {}
  toString() {
    return "";
  }
  [Symbol.iterator]() {
    return [][Symbol.iterator]();
  }
}

const readonlySearchParams = new OpenstoryReadonlySearchParams();
export const useSearchParams = () => readonlySearchParams;
export const useParams = () => ({});
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];

export const redirect = () => {
  throw new Error("openstory: redirect() called inside a story");
};

export const notFound = () => {
  throw new Error("openstory: notFound() called inside a story");
};
`;

const writeIfNotExists = async (
  absolutePath: string,
  contents: string,
  force: boolean,
): Promise<SetupFileWrite> => {
  if (!force && (await fileExists(absolutePath))) {
    return { path: absolutePath, action: "skipped-exists" };
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
  return { path: absolutePath, action: "written" };
};

export const writeSetupFiles = async (
  options: WriteSetupFilesOptions,
): Promise<SetupFileWrite[]> => {
  const writes: SetupFileWrite[] = [];
  const projectRoot = isAbsolute(options.projectRoot)
    ? options.projectRoot
    : resolve(options.projectRoot);

  const viteConfigPath = join(projectRoot, "vite.config.ts");
  writes.push(
    await writeIfNotExists(viteConfigPath, renderViteConfigSource(options.features), options.force),
  );

  const previewPath = join(projectRoot, previewFilename(options.features.framework));
  writes.push(
    await writeIfNotExists(previewPath, renderPreviewSource(options.features), options.force),
  );

  if (options.features.isNext) {
    const mockPath = join(projectRoot, ".openstory/next-navigation-mock.tsx");
    writes.push(await writeIfNotExists(mockPath, renderNextNavigationMockSource(), options.force));
  }

  return writes;
};
