/**
 * expo-vision-camera-v4-mediapipe
 *
 * Type definitions for the MediaPipe Hand Landmarker Frame Processor Plugin.
 * This plugin provides real-time hand landmark detection (21 points per hand)
 * using Google's MediaPipe Tasks Vision API, running natively on-device.
 *
 * @platform Android
 */

import type { Frame } from 'react-native-vision-camera';

/**
 * A single 3D landmark point detected on a hand.
 *
 * Coordinates are normalized to [0.0, 1.0] relative to the image dimensions.
 * - `x`: Horizontal position (0.0 = left edge, 1.0 = right edge)
 * - `y`: Vertical position (0.0 = top edge, 1.0 = bottom edge)
 * - `z`: Depth relative to the wrist (negative = closer to camera)
 *
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 */
export interface HandLandmark {
  /** Normalized x-coordinate [0.0, 1.0] */
  x: number;
  /** Normalized y-coordinate [0.0, 1.0] */
  y: number;
  /** Normalized z-coordinate (depth relative to wrist) */
  z: number;
}

/**
 * Hand classification indicating left or right hand.
 */
export interface HandednessCategory {
  /** "Left" or "Right" */
  categoryName: string;
  /** Confidence score [0.0, 1.0] */
  score: number;
  /** Display name (may be same as categoryName) */
  displayName: string;
}

/**
 * A single body pose landmark (MediaPipe Pose, 33 points).
 * Coordinates normalized to [0.0, 1.0]; `visibility` ∈ [0.0, 1.0].
 *
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  /** Probability of the landmark being visible in the frame [0.0, 1.0] */
  visibility: number;
}

/**
 * A single face landmark (MediaPipe FaceLandmarker, 478 points).
 * Coordinates normalized to [0.0, 1.0].
 *
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
 */
export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Result returned from `detectHandLandmarks()` frame processor call.
 *
 * `pose` and `face` are present only when the plugin is configured with
 * `enablePose` / `enableFace` and the respective landmarks were detected.
 * For Libras (Brazilian Sign Language), face (non-manual markers) and body
 * pose carry meaning beyond the hands.
 */
export interface HandDetectionResult {
  /**
   * Array of detected hands.
   * Each hand is an array of 21 `HandLandmark` points.
   *
   * Landmark indices follow the MediaPipe Hand Landmark Model:
   * ```
   *  0 = WRIST
   *  1 = THUMB_CMC       5 = INDEX_FINGER_MCP    9 = MIDDLE_FINGER_MCP
   *  2 = THUMB_MCP       6 = INDEX_FINGER_PIP   10 = MIDDLE_FINGER_PIP
   *  3 = THUMB_IP        7 = INDEX_FINGER_DIP   11 = MIDDLE_FINGER_DIP
   *  4 = THUMB_TIP       8 = INDEX_FINGER_TIP   12 = MIDDLE_FINGER_TIP
   * 13 = RING_FINGER_MCP  17 = PINKY_MCP
   * 14 = RING_FINGER_PIP  18 = PINKY_PIP
   * 15 = RING_FINGER_DIP  19 = PINKY_DIP
   * 16 = RING_FINGER_TIP  20 = PINKY_TIP
   * ```
   */
  hands: HandLandmark[][];

  /**
   * Handedness classification for each detected hand.
   * Array length matches `hands.length`.
   * Each entry contains categories (typically one) indicating "Left" or "Right".
   */
  handedness?: HandednessCategory[][];

  /**
   * Body pose landmarks (33 points) for the primary detected person.
   * Present only when `enablePose` is set and a pose was detected.
   */
  pose?: PoseLandmark[];

  /**
   * Face landmarks (up to 478 points) for the primary detected face.
   * Present only when `enableFace` is set and a face was detected.
   */
  face?: FaceLandmark[];

  /**
   * Error message if detection failed.
   * Present only when an error occurred during initialization or inference.
   */
  error?: string;
}

/**
 * Alias semântico para o resultado holístico (mãos + corpo + rosto).
 * É o mesmo shape de {@link HandDetectionResult}, com `pose`/`face` populados
 * quando `enablePose`/`enableFace` estão ativos.
 */
export type HolisticDetectionResult = HandDetectionResult;

/**
 * MediaPipe Hand Landmarker — Frame Processor Plugin
 *
 * Detects hand landmarks in a camera frame using the MediaPipe Hand Landmarker
 * model running on-device (Edge Computing). Returns up to 2 hands with 21
 * landmark points each.
 *
 * Must be called inside a `useFrameProcessor` worklet context.
 *
 * @example
 * ```tsx
 * import { useFrameProcessor } from 'react-native-vision-camera';
 * import { Worklets } from 'react-native-worklets-core';
 *
 * const onHandsDetected = Worklets.createRunOnJS((result) => {
 *   console.log('Hands:', result.hands);
 *   console.log('Handedness:', result.handedness);
 * });
 *
 * const frameProcessor = useFrameProcessor((frame) => {
 *   'worklet';
 *   const result = detectHandLandmarks(frame);
 *   if (result && result.hands && result.hands.length > 0) {
 *     onHandsDetected(result);
 *   }
 * }, []);
 * ```
 *
 * @param frame - The camera frame from Vision Camera's frame processor
 * @returns Detection result with hand landmarks, handedness, and optional error
 *
 * @platform Android
 */
export declare function detectHandLandmarks(frame: Frame): HandDetectionResult;

/**
 * Landmark index constants for easier access.
 *
 * @example
 * ```ts
 * const wrist = landmarks[HandLandmarkIndex.WRIST];
 * const indexTip = landmarks[HandLandmarkIndex.INDEX_FINGER_TIP];
 * ```
 */
export declare enum HandLandmarkIndex {
  WRIST = 0,
  THUMB_CMC = 1,
  THUMB_MCP = 2,
  THUMB_IP = 3,
  THUMB_TIP = 4,
  INDEX_FINGER_MCP = 5,
  INDEX_FINGER_PIP = 6,
  INDEX_FINGER_DIP = 7,
  INDEX_FINGER_TIP = 8,
  MIDDLE_FINGER_MCP = 9,
  MIDDLE_FINGER_PIP = 10,
  MIDDLE_FINGER_DIP = 11,
  MIDDLE_FINGER_TIP = 12,
  RING_FINGER_MCP = 13,
  RING_FINGER_PIP = 14,
  RING_FINGER_DIP = 15,
  RING_FINGER_TIP = 16,
  PINKY_MCP = 17,
  PINKY_PIP = 18,
  PINKY_DIP = 19,
  PINKY_TIP = 20,
}

/**
 * MediaPipe Pose landmark indices (subset relevant for Libras: upper body).
 * Mirrors the POSE_INDICES used by the Li-Vision API feature builder.
 */
export declare enum PoseLandmarkIndex {
  NOSE = 0,
  LEFT_EYE = 2,
  RIGHT_EYE = 5,
  LEFT_EAR = 7,
  RIGHT_EAR = 8,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14,
  LEFT_WRIST = 15,
  RIGHT_WRIST = 16,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
}
