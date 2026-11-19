import { clampLatencyMs } from './stampClock';

export const BEEP_COUNT = 4;
export const BEEP_INITIAL_DELAY_MS = 500;
export const BEEP_INTERVAL_MS = 750;
export const BEEP_FREQUENCY_HZ = 880;
export const BEEP_DURATION_S = 0.06;

const MIN_MATCH_OFFSET_MS = -50;
const MAX_MATCH_OFFSET_MS = 650;

/**
 * Calcula la mediana de una lista de números. Devuelve 0 si la lista está vacía.
 */
export function computeMedian(values: readonly number[]): number {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (finite.length === 0) {
    return 0;
  }
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return (left + right) / 2;
}

/**
 * Calcula la latencia estimada en ms como la mediana de `(toque - pitido programado)`
 * emparejando cada toque con el pitido más cercano dentro de la ventana válida.
 * Devuelve `null` si no hay toques válidos.
 */
export function computeLatencyEstimateFromTaps(
  scheduledBeepTimesMs: readonly number[],
  tapTimesMs: readonly number[],
): number | null {
  if (scheduledBeepTimesMs.length === 0 || tapTimesMs.length === 0) {
    return null;
  }

  const diffs: number[] = [];
  const usedBeeps = new Set<number>();

  for (const tapMs of tapTimesMs) {
    if (!Number.isFinite(tapMs)) {
      continue;
    }
    let bestBeepIdx = -1;
    let bestAbsDiff = Number.POSITIVE_INFINITY;
    let bestRawDiff = 0;

    for (let i = 0; i < scheduledBeepTimesMs.length; i++) {
      if (usedBeeps.has(i)) {
        continue;
      }
      const beepMs = scheduledBeepTimesMs[i];
      if (beepMs === undefined || !Number.isFinite(beepMs)) {
        continue;
      }
      const rawDiff = tapMs - beepMs;
      if (rawDiff < MIN_MATCH_OFFSET_MS || rawDiff > MAX_MATCH_OFFSET_MS) {
        continue;
      }
      const absDiff = Math.abs(rawDiff);
      if (absDiff < bestAbsDiff) {
        bestAbsDiff = absDiff;
        bestBeepIdx = i;
        bestRawDiff = rawDiff;
      }
    }

    if (bestBeepIdx !== -1) {
      usedBeeps.add(bestBeepIdx);
      diffs.push(Math.max(0, bestRawDiff));
    }
  }

  if (diffs.length === 0) {
    return null;
  }

  return clampLatencyMs(computeMedian(diffs));
}
