import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export interface PreviewOptions {
  port: number;
  outDir: string;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const mimeForPath = (path: string): string => {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return "application/octet-stream";
  return MIME_TYPES[path.slice(lastDot)] ?? "application/octet-stream";
};

export const runPreview = async (
  projectRoot: string,
  options: PreviewOptions,
): Promise<void> => {
  const absoluteOutDir = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(projectRoot, options.outDir);

  const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    let relativePath = url === "/" ? "index.html" : url.replace(/^\//, "");
    const candidate = join(absoluteOutDir, relativePath);
    try {
      const stats = await stat(candidate);
      const filePath = stats.isDirectory()
        ? join(candidate, "index.html")
        : candidate;
      const fileStats = stats.isDirectory() ? await stat(filePath) : stats;
      if (!fileStats.isFile()) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }
      res.setHeader("content-type", mimeForPath(filePath));
      res.statusCode = 200;
      createReadStream(filePath).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });

  await new Promise<void>((resolveListen) => {
    server.listen(options.port, "127.0.0.1", () => resolveListen());
  });
  process.stdout.write(
    `ode preview: serving ${absoluteOutDir} on http://127.0.0.1:${options.port}\n`,
  );
};
