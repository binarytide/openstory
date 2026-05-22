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
  const titleSegments: string[] = [];
  for (const rawSegment of normalized.split("/")) {
    if (rawSegment.length === 0 || rawSegment === "src") continue;
    const titled = titleSegmentFromPathSegment(rawSegment);
    if (titled.length > 0) titleSegments.push(titled);
  }
  if (titleSegments.length === 0) return "Components";
  return titleSegments.join("/");
};
