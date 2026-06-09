import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";

export interface DitherParams {
  ditherMode: string;
  paletteSource: string;
  numColors: number;
  useGamma?: boolean;
  matrixSize?: string | number;
  errorDiffusionVariant?: string;
  serpentine?: boolean;
  scale?: number;
  seed?: number;
  dotSize?: number;
  gamma?: number;
  angleK?: number;
  wavelet?: string;
  subbandQuant?: number;
  varThreshold?: number;
  windowRadius?: number;
  lumFactor?: number;
  colFactor?: number;
  angle?: number;
  dotGain?: number;
  minDotSize?: number;
  maxDotSize?: number;
  shape?: string;
  sharpness?: number;
}

function runSpawn(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    proc.stdout.on("data", (data) =>
      console.log(`[dither] ${data.toString().trim()}`),
    );
    proc.stderr.on("data", (data) =>
      console.error(`[dither error] ${data.toString().trim()}`),
    );
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`dither_cli.py exited with code ${code}`));
      }
    });
  });
}

export class DitherAdapter {
  private pythonPath: string;
  private ditherCliPath: string;

  constructor(pythonPath: string, ditherCliPath: string) {
    this.pythonPath = pythonPath;
    this.ditherCliPath = ditherCliPath;
  }

  public async applyDither(
    inputPath: string,
    params: DitherParams,
  ): Promise<string> {
    const ext = path.extname(inputPath);
    const outputPath = path.join(os.tmpdir(), `dither_out_${Date.now()}${ext}`);
    const configPath = path.join(
      os.tmpdir(),
      `dither_config_${Date.now()}.json`,
    );

    // Translate custom palettes to predefined names in palette.json
    let finalPaletteSource = params.paletteSource;
    if (params.paletteSource === "gameboy") {
      finalPaletteSource = "gb_dmg_palette";
    } else if (params.paletteSource === "cga") {
      finalPaletteSource = "cga_palette1";
    } else if (params.paletteSource === "bw") {
      finalPaletteSource = "1bit_monitor_glow_2colors";
    }

    // Map UI parameters to Python dithering_lib parameters
    const parameters: Record<string, any> = {};
    if (params.ditherMode === "bayer") {
      // If matrixSize is a number, convert to string (e.g. 4 -> 4x4), otherwise pass string
      parameters.size =
        typeof params.matrixSize === "number"
          ? `${params.matrixSize}x${params.matrixSize}`
          : params.matrixSize || "4x4";
    } else if (params.ditherMode === "error_diffusion") {
      parameters.variant = params.errorDiffusionVariant || "atkinson";
      parameters.serpentine = params.serpentine ? "true" : "false";
    } else if (params.ditherMode === "IGN") {
      parameters.scale = params.scale ?? 1.0;
      parameters.seed = params.seed ?? 0;
    } else if (params.ditherMode === "blue_noise") {
      parameters.size = params.matrixSize ?? 64;
      parameters.seed = params.seed ?? 42;
    } else if (params.ditherMode === "polka_dot") {
      parameters.tile_size = params.dotSize ?? 8;
      parameters.gamma = params.gamma ?? 1.5;
    } else if (params.ditherMode === "wavelet") {
      parameters.wavelet = params.wavelet || "haar";
      parameters.subband_quant = params.subbandQuant ?? 8;
      parameters.seed = params.seed ?? 42;
    } else if (params.ditherMode === "adaptive_variance") {
      parameters.var_threshold = params.varThreshold ?? 300.0;
      parameters.window_radius = params.windowRadius ?? 1;
    } else if (params.ditherMode === "hybrid") {
      parameters.lum_factor = params.lumFactor ?? 1.0;
      parameters.col_factor = params.colFactor ?? 0.2;
    } else if (params.ditherMode === "halftone") {
      parameters.cell_size = params.dotSize ?? 8;
      parameters.angle = params.angle ?? 45.0;
      parameters.dot_gain = params.dotGain ?? 1.0;
      parameters.min_dot_size = params.minDotSize ?? 0.0;
      parameters.max_dot_size = params.maxDotSize ?? 1.0;
      parameters.shape = params.shape || "circle";
      parameters.sharpness = params.sharpness ?? 1.5;
    } else if (params.ditherMode === "ostromoukhov") {
      parameters.serpentine = params.serpentine ? "true" : "false";
    }

    const config = {
      input: inputPath,
      output: outputPath,
      dithering: {
        enabled: true,
        mode: params.ditherMode,
        parameters: parameters,
      },
      palette: {
        source: finalPaletteSource,
        num_colors: params.numColors,
        use_gamma: params.useGamma || false,
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    try {
      console.log(`Starting dither_cli.py with config ${configPath}...`);
      await runSpawn(this.pythonPath, [this.ditherCliPath, configPath]);

      const outputExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);

      if (!outputExists) {
        throw new Error(`Output file was not created: ${outputPath}`);
      }

      return outputPath;
    } finally {
      try {
        await fs.unlink(configPath);
      } catch (e) {
        // Config file may already be cleaned up; ignore
      }
    }
  }
}
