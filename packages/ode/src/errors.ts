export type OdeErrorCategory =
  | "config"
  | "csf"
  | "render"
  | "adapter"
  | "cli"
  | "build"
  | "plugin";

export interface OdeErrorData {
  [key: string]: unknown;
}

export abstract class OdeError extends Error {
  abstract readonly code: string;
  abstract readonly category: OdeErrorCategory;
  abstract readonly exitCode: number;

  readonly data: OdeErrorData;
  readonly docsUrl: string;

  constructor(message: string, data: OdeErrorData = {}) {
    super(message);
    this.name = this.constructor.name;
    this.data = data;
    this.docsUrl = `https://ode.dev/errors/${this.constructor.name}`;
  }

  override toString(): string {
    return `${this.code}: ${this.message}\n  → ${this.docsUrl}`;
  }
}

export class OdeConfigError extends OdeError {
  readonly category = "config" as const;
  readonly exitCode = 1;
  readonly code: string = "OdeConfigError";
}

export class OdeConfigMissingFrameworkError extends OdeConfigError {
  override readonly code = "OdeConfigMissingFrameworkError";
  constructor(detected: string[]) {
    super(
      `Could not detect a framework. Found in package.json: ${
        detected.length > 0 ? detected.join(", ") : "none"
      }. Install one of: react, solid-js — or set \`framework\` in ode() options.`,
      { detected },
    );
  }
}

export class OdeConfigAmbiguousFrameworkError extends OdeConfigError {
  override readonly code = "OdeConfigAmbiguousFrameworkError";
  constructor(candidates: string[]) {
    super(
      `Multiple frameworks detected: ${candidates.join(
        ", ",
      )}. Set \`framework\` in ode() options to disambiguate.`,
      { candidates },
    );
  }
}

export class OdeConfigPreviewNotFoundError extends OdeConfigError {
  override readonly code = "OdeConfigPreviewNotFoundError";
  constructor(searched: string[]) {
    super(
      `\`preview\` not found. Searched: ${searched.join(
        ", ",
      )}. Create preview.tsx at project root, or set \`preview\` in ode() options.`,
      { searched },
    );
  }
}

export class OdeConfigMultiplePreviewsError extends OdeConfigError {
  override readonly code = "OdeConfigMultiplePreviewsError";
  constructor(found: string[]) {
    super(
      `Multiple preview files found: ${found.join(
        ", ",
      )}. Keep one and delete the others, or set \`preview\` in ode() options.`,
      { found },
    );
  }
}

export class OdeConfigInvalidOptionsError extends OdeConfigError {
  override readonly code = "OdeConfigInvalidOptionsError";
  constructor(field: string, reason: string) {
    super(`Invalid ode() option \`${field}\`: ${reason}.`, { field, reason });
  }
}

export class OdeCsfError extends OdeError {
  readonly category = "csf" as const;
  readonly exitCode = 2;
  readonly code: string = "OdeCsfError";
}

export class OdeCsfMissingDefaultExportError extends OdeCsfError {
  override readonly code = "OdeCsfMissingDefaultExportError";
  constructor(filename: string) {
    super(
      `${filename}: CSF requires a default export with story metadata. Add: \`export default { title: '...' }\`.`,
      { filename },
    );
  }
}

export class OdeCsfBadMetaError extends OdeCsfError {
  override readonly code = "OdeCsfBadMetaError";
  constructor(filename: string, hint: string) {
    super(
      `${filename}: default export must be an object literal. ${hint}`,
      { filename, hint },
    );
  }
}

export class OdeCsfDynamicTitleError extends OdeCsfError {
  override readonly code = "OdeCsfDynamicTitleError";
  constructor(filename: string, line: number) {
    super(
      `${filename}:${line}: \`title\` must be a string literal. Dynamic titles (expressions, template literals, function calls) are not supported by the static parser.`,
      { filename, line },
    );
  }
}

export class OdeCsfDuplicateStoryIdError extends OdeCsfError {
  override readonly code = "OdeCsfDuplicateStoryIdError";
  constructor(id: string, files: string[]) {
    super(
      `Duplicate story id "${id}" across files: ${files.join(
        ", ",
      )}. Disambiguate via meta.id or meta.title.`,
      { id, files },
    );
  }
}

export class OdeCsfInvalidTitleError extends OdeCsfError {
  override readonly code = "OdeCsfInvalidTitleError";
  constructor(filename: string, title: string) {
    super(
      `${filename}: Invalid title "${title}" — must include alphanumeric characters.`,
      { filename, title },
    );
  }
}

export class OdeCsfInvalidStoryNameError extends OdeCsfError {
  override readonly code = "OdeCsfInvalidStoryNameError";
  constructor(name: string) {
    super(
      `Invalid story name "${name}" — must include alphanumeric characters.`,
      { name },
    );
  }
}

export class OdeCsfInvalidTagError extends OdeCsfError {
  override readonly code = "OdeCsfInvalidTagError";
  constructor(filename: string, hint: string) {
    super(`${filename}: ${hint}`, { filename });
  }
}

export class OdeCsfStoriesOfError extends OdeCsfError {
  override readonly code = "OdeCsfStoriesOfError";
  constructor(filename: string) {
    super(
      `${filename}: \`storiesOf\` is not supported. Use CSF 3 (default export with object literal + named story exports).`,
      { filename },
    );
  }
}

export class OdeCsfParseError extends OdeCsfError {
  override readonly code = "OdeCsfParseError";
  constructor(filename: string, message: string) {
    super(`${filename}: failed to parse — ${message}`, { filename, parseMessage: message });
  }
}

export class OdeAdapterError extends OdeError {
  readonly category = "adapter" as const;
  readonly exitCode = 3;
  readonly code: string = "OdeAdapterError";
}

export class OdeAdapterMissingFrameworkError extends OdeAdapterError {
  override readonly code = "OdeAdapterMissingFrameworkError";
  constructor(framework: string, install: string) {
    super(
      `ode/${framework} requires ${install} to be installed. Run \`pnpm add ${install}\`.`,
      { framework, install },
    );
  }
}

export class OdeRenderError extends OdeError {
  readonly category = "render" as const;
  readonly exitCode = 4;
  readonly code: string = "OdeRenderError";
}

const KNOWN_IDS_PREVIEW_LIMIT = 5;

export class OdeStoryNotFoundError extends OdeRenderError {
  override readonly code = "OdeStoryNotFoundError";
  constructor(id: string, knownIds: string[]) {
    const shownIds = knownIds.slice(0, KNOWN_IDS_PREVIEW_LIMIT).join(", ");
    const overflow =
      knownIds.length > KNOWN_IDS_PREVIEW_LIMIT
        ? ` (+${knownIds.length - KNOWN_IDS_PREVIEW_LIMIT} more)`
        : "";
    super(`Story "${id}" not found. Available: ${shownIds}${overflow}.`, {
      id,
      knownIds,
    });
  }
}

export class OdeBeforeEachError extends OdeRenderError {
  override readonly code = "OdeBeforeEachError";
  constructor(storyId: string, cause: unknown) {
    super(
      `${storyId}: beforeEach hook threw. ${cause instanceof Error ? cause.message : String(cause)}`,
      { storyId },
    );
    if (cause instanceof Error) this.cause = cause;
  }
}

export class OdePlayError extends OdeRenderError {
  override readonly code = "OdePlayError";
  constructor(storyId: string, cause: unknown) {
    super(
      `${storyId}: play function threw. ${cause instanceof Error ? cause.message : String(cause)}`,
      { storyId },
    );
    if (cause instanceof Error) this.cause = cause;
  }
}

export class OdeMountError extends OdeRenderError {
  override readonly code = "OdeMountError";
  constructor(storyId: string, cause: unknown) {
    super(
      `${storyId}: mount threw. ${cause instanceof Error ? cause.message : String(cause)}`,
      { storyId },
    );
    if (cause instanceof Error) this.cause = cause;
  }
}

export class OdePluginError extends OdeError {
  readonly category = "plugin" as const;
  readonly exitCode = 1;
  readonly code: string = "OdePluginError";
}

export class OdePluginManifestSchemaError extends OdePluginError {
  override readonly code = "OdePluginManifestSchemaError";
  constructor(reason: string) {
    super(`Manifest schema validation failed: ${reason}.`, { reason });
  }
}

export class OdeCliError extends OdeError {
  readonly category = "cli" as const;
  readonly exitCode = 1;
  readonly code: string = "OdeCliError";
}

export class OdeCliUnknownCommandError extends OdeCliError {
  override readonly code = "OdeCliUnknownCommandError";
  constructor(cmd: string, known: string[]) {
    super(`Unknown command "${cmd}". Available: ${known.join(", ")}.`, { cmd, known });
  }
}

export class OdeCliMissingArgError extends OdeCliError {
  override readonly code = "OdeCliMissingArgError";
  constructor(cmd: string, arg: string) {
    super(`\`ode ${cmd}\` requires \`<${arg}>\` argument.`, { cmd, arg });
  }
}

export class OdeBuildError extends OdeError {
  readonly category = "build" as const;
  readonly exitCode = 4;
  readonly code: string = "OdeBuildError";
}

export class OdeBuildFailedError extends OdeBuildError {
  override readonly code = "OdeBuildFailedError";
  constructor(reason: string) {
    super(`Build failed: ${reason}.`, { reason });
  }
}
