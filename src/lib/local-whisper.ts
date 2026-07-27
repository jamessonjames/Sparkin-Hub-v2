let cachedTranscriber: any = null;
let loadingPromise: Promise<void> | null = null;

export async function transcribePCM(
  pcmData: Float32Array,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (typeof window === "undefined") return "";

  if (!cachedTranscriber) {
    if (!loadingPromise) {
      loadingPromise = loadWhisper(onProgress);
    }
    await loadingPromise;
  }

  onProgress?.("Transcrevendo áudio da aba...");
  try {
    const result = await cachedTranscriber(pcmData, {
      language: "portuguese",
      task: "transcribe",
    });
    return (result as any)?.text || "";
  } catch (err: any) {
    console.error("[LocalWhisper] Erro ao transcrever PCM:", err);
    throw err;
  }
}

export async function transcribeAudio(
  audio: Blob,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (typeof window === "undefined") return "";

  if (!cachedTranscriber) {
    if (!loadingPromise) {
      loadingPromise = loadWhisper(onProgress);
    }
    await loadingPromise;
  }

  try {
    const arrayBuffer = await audio.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();
    const audioData = audioBuffer.getChannelData(0);

    const result = await cachedTranscriber(audioData, {
      language: "portuguese",
      task: "transcribe",
    });
    return (result as any)?.text || "";
  } catch (err: any) {
    console.error("[LocalWhisper] Erro ao decodificar Blob:", err);
    throw err;
  }
}

export function createTabPCMCollector(
  stream: MediaStream,
  onAudioChunk: (pcmData: Float32Array) => void,
  chunkIntervalMs = 6000
) {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
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
  onProgress?.("Carregando modelo Whisper...");

  const { pipeline, env } = await import("@xenova/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  cachedTranscriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
    quantized: true,
    progress_callback: (p: any) => {
      if (p.status === "progress" && p.total) {
        onProgress?.(`Baixando Whisper... ${Math.round((p.loaded / p.total) * 100)}%`);
      }
    },
  });
}
