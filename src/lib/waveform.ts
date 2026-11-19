/**
 * Cálculo puro de picos de forma de onda normalizados.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * extracción de picos en `handleAudioFileUpload` (líneas 473-485).
 */

/**
 * Calcula `bins` picos normalizados en el rango `[0, 1]` a partir de muestras PCM.
 * Si todas las muestras son 0, devuelve ceros. Si `bins <= 0`, devuelve `[]`.
 */
export function computePeaks(channelData: Float32Array, bins: number): number[] {
  const targetBins = Math.floor(bins);
  if (!Number.isFinite(bins) || targetBins <= 0) {
    return [];
  }

  const length = channelData.length;
  if (length === 0) {
    return Array.from({ length: targetBins }, () => 0);
  }

  const rawPeaks = new Array<number>(targetBins);
  let globalMax = 0;

  for (let i = 0; i < targetBins; i++) {
    const start = Math.floor((i * length) / targetBins);
    const end = Math.max(start + 1, Math.floor(((i + 1) * length) / targetBins));
    const span = end - start;
    const stride = span > 1200 ? Math.floor(span / 100) : 1;

    let binMax = 0;
    for (let j = start; j < end && j < length; j += stride) {
      const sample = channelData[j] ?? 0;
      const absVal = Math.abs(sample);
      if (absVal > binMax) {
        binMax = absVal;
      }
    }

    rawPeaks[i] = binMax;
    if (binMax > globalMax) {
      globalMax = binMax;
    }
  }

  if (globalMax <= 0) {
    return rawPeaks.map(() => 0);
  }

  return rawPeaks.map((peak) => Math.min(1, Math.max(0, peak / globalMax)));
}
