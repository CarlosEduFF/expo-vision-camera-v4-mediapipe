# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-08-15

### Fixed
- **Pose sempre marcada como invisível** — `NormalizedLandmark.visibility()` é um `Optional<Float>` que o PoseLandmarker do Tasks deixa **vazio** em várias builds (o score só é populado quando o grafo o expõe). O código fazia `visibility().orElse(0f)`, então todos os 33 pontos chegavam ao cliente com `visibility = 0`. Consumidores que filtram por esse campo — o padrão sugerido pela própria documentação do MediaPipe — descartavam a pose inteira, ou pior: recebiam zeros num vetor de features e treinavam modelos com o canal de corpo constante. Agora o plugin tenta `visibility()`, cai para `presence()` e, se ambos vierem vazios, **omite a chave** em vez de emitir zero — ausência passa a significar "desconhecido", não "invisível".

### Nota para consumidores
- Trate `visibility` ausente como ponto presente (`?? 1`), não como zero. Para descartar poses ruins, prefira uma checagem geométrica (largura de ombros plausível, cabeça acima da linha dos ombros): o BlazePose devolve os 33 pontos mesmo sem um corpo reconhecível no enquadramento, e nesse caso nenhum score confiável acompanha o resultado.

## [1.3.0] - 2026-08-14

### Fixed
- **Modelos recebiam a imagem deitada** — o `ImageProcessingOptions.setRotationDegrees()` é ignorado pelo MediaPipe Tasks quando a `MPImage` vem de um `android.media.Image` via `MediaImageBuilder` (bug conhecido, mesma raiz do ML Kit — googlesamples/mlkit#937), então a correção da 1.2.1/1.2.2 nunca teve efeito: hands/pose/face processavam o buffer cru do sensor (de lado). O `FaceLandmarker` tolerava, mas o `PoseLandmarker` (BlazePose) **não é invariante à rotação** (esqueleto do busto saía errado) e o `HandLandmarker` degradava (a 2ª mão raramente era detectada). Agora o frame RGBA é convertido em `Bitmap`, **girado fisicamente** conforme `frame.orientation` e alimentado via `BitmapImageBuilder` — os três modelos passam a ver a imagem em pé.

### Changed
- **Modo `VIDEO` com `detectForVideo(...)`** em hands/pose/face (antes `IMAGE`/`detect`): habilita o tracking entre frames — após a primeira detecção, os frames seguintes pulam a fase cara de re-detecção, melhorando estabilidade (inclusive das duas mãos simultâneas) e desempenho. O timestamp vem de `frame.timestamp`.
- Falha de pose/face não derruba mais o canal de mãos: cada canal opcional tem seu próprio try/catch e reporta `poseError`/`faceError` no resultado.

### Added
- Resultado agora inclui `imageWidth`/`imageHeight` — dimensões (px) da imagem em pé usada na inferência. Overlays precisam delas para mapear as coordenadas normalizadas num preview com `resizeMode="cover"` (que corta as bordas) sem desalinhamento.

## [1.2.2] - 2026-06-13

### Fixed
- **Erro de compilação no Kotlin gerado (1.2.1)** — a leitura da rotação via `frame.imageProxy.imageInfo.rotationDegrees` exigia o tipo `androidx.camera.core.ImageProxy`, que não está no classpath do módulo do app (`Cannot access class 'ImageProxy'` / `Unresolved reference 'imageInfo'`). Agora a rotação é obtida via `frame.orientation` (API pública do frame processor) e convertida para `rotationDegrees`, sem depender de tipos transitivos do CameraX.

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
