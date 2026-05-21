export const escapeHtml = (input: string): string =>
  input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
