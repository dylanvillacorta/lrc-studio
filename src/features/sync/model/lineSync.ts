/**
 * Operaciones puras e inmutables de sincronización por línea.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `stampCurrentLineStart` (línea 748), `stampCurrentLineEnd` (línea 780)
 * y `undoLineSync` (línea 804).
 *
 * Todas las marcas y deltas temporales se expresan en milisegundos.
 */

import type { LyricLine } from '@/types';

export interface LineSyncResult {
  lines: LyricLine[];
  nextLineIndex: number;
}

export interface UndoLineSyncResult extends LineSyncResult {
  rewindTargetMs: number;
}

/**
 * Marca el inicio de la línea en `lineIndex` en `nowMs` (en milisegundos).
 * Si la línea anterior estaba abierta o se solapa, cierra su `endMs` limpiamente.
 * Proviene de `stampCurrentLineStart` en el archivo base.
 */
export function stampLineStart(
  lines: readonly LyricLine[],
  lineIndex: number,
  nowMs: number,
  lineHoldMode = false,
): LineSyncResult {
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { lines: [...lines], nextLineIndex: lineIndex };
  }

  const safeNowMs = Math.max(0, Math.round(nowMs));
  const updated = [...lines];

  if (lineIndex > 0) {
    const prev = updated[lineIndex - 1];
    if (
      prev &&
      prev.startMs !== null &&
      (prev.endMs === null || prev.endMs > safeNowMs)
    ) {
      updated[lineIndex - 1] = {
        ...prev,
        endMs: Math.round(Math.max(prev.startMs + 100, safeNowMs - 40)),
      };
    }
  }

  const curr = updated[lineIndex];
  if (curr) {
    updated[lineIndex] = {
      ...curr,
      startMs: safeNowMs,
      endMs: curr.endMs !== null && curr.endMs > safeNowMs ? curr.endMs : null,
    };
  }

  const nextLineIndex =
    !lineHoldMode && lineIndex < updated.length - 1 ? lineIndex + 1 : lineIndex;

  return { lines: updated, nextLineIndex };
}

/**
 * Marca el fin de la línea actual (o de la línea anterior si `advanceAfter` es `false`).
 * Proviene de `stampCurrentLineEnd` en el archivo base.
 */
export function stampLineEnd(
  lines: readonly LyricLine[],
  activeLineIndex: number,
  nowMs: number,
  advanceAfter = false,
): LineSyncResult {
  if (lines.length === 0) {
    return { lines: [], nextLineIndex: 0 };
  }

  const safeNowMs = Math.max(0, Math.round(nowMs));
  const targetIdx = advanceAfter
    ? activeLineIndex
    : Math.max(0, activeLineIndex - 1);

  const updated = [...lines];
  const target = updated[targetIdx];
  if (!target || target.startMs === null) {
    return { lines: updated, nextLineIndex: activeLineIndex };
  }

  updated[targetIdx] = {
    ...target,
    endMs: Math.round(Math.max(target.startMs + 150, safeNowMs)),
  };

  const nextLineIndex =
    advanceAfter && activeLineIndex < updated.length - 1
      ? activeLineIndex + 1
      : activeLineIndex;

  return { lines: updated, nextLineIndex };
}

/**
 * Deshace la sincronización de la línea inmediatamente anterior y calcula el instante
 * de rebobinado (-2000 ms respecto a su inicio, o -2500 ms desde `currentTimeMs`).
 * Proviene de `undoLineSync` en el archivo base.
 */
export function undoLineSync(
  lines: readonly LyricLine[],
  activeLineIndex: number,
  currentTimeMs: number,
): UndoLineSyncResult {
  if (lines.length === 0) {
    return {
      lines: [],
      nextLineIndex: 0,
      rewindTargetMs: Math.max(0, Math.round(currentTimeMs - 2500)),
    };
  }

  const targetIdx = Math.max(0, Math.min(lines.length - 1, activeLineIndex - 1));
  const targetLine = lines[targetIdx];
  const rewindTargetMs =
    targetLine && targetLine.startMs !== null
      ? Math.max(0, Math.round(targetLine.startMs - 2000))
      : Math.max(0, Math.round(currentTimeMs - 2500));

  const updated = [...lines];
  if (targetLine) {
    updated[targetIdx] = {
      ...targetLine,
      startMs: null,
      endMs: null,
    };
  }

  return {
    lines: updated,
    nextLineIndex: targetIdx,
    rewindTargetMs,
  };
}

/**
 * Ajusta en `deltaMs` (p. ej. ±10 ms o ±50 ms) el `startMs` o `endMs` de una línea.
 */
export function nudgeLineTime(
  lines: readonly LyricLine[],
  lineIndex: number,
  field: 'startMs' | 'endMs',
  deltaMs: number,
): LyricLine[] {
  const line = lines[lineIndex];
  if (!line) {
    return [...lines];
  }

  const baseVal = line[field] ?? 0;
  const nextVal = Math.max(0, Math.round(baseVal + deltaMs));

  const updated = [...lines];
  updated[lineIndex] = {
    ...line,
    [field]: nextVal,
  };

  return updated;
}

function clearLineTimestamps(line: LyricLine): LyricLine {
  return {
    ...line,
    startMs: null,
    endMs: null,
    words: line.words.map((word) => ({
      ...word,
      startMs: null,
      endMs: null,
    })),
  };
}

/**
 * Limpia `startMs`, `endMs` y los tiempos de palabras de la línea indicada,
 * dejándola como línea objetivo a marcar.
 */
export function clearLineMark(
  lines: readonly LyricLine[],
  lineIndex: number,
): LineSyncResult {
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { lines: [...lines], nextLineIndex: Math.max(0, lineIndex) };
  }
  const updated = lines.map((line, idx) =>
    idx === lineIndex ? clearLineTimestamps(line) : line,
  );
  return { lines: updated, nextLineIndex: lineIndex };
}

/**
 * Limpia las marcas de la línea indicada y todas las posteriores para rehacer un tramo completo.
 */
export function clearMarksFromLine(
  lines: readonly LyricLine[],
  fromLineIndex: number,
): LineSyncResult {
  if (fromLineIndex < 0 || fromLineIndex >= lines.length) {
    return { lines: [...lines], nextLineIndex: Math.max(0, fromLineIndex) };
  }
  const updated = lines.map((line, idx) =>
    idx >= fromLineIndex ? clearLineTimestamps(line) : line,
  );
  return { lines: updated, nextLineIndex: fromLineIndex };
}

/**
 * Fija manualmente `startMs` en una línea sin alterar otras líneas; limpia `endMs` si queda <= `startMs`.
 */
export function setLineStartTime(
  lines: readonly LyricLine[],
  lineIndex: number,
  startMs: number,
): LyricLine[] {
  const line = lines[lineIndex];
  if (!line) {
    return [...lines];
  }
  const safeStartMs = Math.max(0, Math.round(startMs));
  return lines.map((item, idx) =>
    idx === lineIndex
      ? {
          ...item,
          startMs: safeStartMs,
          endMs: item.endMs !== null && item.endMs > safeStartMs ? item.endMs : null,
        }
      : item,
  );
}
