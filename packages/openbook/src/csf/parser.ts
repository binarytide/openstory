import { parseSync } from "oxc-parser";

import {
  OpenbookCsfBadMetaError,
  OpenbookCsfDynamicTitleError,
  OpenbookCsfInvalidTagError,
  OpenbookCsfMissingDefaultExportError,
  OpenbookCsfParseError,
  OpenbookCsfStoriesOfError,
} from "../errors.js";
import { combineTags } from "./combine-tags.js";
import { isExportStory } from "./is-export-story.js";
import { storyNameFromExport } from "./story-name-from-export.js";
import { toId } from "./to-id.js";
import {
  at,
  type AstNode,
  coerceLiteralObject,
  collectVariableDeclarations,
  evalLiteral,
  getNodeLine,
  getObjectProperty,
  getObjectPropertyKeys,
  hasObjectProperty,
  toStringLiteral,
  tryRegexLiteral,
  unwrapTypeAnnotations,
  type VariableBindings,
} from "./ast-helpers.js";

export interface ParseCsfOptions {
  filename: string;
  makeTitle: (userTitle: string | undefined) => string;
}

export interface ParsedCsf {
  meta: ParsedMeta;
  stories: ParsedStory[];
  imports: string[];
}

export interface ParsedMeta {
  title: string;
  id?: string;
  component?: string;
  args: Record<string, unknown>;
  argTypes: Record<string, unknown>;
  parameters: Record<string, unknown>;
  tags: string[];
  includeStories?: string[] | RegExp;
  excludeStories?: string[] | RegExp;
  hasRender: boolean;
  hasPlay: boolean;
  hasBeforeEach: boolean;
}

export interface ParsedStory {
  exportName: string;
  localName: string;
  name: string;
  id: string;
  title: string;
  args: Record<string, unknown>;
  argTypes: Record<string, unknown>;
  parameters: Record<string, unknown>;
  tags: string[];
  hasRender: boolean;
  hasPlay: boolean;
  hasBeforeEach: boolean;
}

interface ExportInfo {
  exportName: string;
  localName: string;
  init: AstNode | undefined;
  annotations: Record<string, AstNode>;
}

interface ScannedProgram {
  variables: VariableBindings;
  exports: ExportInfo[];
  defaultExportLocalName?: string;
  defaultExportInline?: AstNode;
  imports: string[];
  hasStoriesOf: boolean;
}

const RENDER_FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

const coerceLiteralObjectWithComputed = (node: AstNode | undefined): Record<string, unknown> =>
  coerceLiteralObject(node, { preserveComputed: true });

const isStoriesOfCall = (expression: AstNode): boolean => {
  let cursor: AstNode | undefined = expression;
  while (cursor) {
    if (cursor.type === "CallExpression") {
      const callee: AstNode = at(cursor, "callee");
      if (callee.type === "Identifier" && at<string>(callee, "name") === "storiesOf") {
        return true;
      }
      if (callee.type === "MemberExpression") {
        cursor = at(callee, "object");
        continue;
      }
    }
    if (cursor.type === "MemberExpression") {
      cursor = at(cursor, "object");
      continue;
    }
    return false;
  }
  return false;
};

const isTemplateBindCall = (node: AstNode): boolean => {
  const callee = at(node, "callee");
  if (callee?.type !== "MemberExpression") return false;
  const property = at(callee, "property");
  return property.type === "Identifier" && at<string>(property, "name") === "bind";
};

const isRenderFunctionShape = (init: AstNode | undefined): boolean => {
  if (!init) return false;
  if (RENDER_FUNCTION_TYPES.has(init.type)) return true;
  if (init.type === "CallExpression" && isTemplateBindCall(init)) return true;
  return false;
};

const stringifyComponent = (node: AstNode): string | undefined => {
  const unwrapped = unwrapTypeAnnotations(node);
  if (!unwrapped) return undefined;
  if (unwrapped.type === "Literal") {
    const value = at<unknown>(unwrapped, "value");
    return typeof value === "string" ? `'${value}'` : String(value);
  }
  if (unwrapped.type === "Identifier") return at<string>(unwrapped, "name");
  if (unwrapped.type === "ObjectExpression") return "{}";
  return undefined;
};

const coerceTags = (node: AstNode, filename: string): string[] => {
  const arrayNode = unwrapTypeAnnotations(node);
  if (!arrayNode || arrayNode.type !== "ArrayExpression") {
    throw new OpenbookCsfInvalidTagError(filename, "Expected tags array");
  }
  const tags: string[] = [];
  for (const element of at<Array<AstNode | null>>(arrayNode, "elements")) {
    if (!element) continue;
    const literal = unwrapTypeAnnotations(element);
    const value = literal?.type === "Literal" ? at<unknown>(literal, "value") : undefined;
    if (typeof value !== "string") {
      throw new OpenbookCsfInvalidTagError(filename, "Expected tag to be string literal");
    }
    tags.push(value);
  }
  return tags;
};

const coerceStoryDescriptor = (node: AstNode | undefined): string[] | RegExp | undefined => {
  if (!node) return undefined;
  const literal = unwrapTypeAnnotations(node);
  if (!literal) return undefined;
  if (literal.type === "ArrayExpression") {
    const value = evalLiteral(literal);
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return value as string[];
    }
    return undefined;
  }
  return tryRegexLiteral(literal);
};

const extractTitleFromMeta = (metaObject: AstNode, filename: string): string | undefined => {
  const titleNode = getObjectProperty(metaObject, "title");
  if (!titleNode) return undefined;
  const value = evalLiteral(titleNode);
  if (typeof value === "string") return value;
  throw new OpenbookCsfDynamicTitleError(filename, getNodeLine(titleNode));
};

const buildExportInfo = (
  exportName: string,
  localName: string,
  init: AstNode | undefined,
): ExportInfo => ({ exportName, localName, init, annotations: {} });

const collectNamedExports = (declaration: AstNode, exports: ExportInfo[]): void => {
  if (declaration.type === "VariableDeclaration") {
    for (const declarator of at<AstNode[]>(declaration, "declarations")) {
      const identifierNode = at(declarator, "id");
      if (identifierNode.type !== "Identifier") continue;
      const name = at<string>(identifierNode, "name");
      exports.push(buildExportInfo(name, name, unwrapTypeAnnotations(at(declarator, "init"))));
    }
    return;
  }
  if (declaration.type === "FunctionDeclaration") {
    const identifierNode = at<AstNode | undefined>(declaration, "id");
    if (identifierNode?.type !== "Identifier") return;
    const name = at<string>(identifierNode, "name");
    exports.push(buildExportInfo(name, name, declaration));
  }
};

const applyAnnotation = (
  exports: ExportInfo[],
  targetName: string,
  annotationName: string,
  value: AstNode,
): void => {
  const unwrappedValue = unwrapTypeAnnotations(value);
  if (!unwrappedValue) return;
  for (const exportInfo of exports) {
    if (exportInfo.localName !== targetName) continue;
    if (annotationName === "story" && unwrappedValue.type === "ObjectExpression") {
      for (const key of getObjectPropertyKeys(unwrappedValue)) {
        const propertyValue = getObjectProperty(unwrappedValue, key);
        if (propertyValue) exportInfo.annotations[key] = propertyValue;
      }
    } else {
      exportInfo.annotations[annotationName] = unwrappedValue;
    }
  }
};

const tryExtractAnnotation = (statement: AstNode, exports: ExportInfo[]): boolean => {
  if (statement.type !== "ExpressionStatement") return false;
  const expression = at(statement, "expression");
  if (expression.type !== "AssignmentExpression") return false;
  if (at<string>(expression, "operator") !== "=") return false;
  const left = at(expression, "left");
  if (left.type !== "MemberExpression" || at(left, "computed")) return false;
  const targetObject = at(left, "object");
  const propertyNode = at(left, "property");
  if (targetObject.type !== "Identifier" || propertyNode.type !== "Identifier") return false;
  applyAnnotation(
    exports,
    at<string>(targetObject, "name"),
    at<string>(propertyNode, "name"),
    at(expression, "right"),
  );
  return true;
};

const scanProgram = (program: AstNode): ScannedProgram => {
  const variables: VariableBindings = {};
  const exports: ExportInfo[] = [];
  const imports: string[] = [];
  let defaultExportLocalName: string | undefined;
  let defaultExportInline: AstNode | undefined;
  let hasStoriesOf = false;

  for (const statement of at<AstNode[]>(program, "body")) {
    if (statement.type === "ImportDeclaration") {
      imports.push(at<{ value: string }>(statement, "source").value);
      continue;
    }

    if (statement.type === "VariableDeclaration") {
      collectVariableDeclarations(statement, variables);
      continue;
    }

    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = unwrapTypeAnnotations(at(statement, "declaration"));
      if (!declaration) continue;
      if (declaration.type === "Identifier") {
        defaultExportLocalName = at<string>(declaration, "name");
      } else {
        defaultExportInline = declaration;
      }
      continue;
    }

    if (statement.type === "ExportNamedDeclaration") {
      const declaration = at<AstNode | null>(statement, "declaration");
      if (declaration) {
        if (declaration.type === "VariableDeclaration") {
          collectVariableDeclarations(declaration, variables);
        }
        collectNamedExports(declaration, exports);
      }
      const specifiers = at<AstNode[] | undefined>(statement, "specifiers");
      for (const specifier of specifiers ?? []) {
        if (specifier.type !== "ExportSpecifier") continue;
        const local = at(specifier, "local");
        const exported = at(specifier, "exported");
        if (local.type !== "Identifier" || exported.type !== "Identifier") continue;
        const localName = at<string>(local, "name");
        const exportName = at<string>(exported, "name");
        if (exportName === "default") {
          defaultExportLocalName = localName;
          continue;
        }
        exports.push(buildExportInfo(exportName, localName, undefined));
      }
      continue;
    }

    if (tryExtractAnnotation(statement, exports)) continue;

    if (statement.type === "ExpressionStatement" && isStoriesOfCall(at(statement, "expression"))) {
      hasStoriesOf = true;
    }
  }

  for (const exportInfo of exports) {
    if (exportInfo.init === undefined) {
      exportInfo.init = unwrapTypeAnnotations(variables[exportInfo.localName]);
    }
  }

  return {
    variables,
    exports,
    defaultExportLocalName,
    defaultExportInline,
    imports,
    hasStoriesOf,
  };
};

const extractMeta = (
  metaObject: AstNode,
  filename: string,
  makeTitle: ParseCsfOptions["makeTitle"],
): ParsedMeta => {
  const userTitle = extractTitleFromMeta(metaObject, filename);
  const idNode = getObjectProperty(metaObject, "id");
  const componentNode = getObjectProperty(metaObject, "component");
  const tagsNode = getObjectProperty(metaObject, "tags");

  return {
    title: makeTitle(userTitle),
    id: idNode ? toStringLiteral(idNode) : undefined,
    component: componentNode ? stringifyComponent(componentNode) : undefined,
    args: coerceLiteralObjectWithComputed(getObjectProperty(metaObject, "args")),
    argTypes: coerceLiteralObjectWithComputed(getObjectProperty(metaObject, "argTypes")),
    parameters: coerceLiteralObjectWithComputed(getObjectProperty(metaObject, "parameters")),
    tags: tagsNode ? coerceTags(tagsNode, filename) : [],
    includeStories: coerceStoryDescriptor(getObjectProperty(metaObject, "includeStories")),
    excludeStories: coerceStoryDescriptor(getObjectProperty(metaObject, "excludeStories")),
    hasRender: hasObjectProperty(metaObject, "render"),
    hasPlay: hasObjectProperty(metaObject, "play"),
    hasBeforeEach: hasObjectProperty(metaObject, "beforeEach"),
  };
};

const mergeRecords = (...sources: Array<Record<string, unknown>>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  let anyComputed = false;
  for (const source of sources) {
    if (!source) continue;
    if ("__computed" in source) {
      anyComputed = true;
      continue;
    }
    for (const key of Object.keys(source)) result[key] = source[key];
  }
  if (anyComputed) result["__computed"] = true;
  return result;
};

const deriveStoryId = (
  metaId: string | undefined,
  metaTitle: string,
  storyDisplayName: string,
  customStoryId: string | undefined,
): string => {
  if (customStoryId) return customStoryId;
  if (metaId) {
    const fragment =
      toId("placeholder", storyDisplayName).split("--")[1] ?? storyDisplayName.toLowerCase();
    return `${metaId}--${fragment}`;
  }
  return toId(metaTitle, storyDisplayName);
};

const fromInlineOrAnnotation = (
  storyObject: AstNode | undefined,
  annotation: AstNode | undefined,
  propertyName: string,
): Record<string, unknown> => {
  const inlineNode = storyObject ? getObjectProperty(storyObject, propertyName) : undefined;
  const sources: Array<Record<string, unknown>> = [];
  if (annotation) sources.push(coerceLiteralObjectWithComputed(annotation));
  if (inlineNode) sources.push(coerceLiteralObjectWithComputed(inlineNode));
  if (sources.length === 0) return {};
  return mergeRecords(...sources);
};

const fromInlineOrAnnotationTags = (
  storyObject: AstNode | undefined,
  annotation: AstNode | undefined,
  filename: string,
): string[] => {
  const inlineNode = storyObject ? getObjectProperty(storyObject, "tags") : undefined;
  const annotationTags = annotation ? coerceTags(annotation, filename) : [];
  const inlineTags = inlineNode ? coerceTags(inlineNode, filename) : [];
  return [...annotationTags, ...inlineTags];
};

const extractStory = (meta: ParsedMeta, exportInfo: ExportInfo): ParsedStory => {
  const init = exportInfo.init;
  const storyObject = init?.type === "ObjectExpression" ? init : undefined;
  const annotations = exportInfo.annotations;

  const inlineObjectName = storyObject
    ? toStringLiteral(getObjectProperty(storyObject, "name"))
    : undefined;
  const annotationName =
    (annotations["name"] && toStringLiteral(annotations["name"])) ??
    (annotations["storyName"] && toStringLiteral(annotations["storyName"]));
  const displayName =
    inlineObjectName ?? annotationName ?? storyNameFromExport(exportInfo.exportName);

  const args = mergeRecords(
    meta.args,
    fromInlineOrAnnotation(storyObject, annotations["args"], "args"),
  );
  const argTypes = mergeRecords(
    meta.argTypes,
    fromInlineOrAnnotation(storyObject, annotations["argTypes"], "argTypes"),
  );
  const parameters = mergeRecords(
    meta.parameters,
    fromInlineOrAnnotation(storyObject, annotations["parameters"], "parameters"),
  );
  const tags = combineTags(
    ...meta.tags,
    ...fromInlineOrAnnotationTags(storyObject, annotations["tags"], "<inline>"),
  );

  const customStoryId =
    typeof parameters["__id"] === "string" ? (parameters["__id"] as string) : undefined;
  const id = deriveStoryId(meta.id, meta.title, displayName, customStoryId);

  const hasRender =
    isRenderFunctionShape(init) ||
    hasObjectProperty(storyObject, "render") ||
    Boolean(annotations["render"]);
  const hasPlay = hasObjectProperty(storyObject, "play") || Boolean(annotations["play"]);
  const hasBeforeEach =
    hasObjectProperty(storyObject, "beforeEach") || Boolean(annotations["beforeEach"]);

  return {
    exportName: exportInfo.exportName,
    localName: exportInfo.localName,
    name: displayName,
    id,
    title: meta.title,
    args,
    argTypes,
    parameters,
    tags,
    hasRender,
    hasPlay,
    hasBeforeEach,
  };
};

export const parseCsf = (source: string, options: ParseCsfOptions): ParsedCsf => {
  const { filename, makeTitle } = options;
  const language = filename.endsWith("x") ? "tsx" : "ts";

  let parseResult;
  try {
    parseResult = parseSync(filename, source, { lang: language });
  } catch (cause) {
    throw new OpenbookCsfParseError(
      filename,
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (parseResult.errors.length > 0) {
    throw new OpenbookCsfParseError(filename, parseResult.errors[0]!.message);
  }

  const program = parseResult.program as unknown as AstNode;
  const scanned = scanProgram(program);

  if (scanned.hasStoriesOf) {
    throw new OpenbookCsfStoriesOfError(filename);
  }

  const metaObject = scanned.defaultExportInline
    ? unwrapTypeAnnotations(scanned.defaultExportInline)
    : scanned.defaultExportLocalName
      ? unwrapTypeAnnotations(scanned.variables[scanned.defaultExportLocalName])
      : undefined;

  if (!metaObject) {
    throw new OpenbookCsfMissingDefaultExportError(filename);
  }
  if (metaObject.type !== "ObjectExpression") {
    throw new OpenbookCsfBadMetaError(
      filename,
      `Got ${metaObject.type}. Use \`export default { title: '...' }\` or a variable bound to an object literal.`,
    );
  }

  const meta = extractMeta(metaObject, filename, makeTitle);

  const stories: ParsedStory[] = [];
  for (const exportInfo of scanned.exports) {
    const included = isExportStory(exportInfo.exportName, {
      includeStories: meta.includeStories,
      excludeStories: meta.excludeStories,
    });
    if (!included) continue;
    stories.push(extractStory(meta, exportInfo));
  }

  return {
    meta,
    stories,
    imports: scanned.imports,
  };
};
