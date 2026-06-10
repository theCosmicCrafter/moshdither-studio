/**
 * Download SAM 3 Tracker ONNX model files from HuggingFace for offline use.
 *
 * Run: node scripts/download-sam3-model.js
 *
 * Downloads the minimum set of files needed for inference:
 *   - config.json
 *   - preprocessor_config.json
 *   - processor_config.json
 *   - onnx/vision_encoder_fp16.onnx + .onnx_data
 *   - onnx/prompt_encoder_mask_decoder_fp16.onnx + .onnx_data
 *
 * Total size: ~400MB (fp16 variant)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const MODEL_ID = "onnx-community/sam3-tracker-ONNX";
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const OUT_DIR = path.join(__dirname, "..", "assets", "models", "sam3");

const FILES = [
  "config.json",
  "preprocessor_config.json",
  "processor_config.json",
  "onnx/vision_encoder_fp16.onnx",
  "onnx/vision_encoder_fp16.onnx_data",
  "onnx/prompt_encoder_mask_decoder_fp16.onnx",
  "onnx/prompt_encoder_mask_decoder_fp16.onnx_data",
  // Fallback: base ONNX files (in case fp16 fails)
  "onnx/vision_encoder.onnx",
  "onnx/vision_encoder.onnx_data",
  "onnx/prompt_encoder_mask_decoder.onnx",
  "onnx/prompt_encoder_mask_decoder.onnx_data",
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    if (fs.existsSync(dest)) {
      const stats = fs.statSync(dest);
      if (stats.size > 0) {
        console.log(`  [SKIP] ${path.relative(OUT_DIR, dest)} already exists (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
        resolve();
        return;
      }
    }

    console.log(`  [DOWNLOAD] ${path.relative(OUT_DIR, dest)} ...`);
    const file = fs.createWriteStream(dest);

    https
      .get(url, { timeout: 120000 }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          console.log(`    -> Redirecting to ${redirectUrl.substring(0, 60)}...`);
          https
            .get(redirectUrl, { timeout: 120000 }, (res) => {
              res.pipe(file);
              file.on("finish", () => {
                file.close();
                const size = fs.statSync(dest).size;
                console.log(`    [OK] ${(size / 1024 / 1024).toFixed(1)} MB`);
                resolve();
              });
            })
            .on("error", (err) => {
              fs.unlink(dest, () => {});
              reject(err);
            });
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          const size = fs.statSync(dest).size;
          console.log(`    [OK] ${(size / 1024 / 1024).toFixed(1)} MB`);
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  console.log(`Downloading SAM 3 model to:\n  ${OUT_DIR}\n`);

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  for (const file of FILES) {
    const url = `${BASE_URL}/${file}`;
    const dest = path.join(OUT_DIR, file);
    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`  [ERROR] ${file}: ${err.message}`);
    }
  }

  console.log("\nDone. Model files saved to assets/models/sam3/");
}

main();
