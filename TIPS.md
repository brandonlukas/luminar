# Reproducing the Browser-Side Video Export Pipeline

This document explains how Luminar's client-side MP4 export works so the same
pattern can be dropped into any Three.js (or raw WebGL) project.

---

## Architecture Overview

```
User clicks "Export"
  -> Offscreen WebGLRenderer (preserveDrawingBuffer: true)
  -> Frame loop: simulate, render, gl.readPixels()
  -> Raw RGBA frames written to FFmpeg virtual filesystem
  -> FFmpeg.wasm encodes H.264 MP4
  -> Blob downloaded via <a> click
```

Everything runs in the browser — no server, no native binary.

---

## 1. Dependencies

```jsonc
// package.json
{
  "dependencies": {
    "@ffmpeg/ffmpeg": "^0.12.10",
    "@ffmpeg/util": "^0.12.1",
    "three": "^0.172.0"  // or any WebGL renderer
  }
}
```

### Bundler Configuration (Critical)

FFmpeg's WASM modules must **not** be pre-bundled. In Vite:

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
```

For webpack, mark them as externals or use `module.noParse`. Without this,
the bundler will try to process the WASM loader and fail at runtime.

---

## 2. FFmpeg Encoder Wrapper

The encoder handles three jobs: loading the WASM core, buffering raw frames
in JS memory, and running the final encode.

> **Important:** The original version of this encoder wrote individual frame
> files (`frame_00000.raw`, `frame_00001.raw`, ...) to FFmpeg's Emscripten
> virtual filesystem and used `-i frame_%05d.raw` (the `image2` demuxer) to
> read them back. This works with standard Vite but **fails silently with
> alternative bundlers** like `rolldown-vite`. The `%05d` pattern expansion
> inside FFmpeg.wasm's `exec()` cannot find the files — even though
> `listDir('/')` confirms they exist — because the bundled worker resolves
> the Emscripten FS working directory differently than the `writeFile` API.
>
> The fix below **bypasses the image2 demuxer entirely**: frames are collected
> in a JS-side array, concatenated into a single raw video stream, and written
> as one file. FFmpeg reads it with `-f rawvideo`, which requires no pattern
> matching and works reliably across all bundlers.

```ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

class FFmpegEncoder {
  private ffmpeg = new FFmpeg();
  private frames: Uint8Array[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Single-threaded build loaded from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    this.initialized = true;
  }

  addFrame(pixels: Uint8Array): void {
    // Collect frames in JS memory — no virtual FS writes during capture
    this.frames.push(pixels);
  }

  async finalize(
    width: number, height: number, fps: number, crf: number
  ): Promise<Blob> {
    // Concatenate all frames into a single raw video stream
    const frameSize = width * height * 4;
    const totalSize = this.frames.length * frameSize;
    const concat = new Uint8Array(totalSize);
    for (let i = 0; i < this.frames.length; i++) {
      concat.set(this.frames[i], i * frameSize);
    }
    this.frames = []; // Free JS-side frame memory

    // Write the single concatenated file to the virtual FS
    await this.ffmpeg.writeFile('input.raw', concat);

    // Encode — FFmpeg reads the continuous stream (no %05d pattern needed)
    await this.ffmpeg.exec([
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', String(fps),
      '-i', 'input.raw',
      '-vf', 'vflip',          // WebGL Y-axis is inverted
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',   // Required for broad playback support
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    const data = await this.ffmpeg.readFile('output.mp4');
    const raw = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(data as string);
    const ab = new ArrayBuffer(raw.byteLength);
    new Uint8Array(ab).set(raw);
    const blob = new Blob([ab], { type: 'video/mp4' });

    // Cleanup virtual FS
    try { await this.ffmpeg.deleteFile('input.raw'); } catch {}
    try { await this.ffmpeg.deleteFile('output.mp4'); } catch {}

    return blob;
  }

  dispose(): void {
    this.frames = [];
    this.ffmpeg.terminate();
  }
}
```

### Key FFmpeg flags explained

| Flag | Purpose |
|------|---------|
| `-f rawvideo -pix_fmt rgba` | Tells FFmpeg the input is raw RGBA pixel buffers |
| `-s WxH` | Frame dimensions — must match `gl.readPixels` output |
| `-r FPS` | Input/output frame rate |
| `-vf vflip` | Corrects WebGL's bottom-up row order to top-down |
| `-c:v libx264 -crf N` | H.264 encode; CRF 0 = lossless, 18 = good quality |
| `-pix_fmt yuv420p` | Converts RGBA to YUV for universal player support |
| `-movflags +faststart` | Moves MP4 metadata to front for instant web playback |

---

## 3. Frame Capture Loop

The core pattern: decouple your render loop from `requestAnimationFrame`, step
the simulation deterministically, and read pixels after each frame.

```ts
async function exportVideo(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  simulationStep: () => void,
  exportParams: { width: number; height: number; fps: number; duration: number; crf: number },
  onProgress?: (frame: number, total: number) => void,
): Promise<Blob> {
  const { width, height, fps, duration, crf } = exportParams;
  const totalFrames = fps * duration;

  const encoder = new FFmpegEncoder();
  await encoder.init();

  const gl = renderer.getContext();
  const pixelBuffer = new Uint8Array(width * height * 4);

  for (let i = 0; i < totalFrames; i++) {
    // 1. Advance simulation by one deterministic step
    simulationStep();

    // 2. Render the frame
    renderer.render(scene, camera);

    // 3. Read pixels from the GPU
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

    // 4. Copy buffer (readPixels reuses the same typed array)
    encoder.addFrame(new Uint8Array(pixelBuffer));

    onProgress?.(i + 1, totalFrames);

    // 5. Yield to browser periodically to keep UI responsive
    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return encoder.finalize(width, height, fps, crf);
}
```

### Critical detail: `preserveDrawingBuffer`

The WebGL renderer **must** be created with `preserveDrawingBuffer: true`.
Without it, `gl.readPixels()` may return a cleared buffer depending on the
browser's compositing timing.

```ts
const renderer = new THREE.WebGLRenderer({
  canvas: offscreenCanvas,
  preserveDrawingBuffer: true,
  antialias: false,
  alpha: false,
});
```

---

## 4. Triggering the Download

```ts
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 5. React Integration Pattern

Luminar wires the export into a React component with progress state:

```tsx
const [progress, setProgress] = useState<{ frame: number; total: number } | null>(null);
const [exporting, setExporting] = useState(false);

const handleExport = async () => {
  setExporting(true);
  try {
    const blob = await exportVideo(renderer, scene, camera, step, params, (f, t) =>
      setProgress({ frame: f, total: t })
    );
    downloadBlob(blob, 'export.mp4');
  } finally {
    setExporting(false);
    setProgress(null);
  }
};
```

Disable the export button while `exporting` is true to prevent double invocations.

---

## 6. Gotchas and Tips

### Memory

- **Copy the pixel buffer** before calling `addFrame`. `gl.readPixels()` writes
  into the same `Uint8Array` every call — if you pass it directly, every frame
  in FFmpeg's virtual FS will contain the last frame's data.
- For 4K exports (3840x2160), each raw frame is ~33 MB. FFmpeg stores them all
  in memory before encoding. A 30-second 4K/30fps export needs ~30 GB of
  virtual FS. Mitigate by encoding in chunks or reducing resolution.

### WebGL Y-Axis

WebGL's `readPixels` returns rows bottom-to-top. The `-vf vflip` flag in the
FFmpeg command corrects this. Alternatively, flip the rows manually in JS, but
the FFmpeg flag is cheaper.

### CORS / CDN Loading

FFmpeg's WASM core is loaded from `unpkg.com` via `toBlobURL`, which fetches
the file and creates a local blob URL. This sidesteps CORS issues. If you
self-host the WASM files, make sure your server sends the correct
`Content-Type` and CORS headers, and that `Cross-Origin-Opener-Policy` /
`Cross-Origin-Embedder-Policy` headers are set if using the multi-threaded
build.

### Single-Threaded vs Multi-Threaded FFmpeg

Luminar uses the **single-threaded** build (`@ffmpeg/core`). The multi-threaded
build (`@ffmpeg/core-mt`) is faster but requires `SharedArrayBuffer`, which
needs specific HTTP headers (`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`). The single-threaded build works
everywhere without header changes.

### Browser Responsiveness

The `setTimeout(resolve, 0)` yield every 5 frames keeps the main thread from
freezing. Without this, the browser tab will appear unresponsive during long
exports. For truly non-blocking exports, move the render loop into a Web Worker
with an `OffscreenCanvas`.

### Post-Processing

If you use Three.js `EffectComposer` (bloom, etc.), make sure to call
`effectComposer.render()` instead of `renderer.render()` in the frame loop.
The `readPixels` call reads from whatever was last rendered to the default
framebuffer.

### Image Sequence Input (`%05d`) vs Single Raw File

The classic FFmpeg pattern for reading image sequences is:

```
-i frame_%05d.raw
```

This uses the `image2` demuxer to expand `%05d` into `frame_00000.raw`,
`frame_00001.raw`, etc. **This does not work reliably in FFmpeg.wasm** when
the bundler processes the FFmpeg worker differently than standard Vite.

Specifically, with `rolldown-vite` (and potentially other Rust-based bundlers
like Turbopack), the FFmpeg worker's Emscripten virtual filesystem resolves
file paths differently during `exec()` than during `writeFile()`. Files
confirmed present via `listDir('/')` will still produce
`"No such file or directory"` followed by `Aborted()` when FFmpeg tries to
open them. This happens regardless of whether you use absolute (`/frame_...`)
or relative (`frame_...`) paths, and regardless of whether you create
subdirectories.

**The reliable fix:** collect all frame data in a JS array, concatenate into
a single raw video stream, write it as one file (`input.raw`), and use
`-f rawvideo -i input.raw`. This bypasses the image2 demuxer entirely and
works across all bundlers.

Trade-off: all frames must fit in JS memory simultaneously before
concatenation. For 1080p/30fps/5s that's ~1.2 GB, which is fine. For very
long or 4K exports, consider chunked encoding or reduced resolution.

### FFmpeg Error Handling

FFmpeg.wasm rejects promises with **strings**, not `Error` objects. When
catching errors from FFmpeg operations, always use `String(error)` rather
than `error.message`:

```ts
} catch (error) {
  // error might be a string like "ErrnoError: FS error"
  const msg = error instanceof Error ? error.message : String(error);
}
```

If FFmpeg's `exec()` encounters a fatal error (like missing input files), the
Emscripten module calls `abort()`. After this, the entire FFmpeg instance is
**dead** — any subsequent FS operations (`readFile`, `deleteFile`) will throw
`ErrnoError: FS error`. Always check `exec()` logs before assuming the FS
itself is broken.

### CDN Core Version

The `@ffmpeg/core` version loaded from CDN does **not** need to match the
installed `@ffmpeg/ffmpeg` npm package version. The npm package
(`@ffmpeg/ffmpeg@0.12.15`) works correctly with `@ffmpeg/core@0.12.6` from
the CDN. Using a mismatched or newer core version can cause subtle
initialization failures.

---

## 7. Minimal Standalone Example

Putting it all together — a minimal export from any Three.js scene:

```ts
import * as THREE from 'three';
// Assume FFmpegEncoder class from section 2

export async function captureScene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  onFrame: () => void,           // your per-frame update callback
  width = 1920,
  height = 1080,
  fps = 30,
  durationSec = 10,
  crf = 8,
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);

  const encoder = new FFmpegEncoder();
  await encoder.init();

  const gl = renderer.getContext();
  const buf = new Uint8Array(width * height * 4);
  const totalFrames = fps * durationSec;

  for (let i = 0; i < totalFrames; i++) {
    onFrame();
    renderer.render(scene, camera);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    encoder.addFrame(new Uint8Array(buf));
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

  const blob = await encoder.finalize(width, height, fps, crf);
  downloadBlob(blob, 'capture.mp4');

  renderer.dispose();
  encoder.dispose();
}
```

---

## 8. File Reference (Luminar)

| File | Role |
|------|------|
| `src/export/FFmpegEncoder.ts` | WASM encoder wrapper |
| `src/export/ExportManager.ts` | Offscreen render loop + frame capture orchestration |
| `src/components/ExportControls.tsx` | React UI (resolution, FPS, duration, CRF, progress bar) |
| `src/types.ts` | `ExportParams`, `ExportProgress`, `VisualizationParams` |
| `vite.config.ts` | `optimizeDeps.exclude` for FFmpeg |
