import { openstory } from "../plugin/index.js";

export interface DevOptions {
  port: number;
  host: string;
  open: boolean;
}

export const runDev = async (options: DevOptions): Promise<void> => {
  const { createServer } = await import("vite");
  const server = await createServer({
    server: {
      port: options.port,
      host: options.host,
      open: options.open,
    },
    plugins: [openstory()],
  });
  await server.listen();
  server.printUrls();
};
