/**
 * Codec-pipeline stack entries corrupt the encoded file at export — there is
 * no per-frame moment where a keyframe, LFO, audio binding or mask could
 * apply, so ParameterPanel suppresses those controls for them (the backend
 * would only silently ignore what the UI let the user set). This pins the
 * suppression to the meta's declared `pipeline` field.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useAppStore, type EffectMeta, type StackEntry } from "../../store";
import ParameterPanel from "../EffectStack/ParameterPanel";

const CODEC_META: EffectMeta = {
  id: "ffglitch.zoom",
  name: "Zoom",
  category: "datamoshing",
  media_type: "video",
  pipeline: "codec",
  parameters: [
    { id: "zoom", name: "Zoom", type: "slider", min: -100, max: 100, step: 1, default: 20 },
  ],
};

const PIXEL_META: EffectMeta = {
  id: "dithering.bayer",
  name: "Bayer",
  category: "dithering",
  media_type: "both",
  pipeline: "pixel",
  parameters: [
    { id: "levels", name: "Levels", type: "slider", min: 2, max: 16, step: 1, default: 4 },
  ],
};

function entryFor(meta: EffectMeta): StackEntry {
  return {
    id: `entry-${meta.id}`,
    effectId: meta.id,
    effectName: meta.name,
    params: { [meta.parameters[0].id]: meta.parameters[0].default },
    enabled: true,
    maskId: null,
    maskMode: "inside",
  };
}

function mount(meta: EffectMeta) {
  const entry = entryFor(meta);
  useAppStore.setState({
    effectStack: [entry],
    allEffects: [meta],
    selectedStackId: entry.id,
    // Video loaded so the video-only warning doesn't crowd the assertions —
    // codec metas are media_type "video" on purpose.
    mediaLoaded: true,
    isVideo: true,
    audioEnabled: true,
    lfos: {},
    keyframes: {},
    audioBindings: {},
  });
  return render(<ParameterPanel stackId={entry.id} />);
}

describe("ParameterPanel on a codec (FFglitch) layer", () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it("hides the +LFO chip, keyframe button and audio binding", () => {
    mount(CODEC_META);
    // The slider itself stays — static params DO reach the codec stage.
    expect(screen.getByLabelText("Zoom fader")).toBeInTheDocument();
    expect(screen.queryByTestId("lfo-zoom")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Add keyframe")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Bind to audio")).not.toBeInTheDocument();
  });

  it("says why the animation controls are gone", () => {
    mount(CODEC_META);
    expect(screen.getByTestId("codec-layer-note")).toBeInTheDocument();
  });
});

describe("ParameterPanel on a normal pixel layer (control)", () => {
  it("keeps the modulation controls", () => {
    mount(PIXEL_META);
    expect(screen.getByLabelText("Levels fader")).toBeInTheDocument();
    expect(screen.getByTestId("lfo-levels")).toBeInTheDocument();
    expect(screen.getByTitle("Add keyframe")).toBeInTheDocument();
    expect(screen.getByTitle("Bind to audio")).toBeInTheDocument();
    expect(screen.queryByTestId("codec-layer-note")).not.toBeInTheDocument();
  });
});
