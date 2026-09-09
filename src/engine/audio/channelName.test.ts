import { describe, expect, it } from "vitest";
import { audioChannelName, splitAudioChannelName } from "./channelName";

/**
 * Stack ids embed the effect id, which is itself dotted ("dither.bayer-...").
 * Splitting a channel name on the FIRST dot therefore tears the stack id in
 * half and the parameter never resolves.
 */
describe("audio channel names", () => {
  it("round-trips a dotted stack id", () => {
    const stackId = "dither.bayer-1757400000000-a1b2c3";
    const name = audioChannelName(stackId, "matrixSize");
    expect(name).toBe(`${stackId}.matrixSize`);
    expect(splitAudioChannelName(name)).toEqual({ stackId, paramId: "matrixSize" });
  });

  it("round-trips an undotted stack id", () => {
    expect(splitAudioChannelName(audioChannelName("s1", "amount"))).toEqual({
      stackId: "s1",
      paramId: "amount",
    });
  });

  it("rejects names with nothing on one side of the dot", () => {
    expect(splitAudioChannelName("noDotHere")).toBeNull();
    expect(splitAudioChannelName(".leading")).toBeNull();
    expect(splitAudioChannelName("trailing.")).toBeNull();
    expect(splitAudioChannelName("")).toBeNull();
  });
});
