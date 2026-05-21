import { describe, expect, it } from "vitest";
import SvelteButton from "./fixtures/svelte-button.svelte";
import { renderer } from "../../src/svelte/renderer.js";
import { exerciseRenderer } from "./test-utils.js";

interface ButtonArgs {
  label: string;
}

describe("svelte renderer", () => {
  it("mounts, updates, and unmounts a component across the args lifecycle", async () => {
    const result = await exerciseRenderer(renderer, {
      render: (args: ButtonArgs) => ({ component: SvelteButton, props: { label: args.label } }),
      initialArgs: { label: "hello-svelte" },
      updatedArgs: { label: "goodbye-svelte" },
    });
    expect(result.initialText).toContain("hello-svelte");
    expect(result.updatedText).toContain("goodbye-svelte");
  });
});
