/**
 * Análisis puro de reproducción, ventanas de Pre-Roll, semáforo y progreso.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `getActiveLineWindow` (línea 370), `triggerPreRollPlay` (línea 404),
 * `currentPlayingLineIndex` (línea 1237) y métricas de progreso (líneas 1414-1419).
 *
 * Todas las marcas temporales están en milisegundos.
 */

import type {
  ActiveLineWindow,
  LyricLine,
  PreRollTrafficLight,
  SyncProgress,
  WordTiming,
} from '@/types';

export const DEFAULT_PRE_ROLL_MS = 2500;
export const DEFAULT_POST_ROLL_MS = 800;
export const DEFAULT_WORD_SWEEP_MS = 350;

export interface KaraokeLineState {
  lineIndex: number;
  isActive: boolean;
  isPast: boolean;
  wordProgressPct: number[];
}

export interface KaraokePlaybackState {
  activeLineIndex: number;
  activeWordIndex: number;
  syncedLinesCount: number;
  unsyncedLinesCount: number;
  hasUnsyncedLines: boolean;
  lines: KaraokeLineState[];
}

export interface ActiveLineWindowOptions {
  preRollMs?: number;
  postRollMs?: number;
  durationMs?: number;
}

/**
 * Devuelve el índice de la línea activa para `currentTimeMs`, o `-1` si aún no comienza
 * ninguna o está fuera de ventana (+600 ms de tolerancia al final).
 * Proviene de `currentPlayingLineIndex` en el archivo base.
 */
export function findActiveLineIndex(
  lines: readonly LyricLine[],
  currentTimeMs: number,
): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line && line.startMs !== null && currentTimeMs >= line.startMs) {
      if (
        line.endMs === null ||
        currentTimeMs <= Math.max(line.startMs, line.endMs) + 600
      ) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Devuelve el índice de la palabra activa dentro de una línea para `currentTimeMs`, o `-1`.
 */
export function findActiveWordIndex(
  line: LyricLine | undefined,
  currentTimeMs: number,
): number {
  if (!line || line.words.length === 0) {
    return -1;
  }
  for (let i = line.words.length - 1; i >= 0; i--) {
    const word = line.words[i];
    if (word && word.startMs !== null && currentTimeMs >= word.startMs) {
      if (word.endMs === null || currentTimeMs <= Math.max(word.startMs, word.endMs)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Calcula la ventana temporal de la línea activa con Pre-Roll y Post-Roll para la ráfaga aislada.
 * Proviene de `getActiveLineWindow` en el archivo base (convertido a milisegundos).
 */
export function getActiveLineWindow(
  lines: readonly LyricLine[],
  lineIndex: number,
  options: ActiveLineWindowOptions = {},
): ActiveLineWindow {
  const preRollMs = options.preRollMs ?? DEFAULT_PRE_ROLL_MS;
  const postRollMs = options.postRollMs ?? DEFAULT_POST_ROLL_MS;
  const maxDurationMs = options.durationMs && options.durationMs > 0
    ? options.durationMs
    : 9_999_000;

  const line = lines[lineIndex];
  if (!line) {
    return {
      lineStartMs: 0,
      lineEndMs: 4000,
      windowStartMs: 0,
      windowEndMs: Math.min(maxDurationMs, 5000),
    };
  }

  const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : undefined;
  const fallbackStartMs =
    prevLine && prevLine.endMs !== null ? prevLine.endMs + 300 : lineIndex * 3500;
  const lineStartMs = line.startMs !== null ? line.startMs : fallbackStartMs;

  const syncedWordEnds = line.words
    .map((w) => w.endMs)
    .filter((t): t is number => t !== null);
  const nextLineStartMs = lines[lineIndex + 1]?.startMs ?? null;

  const fallbackEndMs =
    syncedWordEnds.length > 0
      ? Math.max(...syncedWordEnds, lineStartMs + 1800)
      : nextLineStartMs !== null && nextLineStartMs > lineStartMs
        ? Math.max(lineStartMs, nextLineStartMs - 100)
        : lineStartMs + 3600;

  const lineEndMs =
    line.endMs !== null ? Math.max(lineStartMs + 500, line.endMs) : fallbackEndMs;
  const windowStartMs = Math.max(0, Math.round(lineStartMs - preRollMs));
  const windowEndMs = Math.min(maxDurationMs, Math.round(lineEndMs + postRollMs));

  return {
    lineStartMs,
    lineEndMs,
    windowStartMs,
    windowEndMs,
  };
}

/**
 * Calcula el instante de arranque del Pre-Roll para una palabra o línea:
 * `targetStartMs - preRollMs` (por defecto 2500 ms), limitado a un mínimo de `0 ms`.
 */
export function computePreRollStartMs(
  targetStartMs: number | null,
  preRollMs = DEFAULT_PRE_ROLL_MS,
): number {
  if (targetStartMs === null || !Number.isFinite(targetStartMs)) {
    return 0;
  }
  return Math.max(0, Math.round(targetStartMs - Math.max(0, preRollMs)));
}

/**
 * Determina el estado del semáforo de Pre-Roll según el tiempo restante hasta el objetivo.
 *
 * El archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`, líneas 2080-2130) mostraba una
 * barra continua sin discretización en tres luces; el wireframe (`docs/wireframe/Palabra.dc.html`,
 * línea 61) y `docs/DISENO.md` definen el semáforo de 3 luces para la cuenta de 2.5 s:
 * - `red`: parte alta de la cuenta (`> 66%` del Pre-Roll; con 2500 ms equivale a `> 1650 ms`).
 * - `amber`: mitad de la cuenta (`> 20%` y `<= 66%`; con 2500 ms cubre `501–1650 ms`, incluido el `−1.4s` del wireframe).
 * - `green`: tramo final listo para marcar (`<= 20%`; con 2500 ms equivale a `<= 500 ms`).
 */
export function getPreRollTrafficLight(
  remainingMs: number,
  preRollMs = DEFAULT_PRE_ROLL_MS,
): PreRollTrafficLight {
  const safePreRollMs = Math.max(1, preRollMs);
  const greenThresholdMs = Math.round(safePreRollMs * 0.2);
  const amberThresholdMs = Math.round(safePreRollMs * 0.66);

  if (remainingMs <= greenThresholdMs) {
    return 'green';
  }
  if (remainingMs <= amberThresholdMs) {
    return 'amber';
  }
  return 'red';
}

/**
 * Calcula el porcentaje de líneas sincronizadas y palabras sincronizadas.
 * Proviene de las métricas de progreso del archivo base (líneas 1414-1419).
 */
export function computeSyncProgress(lines: readonly LyricLine[]): SyncProgress {
  const totalLines = lines.length;
  const syncedLines = lines.filter((l) => l.startMs !== null).length;
  const totalWords = lines.reduce((acc, l) => acc + l.words.length, 0);
  const syncedWords = lines.reduce(
    (acc, l) => acc + l.words.filter((w) => w.startMs !== null).length,
    0,
  );

  const lineProgress =
    totalLines > 0 ? Math.round((syncedLines / totalLines) * 100) : 0;
  const wordProgress =
    totalWords > 0 ? Math.round((syncedWords / totalWords) * 100) : 0;

  return {
    totalLines,
    syncedLines,
    totalWords,
    syncedWords,
    lineProgress,
    wordProgress,
  };
}

/**
 * Calcula el porcentaje de barrido (0 a 100) de una palabra para `currentTimeMs`.
 * Si la palabra no tiene marca propia pero la línea está activa sin desglose por palabra,
 * devuelve `100` para resaltar la línea completa (compatible con el archivo base).
 */
export function computeWordProgressPct(
  word: WordTiming,
  currentTimeMs: number,
  fallbackLineActive = false,
): number {
  if (word.startMs === null) {
    return fallbackLineActive ? 100 : 0;
  }
  if (currentTimeMs <= word.startMs) {
    return 0;
  }
  const endMs =
    word.endMs !== null && word.endMs > word.startMs
      ? word.endMs
      : word.startMs + DEFAULT_WORD_SWEEP_MS;
  if (currentTimeMs >= endMs) {
    return 100;
  }
  const rawPct = ((currentTimeMs - word.startMs) / (endMs - word.startMs)) * 100;
  return Math.min(100, Math.max(0, Math.round(rawPct * 10) / 10));
}

/**
 * Calcula el estado completo de la vista previa Karaoke para `currentTimeMs`:
 * línea activa, palabra activa, líneas pasadas/futuras, progreso de barrido por palabra
 * y conteo de líneas sin sincronizar.
 */
export function computeKaraokeState(
  lines: readonly LyricLine[],
  currentTimeMs: number,
): KaraokePlaybackState {
  const activeLineIndex = findActiveLineIndex(lines, currentTimeMs);
  const activeLine = activeLineIndex >= 0 ? lines[activeLineIndex] : undefined;
  const activeWordIndex = findActiveWordIndex(activeLine, currentTimeMs);

  let lastStartedLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const startMs = lines[i]?.startMs;
    if (startMs !== null && startMs !== undefined && currentTimeMs >= startMs) {
      lastStartedLineIndex = i;
      break;
    }
  }

  let syncedLinesCount = 0;
  let unsyncedLinesCount = 0;

  const lineStates: KaraokeLineState[] = lines.map((line, lineIndex) => {
    const isSynced = line.startMs !== null;
    if (isSynced) {
      syncedLinesCount++;
    } else {
      unsyncedLinesCount++;
    }

    const isActive = lineIndex === activeLineIndex;
    const isPast =
      !isActive &&
      isSynced &&
      ((lastStartedLineIndex >= 0 && lineIndex < lastStartedLineIndex) ||
        (line.endMs !== null &&
          currentTimeMs > Math.max(line.startMs ?? 0, line.endMs)));

    const fallbackLineActive = isActive && isSynced;
    const wordProgressPct = line.words.map((word) =>
      computeWordProgressPct(word, currentTimeMs, fallbackLineActive),
    );

    return {
      lineIndex,
      isActive,
      isPast,
      wordProgressPct,
    };
  });

  return {
    activeLineIndex,
    activeWordIndex,
    syncedLinesCount,
    unsyncedLinesCount,
    hasUnsyncedLines: unsyncedLinesCount > 0,
    lines: lineStates,
  };
}

export interface PlaybackTrackingInput {
  lines: readonly LyricLine[];
  currentTimeMs: number;
  isPlaying: boolean;
  activeLineIndex: number;
  lastPlayingLineIndex: number;
  manualOverrideAtPlayingIndex: number | null;
}

export interface PlaybackTrackingResult {
  playingLineIndex: number;
  trackedListIndex: number;
  nextActiveLineIndex: number | null;
  nextManualOverride: number | null;
}

/**
 * Resuelve la línea en reproducción según las marcas guardadas y coordina el seguimiento
 * automático frente a la selección manual del usuario.
 */
export function resolvePlaybackTracking({
  lines,
  currentTimeMs,
  isPlaying,
  activeLineIndex,
  lastPlayingLineIndex,
  manualOverrideAtPlayingIndex,
}: PlaybackTrackingInput): PlaybackTrackingResult {
  const playingLineIndex = isPlaying ? findActiveLineIndex(lines, currentTimeMs) : -1;

  if (!isPlaying) {
    return {
      playingLineIndex: -1,
      trackedListIndex: activeLineIndex,
      nextActiveLineIndex: null,
      nextManualOverride: manualOverrideAtPlayingIndex,
    };
  }

  const advancedToNewLine =
    playingLineIndex >= 0 && playingLineIndex !== lastPlayingLineIndex;

  if (advancedToNewLine && playingLineIndex !== manualOverrideAtPlayingIndex) {
    const activeLineHasTime = lines[activeLineIndex]?.startMs !== null;
    const playingLineHasTime = lines[playingLineIndex]?.startMs !== null;
    return {
      playingLineIndex,
      trackedListIndex: playingLineIndex,
      nextActiveLineIndex:
        activeLineHasTime && playingLineHasTime ? playingLineIndex : null,
      nextManualOverride: null,
    };
  }

  if (manualOverrideAtPlayingIndex !== null) {
    return {
      playingLineIndex,
      trackedListIndex: activeLineIndex,
      nextActiveLineIndex: null,
      nextManualOverride: manualOverrideAtPlayingIndex,
    };
  }

  return {
    playingLineIndex,
    trackedListIndex: playingLineIndex >= 0 ? playingLineIndex : activeLineIndex,
    nextActiveLineIndex: null,
    nextManualOverride: null,
  };
}
