import { basename, dirname, relative } from "node:path";
import {
  OPENSTORY_FRAMEWORK_TO_ADAPTER,
  PROPS_ARG_NOISE,
  PROPS_DISABLED_NAMES,
  PROPS_ERROR_NAMES,
  PROPS_LOADING_NAMES,
  PROPS_OPEN_NAMES,
  PROPS_PLACEHOLDER_STRING_VALUE,
  PROPS_PRESSED_NAMES,
  PROPS_SELECTED_NAMES,
  PROPS_VARIANT_NAME_PRIORITY,
  STORY_DEFAULT_EXPORT_NAME,
  STORY_FILE_HEADER,
  STORY_MAX_VARIANT_STORIES,
} from "../constants.js";
import type { Framework } from "../types.js";
import { deriveTitleFromPath } from "./derive-title-from-path.js";
import type { PropSchema } from "./extract-props.js";

export interface RenderStoryOptions {
  componentName: string;
  componentSourceAbsolutePath: string;
  componentIsDefaultExport?: boolean;
  framework: Framework;
  projectRoot: string;
  storyOutputAbsolutePath: string;
  props: PropSchema[];
  title?: string;
}

export interface RenderedStoryFile {
  source: string;
  storyExportNames: string[];
  importSpecifier: string;
}

interface StoryPlan {
  exportName: string;
  args?: Record<string, unknown>;
}

const PASCAL_BOUNDARY_REGEX = /[^A-Za-z0-9]+/g;
const STARTS_WITH_DIGIT_REGEX = /^[0-9]/;

const toPascalCase = (rawName: string): string => {
  const cleaned = rawName.replace(PASCAL_BOUNDARY_REGEX, " ").trim();
  if (cleaned === "") return "Story";
  return cleaned
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
};

const humanize = (rawName: string): string => {
  const spaced = rawName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(PASCAL_BOUNDARY_REGEX, " ")
    .trim();
  if (spaced === "") return rawName;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const buildImportSpecifier = (storyAbsolutePath: string, componentAbsolutePath: string): string => {
  const storyDirectory = dirname(storyAbsolutePath);
  const relativePath = relative(storyDirectory, componentAbsolutePath).split("\\").join("/");
  const withoutExtension = relativePath.replace(/\.[^./]+$/, "");
  const normalized = withoutExtension.startsWith(".") ? withoutExtension : `./${withoutExtension}`;
  return normalized;
};

const placeholderArgValue = (prop: PropSchema): unknown => {
  if (prop.defaultValue !== undefined) return prop.defaultValue;
  switch (prop.kind) {
    case "string":
      if (prop.name === "children" || /label|title|name|text|heading/i.test(prop.name)) {
        return PROPS_PLACEHOLDER_STRING_VALUE;
      }
      return humanize(prop.name);
    case "number":
      return 0;
    case "boolean":
      return false;
    case "enum":
      return prop.options?.[0];
    case "node":
      return prop.name === "children" ? PROPS_PLACEHOLDER_STRING_VALUE : undefined;
    case "array":
      return prop.optional ? undefined : [];
    case "object":
      return prop.optional ? undefined : {};
    default:
      return undefined;
  }
};

const REF_SUFFIX = "Ref";

const looksLikeRefPropName = (propName: string): boolean =>
  propName.endsWith(REF_SUFFIX) && propName.length > REF_SUFFIX.length;

const shouldIncludeInArgs = (prop: PropSchema): boolean => {
  if (PROPS_ARG_NOISE.has(prop.name)) return false;
  if (looksLikeRefPropName(prop.name)) return false;
  if (prop.kind === "function") return false;
  if (prop.kind === "unknown") return false;
  if (prop.kind === "object" && prop.defaultValue === undefined && prop.optional) return false;
  if (prop.kind === "array" && prop.defaultValue === undefined && prop.optional) return false;
  if (prop.kind === "node" && prop.name !== "children") return false;
  return true;
};

const buildBaseArgs = (props: PropSchema[]): Record<string, unknown> => {
  const baseArgs: Record<string, unknown> = {};
  for (const prop of props) {
    if (!shouldIncludeInArgs(prop)) continue;
    const value = placeholderArgValue(prop);
    if (value === undefined) continue;
    baseArgs[prop.name] = value;
  }
  return baseArgs;
};

const buildArgTypes = (props: PropSchema[]): Record<string, Record<string, unknown>> => {
  const argTypes: Record<string, Record<string, unknown>> = {};
  for (const prop of props) {
    if (PROPS_ARG_NOISE.has(prop.name)) continue;
    if (looksLikeRefPropName(prop.name)) continue;
    if (prop.kind === "function") continue;
    if (prop.kind === "unknown") continue;
    const entry: Record<string, unknown> = {};
    if (prop.kind === "enum" && prop.options) {
      entry.control = "select";
      entry.options = prop.options;
    }
    if (prop.description) entry.description = prop.description;
    if (Object.keys(entry).length > 0) argTypes[prop.name] = entry;
  }
  return argTypes;
};

const pickVariantProp = (props: PropSchema[]): PropSchema | undefined => {
  for (const preferredName of PROPS_VARIANT_NAME_PRIORITY) {
    const candidate = props.find(
      (prop) => prop.name === preferredName && prop.kind === "enum" && prop.options,
    );
    if (candidate) return candidate;
  }
  return props.find((prop) => prop.kind === "enum" && prop.options);
};

const planStories = (props: PropSchema[]): StoryPlan[] => {
  const plans: StoryPlan[] = [{ exportName: STORY_DEFAULT_EXPORT_NAME }];
  const usedNames = new Set<string>([STORY_DEFAULT_EXPORT_NAME]);
  const variantProp = pickVariantProp(props);

  if (variantProp?.options) {
    const variantNamePascal = toPascalCase(variantProp.name);
    let variantStoryCount = 0;
    for (const option of variantProp.options) {
      if (variantStoryCount >= STORY_MAX_VARIANT_STORIES) break;
      if (option === variantProp.defaultValue) continue;
      let candidate = toPascalCase(String(option));
      if (STARTS_WITH_DIGIT_REGEX.test(candidate)) {
        candidate = `${variantNamePascal}${candidate}`;
      }
      if (usedNames.has(candidate)) continue;
      usedNames.add(candidate);
      plans.push({ exportName: candidate, args: { [variantProp.name]: option } });
      variantStoryCount += 1;
    }
  }

  const addStatePlan = (exportName: string, propName: string) => {
    if (usedNames.has(exportName)) return;
    usedNames.add(exportName);
    plans.push({ exportName, args: { [propName]: true } });
  };

  for (const prop of props) {
    if (prop.kind !== "boolean") continue;
    if (PROPS_LOADING_NAMES.has(prop.name)) addStatePlan("Loading", prop.name);
    else if (PROPS_DISABLED_NAMES.has(prop.name)) addStatePlan("Disabled", prop.name);
    else if (PROPS_ERROR_NAMES.has(prop.name)) addStatePlan("WithError", prop.name);
    else if (PROPS_OPEN_NAMES.has(prop.name)) addStatePlan("Open", prop.name);
    else if (PROPS_PRESSED_NAMES.has(prop.name)) addStatePlan("Pressed", prop.name);
    else if (PROPS_SELECTED_NAMES.has(prop.name)) addStatePlan("Selected", prop.name);
  }

  return plans;
};

const SAFE_OBJECT_KEY_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const formatObjectKey = (key: string): string =>
  SAFE_OBJECT_KEY_REGEX.test(key) ? key : JSON.stringify(key);

interface SerializeOptions {
  identifierValues?: Set<string>;
}

const serializeValue = (value: unknown, level: number, options: SerializeOptions): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    if (options.identifierValues?.has(value)) return value;
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const innerIndent = "  ".repeat(level + 1);
    const closingIndent = "  ".repeat(level);
    const items = value.map((item) => `${innerIndent}${serializeValue(item, level + 1, options)}`);
    return `[\n${items.join(",\n")},\n${closingIndent}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
    if (entries.length === 0) return "{}";
    const innerIndent = "  ".repeat(level + 1);
    const closingIndent = "  ".repeat(level);
    const lines = entries.map(
      ([key, fieldValue]) =>
        `${innerIndent}${formatObjectKey(key)}: ${serializeValue(fieldValue, level + 1, options)},`,
    );
    return `{\n${lines.join("\n")}\n${closingIndent}}`;
  }
  return JSON.stringify(String(value));
};

const buildMetaObject = (
  componentName: string,
  title: string,
  baseArgs: Record<string, unknown>,
  argTypes: Record<string, Record<string, unknown>>,
): string => {
  const metaRecord: Record<string, unknown> = {
    title,
    component: componentName,
  };
  if (Object.keys(baseArgs).length > 0) metaRecord.args = baseArgs;
  if (Object.keys(argTypes).length > 0) metaRecord.argTypes = argTypes;
  return serializeValue(metaRecord, 0, { identifierValues: new Set([componentName]) });
};

const serializeStory = (plan: StoryPlan): string => {
  if (!plan.args || Object.keys(plan.args).length === 0) {
    return `export const ${plan.exportName}: Story = {};`;
  }
  const storyBody = serializeValue({ args: plan.args }, 0, {});
  return `export const ${plan.exportName}: Story = ${storyBody};`;
};

export const renderCsfStory = (options: RenderStoryOptions): RenderedStoryFile => {
  const importSpecifier = buildImportSpecifier(
    options.storyOutputAbsolutePath,
    options.componentSourceAbsolutePath,
  );
  const adapter = OPENSTORY_FRAMEWORK_TO_ADAPTER[options.framework];
  const componentRelativeForTitle = relative(
    options.projectRoot,
    options.componentSourceAbsolutePath,
  );
  const title = options.title ?? deriveTitleFromPath(componentRelativeForTitle);

  const componentImport = options.componentIsDefaultExport
    ? `import ${options.componentName} from ${JSON.stringify(importSpecifier)};`
    : `import { ${options.componentName} } from ${JSON.stringify(importSpecifier)};`;

  const baseArgs = buildBaseArgs(options.props);
  const argTypes = buildArgTypes(options.props);
  const metaObject = buildMetaObject(options.componentName, title, baseArgs, argTypes);
  const plans = planStories(options.props);
  const storyDeclarations = plans.map(serializeStory).join("\n\n");

  const source =
    `// ${STORY_FILE_HEADER}\n` +
    `import type { Meta, StoryObj } from ${JSON.stringify(adapter)};\n` +
    `${componentImport}\n\n` +
    `const meta = ${metaObject} satisfies Meta;\n` +
    `export default meta;\n\n` +
    `type Story = StoryObj<typeof meta>;\n\n` +
    `${storyDeclarations}\n`;

  return {
    source,
    storyExportNames: plans.map((plan) => plan.exportName),
    importSpecifier,
  };
};

export const deriveStoryOutputPath = (componentAbsolutePath: string): string => {
  const componentBase = basename(componentAbsolutePath);
  const directory = dirname(componentAbsolutePath);
  const lastDot = componentBase.lastIndexOf(".");
  const stem = lastDot === -1 ? componentBase : componentBase.slice(0, lastDot);
  const extension = lastDot === -1 ? "" : componentBase.slice(lastDot);
  return `${directory}/${stem}.stories${extension}`;
};
