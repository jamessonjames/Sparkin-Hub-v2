let cachedTranscriber: any = null;
let loadingPromise: Promise<void> | null = null;

async function blobToFloat32Array(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();
  return audioBuffer.getChannelData(0);
}

export async function transcribeAudio(
  audio: Blob,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (!cachedTranscriber) {
    if (!loadingPromise) {
      loadingPromise = loadWhisper(onProgress);
    }
    await loadingPromise;
  }

  onProgress?.("Decodificando áudio...");
  const audioData = await blobToFloat32Array(audio);

  onProgress?.("Transcrevendo áudio...");
  const result = await cachedTranscriber(audioData, {
    language: "portuguese",
    task: "transcribe",
  });
  return (result as any).text || "";
}

async function loadWhisper(onProgress?: (msg: string) => void) {
  onProgress?.("Carregando modelo Whisper...");

  const { pipeline } = await import(
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js"
  );

  cachedTranscriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
    quantized: true,
    progress_callback: (p: any) => {
      if (p.status === "progress") {
        onProgress?.(`Baixando Whisper... ${Math.round((p.loaded / p.total) * 100)}%`);
      }
    },
  });
}
