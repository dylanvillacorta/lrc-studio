import { splitLineIntoWords, splitRawTextIntoLines } from '@/features/lyrics/model/lyricsParser';
import type { LyricLine } from '@/types';

export interface LyricsStats {
  lineCount: number;
  wordCount: number;
}

export interface LyricsApplyImpact {
  preservedMarks: number;
  lostMarks: number;
  totalSyncedMarks: number;
}

/**
 * Calcula el número de líneas no vacías y palabras totales de un texto de letra.
 */
export function countLyricsStats(rawText: string): LyricsStats {
  const lines = splitRawTextIntoLines(rawText);
  let wordCount = 0;
  for (const line of lines) {
    wordCount += splitLineIntoWords(line).length;
  }
  return {
    lineCount: lines.length,
    wordCount,
  };
}

/**
 * Estima cuántas marcas de sincronización se conservan y cuántas se perderían
 * al aplicar un nuevo texto sobre las líneas existentes.
 */
export function estimateLyricsApplyImpact(
  nextRawText: string,
  existingLines: readonly LyricLine[],
): LyricsApplyImpact {
  const nextLineSet = new Set(splitRawTextIntoLines(nextRawText));
  let preservedMarks = 0;
  let lostMarks = 0;

  for (const line of existingLines) {
    if (line.startMs === null) {
      continue;
    }
    if (nextLineSet.has(line.text.trim())) {
      preservedMarks += 1;
    } else {
      lostMarks += 1;
    }
  }

  return {
    preservedMarks,
    lostMarks,
    totalSyncedMarks: preservedMarks + lostMarks,
  };
}
