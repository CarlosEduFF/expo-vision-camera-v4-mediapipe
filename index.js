/**
 * expo-vision-camera-v4-mediapipe
 *
 * Entry point for the MediaPipe Hand Landmarker Frame Processor Plugin.
 *
 * IMPORTANT: `detectHandLandmarks` is a native Frame Processor Plugin
 * registered via the Expo Config Plugin. It is available as a global
 * function inside `useFrameProcessor` worklets — it does NOT need to
 * be imported in your frame processor code.
 *
 * This module re-exports the TypeScript types for consumer convenience.
 *
 * @example
 * ```tsx
 * import { useFrameProcessor } from 'react-native-vision-camera';
 * import { Worklets } from 'react-native-worklets-core';
 *
 * // Types can be imported for TypeScript support:
 * // import type { HandDetectionResult } from 'expo-vision-camera-v4-mediapipe';
 *
 * const frameProcessor = useFrameProcessor((frame) => {
 *   'worklet';
 *   // detectHandLandmarks is globally available inside worklets
 *   const result = detectHandLandmarks(frame);
 *   if (result?.hands?.length > 0) {
 *     // Process landmarks...
 *   }
 * }, []);
 * ```
 *
 * @platform Android
 */

// Re-export types for TypeScript consumers
// The actual `detectHandLandmarks` function is injected natively
// and available as a global inside Frame Processor worklets.

/**
 * Landmark index constants for easier access to specific hand points.
 * @readonly
 * @enum {number}
 */
const HandLandmarkIndex = Object.freeze({
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_FINGER_MCP: 5,
  INDEX_FINGER_PIP: 6,
  INDEX_FINGER_DIP: 7,
  INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_MCP: 9,
  MIDDLE_FINGER_PIP: 10,
  MIDDLE_FINGER_DIP: 11,
  MIDDLE_FINGER_TIP: 12,
  RING_FINGER_MCP: 13,
  RING_FINGER_PIP: 14,
  RING_FINGER_DIP: 15,
  RING_FINGER_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
});

/**
 * MediaPipe Pose landmark indices (subset relevant for Libras: upper body).
 * Mirrors POSE_INDICES used by the Li-Vision API feature builder.
 * @readonly
 * @enum {number}
 */
const PoseLandmarkIndex = Object.freeze({
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
});

module.exports = { HandLandmarkIndex, PoseLandmarkIndex };
