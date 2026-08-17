import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAppStore } from "../store";
import StatusBar from "../components/StatusBar";
import OnboardingModal from "../components/OnboardingModal";
import EffectStack from "../components/EffectStack";

// Helper: create a mock EffectMeta for store operations
function mockEffectMeta(id: string, name: string, category: string) {
  return {
    id,
    name,
    category,
    media_type: "both" as const,
    parameters: [
      { id: "intensity", name: "Intensity", type: "slider" as const, min: 0, max: 1, default: 0.5, step: 0.01 },
    ],
  };
}

describe("UI Components E2E", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe("StatusBar", () => {
    it("renders status message from store", () => {
      useAppStore.getState().setStatusMessage("Test status");
      render(<StatusBar />);
      expect(screen.getByText("Test status")).toBeInTheDocument();
    });

    it("shows processing icon when isProcessing", () => {
      useAppStore.getState().setIsProcessing(true);
      render(<StatusBar />);
      expect(screen.getByText("cloud_sync")).toBeInTheDocument();
    });

    it("displays effect count and active stack count", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
        mockEffectMeta("analog.vhs", "VHS", "analog"),
      ]);
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer", "dithering"));
      render(<StatusBar />);
      expect(screen.getByText(/2 effects available/)).toBeInTheDocument();
      expect(screen.getByText(/1 active in stack/)).toBeInTheDocument();
    });

    it("renders scope buttons", () => {
      render(<StatusBar />);
      expect(screen.getByTitle("Histogram")).toBeInTheDocument();
      expect(screen.getByTitle("Waveform")).toBeInTheDocument();
      expect(screen.getByTitle("RGB Parade")).toBeInTheDocument();
    });

    it("toggles scope visibility on click", () => {
      render(<StatusBar />);
      const histBtn = screen.getByTitle("Histogram");
      fireEvent.click(histBtn);
      expect(useAppStore.getState().scopesVisible).toBe(true);
      expect(useAppStore.getState().scopeMode).toBe("histogram");
    });
  });

  describe("OnboardingModal", () => {
    it("renders when not dismissed", () => {
      render(<OnboardingModal />);
      expect(screen.getByText("Welcome to MoshDither Studio")).toBeInTheDocument();
    });

    it("does not render when dismissed in localStorage", () => {
      localStorage.setItem("onboardingDismissed", "true");
      render(<OnboardingModal />);
      expect(screen.queryByText("Welcome to MoshDither Studio")).not.toBeInTheDocument();
    });

    it("dismisses on Get Started click", () => {
      render(<OnboardingModal />);
      fireEvent.click(screen.getByText("Get Started"));
      expect(localStorage.getItem("onboardingDismissed")).toBe("true");
    });

    it("dismisses on Skip click", () => {
      render(<OnboardingModal />);
      fireEvent.click(screen.getByText("Skip"));
      expect(localStorage.getItem("onboardingDismissed")).toBe("true");
    });

    it("lists feature highlights", () => {
      render(<OnboardingModal />);
      expect(screen.getByText("Import images or videos to start")).toBeInTheDocument();
      expect(screen.getByText("Export to PNG, JPG, GIF, or MP4")).toBeInTheDocument();
    });
  });

  describe("EffectStack", () => {
    it("shows empty state when no effects", () => {
      render(<EffectStack />);
      expect(screen.getByText("Empty stack")).toBeInTheDocument();
      expect(screen.getByText(/No effects in stack/)).toBeInTheDocument();
    });

    it("shows effect count when stack has items", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      expect(screen.getByText(/1 effect in stack/)).toBeInTheDocument();
      expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
    });

    it("shows multiple effects count", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      useAppStore.getState().addToStack(mockEffectMeta("analog.vhs", "VHS Effect", "analog"));
      render(<EffectStack />);
      expect(screen.getByText(/2 effects in stack/)).toBeInTheDocument();
    });

    it("removes effect on delete button click", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
      fireEvent.click(screen.getByTitle("Remove"));
      expect(screen.queryByText("Bayer Dither")).not.toBeInTheDocument();
    });

    it("toggles effect visibility", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      const toggleBtn = screen.getByTitle("Disable");
      fireEvent.click(toggleBtn);
      expect(useAppStore.getState().effectStack[0].enabled).toBe(false);
    });

    it("selects effect on click", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      // Click on the effect entry (not a button)
      fireEvent.click(screen.getByText("Bayer Dither"));
      expect(useAppStore.getState().selectedStackId).not.toBeNull();
    });

    it("moves effect up", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      useAppStore.getState().addToStack(mockEffectMeta("analog.vhs", "VHS Effect", "analog"));
      render(<EffectStack />);
      // Second effect should have a move-up button
      const moveUpBtn = screen.getByTitle("Move Up");
      fireEvent.click(moveUpBtn);
      const stack = useAppStore.getState().effectStack;
      expect(stack[0].effectName).toBe("VHS Effect");
      expect(stack[1].effectName).toBe("Bayer Dither");
    });

    it("shows mask selector for each effect", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      expect(screen.getByTitle("Assign mask to this effect")).toBeInTheDocument();
    });
  });
});
