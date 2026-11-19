import { describe, expect, it } from 'vitest';
import {
  computeLatencyEstimateFromTaps,
  computeMedian,
} from './latencyCalibration';

describe('latencyCalibration', () => {
  it('calcula la mediana para listas impares, pares y vacías', () => {
    expect(computeMedian([])).toBe(0);
    expect(computeMedian([220, 180, 200])).toBe(200);
    expect(computeMedian([100, 200, 250, 400])).toBe(225);
  });

  it('estima la latencia con la mediana de las diferencias entre toque y pitido', () => {
    const beeps = [1000, 1750, 2500, 3250];
    const taps = [1190, 1960, 2950, 3450]; // diffs: 190, 210, 450, 200 -> mediana 205
    expect(computeLatencyEstimateFromTaps(beeps, taps)).toBe(205);
  });

  it('acota la estimación entre 0 y 500 ms y descarta toques fuera de ventana', () => {
    const beeps = [1000, 1750, 2500, 3250];
    expect(computeLatencyEstimateFromTaps(beeps, [980, 1730])).toBe(0);
    expect(computeLatencyEstimateFromTaps(beeps, [1580, 2330, 3080, 3830])).toBe(500);
    expect(computeLatencyEstimateFromTaps(beeps, [5000])).toBeNull();
    expect(computeLatencyEstimateFromTaps([], [1000])).toBeNull();
  });
});
