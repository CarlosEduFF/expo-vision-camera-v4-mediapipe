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
 *   "minTrackingConfidence": 0.4,
 *   "enablePose": true,
 *   "enableFace": true
 * }]
 * ```
 *
 * Com enablePose/enableFace, o plugin também detecta corpo (PoseLandmarker) e
 * rosto (FaceLandmarker), retornando 'pose' e 'face' além de 'hands' — canais
 * necessários para o significado completo dos sinais de Libras. Esses modelos
 * (pose_landmarker_lite.task, face_landmarker.task) precisam estar disponíveis
 * para cópia ao prebuild.
 *
 * @platform Android
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision
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
  // Canais holísticos (Libras completa). Desligados por padrão para manter
  // o comportamento só-mãos retrocompatível.
  enablePose: false,
  enableFace: false,
};

// Modelos MediaPipe necessários por canal habilitado.
const MODEL_HAND = "hand_landmarker.task";
const MODEL_POSE = "pose_landmarker_lite.task";
const MODEL_FACE = "face_landmarker.task";

// -----------------------------------------------
// Kotlin Plugin Source Template
// -----------------------------------------------

function getHandLandmarkerPluginKotlin(packageName, options) {
  const {
    numHands,
    minDetectionConfidence,
    minPresenceConfidence,
    minTrackingConfidence,
    enablePose,
    enableFace,
  } = { ...DEFAULT_OPTIONS, ...options };

  // Blocos opcionais (pose/face) só são emitidos quando habilitados, para não
  // arrastar dependências de modelo que o app não vai empacotar.
  const poseImports = enablePose
    ? `import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker\n`
    : "";
  const faceImports = enableFace
    ? `import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker\n`
    : "";

  const poseField = enablePose ? `    private var poseLandmarker: PoseLandmarker? = null\n` : "";
  const faceField = enableFace ? `    private var faceLandmarker: FaceLandmarker? = null\n` : "";

  const poseInit = enablePose
    ? `
            val poseBase = BaseOptions.builder()
                .setModelAssetPath("${MODEL_POSE}")
                .build()
            val poseOptions = PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(poseBase)
                .setRunningMode(RunningMode.IMAGE)
                .setNumPoses(1)
                .setMinPoseDetectionConfidence(${minDetectionConfidence}f)
                .setMinPosePresenceConfidence(${minPresenceConfidence}f)
                .setMinTrackingConfidence(${minTrackingConfidence}f)
                .build()
            poseLandmarker = PoseLandmarker.createFromOptions(context, poseOptions)
            Log.d(TAG, "=== PoseLandmarker CREATED ===")
`
    : "";

  const faceInit = enableFace
    ? `
            val faceBase = BaseOptions.builder()
                .setModelAssetPath("${MODEL_FACE}")
                .build()
            val faceOptions = FaceLandmarker.FaceLandmarkerOptions.builder()
                .setBaseOptions(faceBase)
                .setRunningMode(RunningMode.IMAGE)
                .setNumFaces(1)
                .setMinFaceDetectionConfidence(${minDetectionConfidence}f)
                .setMinFacePresenceConfidence(${minPresenceConfidence}f)
                .setMinTrackingConfidence(${minTrackingConfidence}f)
                .build()
            faceLandmarker = FaceLandmarker.createFromOptions(context, faceOptions)
            Log.d(TAG, "=== FaceLandmarker CREATED ===")
`
    : "";

  // No callback, anexa pose/face ao mapa de saída (mesma MPImage, reaproveitada).
  const poseDetect = enablePose
    ? `
            poseLandmarker?.let { pl ->
                val poseResult = pl.detect(mpImage)
                if (poseResult.landmarks().isNotEmpty()) {
                    val posePoints = mutableListOf<Map<String, Double>>()
                    for (lm in poseResult.landmarks()[0]) {
                        posePoints.add(hashMapOf(
                            "x" to lm.x().toDouble(),
                            "y" to lm.y().toDouble(),
                            "z" to lm.z().toDouble(),
                            "visibility" to (lm.visibility().orElse(0f)).toDouble()
                        ))
                    }
                    output["pose"] = posePoints
                }
            }
`
    : "";

  const faceDetect = enableFace
    ? `
            faceLandmarker?.let { fl ->
                val faceResult = fl.detect(mpImage)
                if (faceResult.faceLandmarks().isNotEmpty()) {
                    val facePoints = mutableListOf<Map<String, Double>>()
                    for (lm in faceResult.faceLandmarks()[0]) {
                        facePoints.add(hashMapOf(
                            "x" to lm.x().toDouble(),
                            "y" to lm.y().toDouble(),
                            "z" to lm.z().toDouble()
                        ))
                    }
                    output["face"] = facePoints
                }
            }
`
    : "";

  return `package ${packageName}

import android.media.Image
import android.util.Log
import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
${poseImports}${faceImports}import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

/**
 * HandLandmarkerPlugin: detecção holística para Vision Camera v4.
 * Processa frames on-device com a Task Vision API do MediaPipe.
 *
 * Sempre retorna 21 landmarks por mão (x, y, z) + handedness (Left/Right).
 * Opcionalmente retorna 'pose' (corpo) e 'face' (rosto) quando habilitados,
 * essenciais para o significado completo dos sinais de Libras.
 *
 * Configuração:
 *   numHands = ${numHands}
 *   minDetectionConfidence = ${minDetectionConfidence}f
 *   minPresenceConfidence = ${minPresenceConfidence}f
 *   minTrackingConfidence = ${minTrackingConfidence}f
 *   enablePose = ${enablePose}
 *   enableFace = ${enableFace}
 */
class HandLandmarkerPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        private const val TAG = "HandLandmarkerPlugin"
    }

    private var handLandmarker: HandLandmarker? = null
${poseField}${faceField}    private var initError: String? = null

    init {
        try {
            Log.d(TAG, "=== INITIALIZING HandLandmarkerPlugin ===")
            val context = proxy.context

            val baseOptions = BaseOptions.builder()
                .setModelAssetPath("${MODEL_HAND}")
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
${poseInit}${faceInit}        } catch (e: Exception) {
            initError = e.message
            Log.e(TAG, "=== ERROR INITIALIZING landmarkers ===", e)
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

        var mpImage: MPImage? = null
        try {
            val mediaImage: Image = frame.image
            mpImage = MediaImageBuilder(mediaImage).build()
            val result = handLandmarker!!.detect(mpImage)

            val output = hashMapOf<String, Any>()

            // Extract hand landmark points
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
            output["hands"] = handsArray

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
            output["handedness"] = handednessArray
${poseDetect}${faceDetect}
            return output
        } catch (e: Exception) {
            Log.e(TAG, "ERROR in detection callback", e)
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (e.message ?: "Unknown error")
            )
        } finally {
            mpImage?.close()
        }
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

  for (const key of ["enablePose", "enableFace"]) {
    if (typeof userOptions[key] === "boolean") {
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
 * @param {boolean} [options.enablePose=false] - Also detect body pose (PoseLandmarker)
 * @param {boolean} [options.enableFace=false] - Also detect face landmarks (FaceLandmarker)
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
        `dependencies {\n    // MediaPipe Tasks Vision — Hand/Pose/Face Landmarker (expo-vision-camera-v4-mediapipe)\n    implementation("com.google.mediapipe:tasks-vision:0.10.21")\n`
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

      // Copia cada modelo necessário (mãos sempre; pose/face se habilitados)
      // procurando em assets/, raiz do projeto e no pacote do plugin.
      const requiredModels = [MODEL_HAND];
      if (resolvedOptions.enablePose) requiredModels.push(MODEL_POSE);
      if (resolvedOptions.enableFace) requiredModels.push(MODEL_FACE);

      for (const modelName of requiredModels) {
        const possibleSources = [
          path.join(projectRoot, "assets", modelName),
          path.join(projectRoot, modelName),
          path.join(projectRoot, "node_modules", "expo-vision-camera-v4-mediapipe", modelName),
        ];

        const dest = path.join(assetsDir, modelName);
        if (fs.existsSync(dest)) {
          console.log(`[HandLandmarker] ⏭️  "${modelName}" já está em assets, pulando`);
          continue;
        }

        let found = false;
        for (const src of possibleSources) {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[HandLandmarker] ✅ Copiado "${modelName}" de ${src}`);
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(
            `[HandLandmarker] ⚠️  Modelo "${modelName}" não encontrado em:\n` +
            possibleSources.map((s) => `  - ${s}`).join("\n") + "\n" +
            "  Baixe os modelos em https://ai.google.dev/edge/mediapipe/solutions/vision"
          );
        }
      }

      return mod;
    },
  ]);

  return config;
}

module.exports = withHandLandmarker;
