import { describe, expect, it } from "vitest";
import { resolveExternalDrag } from "./externalDrag";

describe("resolveExternalDrag", () => {
  it("rejects when nothing is being dragged from the rail", () => {
    expect(resolveExternalDrag(null, new Set())).toBeUndefined();
  });

  it("rejects an id that isn't a registered panel", () => {
    expect(resolveExternalDrag("not-a-real-panel", new Set())).toBeUndefined();
  });

  it("rejects a panel that is already docked, rather than creating a duplicate tab", () => {
    expect(resolveExternalDrag("export", new Set(["export"]))).toBeUndefined();
  });

  it("accepts a registered, undocked panel and builds its tab node", () => {
    const result = resolveExternalDrag("export", new Set(["stack", "browser"]));
    expect(result).toEqual({
      json: { type: "tab", id: "export", component: "export", name: "Export" },
    });
  });
});
