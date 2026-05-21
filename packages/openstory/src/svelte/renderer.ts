import { OpenstoryAdapterMissingFrameworkError } from "../errors.js";
import type { OpenstoryRenderer, RendererMountOpts, RendererUpdateOpts } from "../types.js";

interface SvelteRuntime {
  mount: (
    component: unknown,
    options: { target: HTMLElement; props?: Record<string, unknown> },
  ) => unknown;
  unmount: (instance: unknown, options?: { outro?: boolean }) => Promise<void> | void;
}

interface SvelteRenderResult {
  component: unknown;
  props?: Record<string, unknown>;
}

interface SvelteMounted {
  instance: unknown;
  container: HTMLElement;
}

let cachedSvelteRuntime: SvelteRuntime | undefined;

const ensureSvelte = async (): Promise<SvelteRuntime> => {
  if (cachedSvelteRuntime) return cachedSvelteRuntime;
  try {
    cachedSvelteRuntime = (await import("svelte")) as unknown as SvelteRuntime;
    return cachedSvelteRuntime;
  } catch {
    throw new OpenstoryAdapterMissingFrameworkError("svelte", "svelte");
  }
};

const isSvelteRenderResult = (value: unknown): value is SvelteRenderResult =>
  typeof value === "object" && value !== null && "component" in value;

const coerceRenderResult = (raw: unknown): SvelteRenderResult => {
  if (isSvelteRenderResult(raw)) return raw;
  return { component: raw };
};

const mountInto = (
  runtime: SvelteRuntime,
  options: RendererMountOpts<unknown> | (RendererUpdateOpts<unknown> & { container: HTMLElement }),
  container: HTMLElement,
): unknown => {
  const result = coerceRenderResult(options.render(options.args, options.context));
  return runtime.mount(result.component, {
    target: container,
    props: result.props,
  });
};

export const renderer: OpenstoryRenderer<unknown, SvelteMounted> = {
  mount: (options) => {
    const mounted: SvelteMounted = { instance: undefined, container: options.container };
    void (async () => {
      const runtime = await ensureSvelte();
      mounted.instance = mountInto(runtime, options, options.container);
    })();
    return mounted;
  },
  update: (mounted, options) => {
    void (async () => {
      const runtime = await ensureSvelte();
      if (mounted.instance !== undefined) {
        await runtime.unmount(mounted.instance, { outro: false });
      }
      mounted.instance = mountInto(
        runtime,
        { ...options, container: mounted.container },
        mounted.container,
      );
    })();
  },
  unmount: (mounted) => {
    if (mounted.instance !== undefined) {
      const runtime = cachedSvelteRuntime;
      if (runtime) void runtime.unmount(mounted.instance, { outro: false });
    }
  },
};
