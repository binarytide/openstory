import type { OpenstoryComponentsOption } from "../plugin/index.js";
import type { Framework } from "../types.js";
import { buildInlineViteConfig } from "../utils/build-inline-vite-config.js";

export interface DevOptions {
  port: number;
  host: string;
  open: boolean;
  framework?: Framework;
  components?: boolean | OpenstoryComponentsOption;
}

export const runDev = async (options: DevOptions): Promise<void> => {
  const { config } = await buildInlineViteConfig({
    projectRoot: process.cwd(),
    framework: options.framework,
    components: options.components,
  });

  const { createServer } = await import("vite");
  const server = await createServer({
    ...config,
    server: {
      port: options.port,
      host: options.host,
      open: options.open,
    },
  });
  await server.listen();
  server.printUrls();
};
