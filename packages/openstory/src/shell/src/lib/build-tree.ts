import type { Manifest, ManifestStory, TreeNode } from "./types";

const TITLE_SEPARATOR = "/";

const findOrCreateChild = (parent: TreeNode, segment: string): TreeNode => {
  const existing = parent.children.find((node) => node.segment === segment);
  if (existing) return existing;
  const created: TreeNode = {
    segment,
    fullPath: parent.fullPath ? `${parent.fullPath}${TITLE_SEPARATOR}${segment}` : segment,
    children: [],
  };
  parent.children.push(created);
  return created;
};

export const buildTree = (manifest: Manifest): TreeNode[] => {
  const root: TreeNode = { segment: "", fullPath: "", children: [] };

  for (const story of manifest.stories) {
    const segments = story.title.split(TITLE_SEPARATOR).filter(Boolean);
    let cursor = root;
    for (const segment of segments) {
      cursor = findOrCreateChild(cursor, segment);
    }
    const storyChild: TreeNode = {
      segment: story.name,
      fullPath: `${cursor.fullPath}${TITLE_SEPARATOR}${story.name}`,
      children: [],
      story,
    };
    cursor.children.push(storyChild);
  }

  return root.children;
};

export const flattenStories = (manifest: Manifest): ManifestStory[] => manifest.stories;
