let cachedTranscriber: any = null;
let loadingPromise: Promise<void> | null = null;

export async function transcribeAudio(audio: Blob, onProgress?: (msg: string) => void): Promise<string> {
  if (!cachedTranscriber) {
    if (!loadingPromise) {
      loadingPromise = loadWhisper(onProgress);
    }
    await loadingPromise;
  }

  onProgress?.("Transcrevendo áudio...");
  const result = await cachedTranscriber(audio, {
    language: "portuguese",
    task: "transcribe",
  });
  return (result as any).text || "";
}

async function loadWhisper(onProgress?: (msg: string) => void) {
  onProgress?.("Carregando modelo Whisper... (~150MB na primeira vez)");

  const { pipeline } = await import("@xenova/transformers");

  cachedTranscriber = await pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-tiny",
    {
      quantized: true,
      progress_callback: (p: any) => {
        if (p.status === "progress") {
          onProgress?.(`Baixando Whisper... ${Math.round((p.loaded / p.total) * 100)}%`);
        }
      },
    }
  );
}
