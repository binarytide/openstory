import { parseSync } from "oxc-parser";

import { OpenstoryCsfBadMetaError, OpenstoryCsfParseError } from "../errors.js";
import type { GlobalType, StoryParameters } from "../types.js";
import {
  at,
  type AstNode,
  coerceLiteralObject,
  collectVariableDeclarations,
  getObjectProperty,
  unwrapTypeAnnotations,
  type VariableBindings,
} from "./ast-helpers.js";

export interface ParsedPreview {
  globalTypes: Record<string, GlobalType>;
  initialGlobals: Record<string, unknown>;
  parameters: StoryParameters;
}

const findPreviewObject = (program: AstNode): AstNode | undefined => {
  const variables: VariableBindings = {};
  let defaultExportInline: AstNode | undefined;
  let defaultExportLocalName: string | undefined;

  for (const statement of at<AstNode[]>(program, "body")) {
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
      if (declaration?.type === "VariableDeclaration") {
        collectVariableDeclarations(declaration, variables);
      }
      const specifiers = at<AstNode[] | undefined>(statement, "specifiers");
      for (const specifier of specifiers ?? []) {
        if (specifier.type !== "ExportSpecifier") continue;
        const exported = at(specifier, "exported");
        const local = at(specifier, "local");
        if (exported.type !== "Identifier" || local.type !== "Identifier") continue;
        if (at<string>(exported, "name") === "default") {
          defaultExportLocalName = at<string>(local, "name");
        }
      }
    }
  }

  if (defaultExportInline) return unwrapTypeAnnotations(defaultExportInline);
  if (defaultExportLocalName) return unwrapTypeAnnotations(variables[defaultExportLocalName]);
  return undefined;
};

export const parsePreview = (source: string, filename: string): ParsedPreview => {
  let parseResult;
  try {
    const language = filename.endsWith("x") ? "tsx" : "ts";
    parseResult = parseSync(filename, source, { lang: language });
  } catch (cause) {
    throw new OpenstoryCsfParseError(
      filename,
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (parseResult.errors.length > 0) {
    throw new OpenstoryCsfParseError(filename, parseResult.errors[0]!.message);
  }

  const program = parseResult.program as unknown as AstNode;
  const previewObject = findPreviewObject(program);

  if (!previewObject) {
    return { globalTypes: {}, initialGlobals: {}, parameters: {} };
  }
  if (previewObject.type !== "ObjectExpression") {
    throw new OpenstoryCsfBadMetaError(
      filename,
      `Preview default export must be an object literal (got ${previewObject.type}).`,
    );
  }

  return {
    globalTypes: coerceLiteralObject(getObjectProperty(previewObject, "globalTypes")) as Record<
      string,
      GlobalType
    >,
    initialGlobals: coerceLiteralObject(getObjectProperty(previewObject, "initialGlobals")),
    parameters: coerceLiteralObject(
      getObjectProperty(previewObject, "parameters"),
    ) as StoryParameters,
  };
};
