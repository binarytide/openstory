import "@testing-library/jest-dom/vitest";

export { expect, vi } from "vitest";
export {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/dom";
export { userEvent } from "@testing-library/user-event";

export { step } from "./step.js";
