# Luminar — MVP Specification

**Particle flow visualization along empirical vector fields, optimized for Nature-quality supplementary video export.**

---

## 1. Purpose

Luminar renders animated particles flowing along a 2D vector field derived from single-cell trajectory data (e.g., RNA velocity in UMAP/tSNE embedding space). The primary deliverable is a publication-ready H.264 video suitable for submission to Nature Portfolio journals as supplementary material.

---

## 2. Input Format

### 2.1 Vector Field CSV

A single CSV file with four required columns:

| Column | Type  | Description                            |
| ------ | ----- | -------------------------------------- |
| `x`    | float | Horizontal position in embedding space |
| `y`    | float | Vertical position in embedding space   |
| `dx`   | float | Horizontal velocity component          |
| `dy`   | float | Vertical velocity component            |

**Assumptions derived from reference data (Cebpa.csv):**

- Grid is **sparse and irregular** — vectors exist only where cells are present, not on a regular lattice. Expect 20–30% coverage of the bounding box.
- Coordinates are continuous (typical UMAP range: roughly −10 to +25).
- Velocity magnitudes span ~2 orders of magnitude (0.01–1.1 in reference data). This dynamic range must be handled gracefully.
- Grid spacing is approximately uniform but not guaranteed.
- Row count: expect hundreds to low thousands of grid points (897 in reference data).

### 2.2 File Loading

- Drag-and-drop or file picker in the browser UI.
- Parse with PapaParse. Validate that all four columns exist and contain numeric values.
- On load, compute and cache: bounding box, Delaunay triangulation, velocity magnitude range.

---

## 3. Vector Field Interpolation

Current version already does good job.

---

## 4. Particle System

Current version already does good job.

---

## 5. Visual Effects

### 5.1 Color Mapping

Particle color is mapped from velocity magnitude at the particle's current position:

- **Colormaps available**: viridis (default), cividis, inferno, magma, plasma, coolwarm.
- All default colormaps must be **colorblind-safe** (Nature accessibility requirement).
- Custom single-color mode with bloom providing visual variation.
- Color legend rendered on-canvas showing magnitude-to-color mapping.

---

## 6. Canvas & Aspect Ratio

### 6.1 Viewport

- **Primary aspect ratio**: 16:9 (Nature preferred).
- **Secondary option**: 4:3 toggle.
- The canvas is always locked to the selected aspect ratio. The vector field is fit within the canvas with uniform scaling and centered, preserving the data's true aspect ratio. Remaining space is filled with the background color.
- Real-time preview renders at screen resolution.

### 6.2 Export Resolutions

| Preset | Dimensions   | Use Case                     |
| ------ | ------------ | ---------------------------- |
| 1080p  | 1920 × 1080  | Standard supplementary video |
| 4K     | 3840 × 2160  | High-quality supplementary   |
| Custom | User-defined | Poster or non-standard       |

---

## 7. Video Export (Nature Compliance)

### 7.1 Requirements (from Nature Portfolio guidelines)

- **Codec**: H.264
- **Container**: MP4
- **Aspect ratio**: 16:9 preferred, 4:3 acceptable
- **Compression**: Minimal — use CRF 0–10 (visually lossless to lossless)

### 7.2 Recording Pipeline

1. User sets export parameters: resolution, duration (seconds), frame rate.
2. Switch to **offline render mode**: the animation loop is decoupled from real-time clock.
3. For each frame `i` in `[0, totalFrames)`:
   a. Advance the simulation by exactly one fixed `dt`.
   b. Render the frame to an offscreen canvas/framebuffer.
   c. Read pixels and pass the frame to the encoder.
4. Encode all frames into H.264 MP4 using **ffmpeg.wasm** (client-side, no server required).
5. Offer the resulting MP4 as a download.

### 7.3 Export Parameters

| Parameter  | Range / Default         |
| ---------- | ----------------------- |
| Duration   | 5 – 120 seconds / 15s   |
| Frame rate | 24, 30, 60 fps / 30 fps |
| Resolution | 1080p / 4K / custom     |
| CRF        | 0 – 18 / 8              |

### 7.4 Seamless Loop Guarantee

Because particle lifetimes are staggered and respawns are continuous, any segment of the animation is visually indistinguishable from any other. The exported video can be set to loop in a media player without visible seams. No special crossfade is needed.

### 7.5 Progress Feedback

During export, display a progress bar with frame count, percentage, and estimated time remaining. The UI should remain responsive (use Web Workers or `requestIdleCallback` for encoding).

---

## 8. Overlays & Annotations

All overlays are rendered directly onto the canvas so they are baked into the exported video.

### 8.1 Title Card

- Optional: a static title frame (1–3 seconds) at the start of the video.
- Fields: title text, description, author/affiliation.
- Matches the background color, using the same sans-serif font.

### 8.2 Custom Labels

- User can place text labels on the canvas (e.g., "M1 Macrophage", "Monocyte") by clicking a position and typing.
- Labels are persistent across frames (baked into the animation).
- Font size, color, and position are adjustable.

---

## 9. UI Layout

### 9.1 Structure

```
┌─────────────────────────────────────────────────────┐
│                   Top Bar (title, file loader)       │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│   Control    │                                      │
│   Sidebar    │         Canvas / Viewport            │
│   (280px)    │         (16:9 locked)                │
│              │                                      │
│  - Particles │                                      │
│  - Bloom     │                                      │
│  - Color     │                                      │
│  - Export    │                                      │
│              │                                      │
├──────────────┴──────────────────────────────────────┤
│                   Status Bar (fps, particle count)   │
└─────────────────────────────────────────────────────┘
```

### 9.2 Control Sections

**Particles**: count slider, speed multiplier, trail length, particle size, opacity, lifetime.

**Bloom**: strength, radius, threshold.

**Color**: colormap dropdown, velocity scaling mode (raw / log / normalized), background color.

**Overlays**: scale bar toggle, legend toggle, label editor.

**Export**: resolution preset, duration, frame rate, CRF, title card fields, export button + progress bar.

### 9.3 Interaction

- All sliders update the visualization in real time.
- Pan: click-and-drag on canvas.
- Zoom: scroll wheel.
- Hover: tooltip showing local `(x, y)` position and `(dx, dy)` velocity.
- Play / Pause button.

---

## 10. Tech Stack

| Component       | Technology                                     |
| --------------- | ---------------------------------------------- |
| Rendering       | Three.js (WebGLRenderer) + custom GLSL shaders |
| Post-processing | Three.js EffectComposer + UnrealBloomPass      |
| GPGPU particles | Ping-pong float textures via Three.js          |
| UI framework    | React                                          |
| Control panel   | leva or custom sidebar components              |
| CSV parsing     | PapaParse                                      |
| Delaunay        | d3-delaunay                                    |
| Video encoding  | ffmpeg.wasm (H.264 MP4)                        |
| Colormaps       | Custom LUT textures (baked from matplotlib)    |

---

## 11. Performance Targets

| Metric                      | Target                        |
| --------------------------- | ----------------------------- |
| Real-time preview           | 60 fps with 50K particles     |
| Max particles (interactive) | 200K at ≥30 fps               |
| File load + triangulation   | < 1 second for 1K grid points |
| Export speed                | ≤ 2× real-time for 1080p30    |

---

## 12. Out of Scope (MVP)

The following are deferred to future phases:

- 3D vector fields and camera orbit paths.
- Cell scatter overlay and cluster metadata coloring.
- Audio reactivity.
- Shareable URLs or iframe embedding.
- Server-side rendering.
- Density-aware seeding (uniform random is sufficient for MVP).