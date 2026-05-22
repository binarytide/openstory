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
});
