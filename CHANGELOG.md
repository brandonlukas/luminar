# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-01-04

### Fixed
- Reset to defaults button now fully updates particle visuals (particle count, colors, and all parameters)
- Missing `onColorChange()` callback in reset() method
- Missing `onParticleCountChange()` callback in reset() method

### Changed
- **Simplified CLI API** - Removed file path argument, focus on drag-and-drop workflow only
- **README clarification** - Highlighted drag-and-drop as primary usage method
- **CLI cleanup** - Removed unused file handling code from bin/luminar.mjs

## [0.2.3] - 2026-01-04

### Fixed
- Removed test vector field data from published package
- Added `public/vector-field.json` to `.npmignore` to prevent shipping runtime data
- Package now starts clean with empty fields instead of pre-loaded test data

## [0.2.2] - 2026-01-04

### Fixed
- CLI module resolution error when running `npx @brandonlukas/luminar`
- Inlined CSV parser in bin/luminar.mjs to avoid import path issues
- Inlined CSV parser in scripts/visualize-csv.mjs for consistency

## [0.2.1] - 2026-01-04

### Added
- Comprehensive CHANGELOG.md documenting all v0.2.0 improvements
- Enhanced README.md with features list, architecture overview, and parameter table
- Screenshot reference in README for visual demonstration

### Changed
- Improved README structure with clear sections for Quick Start, CSV Format, Local Development, Recording, and Parameters
- Updated documentation to reflect all performance optimizations and new features

## [0.2.0] - 2026-01-04

### Added
- **Dual vector field support** - Load two CSV fields side-by-side with independent colors
- **Drag-and-drop interface** - Side-specific visual feedback for left/right field loading
- **8 color presets** - Luminous violet, pure white, neon cyan, electric lime, solar flare, aurora mint, sunrise coral, ember gold
- **Motion trails effect** - Optional afterimage pass with configurable decay rate
- **Field management controls** - Clear Field A/B buttons to reset individual fields
- **Turbulence/noise parameter** - Adjustable noise strength for organic particle motion
- **WebM video recording** - Export at 60fps with resolutions up to 4K
- **Recording duration options** - Choose 3s, 5s, 10s, or 15s capture length
- **Modular architecture** - Separated into `ParticleSystem`, `FieldLoader`, `ControlPanel`, `RecordingManager` modules
- **Spatial grid data structure** - O(1) field lookups for high-performance rendering
- **CSV parser module** - Shared parsing logic between CLI and dev scripts
- **Comprehensive README** - Features list, architecture overview, parameter table

### Changed
- **10-100x performance improvement** - Spatial grid replaces O(n) linear search with O(1) grid lookups
- **Optimized particle updates** - Eliminated 300k Math.sqrt() calls per second via squared distance comparisons
- **Cached loop calculations** - Speed multiplier and jitter range computed once per frame
- **Conditional noise evaluation** - Noise check performed once per frame instead of per particle
- **Bounding sphere computation** - Enables Three.js frustum culling for off-screen particles
- **Auto-calibrated cell size** - Spatial grid adapts to field data density
- **Organized property groups** - Clear sections for buffers, field data, spatial grid, view state, noise
- **Extracted helper methods** - Single-responsibility functions for particle reset, noise application, coordinate transforms
- **Coordinate transformation utilities** - Explicit `dataToWorld` and `worldToData` converters
- **Readonly constants** - Immutable noise scale and time scale values
- **Improved code readability** - Split complex methods into high-level flow + detail helpers
- **Enhanced control panel** - Collapsible sections, field colors, clear buttons, trail controls
- **Responsive field layout** - Dynamic viewport offset calculation based on window width

### Fixed
- **Grid search accuracy** - Searches 3×3 grid cells (current + 8 neighbors) for robust nearest-neighbor lookups
- **Header detection** - CSV parser auto-skips header rows when present
- **Field border calibration** - Automatically computed from average nearest-neighbor spacing

### Removed
- Unused `VIEW_OFFSET` constant
- Unused `viewOffsetY` variable
- Unused `colorPreset` parameter
- Duplicate `COLOR_PRESETS` definition
- Unused `getFieldDistControlHandle` function
- Unused `fieldDistControlHandle` variable

### Performance
- **Spatial grid**: O(1) average-case field lookups vs O(n) linear search
- **Field sampling**: With 1000 field points, reduced from ~300M operations/second to ~5M
- **Particle updates**: Eliminated redundant sqrt, multiplication, and condition checks
- **Rendering pipeline**: Frustum culling automatically discards off-screen particles

### Technical Details
- Bundle size: 542.23 kB (gzip: 137.60 kB)
- Build time: ~165ms for 23 modules
- Target: ES2022, TypeScript strict mode
- Three.js: OrthographicCamera, BufferGeometry, Points, UnrealBloomPass, AfterimagePass
- CLI: Zero-install via `npx @brandonlukas/luminar`

## [0.1.0] - Initial Release

### Added
- Basic particle flow visualization with bloom effects
- CSV vector field loading via CLI
- Adjustable parameters: particle count, size, bloom, lifetime
- Orthographic camera with responsive framing
- Additive blending for luminous aesthetic
- Real-time control panel

[0.2.4]: https://github.com/brandonlukas/luminar/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/brandonlukas/luminar/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/brandonlukas/luminar/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/brandonlukas/luminar/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/brandonlukas/luminar/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/brandonlukas/luminar/releases/tag/v0.1.0
