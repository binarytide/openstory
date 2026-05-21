import { render } from "solid-js/web";
import type {
  OdeRenderer,
  RendererMountOpts,
  RendererUpdateOpts,
} from "../types.js";

interface SolidMounted {
  dispose: () => void;
  container: HTMLElement;
}

const renderInto = (
  options: RendererMountOpts<unknown> | (RendererUpdateOpts<unknown> & { container: HTMLElement }),
  container: HTMLElement,
): (() => void) =>
  render(
    () => options.render(options.args, options.context) as unknown as Element,
    container,
  );

export const renderer: OdeRenderer<unknown, SolidMounted> = {
  mount: (options) => {
    const dispose = renderInto(options, options.container);
    return { dispose, container: options.container };
  },
  update: (mounted, options) => {
    mounted.dispose();
    mounted.dispose = renderInto(
      { ...options, container: mounted.container },
      mounted.container,
    );
  },
  unmount: (mounted) => {
    mounted.dispose();
  },
};
