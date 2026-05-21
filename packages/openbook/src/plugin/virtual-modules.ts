import {
  OPENBOOK_DEFAULT_LAYOUT,
  OPENBOOK_FRAMEWORK_TO_ADAPTER,
  OPENBOOK_LAYOUT_CLASSES,
  OPENBOOK_ROOT_ELEMENT_ID,
  VIRTUAL_NULL_PREFIX,
  VIRTUAL_STORY_ENTRY_ID,
} from "../constants.js";
import type { Framework, ManifestStory } from "../types.js";
import { escapeAttribute } from "../utils/escape-attribute.js";
import { toFsId } from "../utils/to-fs-id.js";

export interface RenderStoryIframeHtmlOptions {
  story: ManifestStory;
  previewParameters?: Record<string, unknown>;
  base?: string;
}

export interface SynthesizeEntryOptions {
  story: ManifestStory;
  framework: Framework;
  previewPath: string | undefined;
  storyAbsolutePath: string;
}

export const isStoryEntryId = (id: string): boolean => id.startsWith(VIRTUAL_STORY_ENTRY_ID);

export const resolveStoryEntryId = (id: string): string => `${VIRTUAL_NULL_PREFIX}${id}`;

export const parseStoryEntryParams = (id: string): { storyId: string } | undefined => {
  const cleaned = id.startsWith(VIRTUAL_NULL_PREFIX) ? id.slice(VIRTUAL_NULL_PREFIX.length) : id;
  if (!cleaned.startsWith(VIRTUAL_STORY_ENTRY_ID)) return undefined;
  const queryIndex = cleaned.indexOf("?");
  if (queryIndex === -1) return undefined;
  const storyId = new URLSearchParams(cleaned.slice(queryIndex + 1)).get("id");
  return storyId ? { storyId } : undefined;
};

const pickLayout = (parameters: Record<string, unknown> | undefined): string | undefined => {
  if (!parameters) return undefined;
  const layout = parameters["layout"];
  return typeof layout === "string" ? layout : undefined;
};

export const renderStoryIframeHtml = (options: RenderStoryIframeHtmlOptions): string => {
  const { story, previewParameters } = options;
  const layout =
    pickLayout(story.parameters) ?? pickLayout(previewParameters) ?? OPENBOOK_DEFAULT_LAYOUT;
  const bodyClassName =
    OPENBOOK_LAYOUT_CLASSES[layout] ?? OPENBOOK_LAYOUT_CLASSES[OPENBOOK_DEFAULT_LAYOUT];
  const escapedStoryId = escapeAttribute(story.id);
  const virtualImportSpecifier = `${VIRTUAL_STORY_ENTRY_ID}?id=${encodeURIComponent(story.id)}`;
  const initialStoryGlobal = JSON.stringify({
    id: story.id,
    name: story.name,
    title: story.title,
    exportName: story.exportName,
    importPath: story.importPath,
  });

  return `<!doctype html>
<html lang="en" data-openbook-story="${escapedStoryId}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedStoryId} · Openbook</title>
  <style>
    html, body { margin: 0; padding: 0; min-height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body.openbook-layout-centered  { display: grid; place-items: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
    body.openbook-layout-fullscreen #${OPENBOOK_ROOT_ELEMENT_ID} { min-height: 100vh; }
    body.openbook-layout-padded    #${OPENBOOK_ROOT_ELEMENT_ID} { padding: 16px; }
  </style>
  <script>window.__OPENBOOK_STORY__ = ${initialStoryGlobal};</script>
</head>
<body class="${bodyClassName}">
  <div id="${OPENBOOK_ROOT_ELEMENT_ID}"></div>
  <script type="module">import ${JSON.stringify(virtualImportSpecifier)};</script>
</body>
</html>
`;
};

export const synthesizeStoryEntry = (options: SynthesizeEntryOptions): string => {
  const { story, framework, previewPath, storyAbsolutePath } = options;
  const adapterSpecifier = OPENBOOK_FRAMEWORK_TO_ADAPTER[framework];
  const previewImport = previewPath
    ? `import preview from ${JSON.stringify(toFsId(previewPath))};`
    : "const preview = undefined;";

  return `import { renderer } from ${JSON.stringify(adapterSpecifier)};
import { boot } from "openbook/boot";
${previewImport}
import * as storyModule from ${JSON.stringify(toFsId(storyAbsolutePath))};

boot({
  id: ${JSON.stringify(story.id)},
  exportName: ${JSON.stringify(story.exportName)},
  renderer,
  preview,
  storyModule,
});

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot.invalidate();
  });
}
`;
};
