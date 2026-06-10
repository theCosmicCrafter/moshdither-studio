import { describe, it, expect } from "vitest";
import { parseOSC } from "../oscDMX";

describe("OSC Parser", () => {
  it("parses a simple OSC message with int and float args", () => {
    // Build OSC buffer: "/test\0\0\0,if\0\0\0\0" + int(42) + float(3.14)
    // Address: "/test" (5 chars + 3 padding = 8 bytes)
    // Tags: ",if" (3 chars + 1 padding = 4 bytes)
    // Data: int32(42) + float32(3.14) = 8 bytes
    // Total: 8 + 4 + 8 = 20 bytes
    const buffer = new ArrayBuffer(20);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // Address
    const addr = "/test";
    for (let i = 0; i < addr.length; i++) bytes[offset++] = addr.charCodeAt(i);
    offset = 8; // pad to 8

    // Type tag
    bytes[offset++] = ",".charCodeAt(0);
    bytes[offset++] = "i".charCodeAt(0);
    bytes[offset] = "f".charCodeAt(0);

    // Data
    const data = new DataView(buffer);
    data.setInt32(12, 42, false);
    data.setFloat32(16, 3.14, false);

    const msg = parseOSC(buffer);
    expect(msg).not.toBeNull();
    expect(msg!.address).toBe("/test");
    expect(msg!.args[0]).toBe(42);
    expect(msg!.args[1]).toBeCloseTo(3.14, 1);
  });

  it("parses OSC message with string arg", () => {
    // Address: "/hello" (6 chars + 2 padding = 8 bytes)
    // Tags: ",s" (2 chars + 2 padding = 4 bytes)
    // String: "world" (5 chars + 3 padding = 8 bytes)
    // Total: 8 + 4 + 8 = 20 bytes
    const buffer = new ArrayBuffer(20);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    const addr = "/hello";
    for (let i = 0; i < addr.length; i++) bytes[offset++] = addr.charCodeAt(i);
    offset = 8;

    bytes[offset++] = ",".charCodeAt(0);
    bytes[offset] = "s".charCodeAt(0);
    offset = 12;

    const str = "world";
    for (let i = 0; i < str.length; i++) bytes[offset++] = str.charCodeAt(i);
    // pad to 20

    const msg = parseOSC(buffer);
    expect(msg).not.toBeNull();
    expect(msg!.address).toBe("/hello");
    expect(msg!.args[0]).toBe("world");
  });

  it("returns null for invalid OSC data", () => {
    expect(parseOSC(new ArrayBuffer(0))).toBeNull();
    expect(parseOSC(new Uint8Array([0x00, 0x00]).buffer)).toBeNull();
  });
});
