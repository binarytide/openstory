import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { renderer } from "../../src/vue/renderer.js";
import { exerciseRenderer } from "./test-utils.js";

interface ButtonArgs {
  label: string;
}

const Button = defineComponent({
  props: { label: { type: String, required: true } },
  setup: (props) => () => h("button", { "data-testid": "vue-button" }, props.label),
});

describe("vue renderer", () => {
  it("mounts, updates, and unmounts a component across the args lifecycle", async () => {
    const result = await exerciseRenderer(renderer, {
      render: (args: ButtonArgs) => h(Button, args),
      initialArgs: { label: "hello-vue" },
      updatedArgs: { label: "goodbye-vue" },
    });
    expect(result.initialText).toContain("hello-vue");
    expect(result.updatedText).toContain("goodbye-vue");
  });
});
