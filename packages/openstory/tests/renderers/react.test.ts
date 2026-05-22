import { createElement, useState } from "react";
import { describe, expect, it } from "vitest";
import { renderer } from "../../src/react/renderer.js";
import { buildContext, exerciseRenderer, waitForText } from "./test-utils.js";

interface ButtonArgs {
  label: string;
}

const Button = (props: ButtonArgs) =>
  createElement("button", { "data-testid": "react-button" }, props.label);

describe("react renderer", () => {
  it("mounts, updates, and unmounts a component across the args lifecycle", async () => {
    const result = await exerciseRenderer(renderer, {
      render: (args: ButtonArgs) => createElement(Button, args),
      initialArgs: { label: "hello-react" },
      updatedArgs: { label: "goodbye-react" },
    });
    expect(result.initialText).toContain("hello-react");
    expect(result.updatedText).toContain("goodbye-react");
  });

  it("supports hooks called directly inside the render function", async () => {
    const renderWithHooks = (args: ButtonArgs) => {
      const [counter] = useState(7);
      return createElement("span", { "data-testid": "hook-output" }, `${args.label}-${counter}`);
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const mounted = renderer.mount({
        container,
        render: renderWithHooks as never,
        args: { label: "with-hook" },
        context: buildContext(container, { label: "with-hook" }),
      });
      await waitForText(container, "with-hook-7");
      expect(container.textContent).toContain("with-hook-7");
      renderer.unmount(mounted);
    } finally {
      container.remove();
    }
  });

  it("preserves hook state across args updates", async () => {
    const renderWithStableHook = (args: ButtonArgs) => {
      const [initialLabelSnapshot] = useState(args.label);
      return createElement(
        "span",
        { "data-testid": "snapshot-output" },
        `current=${args.label}|first=${initialLabelSnapshot}`,
      );
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const mounted = renderer.mount({
        container,
        render: renderWithStableHook as never,
        args: { label: "first-args" },
        context: buildContext(container, { label: "first-args" }),
      });
      await waitForText(container, "current=first-args|first=first-args");
      renderer.update(mounted, {
        render: renderWithStableHook as never,
        args: { label: "second-args" },
        context: buildContext(container, { label: "second-args" }),
      });
      await waitForText(container, "current=second-args|first=first-args");
      renderer.unmount(mounted);
    } finally {
      container.remove();
    }
  });

  it("ignores update calls made before the async react-dom/client import resolves", async () => {
    const renderLabel = (args: ButtonArgs) =>
      createElement("span", { "data-testid": "race-output" }, args.label);
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const mounted = renderer.mount({
        container,
        render: renderLabel as never,
        args: { label: "initial-args" },
        context: buildContext(container, { label: "initial-args" }),
      });
      renderer.update(mounted, {
        render: renderLabel as never,
        args: { label: "updated-args-before-mount-resolved" },
        context: buildContext(container, { label: "updated-args-before-mount-resolved" }),
      });
      await waitForText(container, "updated-args-before-mount-resolved");
      expect(container.textContent).toContain("updated-args-before-mount-resolved");
      renderer.unmount(mounted);
    } finally {
      container.remove();
    }
  });
});
