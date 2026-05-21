export const OPENBOOK_VERSION = "0.0.1";

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
  "**/openbook-static/**",
];

export const PREVIEW_FILE_LOCATIONS = ["preview", "src/preview"];
export const PREVIEW_FILE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

export const STORY_PATH_PREFIX = "/__story/";
export const MANIFEST_PATH = "/__openbook/manifest.json";

export const VIRTUAL_STORY_ENTRY_ID = "virtual:openbook-story-entry";
export const VIRTUAL_NULL_PREFIX = "\0";

export const VITE_INTERNAL_QUERY_RE =
  /[?&](?:html-proxy|import|t=|raw|url|inline|worker|sharedworker)/;

export const OPENBOOK_ROOT_ELEMENT_ID = "openbook-root";
export const OPENBOOK_LAYOUT_CLASSES: Record<string, string> = {
  centered: "openbook-layout-centered",
  fullscreen: "openbook-layout-fullscreen",
  padded: "openbook-layout-padded",
};
export const OPENBOOK_DEFAULT_LAYOUT = "padded";

export const URL_KV_PAIR_SEPARATOR = ";";
export const URL_KV_KEY_VALUE_SEPARATOR = ":";

export const OPENBOOK_FRAMEWORK_TO_ADAPTER: Record<string, string> = {
  react: "openbook/react",
  solid: "openbook/solid",
  vue: "openbook/vue",
  svelte: "openbook/svelte",
};

export const PARENT_MESSAGE_SOURCE = "openbook";
export const SHELL_MESSAGE_SOURCE = "openbook-shell";
