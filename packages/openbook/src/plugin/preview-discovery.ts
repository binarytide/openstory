import { join } from "node:path";
import { PREVIEW_FILE_EXTENSIONS, PREVIEW_FILE_LOCATIONS } from "../constants.js";
import {
  OpenbookConfigMultiplePreviewsError,
  OpenbookConfigPreviewNotFoundError,
} from "../errors.js";
import { fileExists } from "../utils/file-exists.js";

export const findPreviewFile = async (projectRoot: string): Promise<string | undefined> => {
  const matches: string[] = [];
  for (const base of PREVIEW_FILE_LOCATIONS) {
    for (const extension of PREVIEW_FILE_EXTENSIONS) {
      const candidate = join(projectRoot, `${base}${extension}`);
      if (await fileExists(candidate)) matches.push(candidate);
    }
  }
  if (matches.length > 1) {
    throw new OpenbookConfigMultiplePreviewsError(matches);
  }
  return matches[0];
};

export const requirePreviewFile = async (projectRoot: string): Promise<string> => {
  const path = await findPreviewFile(projectRoot);
  if (!path) {
    throw new OpenbookConfigPreviewNotFoundError(
      PREVIEW_FILE_LOCATIONS.flatMap((base) =>
        PREVIEW_FILE_EXTENSIONS.map((extension) => `${base}${extension}`),
      ),
    );
  }
  return path;
};
