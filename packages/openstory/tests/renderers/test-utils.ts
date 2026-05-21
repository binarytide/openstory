import { expect } from "vitest";
import type {
  OpenstoryRenderer,
  RendererMountOpts,
  RendererUpdateOpts,
  StoryContext,
} from "../../src/types.js";

export const buildContext = (container: HTMLElement, args: unknown): StoryContext => ({
  id: "test--story",
  name: "Story",
  title: "test",
  args,
  argTypes: {},
  globals: {},
  parameters: {},
  canvasElement: container,
  abortSignal: new AbortController().signal,
  step: async (_name, body) => {
    await body();
  },
  hooks: {},
});

export const flushAsync = async (intervalMs = 5, maxAttempts = 40): Promise<void> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise<void>((resolveFlush) => setTimeout(resolveFlush, intervalMs));
  }
};

export const waitForText = async (
  container: HTMLElement,
  expectedText: string,
  options: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<void> => {
  const intervalMs = options.intervalMs ?? 10;
  const maxAttempts = options.maxAttempts ?? 100;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (container.textContent?.includes(expectedText)) return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  expect.fail(
    `Timed out after ${intervalMs * maxAttempts}ms waiting for text "${expectedText}" in container. Got: "${container.textContent ?? ""}"`,
  );
};

export interface RendererLifecycleResult<TMounted> {
  mounted: TMounted;
  initialText: string;
  updatedText: string;
}

type RenderFn = RendererMountOpts<unknown>["render"] & RendererUpdateOpts<unknown>["render"];

export const exerciseRenderer = async <TArgs extends { label: string }, TMounted>(
  renderer: OpenstoryRenderer<unknown, TMounted>,
  options: {
    render: (args: TArgs) => unknown;
    initialArgs: TArgs;
    updatedArgs: TArgs;
  },
): Promise<RendererLifecycleResult<TMounted>> => {
  const renderForRenderer: RenderFn = (args) => options.render(args as TArgs);
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    const mountContext = buildContext(container, options.initialArgs);
    const mounted = renderer.mount({
      container,
      render: renderForRenderer,
      args: options.initialArgs,
      context: mountContext,
    });
    await waitForText(container, options.initialArgs.label);
    const initialText = container.textContent ?? "";

    const updateContext = buildContext(container, options.updatedArgs);
    renderer.update(mounted, {
      render: renderForRenderer,
      args: options.updatedArgs,
      context: updateContext,
    });
    await waitForText(container, options.updatedArgs.label);
    const updatedText = container.textContent ?? "";

    renderer.unmount(mounted);
    await flushAsync();
    expect(container.textContent ?? "").toBe("");
    return { mounted, initialText, updatedText };
  } finally {
    container.remove();
  }
};
