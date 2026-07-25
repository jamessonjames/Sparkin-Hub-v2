type TranscriberFn = (audio: Blob) => Promise<string>;

let cachedTranscriber: TranscriberFn | null = null;
let loadingPromise: Promise<TranscriberFn> | null = null;

export async function transcribeAudio(audio: Blob, onProgress?: (msg: string) => void): Promise<string> {
  if (cachedTranscriber) {
    return cachedTranscriber(audio);
  }

  if (!loadingPromise) {
    loadingPromise = loadWhisper(onProgress);
  }

  const fn = await loadingPromise;
  return fn(audio);
}

async function loadWhisper(onProgress?: (msg: string) => void): Promise<TranscriberFn> {
  onProgress?.("Carregando modelo Whisper... (~150MB na primeira vez)");

  const { pipeline } = await import("@huggingface/transformers");

  const transcriber = await pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-tiny",
    { progress_callback: (p: any) => {
      if (p.status === "progress") {
        onProgress?.(`Baixando modelo Whisper... ${Math.round((p.loaded / p.total) * 100)}%`);
      }
    }}
  );

  cachedTranscriber = async (audio: Blob) => {
    onProgress?.("Transcrevendo áudio...");
    const result = await transcriber(audio, {
      language: "portuguese",
      task: "transcribe",
    });
    return (result as any).text || "";
  };

  return cachedTranscriber;
}
