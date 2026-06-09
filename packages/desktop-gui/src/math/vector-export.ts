interface VectorDitherCell {
  x: number;
  y: number;
  color: string; // Hex code
  radius: number;
}

export function generateSortedSVG(
  cells: VectorDitherCell[], 
  width: number, 
  height: number, 
  shape: 'circle' | 'rect' | 'diamond'
): string {
  // Group paths by color to prevent pen-plotter registration shifting
  const groups: Record<string, string[]> = {};
  
  for (const cell of cells) {
    if (!groups[cell.color]) {
      groups[cell.color] = [];
    }
    
    let element = '';
    if (shape === 'circle') {
      element = `<circle cx="${cell.x}" cy="${cell.y}" r="${cell.radius}" />`;
    } else if (shape === 'rect') {
      const size = cell.radius * 2;
      element = `<rect x="${cell.x - cell.radius}" y="${cell.y - cell.radius}" width="${size}" height="${size}" />`;
    } else if (shape === 'diamond') {
      const r = cell.radius;
      element = `<polygon points="${cell.x},${cell.y - r} ${cell.x + r},${cell.y} ${cell.x},${cell.y + r} ${cell.x - r},${cell.y}" />`;
    }
    groups[cell.color].push(element);
  }
  
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`;
  
  for (const [color, elements] of Object.entries(groups)) {
    svgContent += `\n  <g fill="${color}">`;
    svgContent += `\n    ${elements.join('\n    ')}`;
    svgContent += `\n  </g>`;
  }
  
  svgContent += '\n</svg>';
  return svgContent;
}
