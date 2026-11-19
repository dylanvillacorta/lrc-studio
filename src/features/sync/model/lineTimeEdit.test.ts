import { describe, expect, it } from 'vitest';
import {
  formatEditableTimestamp,
  nudgeTimestampDraft,
  parseTimestampInput,
  validateLineTimeInput,
} from './lineTimeEdit';

describe('lineTimeEdit', () => {
  it('formatea marcas en mm:ss.cc cuando son múltiplos de 10 ms y mm:ss.ccc en caso contrario', () => {
    expect(formatEditableTimestamp(null)).toBe('00:00.00');
    expect(formatEditableTimestamp(undefined)).toBe('00:00.00');
    expect(formatEditableTimestamp(-500)).toBe('00:00.00');
    expect(formatEditableTimestamp(5_000)).toBe('00:05.00');
    expect(formatEditableTimestamp(83_450)).toBe('01:23.45');
    expect(formatEditableTimestamp(83_456)).toBe('01:23.456');
  });

  it('parsea formatos mm:ss.cc y mm:ss.ccc y rechaza entradas inválidas', () => {
    expect(parseTimestampInput('00:05.00')).toEqual({ ok: true, ms: 5_000 });
    expect(parseTimestampInput(' 1:23.45 ')).toEqual({ ok: true, ms: 83_450 });
    expect(parseTimestampInput('01:23.456')).toEqual({ ok: true, ms: 83_456 });

    expect(parseTimestampInput('').ok).toBe(false);
    expect(parseTimestampInput('00:60.00').ok).toBe(false);
    expect(parseTimestampInput('00:05').ok).toBe(false);
    expect(parseTimestampInput('abc').ok).toBe(false);
  });

  it('valida rango contra duración y advierte sin bloquear si queda antes de la línea anterior', () => {
    const outOfRange = validateLineTimeInput('02:00.00', 90_000, 10_000);
    expect(outOfRange.ok).toBe(false);
    if (!outOfRange.ok) {
      expect(outOfRange.error).toContain('00:00.00');
      expect(outOfRange.error).toContain('01:30.00');
    }

    const beforePrev = validateLineTimeInput('00:08.00', 90_000, 10_000);
    expect(beforePrev).toEqual({
      ok: true,
      ms: 8_000,
      warning: 'Aviso: queda antes de la línea anterior (00:10.00).',
    });

    const valid = validateLineTimeInput('00:12.50', 90_000, 10_000);
    expect(valid).toEqual({
      ok: true,
      ms: 12_500,
      warning: null,
    });
  });

  it('ajusta el borrador con ±10 y ±50 ms respetando los límites', () => {
    expect(nudgeTimestampDraft('00:05.00', 50, 90_000)).toBe('00:05.05');
    expect(nudgeTimestampDraft('00:05.00', -10, 90_000)).toBe('00:04.99');
    expect(nudgeTimestampDraft('00:00.02', -50, 90_000)).toBe('00:00.00');
    expect(nudgeTimestampDraft('01:29.98', 50, 90_000)).toBe('01:30.00');
    expect(nudgeTimestampDraft('invalido', 10, 90_000, 4_000)).toBe('00:04.01');
  });
});
