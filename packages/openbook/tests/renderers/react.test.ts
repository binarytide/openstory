import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderer } from "../../src/react/renderer.js";
import { exerciseRenderer } from "./test-utils.js";

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
});
