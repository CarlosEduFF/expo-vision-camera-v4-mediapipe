<p align="center">
  <h1 align="center">🖐️ expo-vision-camera-v4-mediapipe</h1>
</p>

<p align="center">
  <strong>Real-time hand landmark detection for React Native, powered by Google MediaPipe</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/expo-vision-camera-v4-mediapipe">
    <img src="https://img.shields.io/npm/v/expo-vision-camera-v4-mediapipe.svg?style=flat-square&color=00e5ff" alt="npm version" />
  </a>
  <a href="https://github.com/CarlosEduFF/expo-vision-camera-v4-mediapipe/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/expo-vision-camera-v4-mediapipe.svg?style=flat-square&color=00e5ff" alt="license" />
  </a>
  <img src="https://img.shields.io/badge/platform-Android-brightgreen?style=flat-square" alt="platform" />
  <img src="https://img.shields.io/badge/Expo-SDK%2050%2B-blueviolet?style=flat-square" alt="expo" />
  <img src="https://img.shields.io/badge/Vision%20Camera-v4-blue?style=flat-square" alt="vision camera" />
</p>

---

An advanced **Expo Config Plugin** that integrates [Google MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) into **React Native Vision Camera v4** as a native Frame Processor Plugin.

Detect **21 hand landmark points** per hand in real-time, directly on-device (**Edge Computing**), with high performance and low CPU usage through a native Kotlin implementation — no bridge overhead.

## ✨ Features

| Feature | Description |
|---|---|
| ⚡️ **Native Performance** | Kotlin Frame Processor Plugin — no JS bridge overhead |
| 🖐️ **Multi-Hand** | Detect up to 4 hands simultaneously |
| 🤲 **Handedness** | Classify each hand as Left or Right with confidence score |
| 📐 **21 Landmarks** | Full 3D hand skeleton (x, y, z) per hand |
| 📦 **Expo Managed** | Works in managed workflow — no need to eject |
| 🔧 **Auto-Config** | Automatically configures `build.gradle`, `MainApplication.kt`, and native assets |
| ⚙️ **Configurable** | Tune detection/tracking confidence and max hands via `app.json` |
| 🧩 **TypeScript** | Full type definitions with JSDoc documentation |

## 📋 Prerequisites

| Requirement | Version |
|---|---|
| Expo SDK | ≥ 50 |
| React Native | ≥ 0.73 |
| React Native Vision Camera | ≥ 4.0.0 |
| React Native Worklets Core | ≥ 0.5.0 |
| Android | minSdk 24+ |

> **Note**: This plugin currently supports **Android only**. iOS support is not available.

## 📥 Installation

```bash
npm install expo-vision-camera-v4-mediapipe
```

### Model File

Download the `hand_landmarker.task` model from [Google MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#models) and place it in your project root or `assets/` folder.

The plugin will automatically find it in:
1. `./assets/hand_landmarker.task`
2. `./hand_landmarker.task`
3. `./node_modules/expo-vision-camera-v4-mediapipe/hand_landmarker.task`

## ⚙️ Configuration

Add the plugin to your `app.json` or `app.config.js`:

### Basic (default settings)

```json
{
  "expo": {
    "plugins": [
      "react-native-vision-camera",
      "expo-vision-camera-v4-mediapipe"
    ]
  }
}
```

### Advanced (custom options)

```json
{
  "expo": {
    "plugins": [
      "react-native-vision-camera",
      ["expo-vision-camera-v4-mediapipe", {
        "numHands": 1,
        "minDetectionConfidence": 0.5,
        "minPresenceConfidence": 0.5,
        "minTrackingConfidence": 0.5
      }]
    ]
  }
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `numHands` | `number` | `2` | Maximum number of hands to detect (1-4) |
| `minDetectionConfidence` | `number` | `0.4` | Minimum confidence for initial hand detection (0.0-1.0) |
| `minPresenceConfidence` | `number` | `0.4` | Minimum confidence for hand presence (0.0-1.0) |
| `minTrackingConfidence` | `number` | `0.4` | Minimum confidence for landmark tracking (0.0-1.0) |

After configuration, run:

```bash
npx expo prebuild --clean
```

## 🚀 Usage

```tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor, useCameraPermission } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';

// Import types (optional, for TypeScript)
import type { HandDetectionResult } from 'expo-vision-camera-v4-mediapipe';

export default function HandTracker() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // Bridge results from native worklet thread to JS
  const onResult = Worklets.createRunOnJS((result: HandDetectionResult) => {
    console.log(`Detected ${result.hands.length} hand(s)`);
    
    result.hands.forEach((hand, i) => {
      const handSide = result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown';
      console.log(`  Hand ${i}: ${handSide}, wrist at (${hand[0].x}, ${hand[0].y})`);
    });
  });

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    // detectHandLandmarks is globally available inside worklets
    const result = detectHandLandmarks(frame);
    if (result?.hands?.length > 0) {
      onResult(result);
    }
  }, [onResult]);

  if (!hasPermission || !device) return null;

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={true}
      frameProcessor={frameProcessor}
    />
  );
}
```

## 📖 API Reference

### `detectHandLandmarks(frame: Frame): HandDetectionResult`

Detects hand landmarks in a camera frame. Must be called inside a `useFrameProcessor` worklet.

#### `HandDetectionResult`

```typescript
interface HandDetectionResult {
  /** Array of detected hands. Each hand = 21 HandLandmark points */
  hands: HandLandmark[][];
  
  /** Handedness classification per hand ("Left" / "Right") */
  handedness?: HandednessCategory[][];
  
  /** Error message if detection failed */
  error?: string;
}
```

#### `HandLandmark`

```typescript
interface HandLandmark {
  x: number;  // Normalized [0.0, 1.0] — horizontal position
  y: number;  // Normalized [0.0, 1.0] — vertical position
  z: number;  // Depth relative to wrist
}
```

#### `HandednessCategory`

```typescript
interface HandednessCategory {
  categoryName: string;  // "Left" or "Right"
  score: number;         // Confidence [0.0, 1.0]
  displayName: string;
}
```

#### `HandLandmarkIndex` (Enum)

Use `HandLandmarkIndex` for readable access to specific landmark points:

```typescript
import { HandLandmarkIndex } from 'expo-vision-camera-v4-mediapipe';

const wrist = hand[HandLandmarkIndex.WRIST];
const indexTip = hand[HandLandmarkIndex.INDEX_FINGER_TIP];
const thumbTip = hand[HandLandmarkIndex.THUMB_TIP];
```

<details>
<summary>All 21 Landmark Indices</summary>

| Index | Name | Description |
|---|---|---|
| 0 | `WRIST` | Wrist |
| 1 | `THUMB_CMC` | Thumb carpometacarpal joint |
| 2 | `THUMB_MCP` | Thumb metacarpophalangeal joint |
| 3 | `THUMB_IP` | Thumb interphalangeal joint |
| 4 | `THUMB_TIP` | Thumb tip |
| 5 | `INDEX_FINGER_MCP` | Index finger MCP |
| 6 | `INDEX_FINGER_PIP` | Index finger PIP |
| 7 | `INDEX_FINGER_DIP` | Index finger DIP |
| 8 | `INDEX_FINGER_TIP` | Index finger tip |
| 9 | `MIDDLE_FINGER_MCP` | Middle finger MCP |
| 10 | `MIDDLE_FINGER_PIP` | Middle finger PIP |
| 11 | `MIDDLE_FINGER_DIP` | Middle finger DIP |
| 12 | `MIDDLE_FINGER_TIP` | Middle finger tip |
| 13 | `RING_FINGER_MCP` | Ring finger MCP |
| 14 | `RING_FINGER_PIP` | Ring finger PIP |
| 15 | `RING_FINGER_DIP` | Ring finger DIP |
| 16 | `RING_FINGER_TIP` | Ring finger tip |
| 17 | `PINKY_MCP` | Pinky MCP |
| 18 | `PINKY_PIP` | Pinky PIP |
| 19 | `PINKY_DIP` | Pinky DIP |
| 20 | `PINKY_TIP` | Pinky tip |

</details>

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    JavaScript                        │
│  useFrameProcessor → detectHandLandmarks(frame)      │
│                          │                           │
│  Worklets.createRunOnJS ← result                     │
└──────────────────────────┬──────────────────────────┘
                           │ Native call (no bridge)
┌──────────────────────────▼──────────────────────────┐
│                 Native (Kotlin)                      │
│  HandLandmarkerPlugin.callback(frame)                │
│    ├─ imageToBitmap(frame.image)                     │
│    │   └─ YUV_420_888 → NV21 → JPEG → Bitmap        │
│    ├─ BitmapImageBuilder → MPImage                   │
│    ├─ HandLandmarker.detect(mpImage)                 │
│    └─ return { hands, handedness }                   │
└──────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│              MediaPipe Tasks Vision                  │
│  hand_landmarker.task (TFLite model, ~7.8MB)         │
│  On-device inference — Edge Computing                │
└─────────────────────────────────────────────────────┘
```

## 🔧 Troubleshooting

### "HandLandmarker not initialized"

The model file was not found in Android assets.

**Solution**: Ensure `hand_landmarker.task` exists in your project root or `assets/` folder, then run:
```bash
npx expo prebuild --clean
```

### "Image to Bitmap conversion failed"

The camera frame format is not supported.

**Solution**: This plugin supports `YUV_420_888` and `JPEG` formats. Ensure Vision Camera is configured with a compatible pixel format.

### Detection is slow or dropping frames

**Solutions**:
- Reduce `numHands` to `1`
- Increase confidence thresholds (e.g., `0.6` or `0.7`)
- Use a lower camera resolution via Vision Camera's format prop

### Build fails with "duplicate class" errors

If you have other MediaPipe dependencies in your project, they may conflict.

**Solution**: Ensure only one version of `com.google.mediapipe:tasks-vision` is in your dependency tree. Check with:
```bash
cd android && ./gradlew app:dependencies | grep mediapipe
```

### Plugin changes not applied after rebuild

**Solution**: Always use `--clean` flag when rebuilding:
```bash
npx expo prebuild --clean
npx expo run:android
```

## 📄 Credits

Developed as part of the **[Li-Vision](https://github.com/CarlosEduFF)** project — advanced accessibility and gesture recognition powered by Edge AI.

## 📝 License

[MIT](./LICENSE) © [CarlosEduFF](https://github.com/CarlosEduFF)

---

<p align="center">
  <sub>Built with ❤️ and Kotlin</sub>
</p>
