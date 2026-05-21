import { stat } from "node:fs/promises";

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
};
