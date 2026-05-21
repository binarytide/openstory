import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { Manifest } from "@/lib/types";

interface StoryTreeProps {
  manifest: Manifest;
  selectedId: string | undefined;
  onSelect: (storyId: string) => void;
}

const TREE_THEME_STYLES = {
  "--trees-bg-override": "var(--background)",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-bg-muted-override": "transparent",
  "--trees-accent-override": "color-mix(in oklch, var(--foreground) 8%, transparent)",
  "--trees-border-color-override": "var(--border)",
} as CSSProperties;

interface PathMapping {
  paths: string[];
  pathToStoryId: Map<string, string>;
  storyIdToPath: Map<string, string>;
}

const buildPathMapping = (manifest: Manifest): PathMapping => {
  const paths: string[] = [];
  const pathToStoryId = new Map<string, string>();
  const storyIdToPath = new Map<string, string>();
  for (const story of manifest.stories) {
    const path = `${story.title}/${story.name}`;
    paths.push(path);
    pathToStoryId.set(path, story.id);
    storyIdToPath.set(story.id, path);
  }
  return { paths, pathToStoryId, storyIdToPath };
};

export const StoryTree = ({ manifest, selectedId, onSelect }: StoryTreeProps) => {
  const mapping = useMemo(() => buildPathMapping(manifest), [manifest]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;

  const { model } = useFileTree({
    paths: mapping.paths,
    initialExpansion: "open",
    icons: { set: "none", remap: { file: "" } },
    onSelectionChange: (selectedPaths) => {
      const [firstSelected] = selectedPaths;
      if (!firstSelected) return;
      const storyId = mappingRef.current.pathToStoryId.get(firstSelected);
      if (storyId) onSelectRef.current(storyId);
    },
  });

  useEffect(() => {
    model.resetPaths(mapping.paths);
  }, [model, mapping.paths]);

  useEffect(() => {
    if (!selectedId) return;
    const path = mapping.storyIdToPath.get(selectedId);
    if (!path) return;
    const item = model.getItem(path);
    if (!item || item.isSelected()) return;
    item.select();
    item.focus();
    model.scrollToPath(path);
  }, [model, mapping, selectedId]);

  return <FileTree model={model} className="h-full w-full" style={TREE_THEME_STYLES} />;
};
