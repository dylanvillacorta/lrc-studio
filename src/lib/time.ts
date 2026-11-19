/**
 * Utilidades puras de formato temporal.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `formatTime` (línea 42) y `formatLrcTimestamp` (línea 54).
 * Todas las entradas de tiempo en este módulo usan milisegundos.
 */

/**
 * Formatea una duración en milisegundos como mm:ss.mmm.
 */
export function formatTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Formatea una duración en milisegundos como mm:ss.cc (centésimas) o mm:ss,
 * o `--:--.--` si el valor es nulo, indefinido o no finito.
 * Proviene de `formatTime(seconds, showMs)` en el archivo base.
 */
export function formatDisplayTime(ms: number | null | undefined, showMs = true): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return showMs ? '--:--.--' : '--:--';
  }
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const centis = Math.floor((safeMs % 1000) / 10);
  const minStr = String(minutes).padStart(2, '0');
  const secStr = String(seconds).padStart(2, '0');
  const csStr = String(centis).padStart(2, '0');
  return showMs ? `${minStr}:${secStr}.${csStr}` : `${minStr}:${secStr}`;
}

/**
 * Formatea una marca temporal en milisegundos al estándar LRC `mm:ss.cc`.
 * Proviene de `formatLrcTimestamp(seconds)` en el archivo base.
 */
export function formatLrcTimestamp(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const centis = Math.floor((safeMs % 1000) / 10);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
