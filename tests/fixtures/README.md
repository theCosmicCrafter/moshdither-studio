# Test fixtures

`test-image.png` and `test-video.mp4` back the real-backend E2E suites
(`tests/e2e/real-backend.spec.ts`, `tests/e2e/render-presets-luts.spec.ts`).

They are committed rather than generated at test time so the suites run
anywhere without an FFmpeg on PATH. Before they existed both suites defaulted
their media paths to `""` and skipped every media-dependent case silently —
which is indistinguishable from passing, and hid a total video-export
regression for the life of the bug.

They are deliberately small (139 KB total, 480x270) so the full 99-effect
render sweep finishes in about ten seconds. `testsrc2` is used because its
gradients, colour bars and moving elements exercise dithering, chroma and
motion-based effects far better than a flat fill.

## Regenerating

```bash
ffmpeg -y -f lavfi -i "testsrc2=size=480x270:rate=30:duration=2" \
  -pix_fmt yuv420p -c:v libx264 tests/fixtures/test-video.mp4

ffmpeg -y -f lavfi -i "testsrc2=size=480x270" \
  -frames:v 1 tests/fixtures/test-image.png
```

## Using different media

Both suites honour overrides, useful for exercising the pipeline at real
resolutions:

```bash
MOSHDITHER_TEST_IMAGE=/path/photo.png MOSHDITHER_TEST_VIDEO=/path/clip.mp4 npm run test:e2e
```

Note the video fixture has **no audio track**. Audio-reactive export paths are
covered separately by the audio-bake tests in `src-tauri`.
