import { describe, expect, it } from 'vitest';
import { evaluatePlaybackProgress } from '@/features/sync/hooks/audioHealth';

const base = { prevTimeSec: 10, elapsedMs: 1200, playbackRate: 1 };

describe('evaluatePlaybackProgress (vigilante, T26)', () => {
  it('avanza con el reloj real', () => {
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: 11.2 })).toBe('advancing');
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: 10.5 })).toBe('advancing');
  });

  it('congelado: currentTime no avanza o avanza muy por debajo', () => {
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: 10 })).toBe('frozen');
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: 10.1 })).toBe('frozen');
  });

  it('saltos (seek atrás o adelante) y ventanas cortas no son concluyentes', () => {
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: 3 })).toBe('inconclusive');
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: 60 })).toBe('inconclusive');
    expect(evaluatePlaybackProgress({ ...base, elapsedMs: 100, currTimeSec: 10 })).toBe('inconclusive');
    expect(evaluatePlaybackProgress({ ...base, currTimeSec: Number.NaN })).toBe('inconclusive');
  });

  it('respeta la velocidad de reproducción distinta de 1', () => {
    // A 2x se esperan 2.4 s en 1200 ms: 0.4 s es poco (congelado), 2.4 s avanza.
    expect(evaluatePlaybackProgress({ ...base, playbackRate: 2, currTimeSec: 10.4 })).toBe('frozen');
    expect(evaluatePlaybackProgress({ ...base, playbackRate: 2, currTimeSec: 12.4 })).toBe('advancing');
    // A 0.5x se esperan 0.6 s: 0.3 s avanza, 0 congelado.
    expect(evaluatePlaybackProgress({ ...base, playbackRate: 0.5, currTimeSec: 10.3 })).toBe('advancing');
    expect(evaluatePlaybackProgress({ ...base, playbackRate: 0.5, currTimeSec: 10 })).toBe('frozen');
  });
});
