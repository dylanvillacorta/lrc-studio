import { describe, expect, it } from 'vitest';
import { computePeaks } from '@/lib/waveform';

describe('computePeaks', () => {
  it('devuelve arreglo vacío si bins es cero o negativo', () => {
    const data = new Float32Array([0.1, -0.5, 0.3]);
    expect(computePeaks(data, 0)).toEqual([]);
    expect(computePeaks(data, -4)).toEqual([]);
  });

  it('devuelve ceros si el buffer está vacío o en silencio', () => {
    expect(computePeaks(new Float32Array(0), 4)).toEqual([0, 0, 0, 0]);
    expect(computePeaks(new Float32Array([0, 0, 0, 0]), 2)).toEqual([0, 0]);
  });

  it('normaliza los picos al rango [0, 1] tomando el máximo global', () => {
    const data = new Float32Array([0.1, -0.25, 0.5, -0.1, 0.0, 0.25]);
    const peaks = computePeaks(data, 3);
    expect(peaks).toHaveLength(3);
    expect(peaks[0]).toBeCloseTo(0.5, 5);
    expect(peaks[1]).toBeCloseTo(1.0, 5);
    expect(peaks[2]).toBeCloseTo(0.5, 5);
  });

  it('soporta buffers más cortos que el número de bins', () => {
    const data = new Float32Array([-0.4, 0.8]);
    const peaks = computePeaks(data, 4);
    expect(peaks).toHaveLength(4);
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });
});
