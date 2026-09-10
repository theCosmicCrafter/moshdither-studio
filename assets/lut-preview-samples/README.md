# LUT preview samples

Source imagery for the LUT Library thumbnails. Used at generation time only by
`scripts/generate-lut-thumbs.mjs` — these files are **not** bundled into the app;
only the generated 120px thumbnails in `public/lut/thumbs/` ship.

| File | Why it is here |
|------|----------------|
| `portrait.jpg` | Skin tone. The single most diagnostic surface for a grade LUT — a cast that is invisible on landscape reads immediately on a face. |
| `mountain.jpg` | Neutral whites (snow), blue sky, green conifers, grey rock. Widest neutral-plus-primary range of the three. |
| `landscape.jpg` | Saturated greens and a warm sunset, so saturation pushes and warm/cool shifts are obvious. |

Free-use stock images, provided by the project owner from
`LUTs-Manager-Testing/LUTs-Manager/standalone-app/assets/preview-samples`.

They are composited into a four-quadrant reference alongside a synthetic neutral
grey ramp; the ramp is what exposes crushed blacks and banding, which no
photograph shows as clearly.
