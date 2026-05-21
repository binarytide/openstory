const NEGATION_PREFIX = "!";

export const combineTags = (...tags: string[]): string[] => {
  const result = tags.reduce<Set<string>>((accumulator, tag) => {
    if (tag.startsWith(NEGATION_PREFIX)) {
      accumulator.delete(tag.slice(NEGATION_PREFIX.length));
    } else {
      accumulator.add(tag);
    }
    return accumulator;
  }, new Set<string>());
  return Array.from(result);
};
