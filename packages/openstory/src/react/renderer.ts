import { createElement, type ElementType } from "react";
import { OpenstoryAdapterMissingFrameworkError } from "../errors.js";
import type { OpenstoryRenderer, StoryContext } from "../types.js";

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

const isPropsObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const defaultRender =
  (component: unknown) =>
  (args: unknown, _context: StoryContext<unknown>): unknown => {
    const componentProps = isPropsObject(args) ? args : {};
    return createElement(component as ElementType, componentProps as Record<string, unknown>);
  };

export const renderer: OpenstoryRenderer<unknown, ReactMounted> = {
  defaultRender,
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
