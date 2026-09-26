/**
 * Sparkin Hub - Dual Stream Audio Capture & Mixer
 *
 * Mixes microphone audio AND meeting window/tab audio into a single composite stream
 * using standard Web Audio API (AudioContext + MediaStreamAudioDestinationNode).
 *
 * Enables 100% free, zero-cost, client-side recording and transcription of both
 * the local user and remote participants.
 */

export interface MeetingAudioCaptureController {
  hasTabAudio: boolean;
  start: () => void;
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
  cleanup: () => void;
  getMimeType: () => string;
}

export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

export async function createMeetingAudioRecorder(options: {
  captureTabAudio?: boolean;
  onMicLevel?: (level: number) => void;
  onTabLevel?: (level: number) => void;
  onLog?: (type: "info" | "success" | "warning" | "error", message: string) => void;
  onTabEnded?: () => void;
}): Promise<MeetingAudioCaptureController> {
  const log = options.onLog || (() => {});
  const mimeType = getSupportedMimeType();

  let micStream: MediaStream | null = null;
  let displayStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let hasTabAudio = false;

  let micRaf: number | null = null;
  let tabRaf: number | null = null;

  // 1. Capture Tab/Window audio if requested
  if (options.captureTabAudio && typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
    try {
      log("info", "Selecione a guia da reunião no Chrome e marque 'Compartilhar áudio da guia'.");
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Chromium requires video: true for getDisplayMedia
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length > 0) {
        hasTabAudio = true;
        log("success", `Áudio da reunião conectado com sucesso (${audioTracks.length} canal).`);
      } else {
        log(
          "warning",
          "Atenção: Nenhum áudio foi capturado da janela. Para capturar a fala da outra pessoa, escolha 'Guia do Chrome' e marque a opção 'Compartilhar áudio da guia'."
        );
      }

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          log("info", "Compartilhamento da tela/guia da reunião foi encerrado.");
          options.onTabEnded?.();
        };
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        log("info", "Compartilhamento da janela/guia cancelado pelo usuário. Continuando apenas com microfone.");
      } else {
        log("warning", "Não foi possível capturar a janela: " + (err.message || err));
      }
    }
  }

  // 2. Capture Microphone
  try {
    log("info", "Conectando ao microfone...");
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    log("success", "Microfone conectado com sucesso.");
  } catch (err: any) {
    if (displayStream) {
      displayStream.getTracks().forEach((t) => t.stop());
    }
    log("error", "Não foi possível acessar o microfone: " + (err.message || err));
    throw new Error("Não foi possível acessar o microfone: " + (err.message || err));
  }

  // 3. Web Audio Mixer
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  audioCtx = new AudioContextClass();

  // Create composite destination
  const destination = audioCtx.createMediaStreamDestination();

  // Connect Mic to destination and visualizer
  const micSource = audioCtx.createMediaStreamSource(micStream);
  const micAnalyser = audioCtx.createAnalyser();
  micAnalyser.fftSize = 256;
  micSource.connect(micAnalyser);
  micSource.connect(destination);

  if (options.onMicLevel) {
    const micData = new Uint8Array(micAnalyser.frequencyBinCount);
    const tickMic = () => {
      micAnalyser.getByteFrequencyData(micData);
      const avg = micData.reduce((a, b) => a + b, 0) / micData.length;
      options.onMicLevel?.(Math.min(100, Math.round(avg * 2.5)));
      micRaf = requestAnimationFrame(tickMic);
    };
    micRaf = requestAnimationFrame(tickMic);
  }

  // Connect Tab audio to destination and visualizer
  const tabAudioTrack = displayStream?.getAudioTracks()[0];
  if (tabAudioTrack && tabAudioTrack.readyState === "live") {
    const tabSourceStream = new MediaStream([tabAudioTrack]);
    const tabSource = audioCtx.createMediaStreamSource(tabSourceStream);
    const tabAnalyser = audioCtx.createAnalyser();
    tabAnalyser.fftSize = 256;
    tabSource.connect(tabAnalyser);
    tabSource.connect(destination);

    if (options.onTabLevel) {
      const tabData = new Uint8Array(tabAnalyser.frequencyBinCount);
      const tickTab = () => {
        tabAnalyser.getByteFrequencyData(tabData);
        const avg = tabData.reduce((a, b) => a + b, 0) / tabData.length;
        options.onTabLevel?.(Math.min(100, Math.round(avg * 2.5)));
        tabRaf = requestAnimationFrame(tickTab);
      };
      tabRaf = requestAnimationFrame(tickTab);
    }
  }

  // 4. Create MediaRecorder with the composite mixed stream
  const recorder = new MediaRecorder(destination.stream, { mimeType });
  const audioChunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  const cleanup = () => {
    if (micRaf) cancelAnimationFrame(micRaf);
    if (tabRaf) cancelAnimationFrame(tabRaf);
    options.onMicLevel?.(0);
    options.onTabLevel?.(0);

    if (displayStream) {
      displayStream.getTracks().forEach((t) => t.stop());
      displayStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx && audioCtx.state !== "closed") {
      try {
        audioCtx.close();
      } catch {}
      audioCtx = null;
    }
  };

  return {
    hasTabAudio,
    getMimeType: () => recorder.mimeType || mimeType,
    start: () => {
      audioChunks.length = 0;
      recorder.start(1000);
    },
    stop: () => {
      return new Promise<{ blob: Blob; mimeType: string }>((resolve, reject) => {
        if (recorder.state === "inactive") {
          cleanup();
          const finalBlob = new Blob(audioChunks, { type: recorder.mimeType || mimeType });
          resolve({ blob: finalBlob, mimeType: recorder.mimeType || mimeType });
          return;
        }

        recorder.addEventListener(
          "stop",
          () => {
            const finalMime = recorder.mimeType || mimeType;
            const finalBlob = new Blob(audioChunks, { type: finalMime });
            cleanup();
            resolve({ blob: finalBlob, mimeType: finalMime });
          },
          { once: true }
        );

        try {
          recorder.stop();
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    },
    cleanup,
  };
}
