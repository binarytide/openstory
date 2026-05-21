export interface AstNode {
  type: string;
  [key: string]: unknown;
}

export const COMPUTED_SENTINEL: { readonly __computed: true } = { __computed: true };

export const isComputedValue = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "__computed" in (value as Record<string, unknown>);

export const at = <TValue = AstNode>(node: AstNode, key: string): TValue => node[key] as TValue;

export const atOrUndefined = <TValue = AstNode>(
  node: AstNode | undefined | null,
  key: string,
): TValue | undefined => (node ? (node[key] as TValue | undefined) : undefined);

export const unwrapTypeAnnotations = (node: AstNode | undefined | null): AstNode | undefined => {
  let current = node ?? undefined;
  while (current) {
    if (
      current.type === "TSAsExpression" ||
      current.type === "TSSatisfiesExpression" ||
      current.type === "TSNonNullExpression" ||
      current.type === "ParenthesizedExpression" ||
      current.type === "TSTypeAssertion"
    ) {
      current = at<AstNode | undefined>(current, "expression");
      continue;
    }
    return current;
  }
  return undefined;
};

export const getPropertyKey = (property: AstNode): string | undefined => {
  const keyNode = at(property, "key");
  if (keyNode.type === "Identifier") return at<string>(keyNode, "name");
  if (keyNode.type === "Literal") {
    const value = at<unknown>(keyNode, "value");
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return undefined;
};

export const getObjectProperty = (
  objectExpression: AstNode | undefined,
  propertyName: string,
): AstNode | undefined => {
  if (!objectExpression || objectExpression.type !== "ObjectExpression") return undefined;
  for (const property of at<AstNode[]>(objectExpression, "properties")) {
    if (property.type !== "Property" || at(property, "computed")) continue;
    if (getPropertyKey(property) === propertyName) return at(property, "value");
  }
  return undefined;
};

export const hasObjectProperty = (
  objectExpression: AstNode | undefined,
  propertyName: string,
): boolean => getObjectProperty(objectExpression, propertyName) !== undefined;

export const getObjectPropertyKeys = (objectExpression: AstNode | undefined): string[] => {
  if (!objectExpression || objectExpression.type !== "ObjectExpression") return [];
  const keys: string[] = [];
  for (const property of at<AstNode[]>(objectExpression, "properties")) {
    if (property.type !== "Property" || at(property, "computed")) continue;
    const key = getPropertyKey(property);
    if (key !== undefined) keys.push(key);
  }
  return keys;
};

export interface VariableBindings {
  [name: string]: AstNode | undefined;
}

export const collectVariableDeclarations = (
  declaration: AstNode,
  bindings: VariableBindings,
): void => {
  for (const declarator of at<AstNode[]>(declaration, "declarations")) {
    const identifierNode = at(declarator, "id");
    if (identifierNode.type !== "Identifier") continue;
    bindings[at<string>(identifierNode, "name")] = at<AstNode | undefined>(declarator, "init");
  }
};

interface TemplateQuasi {
  value: { cooked: string | null; raw: string };
}

export const evalLiteral = (node: AstNode | undefined | null): unknown => {
  const unwrapped = unwrapTypeAnnotations(node);
  if (!unwrapped) return undefined;
  switch (unwrapped.type) {
    case "Literal":
      return at<unknown>(unwrapped, "value");
    case "TemplateLiteral": {
      const expressions = at<unknown[]>(unwrapped, "expressions");
      const quasis = at<TemplateQuasi[]>(unwrapped, "quasis");
      if (expressions.length === 0 && quasis.length === 1) {
        return quasis[0]!.value.cooked ?? quasis[0]!.value.raw;
      }
      return COMPUTED_SENTINEL;
    }
    case "ArrayExpression": {
      const elements = at<Array<AstNode | null>>(unwrapped, "elements");
      const items: unknown[] = [];
      for (const element of elements) {
        if (!element) {
          items.push(undefined);
          continue;
        }
        if (element.type === "SpreadElement") return COMPUTED_SENTINEL;
        items.push(evalLiteral(element));
      }
      return items;
    }
    case "ObjectExpression": {
      const properties = at<AstNode[]>(unwrapped, "properties");
      const objectValue: Record<string, unknown> = {};
      for (const property of properties) {
        if (property.type !== "Property" || at(property, "computed")) return COMPUTED_SENTINEL;
        const key = getPropertyKey(property);
        if (key === undefined) return COMPUTED_SENTINEL;
        objectValue[key] = evalLiteral(at(property, "value"));
      }
      return objectValue;
    }
    case "UnaryExpression": {
      const argumentValue = evalLiteral(at(unwrapped, "argument"));
      if (isComputedValue(argumentValue)) return COMPUTED_SENTINEL;
      const operator = at<string>(unwrapped, "operator");
      switch (operator) {
        case "-":
          return typeof argumentValue === "number" ? -argumentValue : COMPUTED_SENTINEL;
        case "+":
          return typeof argumentValue === "number" ? +argumentValue : COMPUTED_SENTINEL;
        case "!":
          return !argumentValue;
        case "typeof":
          return typeof argumentValue;
        case "void":
          return undefined;
        default:
          return COMPUTED_SENTINEL;
      }
    }
    case "Identifier":
      return at<string>(unwrapped, "name") === "undefined" ? undefined : COMPUTED_SENTINEL;
    default:
      return COMPUTED_SENTINEL;
  }
};

export interface CoerceObjectOptions {
  /**
   * When `true`, a node that is present but evaluates to something non-literal
   * (spreads, computed keys, identifier refs) yields `{ __computed: true }`
   * instead of `{}`. A missing node always returns `{}`.
   */
  preserveComputed?: boolean;
}

export const coerceLiteralObject = (
  node: AstNode | undefined,
  options: CoerceObjectOptions = {},
): Record<string, unknown> => {
  if (!node) return {};
  const value = evalLiteral(node);
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isComputedValue(value)
  ) {
    return value as Record<string, unknown>;
  }
  return options.preserveComputed ? { __computed: true } : {};
};

export const toStringLiteral = (node: AstNode | undefined): string | undefined => {
  const unwrapped = unwrapTypeAnnotations(node);
  if (unwrapped?.type === "Literal") {
    const value = at<unknown>(unwrapped, "value");
    if (typeof value === "string") return value;
  }
  return undefined;
};

interface RegexLiteralPayload {
  pattern: string;
  flags: string;
}

export const tryRegexLiteral = (node: AstNode | undefined): RegExp | undefined => {
  const unwrapped = unwrapTypeAnnotations(node);
  if (unwrapped?.type !== "Literal") return undefined;
  const regex = at<RegexLiteralPayload | undefined>(unwrapped, "regex");
  if (!regex) return undefined;
  return new RegExp(regex.pattern, regex.flags);
};

interface NodeLocation {
  start: { line: number; column: number };
}

export const getNodeLine = (node: AstNode): number =>
  at<NodeLocation | undefined>(node, "loc")?.start.line ?? 0;
