import { describe, it, expect } from "vitest";
import {
  serializeProject,
  deserializeProject,
  generateGitAttributes,
  generateGitIgnore,
  createBranch,
  getBranches,
  deleteBranch,
  restoreBranch,
  diffProjects,
} from "../versionControl";

describe("versionControl", () => {
  it("serializes and deserializes a project", () => {
    const json = serializeProject("Test", [{ id: "1", type: "bloom", enabled: true, params: {} }], [], { outputFormat: "mp4", quality: "high", fps: 30 });
    const project = deserializeProject(json);
    expect(project).not.toBeNull();
    expect(project!.name).toBe("Test");
    expect(project!.effects).toHaveLength(1);
  });

  it("returns null for invalid JSON", () => {
    expect(deserializeProject("not json")).toBeNull();
    expect(deserializeProject('{"name": "no version"}')).toBeNull();
  });

  it("generates gitattributes with LFS patterns", () => {
    const attrs = generateGitAttributes();
    expect(attrs).toContain("*.mp4 filter=lfs");
    expect(attrs).toContain("*.png filter=lfs");
    expect(attrs).toContain("*.moshproject text");
  });

  it("generates gitignore with output folders", () => {
    const ignore = generateGitIgnore();
    expect(ignore).toContain("outputs/");
    expect(ignore).toContain("node_modules/");
  });

  it("creates and retrieves branches", () => {
    const snapshot = serializeProject("Test", [], [], { outputFormat: "mp4", quality: "high", fps: 30 });
    createBranch("proj-1", "v1", deserializeProject(snapshot)!, "Initial version");
    const branches = getBranches("proj-1");
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe("v1");
    expect(branches[0].description).toBe("Initial version");
  });

  it("restores a branch snapshot", () => {
    const snapshot = serializeProject("Test", [{ id: "1", type: "bloom", enabled: true, params: {} }], [], { outputFormat: "mp4", quality: "high", fps: 30 });
    createBranch("proj-2", "backup", deserializeProject(snapshot)!);
    const restored = restoreBranch("proj-2", "backup");
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe("Test");
  });

  it("deletes a branch", () => {
    const snapshot = serializeProject("Test", [], [], { outputFormat: "mp4", quality: "high", fps: 30 });
    createBranch("proj-3", "old", deserializeProject(snapshot)!);
    deleteBranch("proj-3", "old");
    expect(getBranches("proj-3")).toHaveLength(0);
  });

  it("detects project diffs", () => {
    const oldProj = deserializeProject(serializeProject("Test", [{ id: "1", type: "bloom", enabled: true, params: { intensity: 0.5 } }], [], { outputFormat: "mp4", quality: "high", fps: 30 }))!;
    const newProj = deserializeProject(serializeProject("Test", [{ id: "1", type: "bloom", enabled: true, params: { intensity: 0.8 } }, { id: "2", type: "pulse", enabled: true, params: {} }], [], { outputFormat: "mp4", quality: "high", fps: 30 }))!;
    const diff = diffProjects(oldProj, newProj);
    expect(diff.effectsAdded).toContain("2");
    expect(diff.effectsChanged).toContain("1");
    expect(diff.settingsChanged).toBe(false);
  });
});
