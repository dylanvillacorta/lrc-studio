import {
  DEFAULT_PRE_ROLL_MS,
  getPreRollTrafficLight,
} from '@/features/sync';
import type { AudioFileInput } from '@/lib/audioImport';
import { createSynthesizedDemoWav } from '@/lib/demoWav';
import type { LyricLine, PreRollTrafficLight } from '@/types';

export type SyncSegmentedMode = 'line' | 'word' | 'burst' | 'karaoke';

export const SYNC_MODE_OPTIONS: readonly {
  value: SyncSegmentedMode;
  label: string;
}[] = [
  { value: 'line', label: 'Línea' },
  { value: 'word', label: 'Palabra' },
  { value: 'burst', label: 'Ráfaga' },
  { value: 'karaoke', label: 'Karaoke' },
];

export const SYNC_SEGMENTED_CLASS =
  'p-1 gap-1 rounded-[16px] [&>button]:min-h-[44px] [&>button]:rounded-[12px] [&>button]:px-1.5 [&>button]:text-xs max-[375px]:[&>button]:text-[11px] [@media(max-height:720px)]:p-0.5 [@media(max-height:720px)]:[&>button]:min-h-[40px]';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;

export interface PreRollStatus {
  remainingMs: number;
  light: PreRollTrafficLight;
  label: string;
  countdownText: string;
}

/**
 * Devuelve la siguiente velocidad de reproducción en el ciclo de transporte.
 */
export function getNextPlaybackRate(current: number): number {
  const idx = PLAYBACK_RATES.findIndex((rate) => Math.abs(rate - current) < 0.01);
  if (idx === -1) {
    return 1;
  }
  return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length] ?? 1;
}

/**
 * Calcula el estado del semáforo, etiqueta textual y cuenta regresiva del Pre-Roll.
 */
export function computePreRollStatus(
  targetStartMs: number | null,
  currentTimeMs: number,
  preRollMs = DEFAULT_PRE_ROLL_MS,
): PreRollStatus {
  const safeTargetMs =
    targetStartMs !== null && Number.isFinite(targetStartMs) ? targetStartMs : 0;
  const remainingMs = Math.max(0, Math.round(safeTargetMs - currentTimeMs));
  const light = getPreRollTrafficLight(remainingMs, preRollMs);

  const label =
    light === 'red'
      ? 'ESPERA'
      : light === 'amber'
        ? 'PREPÁRATE'
        : '¡LISTO!';

  const seconds = (remainingMs / 1000).toFixed(1);
  const countdownText = remainingMs > 0 ? `−${seconds}s` : '0.0s';

  return {
    remainingMs,
    light,
    label,
    countdownText,
  };
}

/**
 * Resuelve el tiempo objetivo (ms) para calcular el Pre-Roll de una palabra o línea.
 */
export function resolveWordTargetStartMs(
  line: LyricLine | undefined,
  wordIndex: number,
): number | null {
  if (!line) {
    return null;
  }
  const word = line.words[wordIndex];
  if (word && word.startMs !== null) {
    return word.startMs;
  }
  if (wordIndex > 0) {
    const prevWord = line.words[wordIndex - 1];
    if (prevWord && prevWord.endMs !== null) {
      return prevWord.endMs;
    }
    if (prevWord && prevWord.startMs !== null) {
      return prevWord.startMs + 350;
    }
  }
  return line.startMs;
}

/**
 * Reduce o rellena los picos de forma de onda a una cantidad fija de barras para renderizado SVG.
 */
export function downsampleWaveformBars(
  peaks: readonly number[],
  targetCount = 48,
): number[] {
  const safeCount = Math.max(8, targetCount);
  if (peaks.length === 0) {
    return Array.from({ length: safeCount }, (_, i) =>
      0.22 + 0.55 * Math.abs(Math.sin((i + 1) * 0.55)),
    );
  }
  const step = peaks.length / safeCount;
  const bars: number[] = [];
  for (let i = 0; i < safeCount; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let maxVal = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      const val = peaks[j] ?? 0;
      if (val > maxVal) {
        maxVal = val;
      }
    }
    bars.push(Math.max(0.08, Math.min(1, maxVal)));
  }
  return bars;
}

/**
 * Traduce errores de carga/decodificación de audio a mensajes claros en español.
 */
export function formatAudioDecodeError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (/decode|encoding|format|unable|audio/i.test(msg) && !/[áéíóúñ]/i.test(msg)) {
      return 'El navegador no pudo decodificar este formato de audio. Prueba convertirlo a WAV o MP3.';
    }
    if (msg.length > 0) {
      return msg;
    }
  }
  return 'No se pudo cargar o decodificar el archivo de audio.';
}

/**
 * Genera una entrada de archivo de audio compatible con `attachAudio` usando el WAV demo sintetizado.
 */
export function createDemoAudioFile(durationSeconds = 28): {
  file: AudioFileInput;
  durationMs: number;
  peaks: number[];
} {
  const demo = createSynthesizedDemoWav(durationSeconds);
  const file: AudioFileInput = {
    name: 'demo-noches-de-verano.wav',
    type: 'audio/wav',
    arrayBuffer: async () => demo.buffer,
  };
  return {
    file,
    durationMs: demo.durationMs,
    peaks: demo.peaks,
  };
}

export interface ScrollTargetMetrics {
  containerScrollTop: number;
  containerClientHeight: number;
  containerScrollHeight: number;
  containerTop: number;
  elementTop: number;
  elementHeight: number;
}

/**
 * Calcula el `scrollTop` exacto del contenedor para centrar verticalmente
 * la línea activa sin desplazar ancestros ni exceder los límites de scroll.
 */
export function computeCenteredScrollTop(metrics: ScrollTargetMetrics): number {
  const maxScrollTop = Math.max(
    0,
    metrics.containerScrollHeight - metrics.containerClientHeight,
  );
  if (maxScrollTop <= 0) {
    return 0;
  }
  const elementOffsetTop =
    metrics.elementTop - metrics.containerTop + metrics.containerScrollTop;
  const centered =
    elementOffsetTop - (metrics.containerClientHeight - metrics.elementHeight) / 2;
  return Math.max(0, Math.min(maxScrollTop, Math.round(centered)));
}

/**
 * Genera el aviso en español cuando existen líneas sin marca temporal en la vista Karaoke.
 */
export function formatUnsyncedLinesNotice(
  syncedLinesCount: number,
  unsyncedLinesCount: number,
): string | null {
  if (unsyncedLinesCount <= 0) {
    return null;
  }
  if (syncedLinesCount === 0) {
    return 'Ninguna línea está sincronizada todavía. Marca los tiempos en Línea o Palabra para ver el karaoke.';
  }
  const noun = unsyncedLinesCount === 1 ? '1 línea sin sincronizar' : `${unsyncedLinesCount} líneas sin sincronizar`;
  return `Hay ${noun}; no se iluminarán hasta que tengan marca de tiempo.`;
}
