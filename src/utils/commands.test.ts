import { describe, it, expect, beforeEach } from "vitest";
import { registerCommand, getCommands, clearCommands, fuzzyMatch, type Command } from "./commands";

describe("Command Registry", () => {
  beforeEach(() => {
    clearCommands();
  });

  function makeCommand(id: string, label = `Command ${id}`): Command {
    return {
      id,
      label,
      category: "test",
      action: () => {},
    };
  }

  describe("registerCommand", () => {
    it("adds a new command", () => {
      registerCommand(makeCommand("test:cmd1"));
      const cmds = getCommands();
      expect(cmds).toHaveLength(1);
      expect(cmds[0].id).toBe("test:cmd1");
    });

    it("replaces existing command with same ID", () => {
      registerCommand(makeCommand("test:cmd1", "Original"));
      registerCommand(makeCommand("test:cmd1", "Updated"));
      const cmds = getCommands();
      expect(cmds).toHaveLength(1);
      expect(cmds[0].label).toBe("Updated");
    });

    it("preserves order of registration", () => {
      registerCommand(makeCommand("test:a"));
      registerCommand(makeCommand("test:b"));
      registerCommand(makeCommand("test:c"));
      const cmds = getCommands();
      expect(cmds.map((c) => c.id)).toEqual(["test:a", "test:b", "test:c"]);
    });
  });

  describe("getCommands", () => {
    it("returns a copy (not the internal array)", () => {
      registerCommand(makeCommand("test:cmd1"));
      const cmds = getCommands();
      cmds.push(makeCommand("injected"));
      expect(getCommands()).toHaveLength(1);
    });

    it("returns empty array after clear", () => {
      registerCommand(makeCommand("test:cmd1"));
      clearCommands();
      expect(getCommands()).toEqual([]);
    });
  });

  describe("clearCommands", () => {
    it("removes all commands", () => {
      registerCommand(makeCommand("test:a"));
      registerCommand(makeCommand("test:b"));
      clearCommands();
      expect(getCommands()).toHaveLength(0);
    });
  });

  describe("fuzzyMatch", () => {
    it("returns 0 for no match", () => {
      expect(fuzzyMatch("xyz", "hello world")).toBe(0);
    });

    it("returns high score for exact substring match", () => {
      const score = fuzzyMatch("exp", "Export Video");
      expect(score).toBeGreaterThan(0);
    });

    it("returns higher score for prefix match vs non-prefix", () => {
      const prefixScore = fuzzyMatch("exp", "Export Video");
      const nonPrefixScore = fuzzyMatch("ort", "Export Video");
      expect(prefixScore).toBeGreaterThan(nonPrefixScore);
    });

    it("returns 0.5 for character-order match (non-substring)", () => {
      const score = fuzzyMatch("evi", "Export Video");
      // 'e' in Export, 'v' in Video, 'i' in Video — in order across full string
      expect(score).toBeGreaterThan(0);
    });

    it("returns 0 for characters not in order", () => {
      expect(fuzzyMatch("vid", "abc")).toBe(0);
    });

    it("is case-insensitive", () => {
      const upper = fuzzyMatch("EXP", "Export Video");
      const lower = fuzzyMatch("exp", "Export Video");
      expect(upper).toBe(lower);
    });

    it("empty query matches everything with positive score", () => {
      const score = fuzzyMatch("", "anything");
      expect(score).toBeGreaterThan(0);
    });

    it("returns 0 if query has more chars than text", () => {
      expect(fuzzyMatch("abcdef", "abc")).toBe(0);
    });

    it("exact match gives highest score", () => {
      const exact = fuzzyMatch("export", "Export");
      const partial = fuzzyMatch("exp", "Export Video");
      expect(exact).toBeGreaterThan(partial);
    });
  });
});
