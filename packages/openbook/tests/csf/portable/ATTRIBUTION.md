# Ported tests: attribution

The test files in this directory are forked from upstream projects under the MIT license.
They serve as Openbook's CSF spec compatibility suite: passing them is part of the
definition-of-done for any release that touches the parser, id generation, or
include/exclude logic.

## ComponentDriven/csf

- **License:** MIT
- **Source:** <https://github.com/ComponentDriven/csf>
- **Files derived from upstream:**
  - `to-id.test.ts` (from `src/index.test.ts > describe('toId')`)
  - `story-name-from-export.test.ts` (from `src/index.test.ts > describe('storyNameFromExport')`)
  - `is-export-story.test.ts` (from `src/index.test.ts > describe('isExportStory')`)
  - `combine-tags.test.ts` (from `src/index.test.ts > describe('combineTags')`)
  - `include-conditional-arg.test.ts` (from `src/includeConditionalArg.test.ts`)

## storybookjs/storybook

- **License:** MIT
- **Source:** <https://github.com/storybookjs/storybook>
- **Files derived from upstream:**
  - `csf-file.test.ts` (from `code/core/src/csf-tools/CsfFile.test.ts`. Subset, adapted to Openbook's flatter parser output shape.)

## What "adapted" means

- Imports updated to point at Openbook's modules.
- Error message expectations updated to match Openbook's `OpenbookCsfXxxError` classes.
- Storybook-internal cruft (`_metaAnnotations`, `_storyAnnotations`, `__stats`)
  dropped from assertions since Openbook's parser exposes a flatter, public-API-only shape.
- Angular `@Component`-decorator edge cases dropped from `csf-file.test.ts`;
  Openbook does not target Angular.
- `enrichCsf` and `getStorySortParameter` tests are not ported since those features
  are deferred to v0.1.0.
