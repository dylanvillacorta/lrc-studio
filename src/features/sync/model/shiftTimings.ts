import type { LyricLine, WordTiming } from '@/types';

function resolveMaxDurationMs(durationMs: number): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, Math.round(durationMs));
}

function shiftOptionalMs(
  value: number | null,
  deltaMs: number,
  maxMs: number,
): number | null {
  if (value === null) {
    return null;
  }
  const shifted = Math.round(value + deltaMs);
  return Math.max(0, Math.min(maxMs, shifted));
}

function shiftWordTiming(
  word: WordTiming,
  deltaMs: number,
  maxMs: number,
): WordTiming {
  return {
    ...word,
    startMs: shiftOptionalMs(word.startMs, deltaMs, maxMs),
    endMs: shiftOptionalMs(word.endMs, deltaMs, maxMs),
  };
}

/**
 * Desplaza todas las marcas temporales (`startMs` y `endMs`) de líneas y palabras
 * sumando `deltaMs`, ignorando `null`, acotando entre `0` y `durationMs`,
 * conservando el orden y sin mutar la entrada.
 */
export function shiftTimings(
  lines: readonly LyricLine[],
  deltaMs: number,
  durationMs: number,
): LyricLine[] {
  const safeDelta =
    typeof deltaMs === 'number' && Number.isFinite(deltaMs)
      ? Math.round(deltaMs)
      : 0;
  const maxMs = resolveMaxDurationMs(durationMs);

  return lines.map((line) => ({
    ...line,
    startMs: shiftOptionalMs(line.startMs, safeDelta, maxMs),
    endMs: shiftOptionalMs(line.endMs, safeDelta, maxMs),
    words: line.words.map((word) => shiftWordTiming(word, safeDelta, maxMs)),
  }));
}

export interface ShiftTimingsPreview {
  hasMarks: boolean;
  firstBeforeMs: number | null;
  firstAfterMs: number | null;
  lastBeforeMs: number | null;
  lastAfterMs: number | null;
}

function collectBounds(lines: readonly LyricLine[]): {
  firstMs: number | null;
  lastMs: number | null;
} {
  let firstMs: number | null = null;
  let lastMs: number | null = null;

  const visit = (value: number | null) => {
    if (value === null) {
      return;
    }
    if (firstMs === null || value < firstMs) {
      firstMs = value;
    }
    if (lastMs === null || value > lastMs) {
      lastMs = value;
    }
  };

  for (const line of lines) {
    visit(line.startMs);
    visit(line.endMs);
    for (const word of line.words) {
      visit(word.startMs);
      visit(word.endMs);
    }
  }

  return { firstMs, lastMs };
}

/**
 * Calcula la vista previa del desplazamiento mostrando la primera y última marca
 * antes y después de aplicar `deltaMs`.
 */
export function getShiftTimingsPreview(
  lines: readonly LyricLine[],
  deltaMs: number,
  durationMs: number,
): ShiftTimingsPreview {
  const before = collectBounds(lines);
  if (before.firstMs === null || before.lastMs === null) {
    return {
      hasMarks: false,
      firstBeforeMs: null,
      firstAfterMs: null,
      lastBeforeMs: null,
      lastAfterMs: null,
    };
  }
  const shifted = shiftTimings(lines, deltaMs, durationMs);
  const after = collectBounds(shifted);
  return {
    hasMarks: true,
    firstBeforeMs: before.firstMs,
    firstAfterMs: after.firstMs,
    lastBeforeMs: before.lastMs,
    lastAfterMs: after.lastMs,
  };
}
