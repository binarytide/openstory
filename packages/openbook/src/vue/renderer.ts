import { OpenbookAdapterMissingFrameworkError } from "../errors.js";
import type { OpenbookRenderer, RendererMountOpts, RendererUpdateOpts } from "../types.js";

interface VueRuntime {
  createApp: (root: unknown) => {
    mount: (container: HTMLElement) => unknown;
    unmount: () => void;
  };
}

interface VueMounted {
  app: ReturnType<VueRuntime["createApp"]> | undefined;
  container: HTMLElement;
}

let cachedVueRuntime: VueRuntime | undefined;

const ensureVue = async (): Promise<VueRuntime> => {
  if (cachedVueRuntime) return cachedVueRuntime;
  try {
    cachedVueRuntime = (await import("vue")) as unknown as VueRuntime;
    return cachedVueRuntime;
  } catch {
    throw new OpenbookAdapterMissingFrameworkError("vue", "vue");
  }
};

const mountInto = (
  runtime: VueRuntime,
  options: RendererMountOpts<unknown> | (RendererUpdateOpts<unknown> & { container: HTMLElement }),
  container: HTMLElement,
): ReturnType<VueRuntime["createApp"]> => {
  const rootComponent = {
    setup: () => () => options.render(options.args, options.context),
  };
  const app = runtime.createApp(rootComponent);
  app.mount(container);
  return app;
};

export const renderer: OpenbookRenderer<unknown, VueMounted> = {
  mount: (options) => {
    const mounted: VueMounted = { app: undefined, container: options.container };
    void (async () => {
      const runtime = await ensureVue();
      mounted.app = mountInto(runtime, options, options.container);
    })();
    return mounted;
  },
  update: (mounted, options) => {
    void (async () => {
      const runtime = await ensureVue();
      mounted.app?.unmount();
      mounted.app = mountInto(
        runtime,
        { ...options, container: mounted.container },
        mounted.container,
      );
    })();
  },
  unmount: (mounted) => {
    mounted.app?.unmount();
  },
};
