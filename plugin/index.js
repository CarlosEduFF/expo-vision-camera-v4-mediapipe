/**
 * Expo Config Plugin — MediaPipe Hand Landmarker Integration
 * 
 * Automatically injects during `expo prebuild`:
 * 1. MediaPipe Tasks Vision dependency in build.gradle
 * 2. Kotlin plugin files in the app package
 * 3. Plugin registration in MainApplication.kt
 * 4. Copies the hand_landmarker.task model to Android assets
 *
 * Supports configurable options via app.json:
 * ```json
 * ["expo-vision-camera-v4-mediapipe", {
 *   "numHands": 2,
 *   "minDetectionConfidence": 0.4,
 *   "minPresenceConfidence": 0.4,
 *   "minTrackingConfidence": 0.4
 * }]
 * ```
 *
 * @platform Android
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 */

const {
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// -----------------------------------------------
// Default configuration values
// -----------------------------------------------

const DEFAULT_OPTIONS = {
  numHands: 2,
  minDetectionConfidence: 0.4,
  minPresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
};

// -----------------------------------------------
// Kotlin Plugin Source Template
// -----------------------------------------------

function getHandLandmarkerPluginKotlin(packageName, options) {
  const {
    numHands,
    minDetectionConfidence,
    minPresenceConfidence,
    minTrackingConfidence,
  } = { ...DEFAULT_OPTIONS, ...options };

  return `package ${packageName}

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.io.ByteArrayOutputStream

/**
 * HandLandmarkerPlugin: High-performance Hand Landmark detection for Vision Camera v4.
 * Processes frames on-device using MediaPipe's Task Vision API.
 *
 * Returns 21 landmark points per hand with x, y, z coordinates,
 * plus handedness classification (Left/Right).
 *
 * Configuration:
 *   numHands = ${numHands}
 *   minDetectionConfidence = ${minDetectionConfidence}f
 *   minPresenceConfidence = ${minPresenceConfidence}f
 *   minTrackingConfidence = ${minTrackingConfidence}f
 */
class HandLandmarkerPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        private const val TAG = "HandLandmarkerPlugin"
    }

    private var handLandmarker: HandLandmarker? = null
    private var initError: String? = null

    init {
        try {
            Log.d(TAG, "=== INITIALIZING HandLandmarkerPlugin ===")
            val context = proxy.context

            val baseOptions = BaseOptions.builder()
                .setModelAssetPath("hand_landmarker.task")
                .build()

            val landmarkerOptions = HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(baseOptions)
                .setRunningMode(RunningMode.IMAGE)
                .setNumHands(${numHands})
                .setMinHandDetectionConfidence(${minDetectionConfidence}f)
                .setMinHandPresenceConfidence(${minPresenceConfidence}f)
                .setMinTrackingConfidence(${minTrackingConfidence}f)
                .build()

            handLandmarker = HandLandmarker.createFromOptions(context, landmarkerOptions)
            Log.d(TAG, "=== HandLandmarker CREATED SUCCESSFULLY ===")
        } catch (e: Exception) {
            initError = e.message
            Log.e(TAG, "=== ERROR INITIALIZING HandLandmarker ===", e)
        }
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        if (handLandmarker == null) {
            Log.e(TAG, "HandLandmarker is null! Error: \$initError")
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (initError ?: "HandLandmarker not initialized")
            )
        }

        try {
            val mediaImage: Image = frame.image
            val bitmap = imageToBitmap(mediaImage)

            if (bitmap == null) {
                Log.e(TAG, "Image to Bitmap conversion failed (format=\${mediaImage.format})")
                return hashMapOf<String, Any>(
                    "hands" to emptyList<Any>(),
                    "error" to "Image to Bitmap conversion failed"
                )
            }

            val mpImage: MPImage = BitmapImageBuilder(bitmap).build()
            val result = handLandmarker!!.detect(mpImage)
            bitmap.recycle()

            val numHands = result.landmarks().size
            if (numHands == 0) {
                return hashMapOf<String, Any>("hands" to emptyList<Any>())
            }

            // Extract landmark points
            val handsArray = mutableListOf<List<Map<String, Double>>>()
            for (hand in result.landmarks()) {
                val points = mutableListOf<Map<String, Double>>()
                for (landmark in hand) {
                    points.add(hashMapOf(
                        "x" to landmark.x().toDouble(),
                        "y" to landmark.y().toDouble(),
                        "z" to landmark.z().toDouble()
                    ))
                }
                handsArray.add(points)
            }

            // Extract handedness (Left/Right classification)
            val handednessArray = mutableListOf<List<Map<String, Any>>>()
            for (categories in result.handednesses()) {
                val categoryList = mutableListOf<Map<String, Any>>()
                for (category in categories) {
                    categoryList.add(hashMapOf(
                        "categoryName" to (category.categoryName() ?: "Unknown") as Any,
                        "score" to category.score().toDouble() as Any,
                        "displayName" to (category.displayName() ?: category.categoryName() ?: "Unknown") as Any
                    ))
                }
                handednessArray.add(categoryList)
            }

            return hashMapOf<String, Any>(
                "hands" to handsArray,
                "handedness" to handednessArray
            )
        } catch (e: Exception) {
            Log.e(TAG, "ERROR in detection callback", e)
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (e.message ?: "Unknown error")
            )
        }
    }

    private fun imageToBitmap(image: Image): Bitmap? {
        return when (image.format) {
            ImageFormat.YUV_420_888 -> yuvToBitmap(image)
            ImageFormat.JPEG -> jpegToBitmap(image)
            else -> yuvToBitmap(image)
        }
    }

    private fun yuvToBitmap(image: Image): Bitmap? {
        try {
            val width = image.width
            val height = image.height
            val yPlane = image.planes[0]
            val uPlane = image.planes[1]
            val vPlane = image.planes[2]
            val yBuffer = yPlane.buffer
            val uBuffer = uPlane.buffer
            val vBuffer = vPlane.buffer

            yBuffer.rewind()
            uBuffer.rewind()
            vBuffer.rewind()

            val yRowStride = yPlane.rowStride
            val uvRowStride = uPlane.rowStride
            val uvPixelStride = uPlane.pixelStride

            val nv21 = ByteArray(width * height * 3 / 2)

            if (yRowStride == width) {
                yBuffer.get(nv21, 0, width * height)
            } else {
                for (row in 0 until height) {
                    yBuffer.position(row * yRowStride)
                    yBuffer.get(nv21, row * width, width)
                }
            }

            val uvHeight = height / 2
            val uvWidth = width / 2
            var nv21Offset = width * height

            for (row in 0 until uvHeight) {
                for (col in 0 until uvWidth) {
                    val uvIndex = row * uvRowStride + col * uvPixelStride
                    vBuffer.position(uvIndex)
                    nv21[nv21Offset++] = vBuffer.get()
                    uBuffer.position(uvIndex)
                    nv21[nv21Offset++] = uBuffer.get()
                }
            }

            val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            val outStream = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, width, height), 85, outStream)
            val jpegBytes = outStream.toByteArray()

            return BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size,
                BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 })
        } catch (e: Exception) {
            Log.e(TAG, "Error converting YUV to Bitmap", e)
            return null
        }
    }

    private fun jpegToBitmap(image: Image): Bitmap? {
        val buffer = image.planes[0].buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }
}
`;
}

// -----------------------------------------------
// Plugin Main Logic
// -----------------------------------------------

/**
 * Validates and merges user-provided options with defaults.
 * @param {object} userOptions - Options from app.json plugin config
 * @returns {object} Merged options
 */
function resolveOptions(userOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS };

  if (typeof userOptions.numHands === "number" && userOptions.numHands >= 1 && userOptions.numHands <= 4) {
    opts.numHands = Math.floor(userOptions.numHands);
  }

  for (const key of ["minDetectionConfidence", "minPresenceConfidence", "minTrackingConfidence"]) {
    if (typeof userOptions[key] === "number" && userOptions[key] >= 0.0 && userOptions[key] <= 1.0) {
      opts[key] = userOptions[key];
    }
  }

  return opts;
}

/**
 * Computes a simple hash of file content for idempotency checks.
 * @param {string} content
 * @returns {string}
 */
function contentHash(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Writes a file only if the content has changed (idempotent).
 * @param {string} filePath
 * @param {string} content
 * @returns {boolean} true if file was written, false if unchanged
 */
function writeFileIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (contentHash(existing) === contentHash(content)) {
      return false;
    }
  }
  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * withHandLandmarker — Expo Config Plugin
 *
 * Configures an Expo project to use MediaPipe Hand Landmarker
 * with React Native Vision Camera v4 on Android.
 *
 * @param {object} config - Expo config
 * @param {object} [options] - Plugin options
 * @param {number} [options.numHands=2] - Maximum number of hands to detect (1-4)
 * @param {number} [options.minDetectionConfidence=0.4] - Min confidence for hand detection (0.0-1.0)
 * @param {number} [options.minPresenceConfidence=0.4] - Min confidence for hand presence (0.0-1.0)
 * @param {number} [options.minTrackingConfidence=0.4] - Min confidence for hand tracking (0.0-1.0)
 * @returns {object} Modified Expo config
 */
function withHandLandmarker(config, options = {}) {
  const resolvedOptions = resolveOptions(options);

  console.log(`[HandLandmarker] 🖐️ Configuring with options:`, resolvedOptions);

  // 1. Add MediaPipe dependency to build.gradle
  config = withAppBuildGradle(config, (mod) => {
    const gradle = mod.modResults.contents;

    if (!gradle.includes("com.google.mediapipe:tasks-vision")) {
      mod.modResults.contents = gradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    // MediaPipe Tasks Vision — HandLandmarker (expo-vision-camera-v4-mediapipe)\n    implementation("com.google.mediapipe:tasks-vision:0.10.21")\n`
      );
      console.log("[HandLandmarker] ✅ Added MediaPipe dependency to build.gradle");
    } else {
      console.log("[HandLandmarker] ⏭️  MediaPipe dependency already in build.gradle");
    }
    return mod;
  });

  // 2. Register plugin in MainApplication.kt
  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes("FrameProcessorPluginRegistry")) {
      contents = contents.replace(
        /^(package .+)$/m,
        `$1\n\nimport com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry`
      );
      console.log("[HandLandmarker] ✅ Added FrameProcessorPluginRegistry import");
    }

    if (!contents.includes("handLandmarker")) {
      contents = contents.replace(
        /class MainApplication\s*:\s*Application\(\)\s*,\s*ReactApplication\s*\{/,
        `class MainApplication : Application(), ReactApplication {\n\n    companion object {\n        init {\n            FrameProcessorPluginRegistry.addFrameProcessorPlugin("handLandmarker") { proxy: com.mrousavy.camera.frameprocessors.VisionCameraProxy, options: Map<String, Any>? ->\n                HandLandmarkerPlugin(proxy, options)\n            }\n        }\n    }\n`
      );
      console.log("[HandLandmarker] ✅ Registered HandLandmarkerPlugin in MainApplication.kt");
    } else {
      console.log("[HandLandmarker] ⏭️  Plugin already registered in MainApplication.kt");
    }

    mod.modResults.contents = contents;
    return mod;
  });

  // 3. Inject Kotlin files and handle model asset copy
  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const packageName = config.android?.package || "com.li.vision.handlandmarker";
      const packageDir = packageName.replace(/\./g, "/");

      const javaDir = path.join(
        projectRoot, "android", "app", "src", "main", "java", packageDir
      );
      const assetsDir = path.join(
        projectRoot, "android", "app", "src", "main", "assets"
      );

      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(assetsDir, { recursive: true });

      // Generate plugin source (idempotent — only write if changed)
      const kotlinSource = getHandLandmarkerPluginKotlin(packageName, resolvedOptions);
      const kotlinPath = path.join(javaDir, "HandLandmarkerPlugin.kt");
      const wasWritten = writeFileIfChanged(kotlinPath, kotlinSource);

      if (wasWritten) {
        console.log("[HandLandmarker] ✅ Generated HandLandmarkerPlugin.kt");
      } else {
        console.log("[HandLandmarker] ⏭️  HandLandmarkerPlugin.kt unchanged, skipping");
      }

      // Attempt to copy model from root, assets, or plugin package
      const modelName = "hand_landmarker.task";
      const possibleSources = [
        path.join(projectRoot, "assets", modelName),
        path.join(projectRoot, modelName),
        path.join(projectRoot, "node_modules", "expo-vision-camera-v4-mediapipe", modelName),
      ];

      const dest = path.join(assetsDir, modelName);
      if (!fs.existsSync(dest)) {
        let found = false;
        for (const src of possibleSources) {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[HandLandmarker] ✅ Copied model from ${src}`);
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(
            `[HandLandmarker] ⚠️  Model file "${modelName}" not found in any of:\n` +
            possibleSources.map((s) => `  - ${s}`).join("\n") + "\n" +
            "  Please download it from https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#models"
          );
        }
      } else {
        console.log("[HandLandmarker] ⏭️  Model already in assets, skipping copy");
      }

      return mod;
    },
  ]);

  return config;
}

module.exports = withHandLandmarker;
