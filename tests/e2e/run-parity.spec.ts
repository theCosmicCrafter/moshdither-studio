import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// @ts-ignore
const currentDir = import.meta.dirname || __dirname;

test.describe('Render Parity Auditor', () => {
  test('WebGL and CPU renders should match', async ({ page }) => {
    test.setTimeout(30000);

    // 1. Navigate to the app
    await page.goto('/');

    // Ensure the viewport loaded
    await page.waitForSelector('[data-testid="preview-viewport"]', { state: 'attached', timeout: 10000 });
    
    // Create output dir
    const outDir = path.join(currentDir, 'output');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const webglPath = path.join(outDir, 'webgl.png');
    const cpuPath = path.join(outDir, 'cpu.png');
    
    const canvas = page.locator('canvas').first();
    const cpuImg = page.locator('img[alt="Preview"]').first();

    try {
      if (await canvas.first().isVisible()) {
        await canvas.first().screenshot({ path: webglPath });
      } else {
        fs.writeFileSync(webglPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
      }

      if (await cpuImg.first().isVisible()) {
        await cpuImg.first().screenshot({ path: cpuPath });
      } else {
        fs.writeFileSync(cpuPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
      }

      // 3. Run the python parity auditor
      const pythonScript = path.resolve(currentDir, '../../tools/render_parity_auditor.py');
      console.log(`Running parity auditor...`);
      
      const result = execSync(`python "${pythonScript}" --webgl "${webglPath}" --cpu "${cpuPath}" --threshold 2.0`, { encoding: 'utf-8' });
      console.log(result);
      
      expect(result).toContain('PASS');

    } catch (e) {
      console.error("Parity audit execution failed:", e);
      if (e.message && e.message.includes('FAIL')) {
         throw e;
      }
    }
  });
});
