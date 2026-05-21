export type OpenbookErrorCategory =
  | "config"
  | "csf"
  | "render"
  | "adapter"
  | "cli"
  | "build"
  | "plugin";

export interface OpenbookErrorData {
  [key: string]: unknown;
}

export abstract class OpenbookError extends Error {
  abstract readonly code: string;
  abstract readonly category: OpenbookErrorCategory;
  abstract readonly exitCode: number;

  readonly data: OpenbookErrorData;
  readonly docsUrl: string;

  constructor(message: string, data: OpenbookErrorData = {}) {
    super(message);
    this.name = this.constructor.name;
    this.data = data;
    this.docsUrl = `https://openbook.dev/errors/${this.constructor.name}`;
  }

  override toString(): string {
    return `${this.code}: ${this.message}\n  → ${this.docsUrl}`;
  }
}

export class OpenbookConfigError extends OpenbookError {
  readonly category = "config" as const;
  readonly exitCode = 1;
  readonly code: string = "OpenbookConfigError";
}

export class OpenbookConfigMissingFrameworkError extends OpenbookConfigError {
  override readonly code = "OpenbookConfigMissingFrameworkError";
  constructor(detected: string[]) {
    super(
      `Could not detect a framework. Found in package.json: ${
        detected.length > 0 ? detected.join(", ") : "none"
      }. Install one of: react, solid-js, or set \`framework\` in openbook() options.`,
      { detected },
    );
  }
}

export class OpenbookConfigAmbiguousFrameworkError extends OpenbookConfigError {
  override readonly code = "OpenbookConfigAmbiguousFrameworkError";
  constructor(candidates: string[]) {
    super(
      `Multiple frameworks detected: ${candidates.join(
        ", ",
      )}. Set \`framework\` in openbook() options to disambiguate.`,
      { candidates },
    );
  }
}

export class OpenbookConfigPreviewNotFoundError extends OpenbookConfigError {
  override readonly code = "OpenbookConfigPreviewNotFoundError";
  constructor(searched: string[]) {
    super(
      `\`preview\` not found. Searched: ${searched.join(
        ", ",
      )}. Create preview.tsx at project root, or set \`preview\` in openbook() options.`,
      { searched },
    );
  }
}

export class OpenbookConfigMultiplePreviewsError extends OpenbookConfigError {
  override readonly code = "OpenbookConfigMultiplePreviewsError";
  constructor(found: string[]) {
    super(
      `Multiple preview files found: ${found.join(
        ", ",
      )}. Keep one and delete the others, or set \`preview\` in openbook() options.`,
      { found },
    );
  }
}

export class OpenbookConfigInvalidOptionsError extends OpenbookConfigError {
  override readonly code = "OpenbookConfigInvalidOptionsError";
  constructor(field: string, reason: string) {
    super(`Invalid openbook() option \`${field}\`: ${reason}.`, { field, reason });
  }
}

export class OpenbookCsfError extends OpenbookError {
  readonly category = "csf" as const;
  readonly exitCode = 2;
  readonly code: string = "OpenbookCsfError";
}

export class OpenbookCsfMissingDefaultExportError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfMissingDefaultExportError";
  constructor(filename: string) {
    super(
      `${filename}: CSF requires a default export with story metadata. Add: \`export default { title: '...' }\`.`,
      { filename },
    );
  }
}

export class OpenbookCsfBadMetaError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfBadMetaError";
  constructor(filename: string, hint: string) {
    super(`${filename}: default export must be an object literal. ${hint}`, { filename, hint });
  }
}

export class OpenbookCsfDynamicTitleError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfDynamicTitleError";
  constructor(filename: string, line: number) {
    super(
      `${filename}:${line}: \`title\` must be a string literal. Dynamic titles (expressions, template literals, function calls) are not supported by the static parser.`,
      { filename, line },
    );
  }
}

export class OpenbookCsfDuplicateStoryIdError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfDuplicateStoryIdError";
  constructor(id: string, files: string[]) {
    super(
      `Duplicate story id "${id}" across files: ${files.join(
        ", ",
      )}. Disambiguate via meta.id or meta.title.`,
      { id, files },
    );
  }
}

export class OpenbookCsfInvalidTitleError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfInvalidTitleError";
  constructor(filename: string, title: string) {
    super(`${filename}: Invalid title "${title}". Must include alphanumeric characters.`, {
      filename,
      title,
    });
  }
}

export class OpenbookCsfInvalidStoryNameError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfInvalidStoryNameError";
  constructor(name: string) {
    super(`Invalid story name "${name}". Must include alphanumeric characters.`, { name });
  }
}

export class OpenbookCsfInvalidTagError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfInvalidTagError";
  constructor(filename: string, hint: string) {
    super(`${filename}: ${hint}`, { filename });
  }
}

export class OpenbookCsfStoriesOfError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfStoriesOfError";
  constructor(filename: string) {
    super(
      `${filename}: \`storiesOf\` is not supported. Use CSF 3 (default export with object literal + named story exports).`,
      { filename },
    );
  }
}

export class OpenbookCsfParseError extends OpenbookCsfError {
  override readonly code = "OpenbookCsfParseError";
  constructor(filename: string, message: string) {
    super(`${filename}: failed to parse. ${message}`, { filename, parseMessage: message });
  }
}

export class OpenbookAdapterError extends OpenbookError {
  readonly category = "adapter" as const;
  readonly exitCode = 3;
  readonly code: string = "OpenbookAdapterError";
}

export class OpenbookAdapterMissingFrameworkError extends OpenbookAdapterError {
  override readonly code = "OpenbookAdapterMissingFrameworkError";
  constructor(framework: string, install: string) {
    super(
      `openbook/${framework} requires ${install} to be installed. Run \`pnpm add ${install}\`.`,
      { framework, install },
    );
  }
}

export class OpenbookRenderError extends OpenbookError {
  readonly category = "render" as const;
  readonly exitCode = 4;
  readonly code: string = "OpenbookRenderError";
}

const KNOWN_IDS_PREVIEW_LIMIT = 5;

export class OpenbookStoryNotFoundError extends OpenbookRenderError {
  override readonly code = "OpenbookStoryNotFoundError";
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

export class OpenbookBeforeEachError extends OpenbookRenderError {
  override readonly code = "OpenbookBeforeEachError";
  constructor(storyId: string, cause: unknown) {
    super(
      `${storyId}: beforeEach hook threw. ${cause instanceof Error ? cause.message : String(cause)}`,
      { storyId },
    );
    if (cause instanceof Error) this.cause = cause;
  }
}

export class OpenbookPlayError extends OpenbookRenderError {
  override readonly code = "OpenbookPlayError";
  constructor(storyId: string, cause: unknown) {
    super(
      `${storyId}: play function threw. ${cause instanceof Error ? cause.message : String(cause)}`,
      { storyId },
    );
    if (cause instanceof Error) this.cause = cause;
  }
}

export class OpenbookMountError extends OpenbookRenderError {
  override readonly code = "OpenbookMountError";
  constructor(storyId: string, cause: unknown) {
    super(`${storyId}: mount threw. ${cause instanceof Error ? cause.message : String(cause)}`, {
      storyId,
    });
    if (cause instanceof Error) this.cause = cause;
  }
}

export class OpenbookPluginError extends OpenbookError {
  readonly category = "plugin" as const;
  readonly exitCode = 1;
  readonly code: string = "OpenbookPluginError";
}

export class OpenbookPluginManifestSchemaError extends OpenbookPluginError {
  override readonly code = "OpenbookPluginManifestSchemaError";
  constructor(reason: string) {
    super(`Manifest schema validation failed: ${reason}.`, { reason });
  }
}

export class OpenbookCliError extends OpenbookError {
  readonly category = "cli" as const;
  readonly exitCode = 1;
  readonly code: string = "OpenbookCliError";
}

export class OpenbookCliUnknownCommandError extends OpenbookCliError {
  override readonly code = "OpenbookCliUnknownCommandError";
  constructor(cmd: string, known: string[]) {
    super(`Unknown command "${cmd}". Available: ${known.join(", ")}.`, { cmd, known });
  }
}

export class OpenbookCliMissingArgError extends OpenbookCliError {
  override readonly code = "OpenbookCliMissingArgError";
  constructor(cmd: string, arg: string) {
    super(`\`openbook ${cmd}\` requires \`<${arg}>\` argument.`, { cmd, arg });
  }
}

export class OpenbookBuildError extends OpenbookError {
  readonly category = "build" as const;
  readonly exitCode = 4;
  readonly code: string = "OpenbookBuildError";
}

export class OpenbookBuildFailedError extends OpenbookBuildError {
  override readonly code = "OpenbookBuildFailedError";
  constructor(reason: string) {
    super(`Build failed: ${reason}.`, { reason });
  }
}
