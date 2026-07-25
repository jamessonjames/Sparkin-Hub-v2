import { pipeline } from "@xenova/transformers";

let cachedTranscriber: any = null;

export async function transcribeAudio(
  audio: Blob,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (!cachedTranscriber) {
    onProgress?.("Carregando modelo Whisper... (~150MB na primeira vez)");
    cachedTranscriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
      quantized: true,
      progress_callback: (p: any) => {
        if (p.status === "progress") {
          onProgress?.(`Baixando Whisper... ${Math.round((p.loaded / p.total) * 100)}%`);
        }
      },
    });
  }

  onProgress?.("Transcrevendo áudio da aba...");
  const result = await cachedTranscriber(audio, {
    language: "portuguese",
    task: "transcribe",
  });
  return (result as any).text || "";
}
