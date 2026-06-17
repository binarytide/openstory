import { basename } from "node:path";
import { parseSync } from "oxc-parser";
import { at, type AstNode, unwrapTypeAnnotations } from "../csf/ast-helpers.js";
import type { Framework } from "../types.js";

export interface DetectedComponent {
  name: string;
  isDefaultExport: boolean;
}

const PASCAL_CASE_REGEX = /^[A-Z][A-Za-z0-9_]*$/;

const isPascalCase = (name: string): boolean => PASCAL_CASE_REGEX.test(name);

const baseNameWithoutExtension = (filename: string): string => {
  const filenameOnly = basename(filename);
  const lastDot = filenameOnly.lastIndexOf(".");
  return lastDot === -1 ? filenameOnly : filenameOnly.slice(0, lastDot);
};

const toPascalCase = (rawName: string): string => {
  const cleaned = rawName.replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (cleaned === "") return "Component";
  return cleaned
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
};

const fileBaseAsComponentName = (filename: string): string =>
  toPascalCase(baseNameWithoutExtension(filename));

const collectFromVariableDeclaration = (
  declaration: AstNode,
  isDefault: boolean,
  components: DetectedComponent[],
  seenNames: Set<string>,
): void => {
  const declarators = at<AstNode[]>(declaration, "declarations");
  for (const declarator of declarators) {
    const identifierNode = at(declarator, "id");
    if (identifierNode.type !== "Identifier") continue;
    const name = at<string>(identifierNode, "name");
    if (!isPascalCase(name) || seenNames.has(name)) continue;
    seenNames.add(name);
    components.push({ name, isDefaultExport: isDefault });
  }
};

const collectFromFunctionDeclaration = (
  declaration: AstNode,
  isDefault: boolean,
  components: DetectedComponent[],
  seenNames: Set<string>,
): void => {
  const identifierNode = at<AstNode | undefined>(declaration, "id");
  if (identifierNode?.type !== "Identifier") return;
  const name = at<string>(identifierNode, "name");
  if (!isPascalCase(name) || seenNames.has(name)) return;
  seenNames.add(name);
  components.push({ name, isDefaultExport: isDefault });
};

const findComponentsInJsxLikeSource = (source: string, filename: string): DetectedComponent[] => {
  const language = filename.endsWith("x") ? "tsx" : "ts";
  const parseResult = parseSync(filename, source, { lang: language });
  if (parseResult.errors.length > 0) return [];

  const program = parseResult.program as unknown as AstNode;
  const components: DetectedComponent[] = [];
  const seenNames = new Set<string>();
  let foundDefaultExport = false;

  const bindings: Record<string, AstNode | undefined> = {};
  for (const statement of at<AstNode[]>(program, "body")) {
    if (statement.type === "VariableDeclaration") {
      for (const declarator of at<AstNode[]>(statement, "declarations")) {
        const identifierNode = at(declarator, "id");
        if (identifierNode.type !== "Identifier") continue;
        bindings[at<string>(identifierNode, "name")] = at<AstNode | undefined>(declarator, "init");
      }
    }
  }

  for (const statement of at<AstNode[]>(program, "body")) {
    if (statement.type === "ExportNamedDeclaration") {
      const declaration = at<AstNode | null>(statement, "declaration");
      if (declaration) {
        if (declaration.type === "VariableDeclaration") {
          collectFromVariableDeclaration(declaration, false, components, seenNames);
        } else if (declaration.type === "FunctionDeclaration") {
          collectFromFunctionDeclaration(declaration, false, components, seenNames);
        }
      }
      const specifiers = at<AstNode[] | undefined>(statement, "specifiers");
      for (const specifier of specifiers ?? []) {
        if (specifier.type !== "ExportSpecifier") continue;
        const exportedNode = at(specifier, "exported");
        if (exportedNode.type !== "Identifier") continue;
        const exportedName = at<string>(exportedNode, "name");
        if (exportedName === "default") {
          foundDefaultExport = true;
          continue;
        }
        if (!isPascalCase(exportedName) || seenNames.has(exportedName)) continue;
        seenNames.add(exportedName);
        components.push({ name: exportedName, isDefaultExport: false });
      }
      continue;
    }

    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = unwrapTypeAnnotations(at(statement, "declaration"));
      if (!declaration) continue;
      foundDefaultExport = true;
      if (declaration.type === "FunctionDeclaration") {
        collectFromFunctionDeclaration(declaration, true, components, seenNames);
      } else if (declaration.type === "Identifier") {
        const name = at<string>(declaration, "name");
        if (isPascalCase(name) && !seenNames.has(name)) {
          seenNames.add(name);
          components.push({ name, isDefaultExport: true });
        }
      }
    }
  }

  if (foundDefaultExport && !components.some((entry) => entry.isDefaultExport)) {
    const fallbackName = fileBaseAsComponentName(filename);
    if (!seenNames.has(fallbackName)) {
      components.push({ name: fallbackName, isDefaultExport: true });
    }
  }

  return components;
};

export const findComponentsInFile = (
  source: string,
  filename: string,
  framework: Framework,
): DetectedComponent[] => {
  if (framework === "foldkit") {
    return [{ name: fileBaseAsComponentName(filename), isDefaultExport: true }];
  }
  if (framework === "vue" || framework === "svelte") {
    return [{ name: fileBaseAsComponentName(filename), isDefaultExport: true }];
  }
  try {
    return findComponentsInJsxLikeSource(source, filename);
  } catch {
    return [];
  }
};
