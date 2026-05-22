import { Component, createElement, type ElementType, type ErrorInfo, type ReactNode } from "react";
import { OpenstoryAdapterMissingFrameworkError } from "../errors.js";
import type { OpenstoryRenderer, StoryContext } from "../types.js";

interface StoryErrorBoundaryProps {
  resetKey: number;
  children: ReactNode;
}

interface StoryErrorBoundaryState {
  caughtError: Error | undefined;
}

class StoryErrorBoundary extends Component<StoryErrorBoundaryProps, StoryErrorBoundaryState> {
  override state: StoryErrorBoundaryState = { caughtError: undefined };

  static getDerivedStateFromError(caughtError: Error): StoryErrorBoundaryState {
    return { caughtError };
  }

  override componentDidCatch(caughtError: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error("openstory: story crashed during render", caughtError, info);
    }
  }

  override componentDidUpdate(previousProps: StoryErrorBoundaryProps): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.caughtError) {
      this.setState({ caughtError: undefined });
    }
  }

  override render(): ReactNode {
    const { caughtError } = this.state;
    if (!caughtError) return this.props.children;
    return createElement(
      "pre",
      {
        style: {
          margin: 0,
          padding: 16,
          font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          color: "#b91c1c",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          overflow: "auto",
        },
      },
      `openstory: story crashed during render\n\n${caughtError.message}\n\n${caughtError.stack ?? ""}`,
    );
  }
}

interface ReactDomClient {
  createRoot: (container: HTMLElement) => {
    render: (vnode: unknown) => void;
    unmount: () => void;
  };
}

interface ReactMounted {
  dispose: () => void;
  rerender: (props: unknown) => void;
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

interface StoryRenderHostProps {
  render: (args: unknown, context: StoryContext<unknown>) => unknown;
  args: unknown;
  context: StoryContext<unknown>;
}

const StoryRenderHost = ({ render, args, context }: StoryRenderHostProps): ReactNode =>
  render(args, context) as ReactNode;

let resetKeyCounter = 0;

const wrapStory = (props: StoryRenderHostProps): ReactNode =>
  createElement(StoryErrorBoundary, {
    resetKey: ++resetKeyCounter,
    children: createElement(StoryRenderHost, props),
  });

export const renderer: OpenstoryRenderer<unknown, ReactMounted> = {
  defaultRender,
  mount: ({ container, render, args, context }) => {
    let reactRoot: ReturnType<ReactDomClient["createRoot"]> | undefined;
    const mounted: ReactMounted = {
      dispose: () => reactRoot?.unmount(),
      rerender: (props) => reactRoot?.render(wrapStory(props as StoryRenderHostProps)),
    };
    void (async () => {
      const { createRoot } = await ensureReactDom();
      reactRoot = createRoot(container);
      reactRoot.render(wrapStory({ render, args, context }));
    })();
    return mounted;
  },
  update: (mounted, options) => {
    mounted.rerender({
      render: options.render,
      args: options.args,
      context: options.context,
    });
  },
  unmount: (mounted) => {
    mounted.dispose();
  },
};
