import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface MoshParams {
  mode: string;
  intensity?: number;
  gop?: number;
  motionUrl?: string;

  // Automosh (Tomato) parameters
  count?: number;
  frame?: number;
  kill?: number;
  keepAudio?: boolean;
  keepFrame?: boolean;

  // Original AVI parameters
  start?: number;
  end?: number;
  startFrame?: number;
  endFrame?: number;
  p?: number;
  keepFirst?: boolean;
  reverse?: boolean;
  mid?: number;

  // FFglitch parameters
  fluidity?: number;
  direction?: "horizontal" | "vertical";
  chunkSize?: number;
  positionFrame?: number;
  repeatCount?: number;

  // JS effects parameters
  zoom?: number;
  delay?: number;
  feedback?: number;
  somePercentage?: number;
  multiple?: number;
  tailLength?: number;
  threshold?: number;
  origGravity?: number;
  frameCount?: number;
  nFrames?: number;
  movementThreshold?: number;
  randomness?: number;
  magnitude?: number;
}

export class MosherAdapter {
  private pythonPath: string;
  private moshCliPath: string;

  constructor(
    pythonPath: string,
    moshCliPath: string,
    _ffglitchPath?: string,
    _ffmpegPath?: string,
  ) {
    this.pythonPath = pythonPath;
    this.moshCliPath = moshCliPath;
  }

  /**
   * Universal Datamoshing entry point. Spawns mosh_cli.py with JSON config.
   */
  public async applyMosh(
    inputVideo: string,
    outputVideo: string,
    params: MoshParams,
  ): Promise<string> {
    const tmpDir = os.tmpdir();
    const configPath = path.join(tmpDir, `mosh_config_${Date.now()}.json`);

    try {
      // Create JSON config for python script
      const config = {
        input: inputVideo.replace(/\\/g, "/"),
        output: outputVideo.replace(/\\/g, "/"),
        mode: params.mode,
        params: params,
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Support both standalone PyInstaller executable and python script
      const isStandalone = !this.moshCliPath.endsWith(".py");
      const cmd = isStandalone ? this.moshCliPath : this.pythonPath;
      const args = isStandalone ? [configPath] : [this.moshCliPath, configPath];

      console.log(`Starting mosh backend: ${cmd} ${args.join(" ")}`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(cmd, args);

        proc.stdout.on("data", (data) =>
          console.log(`[mosh] ${data.toString().trim()}`),
        );
        proc.stderr.on("data", (data) =>
          console.error(`[mosh error] ${data.toString().trim()}`),
        );

        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`mosh_cli.py exited with code ${code}`));
          }
        });
      });

      try {
        await fs.access(outputVideo);
        return outputVideo;
      } catch {
        throw new Error(
          `Output file was not created by the mosh pipeline: ${outputVideo}`,
        );
      }
    } finally {
      await fs.unlink(configPath).catch(() => {});
    }
  }

  /**
   * Backward compatibility wrappers
   */
  public async moshClassic(
    inputVideo: string,
    outputVideo: string,
    intensity: number = 0.8,
  ): Promise<string> {
    return this.applyMosh(inputVideo, outputVideo, {
      mode: "classic",
      intensity,
    });
  }

  public async moshShuffle(
    inputVideo: string,
    outputVideo: string,
    intensity: number = 0.5,
  ): Promise<string> {
    return this.applyMosh(inputVideo, outputVideo, {
      mode: "shuffle",
      intensity,
    });
  }

  public async moshSwapVectors(
    targetVideo: string,
    motionVideo: string,
    outputVideo: string,
  ): Promise<string> {
    return this.applyMosh(targetVideo, outputVideo, {
      mode: "motion_transfer",
      motionUrl: motionVideo,
    });
  }
}
