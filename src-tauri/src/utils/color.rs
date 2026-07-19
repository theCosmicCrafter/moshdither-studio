/// Convert RGB to luminance (0-255).
pub fn luminance(r: u8, g: u8, b: u8) -> u8 {
    // ITU-R BT.601 coefficients
    ((r as f32 * 0.299) + (g as f32 * 0.587) + (b as f32 * 0.114)) as u8
}

/// Clamp a value to [0, 255].
pub fn clamp_u8(v: f32) -> u8 {
    v.clamp(0.0, 255.0) as u8
}

/// Find the nearest color in a palette (Euclidean distance in RGB).
pub fn nearest_palette_color(r: u8, g: u8, b: u8, palette: &[(u8, u8, u8)]) -> (u8, u8, u8) {
    let mut best_idx = 0;
    let mut best_dist = u32::MAX;
    for (idx, &(pr, pg, pb)) in palette.iter().enumerate() {
        let dr = r as i32 - pr as i32;
        let dg = g as i32 - pg as i32;
        let db = b as i32 - pb as i32;
        let dist = (dr * dr + dg * dg + db * db) as u32;
        if dist < best_dist {
            best_dist = dist;
            best_idx = idx;
        }
    }
    palette[best_idx]
}
