/**
 * Operaciones puras e inmutables de captura palabra por palabra (Tap, Hold, Sniper, Aislada).
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `stampWordStart` (línea 826) y `stampWordEndOnRelease` (línea 948).
 *
 * Todas las marcas temporales se expresan en milisegundos.
 */

import type { LyricLine, WordSyncSubMode } from '@/types';

export interface StampWordParams {
  lineIndex: number;
  wordIndex: number;
  nowMs: number;
  subMode: WordSyncSubMode;
  sniperHoldDuration?: boolean;
  sniperAutoAdvancePreRoll?: boolean;
}

export interface WordSyncResult {
  lines: LyricLine[];
  nextLineIndex: number;
  nextWordIndex: number;
  shouldPause: boolean;
  completedLine: boolean;
}

/**
 * Marca el inicio de la palabra activa según el submodo (`sniper`, `isolatedLine`, `tap`, `hold`).
 * Cierra la palabra anterior si seguía abierta o se solapa, actualiza los límites de la línea
 * y calcula el siguiente foco y si debe pausarse la reproducción.
 * Proviene de `stampWordStart` en el archivo base.
 */
export function stampWordStart(
  lines: readonly LyricLine[],
  params: StampWordParams,
): WordSyncResult {
  const {
    lineIndex,
    wordIndex,
    nowMs,
    subMode,
    sniperHoldDuration = false,
    sniperAutoAdvancePreRoll = true,
  } = params;

  const line = lines[lineIndex];
  const currentWord = line?.words[wordIndex];
  if (!line || !currentWord) {
    return {
      lines: [...lines],
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      shouldPause: false,
      completedLine: false,
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

  const needsDefaultEnd =
    subMode === 'tap' ||
    subMode === 'isolatedLine' ||
    (subMode === 'sniper' && !sniperHoldDuration);

  const defaultEndMs = needsDefaultEnd ? safeNowMs + 380 : null;

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
  const newLineEndMs =
    isLastWordInLine && defaultEndMs !== null
      ? Math.max(line.endMs ?? 0, defaultEndMs)
      : line.endMs;

  const updatedLines = [...lines];
  updatedLines[lineIndex] = {
    ...line,
    startMs: newLineStartMs,
    endMs: newLineEndMs,
    words: updatedWords,
  };

  if (subMode === 'sniper') {
    if (!sniperHoldDuration) {
      const nextWordIdx = wordIndex + 1;
      if (nextWordIdx < updatedWords.length) {
        return {
          lines: updatedLines,
          nextLineIndex: lineIndex,
          nextWordIndex: nextWordIdx,
          shouldPause: !sniperAutoAdvancePreRoll,
          completedLine: false,
        };
      }
      return {
        lines: updatedLines,
        nextLineIndex: lineIndex,
        nextWordIndex: wordIndex,
        shouldPause: true,
        completedLine: true,
      };
    }
    return {
      lines: updatedLines,
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      shouldPause: false,
      completedLine: false,
    };
  }

  if (subMode === 'isolatedLine') {
    if (wordIndex < updatedWords.length - 1) {
      return {
        lines: updatedLines,
        nextLineIndex: lineIndex,
        nextWordIndex: wordIndex + 1,
        shouldPause: false,
        completedLine: false,
      };
    }
    return {
      lines: updatedLines,
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      shouldPause: false,
      completedLine: true,
    };
  }

  if (subMode === 'tap') {
    if (wordIndex < updatedWords.length - 1) {
      return {
        lines: updatedLines,
        nextLineIndex: lineIndex,
        nextWordIndex: wordIndex + 1,
        shouldPause: false,
        completedLine: false,
      };
    }
    if (lineIndex < updatedLines.length - 1) {
      return {
        lines: updatedLines,
        nextLineIndex: lineIndex + 1,
        nextWordIndex: 0,
        shouldPause: false,
        completedLine: true,
      };
    }
  }

  return {
    lines: updatedLines,
    nextLineIndex: lineIndex,
    nextWordIndex: wordIndex,
    shouldPause: false,
    completedLine: isLastWordInLine,
  };
}

/**
 * Marca el fin de la palabra activa al soltar el botón o tecla (modo mantener / Francotirador con duración).
 * Proviene de `stampWordEndOnRelease` en el archivo base.
 */
export function stampWordEndOnRelease(
  lines: readonly LyricLine[],
  params: StampWordParams,
): WordSyncResult {
  const {
    lineIndex,
    wordIndex,
    nowMs,
    subMode,
    sniperHoldDuration = false,
    sniperAutoAdvancePreRoll = true,
  } = params;

  const line = lines[lineIndex];
  const word = line?.words[wordIndex];
  if (!line || !word || word.startMs === null) {
    return {
      lines: [...lines],
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      shouldPause: false,
      completedLine: false,
    };
  }

  const safeNowMs = Math.max(0, Math.round(nowMs));
  const finalEndMs = Math.round(Math.max(word.startMs + 60, safeNowMs));

  const updatedWords = [...line.words];
  updatedWords[wordIndex] = {
    ...word,
    endMs: finalEndMs,
  };

  const isLastWord = wordIndex === updatedWords.length - 1;
  const updatedLines = [...lines];
  updatedLines[lineIndex] = {
    ...line,
    endMs: isLastWord ? Math.max(line.endMs ?? 0, finalEndMs) : line.endMs,
    words: updatedWords,
  };

  if (subMode === 'sniper' && sniperHoldDuration) {
    const nextWordIdx = wordIndex + 1;
    if (nextWordIdx < updatedWords.length) {
      return {
        lines: updatedLines,
        nextLineIndex: lineIndex,
        nextWordIndex: nextWordIdx,
        shouldPause: !sniperAutoAdvancePreRoll,
        completedLine: false,
      };
    }
    return {
      lines: updatedLines,
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex,
      shouldPause: true,
      completedLine: true,
    };
  }

  if (wordIndex < updatedWords.length - 1) {
    return {
      lines: updatedLines,
      nextLineIndex: lineIndex,
      nextWordIndex: wordIndex + 1,
      shouldPause: false,
      completedLine: false,
    };
  }

  if (subMode === 'hold' && lineIndex < updatedLines.length - 1) {
    return {
      lines: updatedLines,
      nextLineIndex: lineIndex + 1,
      nextWordIndex: 0,
      shouldPause: false,
      completedLine: true,
    };
  }

  return {
    lines: updatedLines,
    nextLineIndex: lineIndex,
    nextWordIndex: wordIndex,
    shouldPause: false,
    completedLine: isLastWord,
  };
}
