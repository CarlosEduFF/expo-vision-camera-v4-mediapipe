import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor, useCameraPermission } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';

// Import the HandLandmarkIndex enum for readable access
import { HandLandmarkIndex } from 'expo-vision-camera-v4-mediapipe';

// Import types for TypeScript support
import type { HandDetectionResult, HandLandmark } from 'expo-vision-camera-v4-mediapipe';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Colors for each hand
const HAND_COLORS = ['#00e5ff', '#ff6090'];

export default function App() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [detectionResult, setDetectionResult] = useState<HandDetectionResult | null>(null);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // Bridge detection results from the native Worklet thread to the JS thread
  const onResult = Worklets.createRunOnJS((result: HandDetectionResult) => {
    setDetectionResult(result);
  });

  const onEmpty = Worklets.createRunOnJS(() => {
    setDetectionResult(null);
  });

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    try {
      // detectHandLandmarks is globally available inside worklets
      // @ts-ignore — native Frame Processor Plugin global
      const result = detectHandLandmarks(frame);
      
      if (result?.hands?.length > 0) {
        onResult(result);
      } else {
        onEmpty();
      }
    } catch (e) {
      console.error('Detection Error:', e);
    }
  }, [onResult, onEmpty]);

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>📷 Camera permission required</Text>
        <Text style={styles.statusSubtext}>Please grant camera access to continue</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>📱 No camera found</Text>
        <Text style={styles.statusSubtext}>Ensure your device has a front camera</Text>
      </View>
    );
  }

  const hands = detectionResult?.hands ?? [];
  const handedness = detectionResult?.handedness ?? [];

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />
      
      {/* Landmark Overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {hands.map((hand, handIndex) => (
          <React.Fragment key={`hand-${handIndex}`}>
            {hand.map((lm, lmIndex) => (
              <View
                key={`lm-${handIndex}-${lmIndex}`}
                style={[
                  styles.dot,
                  {
                    left: (1 - lm.x) * SCREEN_WIDTH - 4, // Mirror for front camera
                    top: lm.y * SCREEN_HEIGHT - 4,
                    backgroundColor: HAND_COLORS[handIndex % HAND_COLORS.length],
                    // Make fingertips larger
                    ...(([
                      HandLandmarkIndex.THUMB_TIP,
                      HandLandmarkIndex.INDEX_FINGER_TIP,
                      HandLandmarkIndex.MIDDLE_FINGER_TIP,
                      HandLandmarkIndex.RING_FINGER_TIP,
                      HandLandmarkIndex.PINKY_TIP,
                    ] as number[]).includes(lmIndex) ? {
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                    } : {}),
                  },
                ]}
              />
            ))}
          </React.Fragment>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🖐️ Hand Landmarker</Text>
        <Text style={styles.subtitle}>MediaPipe Edge Computing</Text>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        {hands.length === 0 ? (
          <Text style={styles.statusBarText}>No hands detected — show your hand 👋</Text>
        ) : (
          hands.map((hand, i) => {
            const side = handedness[i]?.[0]?.categoryName ?? '?';
            const confidence = handedness[i]?.[0]?.score
              ? `${Math.round(handedness[i][0].score * 100)}%`
              : '';
            return (
              <Text key={i} style={[styles.statusBarText, { color: HAND_COLORS[i % HAND_COLORS.length] }]}>
                {side === 'Left' ? '🫲' : '🫱'} {side} hand {confidence}
              </Text>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 50,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  title: {
    color: '#00e5ff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  statusBar: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minWidth: 200,
    alignItems: 'center',
  },
  statusBarText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  statusSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
});
