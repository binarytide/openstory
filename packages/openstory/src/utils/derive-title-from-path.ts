const titleSegmentFromPathSegment = (segment: string): string => {
  const cleaned = segment.replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (cleaned === "") return "";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};

export const deriveTitleFromPath = (relativePath: string): string => {
  const withoutExtension = relativePath.replace(/\.[^./]+$/, "");
  const normalized = withoutExtension.split("\\").join("/");
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== "src");
  if (segments.length === 0) return "Components";
  return segments
    .map((segment) => titleSegmentFromPathSegment(segment))
    .filter((segment) => segment.length > 0)
    .join("/");
};
