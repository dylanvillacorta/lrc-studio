import { describe, expect, it } from 'vitest';
import {
  computePreRollStatus,
  createDemoAudioFile,
  downsampleWaveformBars,
  formatAudioDecodeError,
  getNextPlaybackRate,
  resolveWordTargetStartMs,
} from './syncViewHelpers';
import type { LyricLine } from '@/types';

describe('syncViewHelpers', () => {
  it('cicla correctamente las velocidades de reproducción', () => {
    expect(getNextPlaybackRate(1)).toBe(1.25);
    expect(getNextPlaybackRate(1.5)).toBe(0.5);
    expect(getNextPlaybackRate(0.5)).toBe(0.75);
    expect(getNextPlaybackRate(2.5)).toBe(1);
  });

  it('calcula el semáforo y la cuenta regresiva del Pre-Roll', () => {
    const red = computePreRollStatus(10_000, 8_000, 2500);
    expect(red.light).toBe('red');
    expect(red.label).toBe('ESPERA');
    expect(red.countdownText).toBe('−2.0s');

    const amber = computePreRollStatus(10_000, 8_600, 2500);
    expect(amber.light).toBe('amber');
    expect(amber.label).toBe('PREPÁRATE');
    expect(amber.countdownText).toBe('−1.4s');

    const green = computePreRollStatus(10_000, 9_700, 2500);
    expect(green.light).toBe('green');
    expect(green.label).toBe('¡LISTO!');
    expect(green.countdownText).toBe('−0.3s');
  });

  it('resuelve el inicio objetivo de una palabra usando la palabra previa o la línea', () => {
    const line: LyricLine = {
      id: 'l1',
      text: 'hola mundo',
      startMs: 5000,
      endMs: null,
      words: [
        { id: 'w1', text: 'hola', startMs: 5000, endMs: 5400 },
        { id: 'w2', text: 'mundo', startMs: null, endMs: null },
      ],
    };
    expect(resolveWordTargetStartMs(line, 0)).toBe(5000);
    expect(resolveWordTargetStartMs(line, 1)).toBe(5400);
    expect(resolveWordTargetStartMs(undefined, 0)).toBeNull();
  });

  it('reduce picos a la cantidad solicitada en [0.08, 1]', () => {
    const bars = downsampleWaveformBars([0, 0.5, 1, 0.2], 8);
    expect(bars).toHaveLength(8);
    expect(bars.every((b) => b >= 0.08 && b <= 1)).toBe(true);
  });

  it('traduce errores técnicos de decodificación al español', () => {
    expect(formatAudioDecodeError(new Error('Unable to decode audio data'))).toContain(
      'No se pudo decodificar',
    );
    expect(formatAudioDecodeError('fallo desconocido')).toContain('No se pudo cargar');
  });

  it('crea un archivo de audio demo válido', async () => {
    const demo = createDemoAudioFile(4);
    expect(demo.durationMs).toBe(4000);
    expect(demo.peaks.length).toBeGreaterThan(0);
    const buf = await demo.file.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(44);
  });
});
