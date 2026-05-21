import { describe, expect, it } from "vitest";
import { renderer } from "../../src/solid/renderer.js";
import { exerciseRenderer } from "./test-utils.js";

interface ButtonArgs {
  label: string;
}

describe("solid renderer", () => {
  it("mounts, updates, and unmounts a component across the args lifecycle", async () => {
    const result = await exerciseRenderer(renderer, {
      render: (args: ButtonArgs) => {
        const button = document.createElement("button");
        button.dataset["testid"] = "solid-button";
        button.textContent = args.label;
        return button;
      },
      initialArgs: { label: "hello-solid" },
      updatedArgs: { label: "goodbye-solid" },
    });
    expect(result.initialText).toContain("hello-solid");
    expect(result.updatedText).toContain("goodbye-solid");
  });
});
