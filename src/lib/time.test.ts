import { describe, expect, it } from 'vitest';
import { formatTime } from '@/lib/time';

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
