export type StoryDescriptor = string[] | RegExp;

export interface IncludeExcludeOptions {
  includeStories?: StoryDescriptor;
  excludeStories?: StoryDescriptor;
}

const matches = (storyKey: string, descriptor: StoryDescriptor): boolean =>
  Array.isArray(descriptor) ? descriptor.includes(storyKey) : descriptor.test(storyKey);

export const isExportStory = (key: string, options: IncludeExcludeOptions): boolean => {
  const { includeStories, excludeStories } = options;
  return (
    key !== "__esModule" &&
    (!includeStories || matches(key, includeStories)) &&
    (!excludeStories || !matches(key, excludeStories))
  );
};
