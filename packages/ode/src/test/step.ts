export const step = async (
  name: string,
  body: () => void | Promise<void>,
): Promise<void> => {
  try {
    await body();
  } catch (cause) {
    if (cause instanceof Error) {
      cause.message = `step "${name}" failed: ${cause.message}`;
    }
    throw cause;
  }
};
