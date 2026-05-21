import { OpenbookConfigInvalidOptionsError } from "../errors.js";
import type { ArgType, ConditionalArg } from "../types.js";
import { deepEqual } from "../utils/deep-equal.js";

type Args = Record<string, unknown>;
type Globals = Record<string, unknown>;

const countDefined = (values: unknown[]): number =>
  values.filter((value) => typeof value !== "undefined").length;

export const testValue = (
  condition: Omit<ConditionalArg, "arg" | "global">,
  value: unknown,
): boolean => {
  const { exists, eq, neq, truthy } = condition;
  if (countDefined([exists, eq, neq, truthy]) > 1) {
    throw new OpenbookConfigInvalidOptionsError(
      "argTypes[*].if",
      `set at most one of { exists, eq, neq, truthy } (got ${JSON.stringify({ exists, eq, neq, truthy })})`,
    );
  }
  if (typeof eq !== "undefined") return deepEqual(value, eq);
  if (typeof neq !== "undefined") return !deepEqual(value, neq);
  if (typeof exists !== "undefined") {
    const valueIsDefined = typeof value !== "undefined";
    return exists ? valueIsDefined : !valueIsDefined;
  }
  const shouldBeTruthy = typeof truthy === "undefined" ? true : truthy;
  return shouldBeTruthy ? Boolean(value) : !value;
};

export const includeConditionalArg = (argType: ArgType, args: Args, globals: Globals): boolean => {
  if (!argType.if) return true;
  const { arg, global } = argType.if;
  if (countDefined([arg, global]) !== 1) {
    throw new OpenbookConfigInvalidOptionsError(
      "argTypes[*].if",
      `exactly one of { arg, global } must be set (got ${JSON.stringify({ arg, global })})`,
    );
  }
  const sourceValue =
    arg !== undefined ? args[arg] : global !== undefined ? globals[global] : undefined;
  return testValue(argType.if, sourceValue);
};
