# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-05-21

### Fixed
- Optimized frame processing by replacing slow YUV-to-Bitmap double conversion with direct `MPImage` wrapping via `MediaImageBuilder`.
- Fixed potential native memory leak by ensuring `MPImage` is closed in a `finally` block after inference.

## [1.1.0] - 2026-04-18

### Added
- TypeScript type definitions (`types/index.d.ts`) with full JSDoc documentation
- `HandLandmarkIndex` enum for easy landmark access
- `handedness` support — detect left/right hand classification
- Configurable options via `app.json` (`numHands`, `minDetectionConfidence`, `minPresenceConfidence`, `minTrackingConfidence`)
- `CHANGELOG.md`
- `LICENSE` file (MIT)
- `.gitignore`

### Changed
- Plugin injection is now idempotent — won't duplicate code on repeated `expo prebuild`
- Improved README with badges, full API reference, troubleshooting guide, and architecture overview
- Updated `package.json` with `repository`, `homepage`, `bugs`, `files`, and `types` fields

### Fixed
- Fixed `index.js` export — now properly declares the frame processor function instead of incorrect re-export

## [1.0.0] - 2026-04-01

### Added
- Initial release
- MediaPipe Hand Landmarker integration as Vision Camera v4 Frame Processor Plugin
- Expo Config Plugin for automatic native configuration
- Support for up to 2 hands with 21 landmark points each
- YUV_420_888 and JPEG frame format support
- Example app with real-time landmark visualization
