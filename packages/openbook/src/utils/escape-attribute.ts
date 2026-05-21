export const escapeAttribute = (input: string): string =>
  input.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
