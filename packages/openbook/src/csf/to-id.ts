import { OpenbookCsfInvalidStoryNameError, OpenbookCsfInvalidTitleError } from "../errors.js";

const SANITIZE_PUNCTUATION_RE = /[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi;
const COLLAPSE_HYPHENS_RE = /-+/g;
const LEADING_HYPHENS_RE = /^-+/;
const TRAILING_HYPHENS_RE = /-+$/;

export const sanitize = (input: string): string =>
  input
    .toLowerCase()
    .replace(SANITIZE_PUNCTUATION_RE, "-")
    .replace(COLLAPSE_HYPHENS_RE, "-")
    .replace(LEADING_HYPHENS_RE, "")
    .replace(TRAILING_HYPHENS_RE, "");

const sanitizeTitle = (input: string): string => {
  const sanitized = sanitize(input);
  if (sanitized === "") {
    throw new OpenbookCsfInvalidTitleError("<inline>", input);
  }
  return sanitized;
};

const sanitizeStoryName = (input: string): string => {
  const sanitized = sanitize(input);
  if (sanitized === "") {
    throw new OpenbookCsfInvalidStoryNameError(input);
  }
  return sanitized;
};

export const toId = (kind: string, name?: string): string =>
  `${sanitizeTitle(kind)}${name ? `--${sanitizeStoryName(name)}` : ""}`;
