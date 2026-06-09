import { describe, it, expect, beforeEach } from "vitest";
import { registerCommand, getCommands, clearCommands, fuzzyMatch } from "../commands";

describe("Command Registry", () => {
  beforeEach(() => {
    clearCommands();
  });

  it("registers and retrieves commands", () => {
    registerCommand({ id: "test", label: "Test Command", category: "Test", action: () => {} });
    const cmds = getCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].label).toBe("Test Command");
  });

  it("overrides existing commands with same id", () => {
    registerCommand({ id: "dup", label: "First", category: "A", action: () => {} });
    registerCommand({ id: "dup", label: "Second", category: "B", action: () => {} });
    expect(getCommands()).toHaveLength(1);
    expect(getCommands()[0].label).toBe("Second");
  });
});

describe("fuzzyMatch", () => {
  it("returns >0 for exact substring match", () => {
    expect(fuzzyMatch("exp", "Export Video")).toBeGreaterThan(0);
  });

  it("returns 0 for no match", () => {
    expect(fuzzyMatch("xyz", "Export Video")).toBe(0);
  });

  it("returns higher score for prefix match", () => {
    const prefixScore = fuzzyMatch("exp", "Export Video");
    const midScore = fuzzyMatch("ort", "Export Video");
    expect(prefixScore).toBeGreaterThan(midScore);
  });
});
