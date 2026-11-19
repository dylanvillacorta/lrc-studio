/**
 * Funciones puras de formateo, parseo y validación de marcas temporales de línea (`mm:ss.cc` o `mm:ss.ccc`).
 */

const TIMESTAMP_PATTERN = /^(\d{1,3}):([0-5]\d)\.(\d{2,3})$/;

export type ParseTimestampResult =
  | { ok: true; ms: number }
  | { ok: false; error: string };

export type ValidateLineTimeResult =
  | { ok: true; ms: number; warning: string | null }
  | { ok: false; error: string };

/**
 * Formatea una marca temporal en milisegundos para edición manual (`mm:ss.cc` si es múltiplo de 10 ms,
 * o `mm:ss.ccc` si tiene precisión de milisegundo).
 */
export function formatEditableTimestamp(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return '00:00.00';
  }
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const remMs = safeMs % 1000;
  const minStr = String(minutes).padStart(2, '0');
  const secStr = String(seconds).padStart(2, '0');

  if (remMs % 10 === 0) {
    const centis = Math.floor(remMs / 10);
    return `${minStr}:${secStr}.${String(centis).padStart(2, '0')}`;
  }
  return `${minStr}:${secStr}.${String(remMs).padStart(3, '0')}`;
}

/**
 * Parsea una cadena en formato `mm:ss.cc` o `mm:ss.ccc` a milisegundos.
 */
export function parseTimestampInput(raw: string): ParseTimestampResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Ingresa un tiempo en formato mm:ss.cc o mm:ss.ccc.',
    };
  }

  const match = TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: 'Formato inválido. Usa mm:ss.cc o mm:ss.ccc (ej. 01:23.45).',
    };
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const frac = match[3] ?? '00';
  const millis = frac.length === 2 ? Number(frac) * 10 : Number(frac);
  const totalMs = minutes * 60_000 + seconds * 1000 + millis;

  return { ok: true, ms: totalMs };
}

/**
 * Valida la entrada de tiempo de línea contra el rango `[0, durationMs]` y advierte sin bloquear
 * si queda antes de la marca de la línea anterior.
 */
export function validateLineTimeInput(
  raw: string,
  durationMs: number,
  prevLineStartMs?: number | null,
): ValidateLineTimeResult {
  const parsed = parseTimestampInput(raw);
  if (!parsed.ok) {
    return parsed;
  }

  const maxDuration = Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0;
  if (maxDuration > 0 && parsed.ms > maxDuration) {
    return {
      ok: false,
      error: `El tiempo debe estar entre 00:00.00 y ${formatEditableTimestamp(maxDuration)}.`,
    };
  }

  const warning =
    prevLineStartMs !== null &&
    prevLineStartMs !== undefined &&
    Number.isFinite(prevLineStartMs) &&
    parsed.ms < prevLineStartMs
      ? `Aviso: queda antes de la línea anterior (${formatEditableTimestamp(prevLineStartMs)}).`
      : null;

  return {
    ok: true,
    ms: parsed.ms,
    warning,
  };
}

/**
 * Ajusta un borrador de tiempo en `deltaMs`, acotado al rango `[0, durationMs]`.
 */
export function nudgeTimestampDraft(
  raw: string,
  deltaMs: number,
  durationMs: number,
  fallbackMs = 0,
): string {
  const parsed = parseTimestampInput(raw);
  const baseMs = parsed.ok ? parsed.ms : Math.max(0, Math.round(fallbackMs));
  const maxDuration =
    Number.isFinite(durationMs) && durationMs > 0
      ? Math.round(durationMs)
      : Number.MAX_SAFE_INTEGER;
  const nextMs = Math.max(0, Math.min(maxDuration, Math.round(baseMs + deltaMs)));
  return formatEditableTimestamp(nextMs);
}
