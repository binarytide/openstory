import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin, ViteDevServer } from "vite";

import {
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_STORY_GLOBS,
  MANIFEST_PATH,
  STORY_PATH_PREFIX,
  VITE_INTERNAL_QUERY_RE,
} from "../constants.js";
import { OpenbookStoryNotFoundError } from "../errors.js";
import type { Framework, Manifest, ManifestStory } from "../types.js";

import { detectFramework } from "./framework-detection.js";
import { ManifestBuilder } from "./manifest.js";
import { findPreviewFile } from "./preview-discovery.js";
import {
  isStoryEntryId,
  parseStoryEntryParams,
  renderStoryIframeHtml,
  resolveStoryEntryId,
  synthesizeStoryEntry,
} from "./virtual-modules.js";

export interface OpenbookUiOptions {
  title?: string;
  theme?: "dark" | "light" | "system";
}

export interface OpenbookOptions {
  stories?: string | string[];
  ignore?: string[];
  framework?: Framework;
  preview?: string;
  ui?: OpenbookUiOptions;
  port?: number;
}

export const defineOpenbook = (options: OpenbookOptions): OpenbookOptions => options;

const SHELL_DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "shell");

const SHELL_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const mimeForPath = (path: string): string => {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return "application/octet-stream";
  return SHELL_MIME_TYPES[path.slice(lastDot)] ?? "application/octet-stream";
};

const extractStringProperty = (value: unknown, propertyName: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[propertyName];
  return typeof candidate === "string" ? candidate : undefined;
};

const sendErrorResponse = (response: ServerResponse, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = extractStringProperty(error, "code") ?? "Error";
  const docsUrl = extractStringProperty(error, "docsUrl");

  response.setHeader("content-type", "application/json; charset=utf-8");
  response.statusCode = 500;
  response.end(JSON.stringify({ error: errorCode, message, docsUrl }));
};

const normalizeStories = (stories: OpenbookOptions["stories"]): string[] => {
  if (!stories) return DEFAULT_STORY_GLOBS;
  return Array.isArray(stories) ? stories : [stories];
};

const resolvePathOption = (projectRoot: string, value: string): string =>
  isAbsolute(value) ? value : resolve(projectRoot, value);

const isShellAssetUrl = (pathOnly: string): boolean =>
  pathOnly === "/" || pathOnly === "/index.html" || pathOnly.startsWith("/assets/");

const isViteInternalUrl = (url: string): boolean =>
  url.startsWith(STORY_PATH_PREFIX) ||
  url.startsWith(MANIFEST_PATH) ||
  url.startsWith("/@") ||
  url.startsWith("/__vite") ||
  url.startsWith("/__openbook/");

const writeShellAsset = async (
  request: IncomingMessage,
  response: ServerResponse,
  absolutePath: string,
): Promise<boolean> => {
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) return false;
    response.setHeader("content-type", mimeForPath(absolutePath));
    response.setHeader("cache-control", "no-cache");
    response.statusCode = 200;
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    createReadStream(absolutePath).pipe(response);
    return true;
  } catch {
    return false;
  }
};

const createShellMiddleware = (): Connect.NextHandleFunction => async (req, res, next) => {
  const url = req.url ?? "";
  if (isViteInternalUrl(url)) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const pathOnly = url.split("?")[0] ?? "/";
  if (!isShellAssetUrl(pathOnly)) return next();

  const relativePath = pathOnly === "/" ? "index.html" : pathOnly.replace(/^\//, "");
  const absolutePath = join(SHELL_DIST_DIR, relativePath);
  const handled = await writeShellAsset(req, res, absolutePath);
  if (!handled) return next();
};

const createManifestMiddleware =
  (getManifest: () => Promise<Manifest>): Connect.NextHandleFunction =>
  async (req, res, next) => {
    if (req.method !== "GET") return next();
    try {
      const manifest = await getManifest();
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.statusCode = 200;
      res.end(JSON.stringify(manifest, null, 2));
    } catch (error) {
      sendErrorResponse(res, error);
    }
  };

const parseStoryIdFromUrl = (url: string): string => {
  const queryIndex = url.indexOf("?");
  const idSegment = url.slice(
    STORY_PATH_PREFIX.length,
    queryIndex === -1 ? url.length : queryIndex,
  );
  return decodeURIComponent(idSegment).replace(/\/$/, "");
};

const createStoryMiddleware =
  (
    getSnapshot: () => Promise<ManifestSnapshot>,
    server: ViteDevServer,
  ): Connect.NextHandleFunction =>
  async (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith(STORY_PATH_PREFIX)) return next();
    if (req.method !== "GET") return next();
    if (VITE_INTERNAL_QUERY_RE.test(url)) return next();

    const storyId = parseStoryIdFromUrl(url);

    try {
      const { manifest, storiesById } = await getSnapshot();
      const story = storiesById.get(storyId);
      if (!story) {
        throw new OpenbookStoryNotFoundError(storyId, [...storiesById.keys()]);
      }
      const rawHtml = renderStoryIframeHtml({
        story,
        previewParameters: manifest.parameters,
      });
      const html = await server.transformIndexHtml(url, rawHtml, req.originalUrl);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.statusCode = 200;
      res.end(html);
    } catch (error) {
      sendErrorResponse(res, error);
    }
  };

interface ManifestSnapshot {
  manifest: Manifest;
  storiesById: Map<string, ManifestStory>;
}

const indexStoriesById = (manifest: Manifest): Map<string, ManifestStory> => {
  const result = new Map<string, ManifestStory>();
  for (const story of manifest.stories) result.set(story.id, story);
  return result;
};

export const openbook = (userOptions: OpenbookOptions = {}): Plugin => {
  const storyGlobs = normalizeStories(userOptions.stories);
  const ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...(userOptions.ignore ?? [])];

  let projectRoot = process.cwd();
  let framework: Framework = "react";
  let previewPath: string | undefined;
  let builder: ManifestBuilder;
  let snapshotPromise: Promise<ManifestSnapshot> | undefined;

  const invalidateManifest = (absolutePath?: string): void => {
    builder?.invalidate(absolutePath);
    snapshotPromise = undefined;
  };

  const getSnapshot = (): Promise<ManifestSnapshot> => {
    if (!snapshotPromise) {
      snapshotPromise = builder.build().then((manifest) => ({
        manifest,
        storiesById: indexStoriesById(manifest),
      }));
    }
    return snapshotPromise;
  };

  const getManifest = async (): Promise<Manifest> => (await getSnapshot()).manifest;

  const resolveStoryAbsolutePath = async (story: ManifestStory): Promise<string> =>
    isAbsolute(story.importPath) ? story.importPath : resolve(projectRoot, story.importPath);

  return {
    name: "openbook",
    enforce: "pre",

    configResolved: async (resolved) => {
      projectRoot = resolved.root;
      framework = userOptions.framework ?? (await detectFramework(projectRoot));
      previewPath = userOptions.preview
        ? resolvePathOption(projectRoot, userOptions.preview)
        : await findPreviewFile(projectRoot);

      builder = new ManifestBuilder({
        projectRoot,
        stories: storyGlobs,
        ignore: ignoreGlobs,
        framework,
        previewPath,
      });
    },

    configureServer: (server) => {
      builder.attachDevServer(server);

      server.watcher.on("add", (path) => invalidateManifest(path));
      server.watcher.on("unlink", (path) => invalidateManifest(path));

      server.middlewares.use(createShellMiddleware());
      server.middlewares.use(MANIFEST_PATH, createManifestMiddleware(getManifest));
      server.middlewares.use(createStoryMiddleware(getSnapshot, server));
    },

    handleHotUpdate: (ctx) => {
      if (/\.stories\.[tj]sx?$/.test(ctx.file)) {
        invalidateManifest(ctx.file);
      }
      if (previewPath && ctx.file === previewPath) {
        invalidateManifest();
        ctx.server.ws.send({ type: "full-reload", path: "*" });
      }
    },

    resolveId: (id) => (isStoryEntryId(id) ? resolveStoryEntryId(id) : null),

    load: async (id) => {
      const params = parseStoryEntryParams(id);
      if (!params) return null;
      const { storiesById } = await getSnapshot();
      const story = storiesById.get(params.storyId);
      if (!story) {
        throw new OpenbookStoryNotFoundError(params.storyId, [...storiesById.keys()]);
      }
      const storyAbsolutePath = await resolveStoryAbsolutePath(story);
      return synthesizeStoryEntry({
        story,
        framework,
        previewPath,
        storyAbsolutePath,
      });
    },
  };
};
