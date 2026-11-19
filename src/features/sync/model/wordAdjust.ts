/**
 * Operaciones puras e inmutables de distribución y micro-ajuste por palabra.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `distributeWordsEvenlyInLine` (línea 1017) y `nudgeWordTime` (línea 1057).
 *
 * Todas las marcas y deltas temporales se expresan en milisegundos.
 */

import type { LyricLine } from '@/types';

/**
 * Distribuye proporcionalmente por longitud de caracteres todas las palabras de una línea.
 * Proviene de `distributeWordsEvenlyInLine` en el archivo base.
 */
export function distributeWordsEvenlyInLine(
  lines: readonly LyricLine[],
  lineIndex: number,
  fallbackStartMs = 0,
): LyricLine[] {
  const line = lines[lineIndex];
  if (!line || line.words.length === 0) {
    return [...lines];
  }

  const startMs =
    line.startMs !== null ? line.startMs : Math.max(0, Math.round(fallbackStartMs));
  const nextLineStartMs = lines[lineIndex + 1]?.startMs ?? null;
  const endMs =
    line.endMs !== null
      ? line.endMs
      : nextLineStartMs !== null && nextLineStartMs > startMs
        ? nextLineStartMs - 100
        : startMs + Math.max(2000, line.words.length * 450);

  const totalSpanMs = Math.max(500, endMs - startMs);
  const totalChars = line.words.reduce((acc, w) => acc + Math.max(2, w.text.length), 0);

  let cursorMs = startMs;
  const distributedWords = line.words.map((w) => {
    const weight = Math.max(2, w.text.length) / totalChars;
    const wSpanMs = totalSpanMs * weight;
    const wStartMs = Math.round(cursorMs);
    const wEndMs = Math.round(cursorMs + Math.max(80, wSpanMs - 30));
    cursorMs += wSpanMs;
    return { ...w, startMs: wStartMs, endMs: wEndMs };
  });

  const updated = [...lines];
  updated[lineIndex] = {
    ...line,
    startMs: Math.round(startMs),
    endMs: Math.round(Math.max(startMs + totalSpanMs, endMs)),
    words: distributedWords,
  };
  return updated;
}

/**
 * Micro-ajuste en milisegundos (`±10 ms`, `±50 ms`, etc.) de una palabra,
 * recalculando los límites de la línea contenedora.
 * Proviene de `nudgeWordTime` en el archivo base.
 */
export function nudgeWordTime(
  lines: readonly LyricLine[],
  lineIndex: number,
  wordIndex: number,
  field: 'startMs' | 'endMs',
  deltaMs: number,
): LyricLine[] {
  const line = lines[lineIndex];
  if (!line) {
    return [...lines];
  }

  const words = [...line.words];
  const word = words[wordIndex];
  if (!word) {
    return [...lines];
  }

  const baseVal = word[field] ?? 0;
  const nextVal = Math.max(0, Math.round(baseVal + deltaMs));
  words[wordIndex] = { ...word, [field]: nextVal };

  const validStarts = words
    .map((item) => item.startMs)
    .filter((t): t is number => t !== null);
  const validEnds = words
    .map((item) => item.endMs)
    .filter((t): t is number => t !== null);

  const updated = [...lines];
  updated[lineIndex] = {
    ...line,
    startMs: validStarts.length > 0 ? Math.min(...validStarts) : line.startMs,
    endMs: validEnds.length > 0 ? Math.max(...validEnds) : line.endMs,
    words,
  };

  return updated;
}
