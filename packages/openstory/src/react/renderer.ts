import { OpenstoryAdapterMissingFrameworkError } from "../errors.js";
import type { OpenstoryRenderer } from "../types.js";

interface ReactDomClient {
  createRoot: (container: HTMLElement) => {
    render: (vnode: unknown) => void;
    unmount: () => void;
  };
}

interface ReactMounted {
  dispose: () => void;
  rerender: (vnode: unknown) => void;
}

let cachedReactDomClient: ReactDomClient | undefined;

const ensureReactDom = async (): Promise<ReactDomClient> => {
  if (cachedReactDomClient) return cachedReactDomClient;
  try {
    cachedReactDomClient = (await import("react-dom/client")) as unknown as ReactDomClient;
    return cachedReactDomClient;
  } catch {
    throw new OpenstoryAdapterMissingFrameworkError("react", "react react-dom");
  }
};

export const renderer: OpenstoryRenderer<unknown, ReactMounted> = {
  mount: ({ container, render, args, context }) => {
    let reactRoot: ReturnType<ReactDomClient["createRoot"]> | undefined;
    const mounted: ReactMounted = {
      dispose: () => reactRoot?.unmount(),
      rerender: (vnode) => reactRoot?.render(vnode),
    };
    void (async () => {
      const { createRoot } = await ensureReactDom();
      reactRoot = createRoot(container);
      reactRoot.render(render(args, context));
      mounted.dispose = () => reactRoot?.unmount();
      mounted.rerender = (vnode) => reactRoot?.render(vnode);
    })();
    return mounted;
  },
  update: (mounted, options) => {
    mounted.rerender(options.render(options.args, options.context));
  },
  unmount: (mounted) => {
    mounted.dispose();
  },
};
