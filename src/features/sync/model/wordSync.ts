/**
 * Operaciones puras e inmutables de captura palabra por palabra.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`): `stampWordStart`.
 *
 * Solo existe el modo continuo con foco automático: cada marca avanza a la próxima
 * palabra sin marca (cruzando líneas) y el deshacer quita la última palabra marcada.
 * Todas las marcas temporales se expresan en milisegundos.
 */

import type { LyricLine } from '@/types';

/** Duración por defecto de una palabra recién marcada. */
const DEFAULT_WORD_DURATION_MS = 380;

export interface WordPosition {
  lineIndex: number;
  wordIndex: number;
}

export interface StampWordParams extends WordPosition {
  nowMs: number;
}

export interface WordSyncResult {
  lines: LyricLine[];
  nextLineIndex: number;
  nextWordIndex: number;
  /** `true` cuando ya no queda ninguna palabra sin marca en toda la canción. */
  completedAll: boolean;
}

export interface UndoWordStampResult {
  lines: LyricLine[];
  lineIndex: number;
  wordIndex: number;
  wordText: string;
  removedStartMs: number;
  rewindTargetMs: number;
}

function isWordSynced(line: LyricLine, wordIndex: number): boolean {
  const word = line.words[wordIndex];
  return word !== undefined && word.startMs !== null;
}

/**
 * Primera palabra sin marca de una línea, o `null` si todas están marcadas o no hay palabras.
 */
export function firstUnsyncedWordIndex(line: LyricLine | undefined): number | null {
  if (!line) {
    return null;
  }
  const index = line.words.findIndex((word) => word.startMs === null);
  return index === -1 ? null : index;
}

/**
 * Busca la próxima palabra sin marca en orden de documento, empezando en la posición dada
 * (inclusive) y cruzando líneas; salta líneas sin palabras.
 */
export function findNextUnsyncedWord(
  lines: readonly LyricLine[],
  from: WordPosition,
): WordPosition | null {
  for (let l = Math.max(0, from.lineIndex); l < lines.length; l += 1) {
    const line = lines[l];
    if (!line) {
      continue;
    }
    const start = l === from.lineIndex ? Math.max(0, from.wordIndex) : 0;
    for (let w = start; w < line.words.length; w += 1) {
      if (!isWordSynced(line, w)) {
        return { lineIndex: l, wordIndex: w };
      }
    }
  }
  return null;
}

/**
 * Foco inteligente: si la palabra en foco no tiene marca se conserva; si ya está marcada,
 * pasa a la primera palabra sin marca posterior a la última marcada; si no hay ninguna,
 * mantiene el foco actual.
 */
export function resolveSmartWordFocus(
  lines: readonly LyricLine[],
  lineIndex: number,
  wordIndex: number,
): WordPosition {
  const current: WordPosition = { lineIndex, wordIndex };
  const line = lines[lineIndex];
  if (line && line.words[wordIndex] === undefined) {
    // Línea sin palabras (o índice fuera de rango): buscar hacia delante y, si no, desde el inicio.
    return (
      findNextUnsyncedWord(lines, { lineIndex, wordIndex: 0 }) ??
      findNextUnsyncedWord(lines, { lineIndex: 0, wordIndex: 0 }) ??
      current
    );
  }
  if (!line || !isWordSynced(line, wordIndex)) {
    return current;
  }
  let lastSynced: WordPosition = current;
  for (let l = 0; l < lines.length; l += 1) {
    const candidate = lines[l];
    if (!candidate) {
      continue;
    }
    for (let w = 0; w < candidate.words.length; w += 1) {
      if (isWordSynced(candidate, w)) {
        lastSynced = { lineIndex: l, wordIndex: w };
      }
    }
  }
  return (
    findNextUnsyncedWord(lines, {
      lineIndex: lastSynced.lineIndex,
      wordIndex: lastSynced.wordIndex + 1,
    }) ?? current
  );
}

/**
 * Foco al entrar al modo Palabra con la línea indicada: la primera palabra sin marca de esa
 * línea; si no tiene, aplica el foco inteligente (primera sin marca tras la última marcada).
 */
export function resolveWordEntryFocus(
  lines: readonly LyricLine[],
  lineIndex: number,
): WordPosition {
  const first = firstUnsyncedWordIndex(lines[lineIndex]);
  if (first !== null) {
    return { lineIndex, wordIndex: first };
  }
  return resolveSmartWordFocus(lines, lineIndex, 0);
}

/**
 * Marca el inicio de la palabra indicada. Cierra la palabra anterior de la misma línea si
 * seguía abierta o se solapa, actualiza los límites de la línea y calcula el siguiente foco.
 * Proviene de `stampWordStart` en el archivo base.
 */
export function stampWord(
  lines: readonly LyricLine[],
  params: StampWordParams,
): WordSyncResult {
  const { lineIndex, wordIndex, nowMs } = params;
  const line = lines[lineIndex];
  const currentWord = line?.words[wordIndex];
  if (!line || !currentWord) {
    return {
      lines: [...lines],
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      completedAll: false,
    };
  }

  const safeNowMs = Math.max(0, Math.round(nowMs));
  const updatedWords = [...line.words];

  if (wordIndex > 0) {
    const prevW = updatedWords[wordIndex - 1];
    if (
      prevW &&
      prevW.startMs !== null &&
      (prevW.endMs === null || prevW.endMs > safeNowMs)
    ) {
      updatedWords[wordIndex - 1] = {
        ...prevW,
        endMs: Math.round(Math.max(prevW.startMs + 50, safeNowMs - 20)),
      };
    }
  }

  const defaultEndMs = safeNowMs + DEFAULT_WORD_DURATION_MS;
  updatedWords[wordIndex] = {
    ...currentWord,
    startMs: safeNowMs,
    endMs: defaultEndMs,
  };

  const newLineStartMs =
    wordIndex === 0 || line.startMs === null
      ? safeNowMs
      : Math.min(line.startMs, safeNowMs);

  const isLastWordInLine = wordIndex === updatedWords.length - 1;
  const newLineEndMs = isLastWordInLine
    ? Math.max(line.endMs ?? 0, defaultEndMs)
    : line.endMs;

  const updatedLines = [...lines];
  updatedLines[lineIndex] = {
    ...line,
    startMs: newLineStartMs,
    endMs: newLineEndMs,
    words: updatedWords,
  };

  const next = findNextUnsyncedWord(updatedLines, {
    lineIndex,
    wordIndex: wordIndex + 1,
  });
  if (!next) {
    return {
      lines: updatedLines,
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      completedAll: true,
    };
  }
  return {
    lines: updatedLines,
    nextLineIndex: next.lineIndex,
    nextWordIndex: next.wordIndex,
    completedAll: false,
  };
}

/**
 * Ubica la palabra a deshacer: la del foco si tiene marca; si no, la marcada más cercana
 * antes del foco (orden de documento, cruzando líneas hacia atrás).
 */
function findUndoTarget(
  lines: readonly LyricLine[],
  focus: WordPosition,
): WordPosition | null {
  const focusLine = lines[focus.lineIndex];
  if (focusLine && isWordSynced(focusLine, focus.wordIndex)) {
    return focus;
  }
  const startLine = Math.min(focus.lineIndex, lines.length - 1);
  for (let l = startLine; l >= 0; l -= 1) {
    const line = lines[l];
    if (!line) {
      continue;
    }
    const from =
      l === focus.lineIndex
        ? Math.min(focus.wordIndex - 1, line.words.length - 1)
        : line.words.length - 1;
    for (let w = from; w >= 0; w -= 1) {
      if (isWordSynced(line, w)) {
        return { lineIndex: l, wordIndex: w };
      }
    }
  }
  return null;
}

/** Indica si existe alguna palabra con marca que se pueda deshacer desde el foco dado. */
export function hasWordStampToUndo(
  lines: readonly LyricLine[],
  focus: WordPosition,
): boolean {
  return findUndoTarget(lines, focus) !== null;
}

/**
 * Quita la marca de la última palabra sincronizada (la del foco si la tiene, o la más
 * cercana anterior). El foco queda en esa palabra y se devuelve el punto de audio al que
 * retroceder (`inicio - preRollMs`, mínimo 0). `null` si no hay nada que deshacer.
 */
export function undoLastWordStamp(
  lines: readonly LyricLine[],
  focus: WordPosition,
  preRollMs: number,
): UndoWordStampResult | null {
  const target = findUndoTarget(lines, focus);
  if (!target) {
    return null;
  }
  const line = lines[target.lineIndex];
  const word = line?.words[target.wordIndex];
  if (!line || !word || word.startMs === null) {
    return null;
  }

  const removedStartMs = word.startMs;
  const words = line.words.map((w, i) =>
    i === target.wordIndex ? { ...w, startMs: null, endMs: null } : w,
  );

  let startMs = line.startMs;
  let endMs = line.endMs;
  if (target.wordIndex === 0) {
    const starts = words.flatMap((w) => (w.startMs === null ? [] : [w.startMs]));
    startMs = starts.length > 0 ? Math.min(...starts) : null;
  }
  if (target.wordIndex === words.length - 1) {
    const ends = words.flatMap((w) => (w.endMs === null ? [] : [w.endMs]));
    endMs = ends.length > 0 ? Math.max(...ends) : null;
  }

  const nextLines = [...lines];
  nextLines[target.lineIndex] = { ...line, startMs, endMs, words };

  return {
    lines: nextLines,
    lineIndex: target.lineIndex,
    wordIndex: target.wordIndex,
    wordText: word.text,
    removedStartMs,
    rewindTargetMs: Math.max(0, removedStartMs - Math.max(0, preRollMs)),
  };
}
