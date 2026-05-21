import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OpenbookConfigAmbiguousFrameworkError,
  OpenbookConfigMissingFrameworkError,
} from "../../src/errors.js";
import { detectFramework } from "../../src/plugin/framework-detection.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "openbook-framework-detection-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const writePackageJson = async (contents: Record<string, unknown>): Promise<void> => {
  await writeFile(join(projectRoot, "package.json"), JSON.stringify(contents), "utf8");
};

describe("detectFramework", () => {
  it("detects react", async () => {
    await writePackageJson({ dependencies: { react: "^19.0.0" } });
    expect(await detectFramework(projectRoot)).toBe("react");
  });

  it("detects solid via solid-js", async () => {
    await writePackageJson({ dependencies: { "solid-js": "^1.9.0" } });
    expect(await detectFramework(projectRoot)).toBe("solid");
  });

  it("detects vue", async () => {
    await writePackageJson({ dependencies: { vue: "^3.5.0" } });
    expect(await detectFramework(projectRoot)).toBe("vue");
  });

  it("detects svelte", async () => {
    await writePackageJson({ devDependencies: { svelte: "^5.0.0" } });
    expect(await detectFramework(projectRoot)).toBe("svelte");
  });

  it("respects peerDependencies in addition to deps/devDeps", async () => {
    await writePackageJson({ peerDependencies: { vue: "^3.5.0" } });
    expect(await detectFramework(projectRoot)).toBe("vue");
  });

  it("throws OpenbookConfigAmbiguousFrameworkError when multiple frameworks are present", async () => {
    await writePackageJson({
      dependencies: { react: "^19.0.0", "solid-js": "^1.9.0" },
    });
    await expect(detectFramework(projectRoot)).rejects.toBeInstanceOf(
      OpenbookConfigAmbiguousFrameworkError,
    );
  });

  it("throws OpenbookConfigMissingFrameworkError when no framework is present", async () => {
    await writePackageJson({ dependencies: { lodash: "^4.0.0" } });
    await expect(detectFramework(projectRoot)).rejects.toBeInstanceOf(
      OpenbookConfigMissingFrameworkError,
    );
  });

  it("throws OpenbookConfigMissingFrameworkError when no package.json exists", async () => {
    await expect(detectFramework(projectRoot)).rejects.toBeInstanceOf(
      OpenbookConfigMissingFrameworkError,
    );
  });
});
