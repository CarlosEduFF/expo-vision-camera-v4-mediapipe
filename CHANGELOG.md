# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-06-13

### Fixed
- **Detecção de mão falhando em modo retrato** — o frame da câmera era entregue ao MediaPipe na orientação do sensor (deitado), sem informar a rotação. A imagem chegava "de lado" e a mão raramente era detectada. Agora o plugin lê `frame.imageProxy.imageInfo.rotationDegrees` e o repassa via `ImageProcessingOptions.setRotationDegrees(...)` em todas as detecções (hands, pose e face). Os landmarks passam a ser retornados já na orientação correta (em pé).

### Observação para consumidores
- Apps que faziam compensação manual de rotação nas coordenadas (ex.: trocar/inverter eixos X⇄Y no JS) devem remover esse workaround — agora basta o espelhamento horizontal (`x → 1 - x`) para câmera frontal.

## [1.2.0] - 2026-06-07

### Added
- **Holistic detection** — optional body pose (`PoseLandmarker`) and face (`FaceLandmarker`) landmarks alongside hands, essential for full sign-language (Libras) meaning where non-manual markers (face) and body posture carry semantics beyond the hands.
- New `app.json` options `enablePose` and `enableFace` (both default `false`).
- Result now optionally includes `pose` (33 points with `visibility`) and `face` (up to 478 points) fields.
- TypeScript types `PoseLandmark`, `FaceLandmark`, `HolisticDetectionResult`, and `PoseLandmarkIndex` enum.

### Changed
- The generated Kotlin only creates the Pose/Face landmarkers when the respective flags are enabled — no extra model dependency for hands-only users.

### Backward compatibility
- **Fully backward compatible.** With `enablePose`/`enableFace` left at their default (`false`), the generated native code and the result shape (`hands`, `handedness`) are identical to `1.1.1`. Existing apps require no changes.
- The pose/face models (`pose_landmarker_lite.task`, `face_landmarker.task`) are **not bundled** in the package; download them and place in your project root or `assets/` only if you enable those channels.

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
