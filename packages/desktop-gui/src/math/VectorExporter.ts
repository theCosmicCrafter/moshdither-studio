// Vector SVG Exporter for Dither Patterns
// Inspired by shpigford-dither's svg.js exporter

export interface SVGExportSettings {
  shape: 'circle' | 'square' | 'diamond';
  style: 'scaled' | 'constant';
  cellSize: number;
  palette: string[]; // Hex color codes, e.g. ["#000000", "#ffffff"]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function svgShape(shape: 'circle' | 'square' | 'diamond', cx: number, cy: number, cellSize: number, sizeFactor: number): string {
  const half = round2((cellSize / 2) * sizeFactor);
  cx = round2(cx);
  cy = round2(cy);

  switch (shape) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="${half}"/>`;
    case 'square': {
      const x = round2(cx - half);
      const y = round2(cy - half);
      const s = round2(half * 2);
      return `<rect x="${x}" y="${y}" width="${s}" height="${s}"/>`;
    }
    case 'diamond': {
      const pts = [
        `${cx},${round2(cy - half)}`,
        `${round2(cx + half)},${cy}`,
        `${cx},${round2(cy + half)}`,
        `${round2(cx - half)},${cy}`
      ].join(' ');
      return `<polygon points="${pts}"/>`;
    }
  }
}

export function generateSvgFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: SVGExportSettings
): string {
  const cellSize = settings.cellSize || 8;
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  // Group cells by color
  const groups: { [colorIndex: number]: { cx: number; cy: number; sizeFactor: number }[] } = {};
  for (let i = 0; i < settings.palette.length; i++) {
    groups[i] = [];
  }

  // Retrieve pixel data from canvas context
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // We loop over cols and rows, sample average luminance in each cell block
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let totalLuma = 0;
      let count = 0;
      
      const startX = x * cellSize;
      const startY = y * cellSize;
      
      for (let cy = 0; cy < cellSize && (startY + cy) < height; cy++) {
        for (let cx = 0; cx < cellSize && (startX + cx) < width; cx++) {
          const pixelIndex = ((startY + cy) * width + (startX + cx)) * 4;
          const r = data[pixelIndex] / 255.0;
          const g = data[pixelIndex + 1] / 255.0;
          const b = data[pixelIndex + 2] / 255.0;
          
          // CIE 1931 perceived luminance formula
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          totalLuma += luma;
          count++;
        }
      }
      
      const avgLuma = count > 0 ? totalLuma / count : 0.5;
      
      // Map luminance to color index in palette
      const numColors = settings.palette.length;
      const colorIndex = Math.min(numColors - 1, Math.floor(avgLuma * numColors));
      
      if (colorIndex === numColors - 1) continue; // Skip background color
      
      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;
      const sizeFactor = settings.style === 'scaled' ? (1.0 - avgLuma) : 1.0;
      
      if (sizeFactor < 0.01) continue;
      
      if (groups[colorIndex]) {
        groups[colorIndex].push({ cx, cy, sizeFactor });
      }
    }
  }

  const bgColor = settings.palette[settings.palette.length - 1] || '#ffffff';
  const svgWidth = cols * cellSize;
  const svgHeight = rows * cellSize;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`;
  svg += `  <rect width="100%" height="100%" fill="${bgColor}"/>\n`;

  for (let i = 0; i < settings.palette.length - 1; i++) {
    const cells = groups[i];
    if (!cells || cells.length === 0) continue;

    svg += `  <g fill="${settings.palette[i]}" id="color-${i}">\n`;
    for (const cell of cells) {
      svg += '    ' + svgShape(settings.shape, cell.cx, cell.cy, cellSize, cell.sizeFactor) + '\n';
    }
    svg += '  </g>\n';
  }

  svg += '</svg>';
  return svg;
}
