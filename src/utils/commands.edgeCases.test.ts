import { describe, it, expect, beforeEach } from "vitest";
import { registerCommand, getCommands, clearCommands, fuzzyMatch } from "./commands";

describe("Commands Fringe Cases", () => {
  beforeEach(() => {
    clearCommands();
  });

  describe("action execution", () => {
    it("action function is callable", () => {
      let called = false;
      registerCommand({
        id: "test:action",
        label: "Test Action",
        category: "test",
        action: () => {
          called = true;
        },
      });
      const cmds = getCommands();
      cmds[0].action();
      expect(called).toBe(true);
    });

    it("action can modify external state", () => {
      let counter = 0;
      registerCommand({
        id: "test:inc",
        label: "Increment",
        category: "test",
        action: () => {
          counter++;
        },
      });
      const cmd = getCommands()[0];
      cmd.action();
      cmd.action();
      cmd.action();
      expect(counter).toBe(3);
    });

    it("replaced command has updated action", () => {
      let firstCalled = false;
      let secondCalled = false;
      registerCommand({
        id: "test:replace",
        label: "Original",
        category: "test",
        action: () => {
          firstCalled = true;
        },
      });
      registerCommand({
        id: "test:replace",
        label: "Updated",
        category: "test",
        action: () => {
          secondCalled = true;
        },
      });
      const cmd = getCommands()[0];
      cmd.action();
      expect(firstCalled).toBe(false);
      expect(secondCalled).toBe(true);
      expect(cmd.label).toBe("Updated");
    });
  });

  describe("fuzzyMatch edge cases", () => {
    it("matches single character query", () => {
      expect(fuzzyMatch("e", "Export")).toBeGreaterThan(0);
    });

    it("matches with numbers in label", () => {
      expect(fuzzyMatch("exp2", "Export 2024")).toBeGreaterThan(0);
    });

    it("matches reversed case (query upper, text lower)", () => {
      const score = fuzzyMatch("EXPORT", "export video");
      expect(score).toBeGreaterThan(0);
    });

    it("query longer than text but characters match in order", () => {
      // "export" vs "exp" — query is longer, so no substring match
      // but character-order check: e-x-p in "export" — yes
      expect(fuzzyMatch("exp", "export")).toBeGreaterThan(0);
    });

    it("handles very long query string", () => {
      const longQuery = "a".repeat(100);
      expect(fuzzyMatch(longQuery, "abc")).toBe(0);
    });

    it("handles very long text string", () => {
      const longText = "a".repeat(1000);
      expect(fuzzyMatch("a", longText)).toBeGreaterThan(0);
    });

    it("exact match gives highest score relative to same-length text", () => {
      const exact = fuzzyMatch("test", "test");
      const partial = fuzzyMatch("tes", "test");
      expect(exact).toBeGreaterThan(partial);
    });

    it("substring in middle scores lower than prefix", () => {
      const mid = fuzzyMatch("est", "test");
      const prefix = fuzzyMatch("tes", "test");
      // "tes" is a prefix, "est" is a substring but not prefix
      expect(prefix).toBeGreaterThan(mid);
    });

    it("non-substring but in-order characters score 0.5", () => {
      // "tv" in "Test Video" — t at index 0, v at index 5
      const score = fuzzyMatch("tv", "Test Video");
      // Not a substring ("tv" not in "test video"), but chars in order
      expect(score).toBe(0.5);
    });

    it("characters out of order score 0", () => {
      expect(fuzzyMatch("vt", "Test Video")).toBe(0);
    });

    it("repeated characters in query match if they appear in order", () => {
      // "ee" in "Export Video" — lowercased: "export video"
      // e at index 0, e at index 7 (vidEo) — in order, so score 0.5
      expect(fuzzyMatch("ee", "Export Video")).toBe(0.5);
    });

    it("repeated characters that form substring get substring score", () => {
      // "ee" in "Export Bee" — lowercased: "export bee"
      // "ee" is a substring at the end, so score = 2/10 + 1 = 1.2
      expect(fuzzyMatch("ee", "Export Bee")).toBe(1.2);
    });
  });

  describe("registry edge cases", () => {
    it("command with empty string label is accepted", () => {
      registerCommand({ id: "test:empty", label: "", category: "test", action: () => {} });
      expect(getCommands()).toHaveLength(1);
      expect(getCommands()[0].label).toBe("");
    });

    it("command with empty string id is accepted", () => {
      registerCommand({ id: "", label: "Empty ID", category: "test", action: () => {} });
      expect(getCommands()).toHaveLength(1);
    });

    it("command with special characters in id", () => {
      registerCommand({
        id: "test:special-chars_123",
        label: "Special",
        category: "test",
        action: () => {},
      });
      expect(getCommands()[0].id).toBe("test:special-chars_123");
    });

    it("registering 100 commands works", () => {
      for (let i = 0; i < 100; i++) {
        registerCommand({
          id: `test:cmd${i}`,
          label: `Command ${i}`,
          category: "test",
          action: () => {},
        });
      }
      expect(getCommands()).toHaveLength(100);
    });

    it("shortcut field is optional and preserved", () => {
      registerCommand({
        id: "test:shortcut",
        label: "Has Shortcut",
        category: "test",
        shortcut: "Ctrl+K",
        action: () => {},
      });
      expect(getCommands()[0].shortcut).toBe("Ctrl+K");
    });

    it("commands without shortcut have undefined shortcut", () => {
      registerCommand({
        id: "test:noshortcut",
        label: "No Shortcut",
        category: "test",
        action: () => {},
      });
      expect(getCommands()[0].shortcut).toBeUndefined();
    });
  });
});
