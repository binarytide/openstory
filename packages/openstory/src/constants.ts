export const OPENSTORY_VERSION = "0.0.1";

export const DEFAULT_DEV_PORT = 6006;

export const DEFAULT_STORY_GLOBS = ["**/*.stories.{ts,tsx,js,jsx}"];

export const DEFAULT_IGNORE_GLOBS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/test-results/**",
  "**/storybook-static/**",
  "**/openstory-static/**",
];

export const DEFAULT_COMPONENT_GLOBS_BY_FRAMEWORK: Record<string, string[]> = {
  react: ["**/*.{tsx,jsx}"],
  solid: ["**/*.{tsx,jsx}"],
  vue: ["**/*.vue"],
  svelte: ["**/*.svelte"],
};

export const AUTO_IGNORE_GLOBS = [
  "**/*.stories.{ts,tsx,js,jsx}",
  "**/*.test.{ts,tsx,js,jsx}",
  "**/*.spec.{ts,tsx,js,jsx}",
  "**/preview.{ts,tsx,js,jsx}",
  "**/vite.config.{ts,js,mts,mjs}",
  "**/vitest.config.{ts,js,mts,mjs}",
];

export const PREVIEW_FILE_LOCATIONS = ["preview", "src/preview"];
export const PREVIEW_FILE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

export const STORY_PATH_PREFIX = "/__story/";
export const MANIFEST_PATH = "/__openstory/manifest.json";

export const VIRTUAL_STORY_ENTRY_ID = "virtual:openstory-story-entry";
export const VIRTUAL_NULL_PREFIX = "\0";

export const VITE_INTERNAL_QUERY_RE =
  /[?&](?:html-proxy|import|t=|raw|url|inline|worker|sharedworker)/;

export const OPENSTORY_ROOT_ELEMENT_ID = "openstory-root";
export const OPENSTORY_LAYOUT_CLASSES: Record<string, string> = {
  centered: "openstory-layout-centered",
  fullscreen: "openstory-layout-fullscreen",
  padded: "openstory-layout-padded",
};
export const OPENSTORY_DEFAULT_LAYOUT = "padded";

export const URL_KV_PAIR_SEPARATOR = ";";
export const URL_KV_KEY_VALUE_SEPARATOR = ":";

export const OPENSTORY_FRAMEWORK_TO_ADAPTER: Record<string, string> = {
  react: "openstory/react",
  solid: "openstory/solid",
  vue: "openstory/vue",
  svelte: "openstory/svelte",
};

export const PARENT_MESSAGE_SOURCE = "openstory";
export const SHELL_MESSAGE_SOURCE = "openstory-shell";
