export const toFsId = (absolutePath: string): string => `/@fs/${absolutePath.replace(/\\/g, "/")}`;
