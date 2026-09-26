let cachedTranscriber: any = null;
let loadingPromise: Promise<void> | null = null;

/**
 * Resamples an AudioBuffer's first channel to 16,000 Hz Float32Array.
 * Whisper models expect 16kHz mono audio.
 */
function resampleTo16k(audioBuffer: AudioBuffer): Float32Array {
  const sourceData = audioBuffer.getChannelData(0);
  const sourceRate = audioBuffer.sampleRate;
  const targetRate = 16000;

  if (sourceRate === targetRate) {
    return sourceData;
  }

  const ratio = sourceRate / targetRate;
  const newLength = Math.round(sourceData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originPos = i * ratio;
    const originIndex = Math.floor(originPos);
    const fraction = originPos - originIndex;
    const nextIndex = Math.min(originIndex + 1, sourceData.length - 1);
    result[i] = sourceData[originIndex] * (1 - fraction) + sourceData[nextIndex] * fraction;
  }

  return result;
}

export async function transcribePCM(
  pcmData: Float32Array,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (typeof window === "undefined" || !pcmData || pcmData.length === 0) return "";

  if (!cachedTranscriber) {
    if (!loadingPromise) {
      loadingPromise = loadWhisper(onProgress);
    }
    await loadingPromise;
  }

  onProgress?.("Transcrevendo áudio localmente...");
  try {
    const result = await cachedTranscriber(pcmData, {
      language: "portuguese",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    return ((result as any)?.text || "").trim();
  } catch (err: any) {
    console.error("[LocalWhisper] Erro ao transcrever PCM:", err);
    throw err;
  }
}

export async function transcribeAudio(
  audio: Blob,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (typeof window === "undefined" || !audio || audio.size === 0) return "";

  if (!cachedTranscriber) {
    if (!loadingPromise) {
      loadingPromise = loadWhisper(onProgress);
    }
    await loadingPromise;
  }

  try {
    onProgress?.("Decodificando áudio capturado...");
    const arrayBuffer = await audio.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    const audioData16k = resampleTo16k(audioBuffer);

    onProgress?.("Transcrevendo fala em português (100% gratuito)...");
    const result = await cachedTranscriber(audioData16k, {
      language: "portuguese",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    return ((result as any)?.text || "").trim();
  } catch (err: any) {
    console.error("[LocalWhisper] Erro ao decodificar/transcrever Blob:", err);
    throw err;
  }
}

export function createTabPCMCollector(
  stream: MediaStream,
  onAudioChunk: (pcmData: Float32Array) => void,
  chunkIntervalMs = 6000
) {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  let pcmBuffer: number[] = [];

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    for (let i = 0; i < input.length; i++) {
      pcmBuffer.push(input[i]);
    }
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  const intervalId = setInterval(() => {
    if (pcmBuffer.length >= 16000 * 2) {
      const pcmData = new Float32Array(pcmBuffer);
      pcmBuffer = [];
      onAudioChunk(pcmData);
    }
  }, chunkIntervalMs);

  return () => {
    clearInterval(intervalId);
    try {
      processor.disconnect();
      source.disconnect();
      audioCtx.close();
    } catch (e) {}
  };
}

async function loadWhisper(onProgress?: (msg: string) => void) {
  onProgress?.("Iniciando motor de IA local Whisper...");

  const { pipeline, env } = await import("@xenova/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  cachedTranscriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
    quantized: true,
    progress_callback: (p: any) => {
      if (p.status === "progress" && p.total) {
        onProgress?.(`Baixando modelo Whisper... ${Math.round((p.loaded / p.total) * 100)}%`);
      }
    },
  });
}
