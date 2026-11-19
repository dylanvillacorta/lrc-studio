import { describe, expect, it } from 'vitest';
import { formatDisplayTime, formatLrcTimestamp, formatTime } from '@/lib/time';

describe('formatTime', () => {
  it('formatea cero milisegundos como 00:00.000', () => {
    expect(formatTime(0)).toBe('00:00.000');
  });

  it('formatea minutos, segundos y milisegundos con ceros a la izquierda', () => {
    expect(formatTime(65_432)).toBe('01:05.432');
  });

  it('limita valores negativos a 00:00.000', () => {
    expect(formatTime(-500)).toBe('00:00.000');
  });
});

describe('formatLrcTimestamp', () => {
  it('formatea marcas LRC en centésimas mm:ss.cc', () => {
    expect(formatLrcTimestamp(0)).toBe('00:00.00');
    expect(formatLrcTimestamp(1_500)).toBe('00:01.50');
    expect(formatLrcTimestamp(65_432)).toBe('01:05.43');
  });

  it('trunca milisegundos a centésimas sin desbordar segundos en bordes', () => {
    expect(formatLrcTimestamp(9)).toBe('00:00.00');
    expect(formatLrcTimestamp(1_234)).toBe('00:01.23');
    expect(formatLrcTimestamp(1_239)).toBe('00:01.23');
    expect(formatLrcTimestamp(59_999)).toBe('00:59.99');
    expect(formatLrcTimestamp(60_000)).toBe('01:00.00');
  });

  it('limita valores negativos o no finitos a 00:00.00', () => {
    expect(formatLrcTimestamp(-100)).toBe('00:00.00');
    expect(formatLrcTimestamp(Number.NaN)).toBe('00:00.00');
    expect(formatLrcTimestamp(Number.POSITIVE_INFINITY)).toBe('00:00.00');
  });
});

describe('formatDisplayTime', () => {
  it('devuelve marcador vacío para null, undefined o NaN', () => {
    expect(formatDisplayTime(null)).toBe('--:--.--');
    expect(formatDisplayTime(undefined, false)).toBe('--:--');
    expect(formatDisplayTime(Number.NaN)).toBe('--:--.--');
  });

  it('formatea con o sin centésimas', () => {
    expect(formatDisplayTime(65_432, true)).toBe('01:05.43');
    expect(formatDisplayTime(65_432, false)).toBe('01:05');
  });
});
