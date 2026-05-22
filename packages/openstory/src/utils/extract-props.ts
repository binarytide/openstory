import { readFile as nodeReadFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { at, type AstNode, evalLiteral, unwrapTypeAnnotations } from "../csf/ast-helpers.js";
import {
  PROPS_ARRAY_TYPE_NAMES,
  PROPS_CROSS_FILE_RESOLUTION_EXTENSIONS,
  PROPS_DATE_NAME_HINTS,
  PROPS_DATE_PLACEHOLDER_ISO,
  PROPS_DOM_PROPS_TYPE_NAMES,
  PROPS_EVENT_HANDLER_PREFIX,
  PROPS_FC_TYPE_NAMES,
  PROPS_FORWARD_REF_NAMES,
  PROPS_NODE_NAME_HINTS,
  PROPS_NODE_TYPE_REFERENCE_NAMES,
  PROPS_OBJECT_TYPE_NAMES,
  PROPS_REF_TYPE_NAMES,
  PROPS_TYPE_RESOLUTION_MAX_HOPS,
  PROPS_UTILITY_TYPE_NAMES,
} from "../constants.js";
import { fileExists } from "./file-exists.js";
import {
  loadTsconfigPaths,
  resolveSpecifierWithPaths,
  type TsconfigPaths,
} from "./resolve-tsconfig-paths.js";

export type PropKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "node"
  | "function"
  | "object"
  | "array"
  | "unknown";

export interface PropSchema {
  name: string;
  optional: boolean;
  kind: PropKind;
  description?: string;
  options?: Array<string | number>;
  defaultValue?: unknown;
}

export interface ExtractPropsResult {
  props: PropSchema[];
  typeName?: string;
  resolvedAsFunction: boolean;
}

export interface ExtractPropsOptions {
  readFile?: (absolutePath: string) => Promise<string>;
  parseCache?: Map<string, ParsedFile>;
  tsconfigPathsCache?: Map<string, TsconfigPaths | null>;
}

export interface ParsedFile {
  filename: string;
  source: string;
  program: AstNode;
  comments: OxcComment[];
}

interface OxcComment {
  type: "Line" | "Block";
  value: string;
  start: number;
  end: number;
}

interface TypeMember {
  name: string;
  optional: boolean;
  typeNode: AstNode;
  description?: string;
  jsDocBlock?: string;
  defaultValue?: unknown;
  sourceFile: ParsedFile;
}

interface CvaVariantInfo {
  options: string[];
  defaultOption?: string;
}

interface ResolveContext {
  readFile: (absolutePath: string) => Promise<string>;
  parseCache: Map<string, ParsedFile>;
  tsconfigPathsCache: Map<string, TsconfigPaths | null>;
  visitedTypes: Set<string>;
  visitedFiles: Set<string>;
}

interface ImportRecord {
  source: string;
  importedName: string;
  isTypeOnly: boolean;
}

interface FileBindings {
  typeBindings: Map<string, AstNode>;
  valueBindings: Map<string, AstNode>;
  enumBindings: Map<string, AstNode>;
  importBindings: Map<string, ImportRecord>;
  reexportBindings: Map<string, ImportRecord>;
}

const isPropertyKeyName = (key: AstNode): string | undefined => {
  if (key.type === "Identifier") return at<string>(key, "name");
  if (key.type === "Literal") {
    const value = at<unknown>(key, "value");
    if (typeof value === "string") return value;
  }
  return undefined;
};

const isStatementExported = (statement: AstNode): boolean =>
  statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration";

const collectBindings = (program: AstNode): FileBindings => {
  const typeBindings = new Map<string, AstNode>();
  const valueBindings = new Map<string, AstNode>();
  const enumBindings = new Map<string, AstNode>();
  const importBindings = new Map<string, ImportRecord>();
  const reexportBindings = new Map<string, ImportRecord>();

  for (const statement of at<AstNode[]>(program, "body")) {
    if (statement.type === "ImportDeclaration") {
      const source = at<AstNode>(statement, "source");
      if (source.type !== "Literal") continue;
      const sourceValue = at<unknown>(source, "value");
      if (typeof sourceValue !== "string") continue;
      const importKindWholeStatement = at<string | undefined>(statement, "importKind");
      for (const specifier of at<AstNode[]>(statement, "specifiers")) {
        if (specifier.type !== "ImportSpecifier") continue;
        const localBinding = at<AstNode>(specifier, "local");
        const importedBinding = at<AstNode>(specifier, "imported");
        if (localBinding.type !== "Identifier") continue;
        if (importedBinding.type !== "Identifier") continue;
        const specifierImportKind = at<string | undefined>(specifier, "importKind");
        const isTypeOnly = importKindWholeStatement === "type" || specifierImportKind === "type";
        importBindings.set(at<string>(localBinding, "name"), {
          source: sourceValue,
          importedName: at<string>(importedBinding, "name"),
          isTypeOnly,
        });
      }
      continue;
    }

    if (statement.type === "ExportNamedDeclaration") {
      const sourceNode = at<AstNode | null>(statement, "source");
      if (sourceNode && sourceNode.type === "Literal") {
        const sourceValue = at<unknown>(sourceNode, "value");
        if (typeof sourceValue === "string") {
          const exportKindWholeStatement = at<string | undefined>(statement, "exportKind");
          for (const specifier of at<AstNode[]>(statement, "specifiers")) {
            if (specifier.type !== "ExportSpecifier") continue;
            const localBinding = at<AstNode>(specifier, "local");
            const exportedBinding = at<AstNode>(specifier, "exported");
            if (localBinding.type !== "Identifier") continue;
            if (exportedBinding.type !== "Identifier") continue;
            const specifierExportKind = at<string | undefined>(specifier, "exportKind");
            const isTypeOnly =
              exportKindWholeStatement === "type" || specifierExportKind === "type";
            reexportBindings.set(at<string>(exportedBinding, "name"), {
              source: sourceValue,
              importedName: at<string>(localBinding, "name"),
              isTypeOnly,
            });
          }
        }
      }
    }

    const declaration =
      isStatementExported(statement) || statement.type === "ExportDefaultDeclaration"
        ? at<AstNode | null>(statement, "declaration")
        : statement;
    if (!declaration) continue;

    if (declaration.type === "TSInterfaceDeclaration") {
      const identifier = at(declaration, "id");
      if (identifier.type === "Identifier") {
        typeBindings.set(at<string>(identifier, "name"), declaration);
      }
      continue;
    }
    if (declaration.type === "TSTypeAliasDeclaration") {
      const identifier = at(declaration, "id");
      if (identifier.type === "Identifier") {
        typeBindings.set(at<string>(identifier, "name"), declaration);
      }
      continue;
    }
    if (declaration.type === "TSEnumDeclaration") {
      const identifier = at(declaration, "id");
      if (identifier.type === "Identifier") {
        enumBindings.set(at<string>(identifier, "name"), declaration);
      }
      continue;
    }
    if (declaration.type === "FunctionDeclaration") {
      const identifier = at<AstNode | undefined>(declaration, "id");
      if (identifier?.type === "Identifier") {
        valueBindings.set(at<string>(identifier, "name"), declaration);
      }
      continue;
    }
    if (declaration.type === "VariableDeclaration") {
      for (const declarator of at<AstNode[]>(declaration, "declarations")) {
        const identifier = at(declarator, "id");
        if (identifier.type !== "Identifier") continue;
        const init = at<AstNode | undefined>(declarator, "init");
        if (init) valueBindings.set(at<string>(identifier, "name"), declarator);
      }
    }
  }

  return { typeBindings, valueBindings, enumBindings, importBindings, reexportBindings };
};

const parseSourceFile = (filename: string, source: string): ParsedFile => {
  const language = filename.endsWith("x") ? "tsx" : "ts";
  const parseResult = parseSync(filename, source, { lang: language });
  return {
    filename,
    source,
    program: parseResult.program as unknown as AstNode,
    comments: (parseResult.comments ?? []) as unknown as OxcComment[],
  };
};

const loadParsedFile = async (
  absolutePath: string,
  context: ResolveContext,
): Promise<ParsedFile | undefined> => {
  const cached = context.parseCache.get(absolutePath);
  if (cached) return cached;
  if (context.visitedFiles.has(absolutePath)) return undefined;
  context.visitedFiles.add(absolutePath);
  let source: string;
  try {
    source = await context.readFile(absolutePath);
  } catch {
    return undefined;
  }
  try {
    const parsed = parseSourceFile(absolutePath, source);
    context.parseCache.set(absolutePath, parsed);
    return parsed;
  } catch {
    return undefined;
  }
};

const tryResolveCandidatePath = async (resolvedBase: string): Promise<string | undefined> => {
  for (const extension of PROPS_CROSS_FILE_RESOLUTION_EXTENSIONS) {
    const candidate = `${resolvedBase}${extension}`;
    if (await fileExists(candidate)) return candidate;
  }
  if (await fileExists(resolvedBase)) return resolvedBase;
  return undefined;
};

const resolveImportPath = async (
  importerFilename: string,
  importSpecifier: string,
  context: ResolveContext,
): Promise<string | undefined> => {
  if (importSpecifier.startsWith(".") || isAbsolute(importSpecifier)) {
    const baseDirectory = dirname(importerFilename);
    const resolvedBase = resolve(baseDirectory, importSpecifier);
    return tryResolveCandidatePath(resolvedBase);
  }
  const tsconfigPaths = await loadTsconfigPaths(
    dirname(importerFilename),
    context.tsconfigPathsCache,
  );
  if (!tsconfigPaths) return undefined;
  const candidates = resolveSpecifierWithPaths(importSpecifier, tsconfigPaths);
  for (const candidate of candidates) {
    const resolved = await tryResolveCandidatePath(candidate);
    if (resolved) return resolved;
  }
  return undefined;
};

const findExportedDeclaration = (
  parsedFile: ParsedFile,
  exportedName: string,
): { node: AstNode; reexport?: ImportRecord } | undefined => {
  const bindings = collectBindings(parsedFile.program);
  const reexport = bindings.reexportBindings.get(exportedName);
  if (reexport) return { node: parsedFile.program, reexport };
  const typeBinding = bindings.typeBindings.get(exportedName);
  if (typeBinding) return { node: typeBinding };
  const enumBinding = bindings.enumBindings.get(exportedName);
  if (enumBinding) return { node: enumBinding };
  return undefined;
};

const resolveTypeReferenceName = (typeNode: AstNode): string | undefined => {
  if (typeNode.type !== "TSTypeReference") return undefined;
  const typeName = at<AstNode>(typeNode, "typeName");
  if (typeName.type === "Identifier") return at<string>(typeName, "name");
  if (typeName.type === "TSQualifiedName") {
    const right = at<AstNode>(typeName, "right");
    if (right.type === "Identifier") return at<string>(right, "name");
  }
  return undefined;
};

const isNodeLikeReference = (typeNode: AstNode): boolean => {
  const referenceName = resolveTypeReferenceName(typeNode);
  if (!referenceName) return false;
  return PROPS_NODE_TYPE_REFERENCE_NAMES.has(referenceName);
};

const isRefTypeReference = (typeNode: AstNode): boolean => {
  const referenceName = resolveTypeReferenceName(typeNode);
  if (!referenceName) return false;
  return PROPS_REF_TYPE_NAMES.has(referenceName);
};

const isDomPropsReference = (typeNode: AstNode): boolean => {
  const referenceName = resolveTypeReferenceName(typeNode);
  if (!referenceName) return false;
  return PROPS_DOM_PROPS_TYPE_NAMES.has(referenceName);
};

const looksLikeEventHandlerName = (propName: string): boolean => {
  if (!propName.startsWith(PROPS_EVENT_HANDLER_PREFIX)) return false;
  if (propName.length <= PROPS_EVENT_HANDLER_PREFIX.length) return false;
  const followingCharacter = propName.charAt(PROPS_EVENT_HANDLER_PREFIX.length);
  return followingCharacter === followingCharacter.toUpperCase();
};

const literalValue = (literalTypeNode: AstNode): string | number | undefined => {
  if (literalTypeNode.type !== "TSLiteralType") return undefined;
  const literal = at<AstNode>(literalTypeNode, "literal");
  if (literal.type !== "Literal") return undefined;
  const value = at<unknown>(literal, "value");
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
};

interface UnionAnalysis {
  members: AstNode[];
  hasUndefined: boolean;
  hasNull: boolean;
}

const analyzeUnion = (typeNode: AstNode): UnionAnalysis => {
  if (typeNode.type !== "TSUnionType") {
    return { members: [typeNode], hasUndefined: false, hasNull: false };
  }
  const members: AstNode[] = [];
  let hasUndefined = false;
  let hasNull = false;
  for (const member of at<AstNode[]>(typeNode, "types")) {
    if (member.type === "TSUndefinedKeyword") {
      hasUndefined = true;
      continue;
    }
    if (member.type === "TSNullKeyword") {
      hasNull = true;
      continue;
    }
    members.push(member);
  }
  return { members, hasUndefined, hasNull };
};

const enumDeclarationToOptions = (
  enumDeclaration: AstNode,
): { options: Array<string | number>; kind: "enum" } | undefined => {
  if (enumDeclaration.type !== "TSEnumDeclaration") return undefined;
  const body = at<AstNode | undefined>(enumDeclaration, "body");
  const members = at<AstNode[]>(body ?? enumDeclaration, "members");
  const options: Array<string | number> = [];
  let autoIncrement = 0;
  for (const member of members) {
    if (member.type !== "TSEnumMember") continue;
    const initializer = at<AstNode | undefined>(member, "initializer");
    if (initializer) {
      const value = evalLiteral(initializer);
      if (typeof value === "string" || typeof value === "number") {
        options.push(value);
        if (typeof value === "number") autoIncrement = value + 1;
      }
      continue;
    }
    options.push(autoIncrement);
    autoIncrement += 1;
  }
  if (options.length === 0) return undefined;
  return { options, kind: "enum" };
};

const classifyType = (
  typeNode: AstNode,
  propName: string,
): { kind: PropKind; options?: Array<string | number> } => {
  if (PROPS_NODE_NAME_HINTS.has(propName)) {
    if (typeNode.type === "TSTypeReference" || typeNode.type === "TSAnyKeyword") {
      return { kind: "node" };
    }
  }

  switch (typeNode.type) {
    case "TSStringKeyword":
      return { kind: "string" };
    case "TSNumberKeyword":
      return { kind: "number" };
    case "TSBooleanKeyword":
      return { kind: "boolean" };
    case "TSFunctionType":
      return { kind: "function" };
    case "TSArrayType":
    case "TSTupleType":
      return { kind: "array" };
    case "TSTypeLiteral":
      return { kind: "object" };
    case "TSLiteralType": {
      const value = literalValue(typeNode);
      if (typeof value === "string") return { kind: "enum", options: [value] };
      if (typeof value === "number") return { kind: "enum", options: [value] };
      const literal = at<AstNode>(typeNode, "literal");
      if (literal.type === "Literal" && typeof at<unknown>(literal, "value") === "boolean") {
        return { kind: "boolean" };
      }
      return { kind: "unknown" };
    }
    case "TSUnionType": {
      const literalOptions: Array<string | number> = [];
      let literalsAreAllStrings = true;
      let literalsAreAllNumbers = true;
      let hasStringPrimitive = false;
      let hasNumberPrimitive = false;
      let hasBooleanPrimitive = false;
      let hasBooleanLiteral = false;
      let hasOtherType = false;
      for (const member of at<AstNode[]>(typeNode, "types")) {
        const value = literalValue(member);
        if (value !== undefined) {
          literalOptions.push(value);
          if (typeof value !== "string") literalsAreAllStrings = false;
          if (typeof value !== "number") literalsAreAllNumbers = false;
          continue;
        }
        if (member.type === "TSLiteralType") {
          const literal = at<AstNode>(member, "literal");
          if (literal.type === "Literal" && typeof at<unknown>(literal, "value") === "boolean") {
            hasBooleanLiteral = true;
            continue;
          }
        }
        if (member.type === "TSStringKeyword") hasStringPrimitive = true;
        else if (member.type === "TSNumberKeyword") hasNumberPrimitive = true;
        else if (member.type === "TSBooleanKeyword") hasBooleanPrimitive = true;
        else hasOtherType = true;
      }
      if (hasOtherType) return { kind: "unknown" };
      if (
        literalOptions.length === 0 &&
        (hasBooleanPrimitive || hasBooleanLiteral) &&
        !hasStringPrimitive &&
        !hasNumberPrimitive
      ) {
        return { kind: "boolean" };
      }
      if (literalOptions.length > 0 && (literalsAreAllStrings || literalsAreAllNumbers)) {
        return { kind: "enum", options: literalOptions };
      }
      if (hasStringPrimitive) return { kind: "string" };
      if (hasNumberPrimitive) return { kind: "number" };
      if (hasBooleanPrimitive) return { kind: "boolean" };
      return { kind: "unknown" };
    }
    case "TSTypeReference": {
      if (isNodeLikeReference(typeNode)) return { kind: "node" };
      const referenceName = resolveTypeReferenceName(typeNode);
      if (referenceName && PROPS_ARRAY_TYPE_NAMES.has(referenceName)) return { kind: "array" };
      if (referenceName && PROPS_OBJECT_TYPE_NAMES.has(referenceName)) return { kind: "object" };
      return { kind: "unknown" };
    }
    default: {
      if (looksLikeEventHandlerName(propName)) return { kind: "function" };
      return { kind: "unknown" };
    }
  }
};

const parseJsDocDescription = (commentValue: string): string | undefined => {
  if (!commentValue.startsWith("*")) return undefined;
  const withoutLeadingStar = commentValue.slice(1);
  const lines = withoutLeadingStar.split("\n").map((line) => line.replace(/^\s*\*?\s?/, ""));
  const descriptionLines: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith("@")) break;
    descriptionLines.push(line);
  }
  const description = descriptionLines.join("\n").trim();
  return description.length > 0 ? description : undefined;
};

const parseJsDocDefault = (commentValue: string): unknown => {
  if (!commentValue.startsWith("*")) return undefined;
  const match = commentValue.match(/@default(?:Value)?\s+([^\n]+)/);
  if (!match) return undefined;
  const rawValue = match[1]!.trim().replace(/\.$/, "");
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;
  if (rawValue === "undefined") return undefined;
  const numeric = Number(rawValue);
  if (!Number.isNaN(numeric) && rawValue !== "") return numeric;
  if (
    (rawValue.startsWith("'") && rawValue.endsWith("'")) ||
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("`") && rawValue.endsWith("`"))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
};

const findLeadingComment = (
  comments: OxcComment[],
  sourceText: string,
  property: AstNode,
): OxcComment | undefined => {
  const propertyStart = at<number>(property, "start");
  let candidate: OxcComment | undefined;
  for (const comment of comments) {
    if (comment.type !== "Block") continue;
    if (comment.end > propertyStart) continue;
    const between = sourceText.slice(comment.end, propertyStart);
    if (!/^\s*$/.test(between)) continue;
    if (!candidate || comment.end > candidate.end) candidate = comment;
  }
  return candidate;
};

const visitedTypeKey = (filename: string, typeName: string): string => `${filename}::${typeName}`;

const synthesizeStringUnionType = (values: Array<string | number>): AstNode => ({
  type: "TSUnionType",
  types: values.map((value) => ({
    type: "TSLiteralType",
    literal: {
      type: "Literal",
      value,
      raw: typeof value === "string" ? JSON.stringify(value) : String(value),
    } as unknown as AstNode,
  })) as unknown as AstNode[],
});

const collectObjectExpressionKeys = (objectExpression: AstNode): string[] => {
  if (objectExpression.type !== "ObjectExpression") return [];
  const keys: string[] = [];
  for (const property of at<AstNode[]>(objectExpression, "properties")) {
    if (property.type !== "Property") continue;
    if (at<boolean>(property, "computed")) continue;
    const key = at<AstNode>(property, "key");
    if (key.type === "Identifier") {
      keys.push(at<string>(key, "name"));
      continue;
    }
    if (key.type === "Literal") {
      const literalValue = at<unknown>(key, "value");
      if (typeof literalValue === "string") keys.push(literalValue);
      else if (typeof literalValue === "number") keys.push(String(literalValue));
      else if (typeof literalValue === "boolean") keys.push(String(literalValue));
    }
  }
  return keys;
};

const findObjectExpressionProperty = (
  objectExpression: AstNode,
  propertyName: string,
): AstNode | undefined => {
  if (objectExpression.type !== "ObjectExpression") return undefined;
  for (const property of at<AstNode[]>(objectExpression, "properties")) {
    if (property.type !== "Property") continue;
    if (at<boolean>(property, "computed")) continue;
    const key = at<AstNode>(property, "key");
    const keyName =
      key.type === "Identifier"
        ? at<string>(key, "name")
        : key.type === "Literal" && typeof at<unknown>(key, "value") === "string"
          ? at<string>(key, "value" as never)
          : undefined;
    if (keyName === propertyName) return at<AstNode>(property, "value");
  }
  return undefined;
};

const extractCvaVariants = (callExpression: AstNode): Map<string, CvaVariantInfo> => {
  const result = new Map<string, CvaVariantInfo>();
  if (callExpression.type !== "CallExpression") return result;
  const callArguments = at<AstNode[]>(callExpression, "arguments");
  const configArgument = callArguments[1];
  if (!configArgument || configArgument.type !== "ObjectExpression") return result;
  const variantsObject = findObjectExpressionProperty(configArgument, "variants");
  if (!variantsObject || variantsObject.type !== "ObjectExpression") return result;
  const defaultVariantsObject = findObjectExpressionProperty(configArgument, "defaultVariants");
  const defaultsByVariant = new Map<string, string>();
  if (defaultVariantsObject && defaultVariantsObject.type === "ObjectExpression") {
    for (const defaultProperty of at<AstNode[]>(defaultVariantsObject, "properties")) {
      if (defaultProperty.type !== "Property") continue;
      const defaultKey = at<AstNode>(defaultProperty, "key");
      const defaultKeyName =
        defaultKey.type === "Identifier" ? at<string>(defaultKey, "name") : undefined;
      if (!defaultKeyName) continue;
      const defaultValueNode = at<AstNode>(defaultProperty, "value");
      const defaultLiteral = evalLiteral(defaultValueNode);
      if (typeof defaultLiteral === "string") {
        defaultsByVariant.set(defaultKeyName, defaultLiteral);
      }
    }
  }
  for (const variantProperty of at<AstNode[]>(variantsObject, "properties")) {
    if (variantProperty.type !== "Property") continue;
    const variantKey = at<AstNode>(variantProperty, "key");
    const variantName =
      variantKey.type === "Identifier" ? at<string>(variantKey, "name") : undefined;
    if (!variantName) continue;
    const variantOptionsObject = at<AstNode>(variantProperty, "value");
    const optionKeys = collectObjectExpressionKeys(variantOptionsObject);
    if (optionKeys.length === 0) continue;
    const variantInfo: CvaVariantInfo = { options: optionKeys };
    const defaultOption = defaultsByVariant.get(variantName);
    if (defaultOption) variantInfo.defaultOption = defaultOption;
    result.set(variantName, variantInfo);
  }
  return result;
};

const tryResolveIndexedVariantPropsAccess = async (
  typeNode: AstNode,
  parsedFile: ParsedFile,
  context: ResolveContext,
): Promise<{ options: Array<string | number>; defaultValue?: unknown } | undefined> => {
  if (typeNode.type !== "TSIndexedAccessType") return undefined;
  const objectType = at<AstNode>(typeNode, "objectType");
  const indexType = at<AstNode>(typeNode, "indexType");
  if (objectType.type !== "TSTypeReference") return undefined;
  if (resolveTypeReferenceName(objectType) !== "VariantProps") return undefined;
  const indexLiteralValue = literalValue(indexType);
  if (typeof indexLiteralValue !== "string") return undefined;
  const typeArguments = at<AstNode | undefined>(objectType, "typeArguments");
  if (!typeArguments || typeArguments.type !== "TSTypeParameterInstantiation") return undefined;
  const typeArgumentNodes = at<AstNode[]>(typeArguments, "params");
  const variantMembers = await resolveVariantPropsReferenceToMembers(
    typeArgumentNodes,
    parsedFile,
    context,
  );
  const targetVariant = variantMembers.find((member) => member.name === indexLiteralValue);
  if (!targetVariant) return undefined;
  const synthesizedUnion = targetVariant.typeNode;
  if (synthesizedUnion.type !== "TSUnionType") return undefined;
  const options: Array<string | number> = [];
  for (const literalMember of at<AstNode[]>(synthesizedUnion, "types")) {
    const optionValue = literalValue(literalMember);
    if (typeof optionValue === "string" || typeof optionValue === "number") {
      options.push(optionValue);
    }
  }
  if (options.length === 0) return undefined;
  return targetVariant.defaultValue !== undefined
    ? { options, defaultValue: targetVariant.defaultValue }
    : { options };
};

const cvaCallFromBinding = (binding: AstNode): AstNode | undefined => {
  const init =
    binding.type === "VariableDeclarator" ? at<AstNode | undefined>(binding, "init") : binding;
  if (!init) return undefined;
  const unwrapped = unwrapTypeAnnotations(init) ?? init;
  if (unwrapped.type !== "CallExpression") return undefined;
  const callee = at<AstNode>(unwrapped, "callee");
  const calleeName = callee.type === "Identifier" ? at<string>(callee, "name") : undefined;
  return calleeName === "cva" ? unwrapped : undefined;
};

const findCvaCallByName = async (
  variantsVariableName: string,
  parsedFile: ParsedFile,
  context: ResolveContext,
): Promise<{ call: AstNode; sourceFile: ParsedFile } | undefined> => {
  const bindings = collectBindings(parsedFile.program);
  const localBinding = bindings.valueBindings.get(variantsVariableName);
  if (localBinding) {
    const localCall = cvaCallFromBinding(localBinding);
    if (localCall) return { call: localCall, sourceFile: parsedFile };
  }
  const importRecord = bindings.importBindings.get(variantsVariableName);
  if (!importRecord) return undefined;
  const resolvedPath = await resolveImportPath(parsedFile.filename, importRecord.source, context);
  if (!resolvedPath) return undefined;
  const externalFile = await loadParsedFile(resolvedPath, context);
  if (!externalFile) return undefined;
  const externalBindings = collectBindings(externalFile.program);
  const externalBinding = externalBindings.valueBindings.get(importRecord.importedName);
  if (!externalBinding) return undefined;
  const externalCall = cvaCallFromBinding(externalBinding);
  if (!externalCall) return undefined;
  return { call: externalCall, sourceFile: externalFile };
};

const resolveVariantPropsReferenceToMembers = async (
  typeArgumentNodes: AstNode[],
  parsedFile: ParsedFile,
  context: ResolveContext,
): Promise<TypeMember[]> => {
  const typeQueryArgument = typeArgumentNodes[0];
  if (!typeQueryArgument || typeQueryArgument.type !== "TSTypeQuery") return [];
  const expressionName = at<AstNode>(typeQueryArgument, "exprName");
  if (expressionName.type !== "Identifier") return [];
  const variantsVariableName = at<string>(expressionName, "name");
  const found = await findCvaCallByName(variantsVariableName, parsedFile, context);
  if (!found) return [];
  const cvaVariants = extractCvaVariants(found.call);
  if (cvaVariants.size === 0) return [];
  const members: TypeMember[] = [];
  for (const [variantName, info] of cvaVariants) {
    const member: TypeMember = {
      name: variantName,
      optional: true,
      typeNode: synthesizeStringUnionType(info.options),
      sourceFile: found.sourceFile,
    };
    if (info.defaultOption !== undefined) member.defaultValue = info.defaultOption;
    members.push(member);
  }
  return members;
};

const resolveTypeNodeToMembers = async (
  typeNode: AstNode,
  parsedFile: ParsedFile,
  context: ResolveContext,
  hops: number,
): Promise<TypeMember[]> => {
  if (hops > PROPS_TYPE_RESOLUTION_MAX_HOPS) return [];

  if (typeNode.type === "TSTypeLiteral") {
    return collectMembersFromTypeBody(typeNode, parsedFile);
  }
  if (typeNode.type === "TSInterfaceBody") {
    return collectMembersFromTypeBody(typeNode, parsedFile);
  }
  if (typeNode.type === "TSInterfaceDeclaration") {
    const ownMembers = collectMembersFromTypeBody(at<AstNode>(typeNode, "body"), parsedFile);
    const extendsList = at<AstNode[] | undefined>(typeNode, "extends") ?? [];
    const inherited: TypeMember[] = [];
    for (const extension of extendsList) {
      if (
        extension.type !== "TSInterfaceHeritage" &&
        extension.type !== "TSExpressionWithTypeArguments"
      ) {
        continue;
      }
      const expression = at<AstNode>(extension, "expression");
      const heritageTypeArguments = at<AstNode | undefined>(extension, "typeArguments");
      const syntheticReference: AstNode = {
        type: "TSTypeReference",
        typeName: expression,
        typeArguments: heritageTypeArguments ?? null,
      };
      const heritageMembers = await resolveTypeReferenceToMembers(
        syntheticReference,
        parsedFile,
        context,
        hops + 1,
      );
      inherited.push(...heritageMembers);
    }
    return mergeMembers(inherited, ownMembers);
  }
  if (typeNode.type === "TSTypeAliasDeclaration") {
    return resolveTypeNodeToMembers(
      at<AstNode>(typeNode, "typeAnnotation"),
      parsedFile,
      context,
      hops + 1,
    );
  }
  if (typeNode.type === "TSIntersectionType") {
    const branches: TypeMember[][] = [];
    for (const branch of at<AstNode[]>(typeNode, "types")) {
      if (isDomPropsReference(branch)) continue;
      branches.push(await resolveTypeNodeToMembers(branch, parsedFile, context, hops + 1));
    }
    return branches.reduce<TypeMember[]>(
      (accumulated, current) => mergeMembers(accumulated, current),
      [],
    );
  }
  if (typeNode.type === "TSUnionType") {
    const branchMemberLists: TypeMember[][] = [];
    for (const branch of at<AstNode[]>(typeNode, "types")) {
      if (branch.type === "TSUndefinedKeyword" || branch.type === "TSNullKeyword") continue;
      const branchMembers = await resolveTypeNodeToMembers(branch, parsedFile, context, hops + 1);
      if (branchMembers.length > 0) branchMemberLists.push(branchMembers);
    }
    return mergeMembersFromUnionBranches(branchMemberLists);
  }
  if (typeNode.type === "TSParenthesizedType") {
    return resolveTypeNodeToMembers(
      at<AstNode>(typeNode, "typeAnnotation"),
      parsedFile,
      context,
      hops + 1,
    );
  }
  if (typeNode.type === "TSTypeReference") {
    return resolveTypeReferenceToMembers(typeNode, parsedFile, context, hops + 1);
  }
  return [];
};

const collectMembersFromTypeBody = (typeBody: AstNode, parsedFile: ParsedFile): TypeMember[] => {
  const memberNodes =
    typeBody.type === "TSTypeLiteral"
      ? at<AstNode[]>(typeBody, "members")
      : at<AstNode[]>(typeBody, "body");
  const result: TypeMember[] = [];
  for (const memberNode of memberNodes) {
    if (memberNode.type !== "TSPropertySignature") continue;
    if (at<boolean>(memberNode, "computed")) continue;
    const name = isPropertyKeyName(at(memberNode, "key"));
    if (!name) continue;
    const typeAnnotation = at<AstNode | null | undefined>(memberNode, "typeAnnotation");
    if (!typeAnnotation) continue;
    const innerType = at<AstNode>(typeAnnotation, "typeAnnotation");
    if (innerType.type === "TSUndefinedKeyword" || innerType.type === "TSNullKeyword") continue;
    const optional = at<boolean>(memberNode, "optional");
    const leadingComment = findLeadingComment(parsedFile.comments, parsedFile.source, memberNode);
    const description = leadingComment ? parseJsDocDescription(leadingComment.value) : undefined;
    const member: TypeMember = {
      name,
      optional,
      typeNode: innerType,
      sourceFile: parsedFile,
    };
    if (description) member.description = description;
    if (leadingComment) member.jsDocBlock = leadingComment.value;
    result.push(member);
  }
  return result;
};

const mergeMembers = (base: TypeMember[], overrides: TypeMember[]): TypeMember[] => {
  const merged = new Map<string, TypeMember>();
  for (const member of base) merged.set(member.name, member);
  for (const member of overrides) merged.set(member.name, member);
  return [...merged.values()];
};

const mergeMembersFromUnionBranches = (branchLists: TypeMember[][]): TypeMember[] => {
  if (branchLists.length === 0) return [];
  if (branchLists.length === 1) return branchLists[0]!;
  const totalBranches = branchLists.length;
  const occurrenceByName = new Map<
    string,
    {
      member: TypeMember;
      appearsInAllBranches: boolean;
      anyBranchOptional: boolean;
      branchCount: number;
    }
  >();
  for (const branchMembers of branchLists) {
    const namesInThisBranch = new Set<string>();
    for (const member of branchMembers) {
      namesInThisBranch.add(member.name);
      const existing = occurrenceByName.get(member.name);
      if (!existing) {
        occurrenceByName.set(member.name, {
          member,
          appearsInAllBranches: true,
          anyBranchOptional: member.optional,
          branchCount: 1,
        });
      } else {
        existing.branchCount += 1;
        if (member.optional) existing.anyBranchOptional = true;
      }
    }
  }
  const result: TypeMember[] = [];
  for (const occurrence of occurrenceByName.values()) {
    const appearsEverywhere = occurrence.branchCount === totalBranches;
    const optional = !appearsEverywhere || occurrence.anyBranchOptional;
    result.push({ ...occurrence.member, optional });
  }
  return result;
};

const resolveTypeReferenceToMembers = async (
  typeReference: AstNode,
  parsedFile: ParsedFile,
  context: ResolveContext,
  hops: number,
): Promise<TypeMember[]> => {
  const typeName = at<AstNode>(typeReference, "typeName");
  const referenceName = resolveTypeReferenceName(typeReference);
  if (!referenceName) return [];

  const typeArguments = at<AstNode | undefined>(typeReference, "typeArguments");
  const typeArgumentNodes =
    typeArguments && typeArguments.type === "TSTypeParameterInstantiation"
      ? at<AstNode[]>(typeArguments, "params")
      : [];

  if (PROPS_DOM_PROPS_TYPE_NAMES.has(referenceName)) return [];

  if (referenceName === "VariantProps") {
    return resolveVariantPropsReferenceToMembers(typeArgumentNodes, parsedFile, context);
  }

  if (referenceName === "Partial" || referenceName === "Required" || referenceName === "Readonly") {
    const argument = typeArgumentNodes[0];
    if (!argument) return [];
    const inner = await resolveTypeNodeToMembers(argument, parsedFile, context, hops + 1);
    if (referenceName === "Partial") {
      return inner.map((member) => ({ ...member, optional: true }));
    }
    if (referenceName === "Required") {
      return inner.map((member) => ({ ...member, optional: false }));
    }
    return inner;
  }

  if (referenceName === "Pick" || referenceName === "Omit") {
    const argument = typeArgumentNodes[0];
    const keysArgument = typeArgumentNodes[1];
    if (!argument || !keysArgument) return [];
    const inner = await resolveTypeNodeToMembers(argument, parsedFile, context, hops + 1);
    const keys = collectLiteralStringSet(keysArgument);
    if (!keys) return inner;
    if (referenceName === "Pick") {
      return inner.filter((member) => keys.has(member.name));
    }
    return inner.filter((member) => !keys.has(member.name));
  }

  if (typeName.type === "TSQualifiedName") {
    return [];
  }

  return resolveNamedTypeToMembers(referenceName, parsedFile, context, hops);
};

const collectLiteralStringSet = (typeNode: AstNode): Set<string> | undefined => {
  const set = new Set<string>();
  if (typeNode.type === "TSLiteralType") {
    const value = literalValue(typeNode);
    if (typeof value === "string") set.add(value);
    return set.size > 0 ? set : undefined;
  }
  if (typeNode.type === "TSUnionType") {
    for (const member of at<AstNode[]>(typeNode, "types")) {
      const value = literalValue(member);
      if (typeof value === "string") set.add(value);
      else return undefined;
    }
    return set.size > 0 ? set : undefined;
  }
  return undefined;
};

const resolveNamedTypeToMembers = async (
  typeName: string,
  parsedFile: ParsedFile,
  context: ResolveContext,
  hops: number,
): Promise<TypeMember[]> => {
  const key = visitedTypeKey(parsedFile.filename, typeName);
  if (context.visitedTypes.has(key)) return [];
  context.visitedTypes.add(key);

  const bindings = collectBindings(parsedFile.program);
  const localType = bindings.typeBindings.get(typeName);
  if (localType) {
    const members = await resolveTypeNodeToMembers(localType, parsedFile, context, hops + 1);
    context.visitedTypes.delete(key);
    return members;
  }
  const importRecord = bindings.importBindings.get(typeName);
  if (importRecord) {
    const resolvedPath = await resolveImportPath(parsedFile.filename, importRecord.source, context);
    if (!resolvedPath) {
      context.visitedTypes.delete(key);
      return [];
    }
    const externalFile = await loadParsedFile(resolvedPath, context);
    if (!externalFile) {
      context.visitedTypes.delete(key);
      return [];
    }
    const found = findExportedDeclaration(externalFile, importRecord.importedName);
    if (!found) {
      context.visitedTypes.delete(key);
      return [];
    }
    if (found.reexport) {
      const reexportResolved = await resolveImportPath(
        externalFile.filename,
        found.reexport.source,
        context,
      );
      if (!reexportResolved) {
        context.visitedTypes.delete(key);
        return [];
      }
      const reexportFile = await loadParsedFile(reexportResolved, context);
      if (!reexportFile) {
        context.visitedTypes.delete(key);
        return [];
      }
      const members = await resolveNamedTypeToMembers(
        found.reexport.importedName,
        reexportFile,
        context,
        hops + 1,
      );
      context.visitedTypes.delete(key);
      return members;
    }
    const members = await resolveTypeNodeToMembers(found.node, externalFile, context, hops + 1);
    context.visitedTypes.delete(key);
    return members;
  }
  context.visitedTypes.delete(key);
  return [];
};

const resolveValueBindingToFunction = (
  initOrDeclaration: AstNode,
  bindings: FileBindings,
  seen: Set<string>,
): { functionNode: AstNode; propsTypeFromVariable?: AstNode } | undefined => {
  const declaratorOrFunction =
    initOrDeclaration.type === "VariableDeclarator"
      ? at<AstNode | undefined>(initOrDeclaration, "init")
      : initOrDeclaration;
  if (!declaratorOrFunction) return undefined;

  let propsTypeFromVariable: AstNode | undefined;
  if (initOrDeclaration.type === "VariableDeclarator") {
    const variableIdentifier = at<AstNode>(initOrDeclaration, "id");
    if (variableIdentifier.type === "Identifier") {
      const variableTypeAnnotation = at<AstNode | null | undefined>(
        variableIdentifier,
        "typeAnnotation",
      );
      if (variableTypeAnnotation) {
        const variableType = at<AstNode>(variableTypeAnnotation, "typeAnnotation");
        propsTypeFromVariable = propsTypeFromFcAnnotation(variableType);
      }
    }
  }

  const unwrapped = unwrapTypeAnnotations(declaratorOrFunction) ?? declaratorOrFunction;

  if (
    unwrapped.type === "FunctionDeclaration" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression"
  ) {
    const result: { functionNode: AstNode; propsTypeFromVariable?: AstNode } = {
      functionNode: unwrapped,
    };
    if (propsTypeFromVariable) result.propsTypeFromVariable = propsTypeFromVariable;
    return result;
  }

  if (unwrapped.type === "CallExpression") {
    const callee = at<AstNode>(unwrapped, "callee");
    const calleeName =
      callee.type === "Identifier"
        ? at<string>(callee, "name")
        : callee.type === "MemberExpression"
          ? at<AstNode>(callee, "property").type === "Identifier"
            ? at<string>(at<AstNode>(callee, "property"), "name")
            : undefined
          : undefined;
    if (calleeName && PROPS_FORWARD_REF_NAMES.has(calleeName)) {
      const callTypeArguments = at<AstNode | undefined>(unwrapped, "typeArguments");
      const callTypeArgumentNodes =
        callTypeArguments && callTypeArguments.type === "TSTypeParameterInstantiation"
          ? at<AstNode[]>(callTypeArguments, "params")
          : [];
      const propsArgumentIndex = calleeName === "forwardRef" ? 1 : 0;
      const propsType = callTypeArgumentNodes[propsArgumentIndex];
      const callArguments = at<AstNode[]>(unwrapped, "arguments");
      const innerFunction = callArguments[0];
      if (
        innerFunction &&
        (innerFunction.type === "ArrowFunctionExpression" ||
          innerFunction.type === "FunctionExpression")
      ) {
        const result: { functionNode: AstNode; propsTypeFromVariable?: AstNode } = {
          functionNode: innerFunction,
        };
        if (propsType) {
          result.propsTypeFromVariable = propsType;
        } else if (propsTypeFromVariable) {
          result.propsTypeFromVariable = propsTypeFromVariable;
        }
        return result;
      }
    }
  }

  if (unwrapped.type === "Identifier") {
    const aliasName = at<string>(unwrapped, "name");
    if (seen.has(aliasName)) return undefined;
    seen.add(aliasName);
    const aliasBinding = bindings.valueBindings.get(aliasName);
    if (!aliasBinding) return undefined;
    return resolveValueBindingToFunction(aliasBinding, bindings, seen);
  }

  if (unwrapped.type === "MemberExpression") {
    return {
      functionNode: { type: "OpenstoryAliasComponent", params: [] } as unknown as AstNode,
    };
  }

  return undefined;
};

const propsTypeFromFcAnnotation = (variableType: AstNode): AstNode | undefined => {
  if (variableType.type !== "TSTypeReference") return undefined;
  const referenceName = resolveTypeReferenceName(variableType);
  if (!referenceName || !PROPS_FC_TYPE_NAMES.has(referenceName)) return undefined;
  const typeArguments = at<AstNode | undefined>(variableType, "typeArguments");
  if (!typeArguments || typeArguments.type !== "TSTypeParameterInstantiation") return undefined;
  const params = at<AstNode[]>(typeArguments, "params");
  return params[0];
};

const firstParamTypeAnnotation = (functionNode: AstNode): AstNode | undefined => {
  const params = at<AstNode[]>(functionNode, "params");
  const firstParam = params[0];
  if (!firstParam) return undefined;
  const target =
    firstParam.type === "AssignmentPattern" ? at<AstNode>(firstParam, "left") : firstParam;
  const typeAnnotation = at<AstNode | null | undefined>(target, "typeAnnotation");
  if (!typeAnnotation) return undefined;
  return at<AstNode>(typeAnnotation, "typeAnnotation");
};

interface DestructuredProp {
  name: string;
  defaultValue?: unknown;
}

const extractDestructuredProps = (functionNode: AstNode): DestructuredProp[] => {
  const params = at<AstNode[]>(functionNode, "params");
  const firstParam = params[0];
  if (!firstParam) return [];
  const objectPattern =
    firstParam.type === "AssignmentPattern" ? at<AstNode>(firstParam, "left") : firstParam;
  if (objectPattern.type !== "ObjectPattern") return [];
  const destructured: DestructuredProp[] = [];
  for (const property of at<AstNode[]>(objectPattern, "properties")) {
    if (property.type !== "Property") continue;
    const key = at<AstNode>(property, "key");
    const value = at<AstNode>(property, "value");
    if (key.type !== "Identifier") continue;
    const propertyName = at<string>(key, "name");
    if (value.type === "AssignmentPattern") {
      const defaultExpression = at<AstNode>(value, "right");
      const evaluated = evalLiteral(defaultExpression);
      const entry: DestructuredProp = { name: propertyName };
      if (evaluated !== undefined && !isComputedSentinel(evaluated)) {
        entry.defaultValue = evaluated;
      }
      destructured.push(entry);
      continue;
    }
    destructured.push({ name: propertyName });
  }
  return destructured;
};

const extractDestructureDefaults = (functionNode: AstNode): Map<string, unknown> => {
  const defaults = new Map<string, unknown>();
  for (const entry of extractDestructuredProps(functionNode)) {
    if (entry.defaultValue !== undefined) defaults.set(entry.name, entry.defaultValue);
  }
  return defaults;
};

const inferKindFromValue = (value: unknown): PropKind | undefined => {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  return undefined;
};

const synthesizeDestructureOnlyProps = (
  functionNode: AstNode,
  existingProps: PropSchema[],
): PropSchema[] => {
  const existingNames = new Set(existingProps.map((prop) => prop.name));
  const destructured = extractDestructuredProps(functionNode);
  const synthesized: PropSchema[] = [];
  for (const entry of destructured) {
    if (existingNames.has(entry.name)) continue;
    if (entry.defaultValue === undefined) continue;
    const inferredKind = inferKindFromValue(entry.defaultValue);
    if (!inferredKind) continue;
    synthesized.push({
      name: entry.name,
      optional: true,
      kind: inferredKind,
      defaultValue: entry.defaultValue,
    });
  }
  return synthesized;
};

const isComputedSentinel = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "__computed" in (value as Record<string, unknown>);

const findComponentDeclarator = (
  bindings: FileBindings,
  componentName: string,
): AstNode | undefined => bindings.valueBindings.get(componentName);

interface AliasResolution {
  typeNode: AstNode;
  sourceFile: ParsedFile;
}

const resolveTypeReferenceToAliasNode = async (
  typeReference: AstNode,
  parsedFile: ParsedFile,
  context: ResolveContext,
  visited: Set<string>,
): Promise<AliasResolution | undefined> => {
  const referenceName = resolveTypeReferenceName(typeReference);
  if (!referenceName) return undefined;
  const visitKey = visitedTypeKey(parsedFile.filename, referenceName);
  if (visited.has(visitKey)) return undefined;
  visited.add(visitKey);

  const bindings = collectBindings(parsedFile.program);
  const localBinding = bindings.typeBindings.get(referenceName);
  if (localBinding) {
    if (localBinding.type === "TSTypeAliasDeclaration") {
      const annotation = at<AstNode>(localBinding, "typeAnnotation");
      if (annotation.type === "TSTypeReference") {
        const deeper = await resolveTypeReferenceToAliasNode(
          annotation,
          parsedFile,
          context,
          visited,
        );
        if (deeper) return deeper;
      }
      return { typeNode: annotation, sourceFile: parsedFile };
    }
    return undefined;
  }

  const importRecord =
    bindings.importBindings.get(referenceName) ?? bindings.reexportBindings.get(referenceName);
  if (!importRecord) return undefined;
  const resolvedPath = await resolveImportPath(parsedFile.filename, importRecord.source, context);
  if (!resolvedPath) return undefined;
  const externalFile = await loadParsedFile(resolvedPath, context);
  if (!externalFile) return undefined;
  const externalBindings = collectBindings(externalFile.program);
  const externalLocal = externalBindings.typeBindings.get(importRecord.importedName);
  if (externalLocal) {
    if (externalLocal.type === "TSTypeAliasDeclaration") {
      const annotation = at<AstNode>(externalLocal, "typeAnnotation");
      if (annotation.type === "TSTypeReference") {
        const deeper = await resolveTypeReferenceToAliasNode(
          annotation,
          externalFile,
          context,
          visited,
        );
        if (deeper) return deeper;
      }
      return { typeNode: annotation, sourceFile: externalFile };
    }
    return undefined;
  }
  const externalReexport = externalBindings.reexportBindings.get(importRecord.importedName);
  if (externalReexport) {
    const reexportPath = await resolveImportPath(
      externalFile.filename,
      externalReexport.source,
      context,
    );
    if (!reexportPath) return undefined;
    const reexportFile = await loadParsedFile(reexportPath, context);
    if (!reexportFile) return undefined;
    const syntheticReference: AstNode = {
      type: "TSTypeReference",
      typeName: { type: "Identifier", name: externalReexport.importedName } as unknown as AstNode,
    };
    return resolveTypeReferenceToAliasNode(syntheticReference, reexportFile, context, visited);
  }
  return undefined;
};

const resolveReferenceToEnum = async (
  typeReference: AstNode,
  parsedFile: ParsedFile,
  context: ResolveContext,
): Promise<{ kind: PropKind; options: Array<string | number> } | undefined> => {
  const referenceName = resolveTypeReferenceName(typeReference);
  if (!referenceName) return undefined;
  const bindings = collectBindings(parsedFile.program);
  const localEnum = bindings.enumBindings.get(referenceName);
  if (localEnum) {
    const enumClassification = enumDeclarationToOptions(localEnum);
    if (enumClassification) return enumClassification;
  }
  const importRecord =
    bindings.importBindings.get(referenceName) ?? bindings.reexportBindings.get(referenceName);
  if (!importRecord) return undefined;
  const resolvedPath = await resolveImportPath(parsedFile.filename, importRecord.source, context);
  if (!resolvedPath) return undefined;
  const externalFile = await loadParsedFile(resolvedPath, context);
  if (!externalFile) return undefined;
  const externalBindings = collectBindings(externalFile.program);
  const externalEnum = externalBindings.enumBindings.get(importRecord.importedName);
  if (!externalEnum) return undefined;
  return enumDeclarationToOptions(externalEnum);
};

const memberToPropSchema = async (
  member: TypeMember,
  destructureDefaults: Map<string, unknown>,
  context: ResolveContext,
): Promise<PropSchema | undefined> => {
  const innerType = member.typeNode;
  const union = analyzeUnion(innerType);
  const effectiveType = union.members.length === 1 ? union.members[0]! : innerType;
  let classification = classifyType(effectiveType, member.name);

  if (classification.kind === "unknown" && effectiveType.type === "TSTypeReference") {
    const enumClassification = await resolveReferenceToEnum(
      effectiveType,
      member.sourceFile,
      context,
    );
    if (enumClassification) {
      classification = enumClassification;
    } else {
      const aliasResolved = await resolveTypeReferenceToAliasNode(
        effectiveType,
        member.sourceFile,
        context,
        new Set(),
      );
      if (aliasResolved) {
        const aliasUnion = analyzeUnion(aliasResolved.typeNode);
        const aliasEffective =
          aliasUnion.members.length === 1 ? aliasUnion.members[0]! : aliasResolved.typeNode;
        const aliasClassification = classifyType(aliasEffective, member.name);
        if (aliasClassification.kind !== "unknown") classification = aliasClassification;
      } else if (PROPS_NODE_NAME_HINTS.has(member.name)) {
        classification = { kind: "node" };
      }
    }
  }

  if (classification.kind === "unknown") {
    const indexedVariantResult = await tryResolveIndexedVariantPropsAccess(
      effectiveType,
      member.sourceFile,
      context,
    );
    if (indexedVariantResult) {
      classification = { kind: "enum", options: indexedVariantResult.options };
      if (indexedVariantResult.defaultValue !== undefined && member.defaultValue === undefined) {
        member.defaultValue = indexedVariantResult.defaultValue;
      }
    }
  }

  if (classification.kind === "unknown" && looksLikeEventHandlerName(member.name)) {
    classification = { kind: "function" };
  }

  if (classification.kind === "unknown" && isRefTypeReference(effectiveType)) {
    classification = { kind: "function" };
  }

  if (classification.kind === "unknown" && PROPS_NODE_NAME_HINTS.has(member.name)) {
    classification = { kind: "node" };
  }

  if (classification.kind === "unknown" && PROPS_DATE_NAME_HINTS.has(member.name)) {
    classification = { kind: "string" };
    if (member.defaultValue === undefined) {
      member.defaultValue = PROPS_DATE_PLACEHOLDER_ISO;
    }
  }

  if (classification.kind === "unknown") {
    const destructureDefaultForKind = destructureDefaults.get(member.name);
    if (typeof destructureDefaultForKind === "string") classification = { kind: "string" };
    else if (typeof destructureDefaultForKind === "number") classification = { kind: "number" };
    else if (typeof destructureDefaultForKind === "boolean") classification = { kind: "boolean" };
  }

  const schema: PropSchema = {
    name: member.name,
    optional: member.optional || union.hasUndefined,
    kind: classification.kind,
  };
  if (classification.options) schema.options = classification.options;
  if (member.description) schema.description = member.description;

  const destructureDefault = destructureDefaults.get(member.name);
  if (destructureDefault !== undefined) {
    schema.defaultValue = destructureDefault;
  } else if (member.defaultValue !== undefined) {
    schema.defaultValue = member.defaultValue;
  } else if (member.jsDocBlock) {
    const jsDocDefault = parseJsDocDefault(member.jsDocBlock);
    if (jsDocDefault !== undefined) schema.defaultValue = jsDocDefault;
  }

  return schema;
};

export const extractPropsFromComponent = async (
  source: string,
  filename: string,
  componentName: string,
  options: ExtractPropsOptions = {},
): Promise<ExtractPropsResult> => {
  const parseCache = options.parseCache ?? new Map<string, ParsedFile>();
  const tsconfigPathsCache = options.tsconfigPathsCache ?? new Map<string, TsconfigPaths | null>();
  const readFile = options.readFile ?? ((absolutePath) => nodeReadFile(absolutePath, "utf8"));

  let parsedFile: ParsedFile;
  try {
    parsedFile = parseSourceFile(filename, source);
  } catch {
    return { props: [], resolvedAsFunction: false };
  }
  parseCache.set(filename, parsedFile);

  const context: ResolveContext = {
    readFile,
    parseCache,
    tsconfigPathsCache,
    visitedTypes: new Set<string>(),
    visitedFiles: new Set<string>([filename]),
  };

  const bindings = collectBindings(parsedFile.program);
  const declarator = findComponentDeclarator(bindings, componentName);
  if (!declarator) return { props: [], resolvedAsFunction: false };

  const resolved = resolveValueBindingToFunction(declarator, bindings, new Set([componentName]));
  if (!resolved) return { props: [], resolvedAsFunction: false };

  const propsType =
    resolved.propsTypeFromVariable ?? firstParamTypeAnnotation(resolved.functionNode);
  const members = propsType
    ? await resolveTypeNodeToMembers(propsType, parsedFile, context, 0)
    : [];
  const destructureDefaults = extractDestructureDefaults(resolved.functionNode);

  const props: PropSchema[] = [];
  for (const member of members) {
    const schema = await memberToPropSchema(member, destructureDefaults, context);
    if (schema) props.push(schema);
  }

  const synthesizedFromDestructure = synthesizeDestructureOnlyProps(resolved.functionNode, props);
  props.push(...synthesizedFromDestructure);

  if (!propsType) return { props, resolvedAsFunction: true };
  const typeName = resolveTypeReferenceName(propsType);
  if (!typeName || PROPS_UTILITY_TYPE_NAMES.has(typeName)) {
    return { props, resolvedAsFunction: true };
  }
  return { props, typeName, resolvedAsFunction: true };
};
