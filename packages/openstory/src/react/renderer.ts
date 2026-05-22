import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
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

const isPropsObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const coerceRenderResult = (value: unknown, args: unknown): ReactNode => {
  if (typeof value === "function") {
    const componentProps = isPropsObject(args) ? args : {};
    return createElement(value as ComponentType<Record<string, unknown>>, componentProps);
  }
  if (value === null || value === undefined) return null;
  if (isValidElement(value)) return value;
  return value as ReactNode;
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
      reactRoot.render(coerceRenderResult(render(args, context), args));
      mounted.dispose = () => reactRoot?.unmount();
      mounted.rerender = (vnode) => reactRoot?.render(vnode);
    })();
    return mounted;
  },
  update: (mounted, options) => {
    mounted.rerender(
      coerceRenderResult(options.render(options.args, options.context), options.args),
    );
  },
  unmount: (mounted) => {
    mounted.dispose();
  },
};
