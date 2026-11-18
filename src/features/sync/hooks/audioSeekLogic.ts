/**
 * Lógica pura para garantizar que el audio suene desde el tiempo mostrado
 * en la interfaz (slider y contador).
 */

/** Diferencia máxima tolerada entre tiempo mostrado y `audio.currentTime`. */
export const PLAY_DRIFT_TOLERANCE_MS = 100;

/** Tiempo mostrado: el seek pendiente tiene prioridad sobre el almacén. */
export function resolveDisplayedTimeMs(
  pendingMs: number | null,
  storeMs: number,
): number {
  const value = pendingMs !== null ? pendingMs : storeMs;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Indica si hay que fijar `audio.currentTime` al tiempo mostrado antes de reproducir. */
export function needsCurrentTimeCorrection(
  displayedMs: number,
  audioCurrentTimeSec: number,
  toleranceMs: number = PLAY_DRIFT_TOLERANCE_MS,
): boolean {
  const audioMs = (Number(audioCurrentTimeSec) || 0) * 1000;
  return Math.abs(displayedMs - audioMs) > toleranceMs;
}

/** Limita un tiempo en ms a la duración conocida (0 o inválida = sin límite). */
export function clampTimeMs(targetMs: number, durationMs: number): number {
  const max = durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(max, Number(targetMs) || 0));
}

interface MetadataTarget {
  readyState: number;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** Espera `loadedmetadata`/`canplay` (o un tiempo máximo). Resuelve true si hay metadatos. */
export function waitForMetadata(
  audio: MetadataTarget,
  timeoutMs = 4000,
): Promise<boolean> {
  if (audio.readyState >= 1) {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (ok: boolean) => {
      if (timer !== null) clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('canplay', onReady);
      resolve(ok);
    };
    const onReady = () => done(audio.readyState >= 1);
    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('canplay', onReady);
    timer = setTimeout(() => done(audio.readyState >= 1), timeoutMs);
  });
}

export type SeekOrigin = 'user' | 'restore';

/**
 * Un seek de restauración nunca pisa un seek del usuario ya emitido
 * (el último seek del usuario prevalece sobre cualquier seek pendiente).
 */
export function shouldApplySeek(
  origin: SeekOrigin,
  userHasSeeked: boolean,
): boolean {
  return origin === 'user' || !userHasSeeked;
}

/** Resuelve el seek pendiente tras un nuevo seek: el nuevo reemplaza al previo si procede. */
export function nextPendingSeekMs(
  pendingMs: number | null,
  requestedMs: number,
  origin: SeekOrigin,
  userHasSeeked: boolean,
): number | null {
  return shouldApplySeek(origin, userHasSeeked) ? requestedMs : pendingMs;
}
