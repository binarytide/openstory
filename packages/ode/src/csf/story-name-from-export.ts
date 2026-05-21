const toStartCase = (input: string): string =>
  input
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\./g, " ")
    .replace(/([^\n])([A-Z])([a-z])/g, (_match, before, upper, lower) => `${before} ${upper}${lower}`)
    .replace(/([a-z])([A-Z])/g, (_match, lower, upper) => `${lower} ${upper}`)
    .replace(/([a-z])([0-9])/gi, (_match, letter, digit) => `${letter} ${digit}`)
    .replace(/([0-9])([a-z])/gi, (_match, digit, letter) => `${digit} ${letter}`)
    .replace(/(\s|^)(\w)/g, (_match, leadingSpace, letter) => `${leadingSpace}${letter.toUpperCase()}`)
    .replace(/ +/g, " ")
    .trim();

export const storyNameFromExport = (key: string): string => toStartCase(key);
