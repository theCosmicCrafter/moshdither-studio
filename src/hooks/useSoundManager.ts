/**
 * SoundManager — Web Audio analog click sounds for interactive elements.
 * Matches the Stitch design's SoundManager class.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch {
        this.enabled = false;
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /** Analog-style click: short filtered noise burst with quick decay */
  click(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.03;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter for analog feel
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2000;
    filter.Q.value = 2;

    // Gain envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.03);
  }

  /** Soft tick for lighter interactions */
  tick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.02);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}

let soundManager: SoundManager | null = null;

export function getSoundManager(): SoundManager {
  if (!soundManager) {
    soundManager = new SoundManager();
  }
  return soundManager;
}

/**
 * Hook to attach click sounds to all neo-btn and similar interactive elements.
 * Call once in the app root.
 */
export function useSoundManager() {
  const attachSounds = () => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".neo-btn, .neo-flat[role='button'], button.sound-click")) {
        getSoundManager().click();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  };

  return { attachSounds, sound: getSoundManager() };
}
