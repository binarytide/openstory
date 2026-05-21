import { openstory, type OpenstoryComponentsOption } from "../plugin/index.js";
import type { Framework } from "../types.js";

export interface DevOptions {
  port: number;
  host: string;
  open: boolean;
  framework?: Framework;
  components?: boolean | OpenstoryComponentsOption;
}

export const runDev = async (options: DevOptions): Promise<void> => {
  const { createServer } = await import("vite");
  const server = await createServer({
    server: {
      port: options.port,
      host: options.host,
      open: options.open,
    },
    plugins: [openstory({ framework: options.framework, components: options.components })],
  });
  await server.listen();
  server.printUrls();
};
