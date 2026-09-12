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
            poseLandmarker = createWithDelegateFallback("PoseLandmarker") { delegate ->
                val poseBase = BaseOptions.builder()
                    .setModelAssetPath("${MODEL_POSE}")
                    .setDelegate(delegate)
                    .build()
                val poseOptions = PoseLandmarker.PoseLandmarkerOptions.builder()
                    .setBaseOptions(poseBase)
                    .setRunningMode(RunningMode.VIDEO)
                    .setNumPoses(1)
                    .setMinPoseDetectionConfidence(${minDetectionConfidence}f)
                    .setMinPosePresenceConfidence(${minPresenceConfidence}f)
                    .setMinTrackingConfidence(${minTrackingConfidence}f)
                    .build()
                PoseLandmarker.createFromOptions(context, poseOptions)
            }
`
    : "";

  const faceInit = enableFace
    ? `
            faceLandmarker = createWithDelegateFallback("FaceLandmarker") { delegate ->
                val faceBase = BaseOptions.builder()
                    .setModelAssetPath("${MODEL_FACE}")
                    .setDelegate(delegate)
                    .build()
                val faceOptions = FaceLandmarker.FaceLandmarkerOptions.builder()
                    .setBaseOptions(faceBase)
                    .setRunningMode(RunningMode.VIDEO)
                    .setNumFaces(1)
                    .setMinFaceDetectionConfidence(${minDetectionConfidence}f)
                    .setMinFacePresenceConfidence(${minPresenceConfidence}f)
                    .setMinTrackingConfidence(${minTrackingConfidence}f)
                    .build()
                FaceLandmarker.createFromOptions(context, faceOptions)
            }
`
    : "";

  // Cada canal opcional tem seu try/catch: uma falha de pose/face não pode
  // derrubar o canal principal (mãos).
  const poseDetect = enablePose
    ? `
            if (!runPose) {
                // Canal desligado em runtime: nem roda a inferência. Diferente
                // de descartar o resultado no JS, isto economiza o tempo do
                // modelo — o que decide a viabilidade em aparelhos fracos.
                lastPosePoints = null
            } else
            poseLandmarker?.let { pl ->
              try {
                // Cadência: roda a inferência de pose a cada 2 frames e reusa o
                // último resultado no frame intermediário.
                if (frameCounter % 2L != 0L) {
                    lastPosePoints?.let { output["pose"] = it }
                } else {
                val poseResult = pl.detectForVideo(mpImage, timestampMs)
                if (poseResult.landmarks().isNotEmpty()) {
                    val posePoints = mutableListOf<Map<String, Double>>()
                    for (lm in poseResult.landmarks()[0]) {
                        val point = hashMapOf(
                            "x" to lm.x().toDouble(),
                            "y" to lm.y().toDouble(),
                            "z" to lm.z().toDouble()
                        )
                        // visibility()/presence() são Optional e vêm VAZIOS em
                        // várias builds do Tasks (o campo é populado só quando o
                        // grafo expõe o score). Um .orElse(0f) aqui marcaria todo
                        // ponto como invisível e o consumidor, filtrando por isso,
                        // esconderia a pose inteira. Então só emitimos a chave
                        // quando o valor existe de fato: ausência de "visibility"
                        // significa "desconhecido", não "invisível".
                        val vis = lm.visibility().orElse(null) ?: lm.presence().orElse(null)
                        if (vis != null) point["visibility"] = vis.toDouble()
                        posePoints.add(point)
                    }
                    output["pose"] = posePoints
                    lastPosePoints = posePoints
                } else {
                    // Sem pose neste frame: descarta o cache para não publicar
                    // um corpo que já saiu do enquadramento.
                    lastPosePoints = null
                }
                }
              } catch (e: Exception) {
                Log.e(TAG, "POSE detect falhou (ts=\$timestampMs)", e)
                output["poseError"] = (e.message ?: e.toString())
              }
            }
`
    : "";

  const faceDetect = enableFace
    ? `
            if (!runFace) {
                lastFacePoints = null
            } else
            faceLandmarker?.let { fl ->
              try {
                // O rosto é o canal mais caro por ponto (478 landmarks) e o que
                // menos muda entre frames: roda a cada 3.
                if (frameCounter % 3L != 0L) {
                    lastFacePoints?.let { output["face"] = it }
                } else {
                val faceResult = fl.detectForVideo(mpImage, timestampMs)
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
                    lastFacePoints = facePoints
                } else {
                    lastFacePoints = null
                }
                }
              } catch (e: Exception) {
                Log.e(TAG, "FACE detect falhou (ts=\$timestampMs)", e)
                output["faceError"] = (e.message ?: e.toString())
              }
            }
`
    : "";

  return `package ${packageName}

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.Image
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
${poseImports}${faceImports}import com.mrousavy.camera.core.types.Orientation
import com.mrousavy.camera.frameprocessors.Frame
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

    /**
     * Qual delegate acabou sendo usado ("GPU" ou "CPU"), por canal.
     *
     * Exposto no resultado de cada frame porque o fallback é silencioso: sem
     * isso não há como saber, olhando o app rodando, se a GPU realmente entrou
     * em uso ou se todos os canais caíram para CPU num aparelho incompatível —
     * a diferença é de várias vezes no tempo de inferência.
     */
    private val delegatesUsed = mutableMapOf<String, String>()

    /** Bitmap de entrada reusado entre frames — ver frameToUprightBitmap(). */
    private var reusableRaw: Bitmap? = null

    /**
     * Contador de frames, base da cadência escalonada de pose/face.
     *
     * Pose (ombros/cotovelos/pulsos) e rosto mudam devagar comparados às mãos,
     * então rodá-los em TODO frame gasta tempo de inferência sem ganho
     * perceptível. Rodando pose a cada 2 e face a cada 3 frames, e reusando o
     * último resultado nos intermediários, o custo médio por frame cai sem que
     * o payload enviado ao servidor mude de forma — os canais seguem completos,
     * só com dados até 1-2 frames mais velhos.
     */
    private var frameCounter = 0L
    private var lastPosePoints: List<Map<String, Double>>? = null
    private var lastFacePoints: List<Map<String, Double>>? = null

    /**
     * Cria um landmarker tentando GPU e caindo para CPU se falhar.
     *
     * O delegate GPU do MediaPipe não é suportado em todo chipset e a falha
     * aparece só na criação do landmarker (driver ausente, OpenCL bloqueado,
     * modelo com operador não delegável). Sem o fallback, um aparelho
     * incompatível ficaria sem NENHUM landmarker — pior que rodar em CPU.
     */
    private fun <T> createWithDelegateFallback(name: String, create: (Delegate) -> T): T? {
        try {
            val instance = create(Delegate.GPU)
            delegatesUsed[name] = "GPU"
            Log.d(TAG, "=== \$name CREATED (GPU) ===")
            return instance
        } catch (e: Throwable) {
            Log.w(TAG, "\$name: GPU indisponível, caindo para CPU — \${e.message}")
        }
        return try {
            val instance = create(Delegate.CPU)
            delegatesUsed[name] = "CPU"
            Log.d(TAG, "=== \$name CREATED (CPU) ===")
            instance
        } catch (e: Exception) {
            delegatesUsed[name] = "FAILED"
            Log.e(TAG, "=== \$name FALHOU em GPU e CPU ===", e)
            null
        }
    }

    init {
        try {
            Log.d(TAG, "=== INITIALIZING HandLandmarkerPlugin ===")
            val context = proxy.context

            handLandmarker = createWithDelegateFallback("HandLandmarker") { delegate ->
                val baseOptions = BaseOptions.builder()
                    .setModelAssetPath("${MODEL_HAND}")
                    .setDelegate(delegate)
                    .build()

                val landmarkerOptions = HandLandmarker.HandLandmarkerOptions.builder()
                    .setBaseOptions(baseOptions)
                    .setRunningMode(RunningMode.VIDEO)
                    .setNumHands(${numHands})
                    .setMinHandDetectionConfidence(${minDetectionConfidence}f)
                    .setMinHandPresenceConfidence(${minPresenceConfidence}f)
                    .setMinTrackingConfidence(${minTrackingConfidence}f)
                    .build()

                HandLandmarker.createFromOptions(context, landmarkerOptions)
            }
            if (handLandmarker == null) initError = "HandLandmarker falhou em GPU e CPU"
${poseInit}${faceInit}        } catch (e: Exception) {
            initError = e.message
            Log.e(TAG, "=== ERROR INITIALIZING landmarkers ===", e)
        }
    }

    /**
     * Converte o frame RGBA da câmera num Bitmap EM PÉ antes da inferência.
     *
     * A câmera entrega o buffer na orientação crua do sensor (deitado) e o
     * ImageProcessingOptions.setRotationDegrees() do MediaPipe Tasks é
     * ignorado quando a MPImage vem de um android.media.Image via
     * MediaImageBuilder (bug conhecido, mesma raiz do ML Kit —
     * https://github.com/googlesamples/mlkit/issues/937).
     *
     * Girar só as COORDENADAS de saída não resolve: os modelos continuam
     * vendo a imagem deitada. O FaceLandmarker até tolera, mas o
     * HandLandmarker degrada (a 2ª mão some) e o PoseLandmarker (BlazePose)
     * NÃO é invariante à rotação — o esqueleto do busto sai errado. A
     * correção real é girar os PIXELS e alimentar via BitmapImageBuilder,
     * caminho em que a orientação já vai correta na própria imagem.
     */
    private fun frameToUprightBitmap(frame: Frame): Bitmap {
        val image: Image = frame.image
        val plane = image.planes[0]
        val buffer = plane.buffer
        buffer.rewind()

        // rowStride pode ter padding além de width*pixelStride; o bitmap cru é
        // criado na largura "acolchoada" e o recorte acontece junto do giro.
        val pixelStride = plane.pixelStride
        val rowPadding = plane.rowStride - pixelStride * image.width
        val paddedWidth = image.width + rowPadding / pixelStride

        // O bitmap de entrada é REUSADO entre frames: alocar um ARGB_8888 de
        // 640x480 a cada frame são ~1,2 MB descartados 30x por segundo, e o
        // churn de GC resultante aparecia como picos de latência (p50 138ms
        // contra máximos de 320ms+). As dimensões só mudam se o formato da
        // câmera mudar, então na prática aloca-se uma vez.
        var raw = reusableRaw
        if (raw == null || raw.width != paddedWidth || raw.height != image.height) {
            raw?.recycle()
            raw = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
            reusableRaw = raw
        }
        raw.copyPixelsFromBuffer(buffer)

        // Giro horário que deixa a imagem em pé. LANDSCAPE_LEFT -> 270 foi
        // validado empiricamente na câmera frontal em retrato (equivale ao
        // antigo remap de coordenadas (x,y) -> (y, 1-x), que é um giro de 90°
        // anti-horário); os demais casos seguem por simetria.
        val degrees = when (frame.orientation) {
            Orientation.PORTRAIT -> 0f
            Orientation.LANDSCAPE_LEFT -> 270f
            Orientation.PORTRAIT_UPSIDE_DOWN -> 180f
            Orientation.LANDSCAPE_RIGHT -> 90f
        }
        if (degrees == 0f && rowPadding == 0) return raw

        val matrix = Matrix().apply { postRotate(degrees) }
        // O bitmap cru NÃO é reciclado aqui: ele é o buffer reusado entre
        // frames e reciclá-lo o invalidaria para a próxima chamada (o
        // createBitmap acima já copia os pixels para o bitmap girado).
        return Bitmap.createBitmap(raw, 0, 0, image.width, image.height, matrix, true)
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        if (handLandmarker == null) {
            Log.e(TAG, "HandLandmarker is null! Error: \$initError")
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (initError ?: "HandLandmarker not initialized")
            )
        }

        frameCounter++

        // Canais opcionais podem ser desligados POR FRAME, a partir do JS:
        //   detectHandLandmarks(frame, { pose: false, face: false })
        // Diferente de simplesmente ignorar o resultado no JS, isto pula a
        // inferência e devolve o tempo do modelo ao frame — em aparelhos de
        // entrada é a diferença entre rodar e não rodar. Ausente = ligado,
        // preservando o comportamento de quem chama sem argumentos.
        val runPose = params?.get("pose") as? Boolean ?: true
        val runFace = params?.get("face") as? Boolean ?: true

        var mpImage: MPImage? = null
        try {
            val upright = frameToUprightBitmap(frame)
            mpImage = BitmapImageBuilder(upright).build()

            // Modo VIDEO: detectForVideo usa tracking entre frames — após a
            // primeira detecção, os frames seguintes pulam a fase cara de
            // re-detecção enquanto o alvo continua rastreado. O timestamp
            // (crescente, em ms) vem do próprio frame da câmera.
            val timestampMs = frame.timestamp / 1_000_000

            val result = handLandmarker!!.detectForVideo(mpImage, timestampMs)

            val output = hashMapOf<String, Any>()

            // Dimensões da imagem (em pé) usada na inferência — o overlay do
            // app precisa delas para mapear as coordenadas normalizadas no
            // preview com resizeMode "cover" (que corta as bordas).
            output["imageWidth"] = upright.width
            output["imageHeight"] = upright.height

            // Delegate efetivamente em uso por canal — o fallback GPU→CPU é
            // silencioso, então sem isto não dá para saber se a aceleração
            // pegou neste aparelho.
            output["delegates"] = HashMap(delegatesUsed)

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
 * Troca a estratégia de backpressure do frame processor do VisionCamera para
 * STRATEGY_KEEP_ONLY_LATEST.
 *
 * O VisionCamera configura o ImageAnalysis do CameraX com
 * STRATEGY_BLOCK_PRODUCER, que ENFILEIRA os frames e entrega todos em ordem.
 * Quando a análise é mais lenta que a câmera — o caso de qualquer inferência
 * de ML: ~40-100ms por frame contra 33ms de produção — essa fila cresce sem
 * parar e o frame processor passa a receber imagens cada vez mais antigas.
 * O preview é um use case separado e continua fluido, então o sintoma é
 * característico: a câmera responde na hora, mas os landmarks desenhados
 * ficam segundos atrás do movimento real.
 *
 * KEEP_ONLY_LATEST descarta os frames intermediários e entrega sempre o mais
 * recente. Perde-se frames (que a inferência não daria conta mesmo) e ganha-se
 * a garantia de que o resultado corresponde ao que está na tela AGORA.
 *
 * Aplicado aqui, no prebuild, porque o arquivo vive em node_modules e qualquer
 * `npm install` reverteria uma edição manual.
 *
 * @param {string} projectRoot
 */
function patchVisionCameraBackpressure(projectRoot) {
  const target = path.join(
    projectRoot, "node_modules", "react-native-vision-camera", "android", "src",
    "main", "java", "com", "mrousavy", "camera", "core",
    "CameraSession+Configuration.kt"
  );
  if (!fs.existsSync(target)) {
    console.warn("[HandLandmarker] ⚠️  CameraSession+Configuration.kt não encontrado — backpressure não ajustado");
    return;
  }
  const source = fs.readFileSync(target, "utf-8");
  const from = "ImageAnalysis.STRATEGY_BLOCK_PRODUCER";
  const to = "ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST";
  if (source.includes(to)) return; // já aplicado
  if (!source.includes(from)) {
    console.warn("[HandLandmarker] ⚠️  STRATEGY_BLOCK_PRODUCER não encontrado — o VisionCamera pode ter mudado");
    return;
  }
  fs.writeFileSync(target, source.replace(from, to));
  console.log("[HandLandmarker] ⚡ backpressure do frame processor → KEEP_ONLY_LATEST");
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

      patchVisionCameraBackpressure(projectRoot);

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
// Exposto para testes/geração manual do Kotlin (ex.: sincronizar um android/
// já prebuildado sem rodar `expo prebuild` de novo).
module.exports.getHandLandmarkerPluginKotlin = getHandLandmarkerPluginKotlin;
module.exports.resolveOptions = resolveOptions;
