import { describe, expect, it } from 'vitest';
import {
  computePreRollStartMs,
  computeSyncProgress,
  findActiveLineIndex,
  findActiveWordIndex,
  getActiveLineWindow,
  getPreRollTrafficLight,
} from '@/features/sync/model/playbackAnalysis';
import type { LyricLine } from '@/types';

const sampleLines: LyricLine[] = [
  {
    id: 'l1',
    text: 'Luces de',
    startMs: 1500,
    endMs: 3500,
    words: [
      { id: 'w1', text: 'Luces', startMs: 1500, endMs: 2200 },
      { id: 'w2', text: 'de', startMs: 2400, endMs: 3400 },
    ],
  },
  {
    id: 'l2',
    text: 'Neón',
    startMs: 5000,
    endMs: null,
    words: [{ id: 'w3', text: 'Neón', startMs: null, endMs: null }],
  },
  {
    id: 'l3',
    text: 'Sin marcas',
    startMs: null,
    endMs: null,
    words: [],
  },
];

describe('playbackAnalysis', () => {
  it('devuelve -1 cuando el tiempo está antes de la primera marca', () => {
    expect(findActiveLineIndex(sampleLines, 500)).toBe(-1);
    expect(findActiveWordIndex(sampleLines[0], 1000)).toBe(-1);
  });

  it('encuentra la línea y palabra activas para un tiempo dado', () => {
    expect(findActiveLineIndex(sampleLines, 2500)).toBe(0);
    expect(findActiveWordIndex(sampleLines[0], 2500)).toBe(1);
    expect(findActiveLineIndex(sampleLines, 4050)).toBe(0); // +600ms tolerancia
    expect(findActiveLineIndex(sampleLines, 4200)).toBe(-1);
    expect(findActiveLineIndex(sampleLines, 5200)).toBe(1);
  });

  it('calcula getActiveLineWindow y limita Pre-Roll cerca de 0 s', () => {
    const win = getActiveLineWindow(sampleLines, 0, {
      preRollMs: 2500,
      postRollMs: 800,
      durationMs: 28_000,
    });
    expect(win.lineStartMs).toBe(1500);
    expect(win.lineEndMs).toBe(3500);
    expect(win.windowStartMs).toBe(0);
    expect(win.windowEndMs).toBe(4300);

    expect(computePreRollStartMs(1200, 2500)).toBe(0);
    expect(computePreRollStartMs(5000, 2500)).toBe(2500);
    expect(computePreRollStartMs(null)).toBe(0);
  });

  it('evalúa el semáforo de Pre-Roll en rojo, ámbar y verde', () => {
    expect(getPreRollTrafficLight(2000)).toBe('red');
    expect(getPreRollTrafficLight(800)).toBe('amber');
    expect(getPreRollTrafficLight(250)).toBe('green');
    expect(getPreRollTrafficLight(-50)).toBe('green');
  });

  it('calcula el progreso de líneas y palabras sincronizadas', () => {
    const progress = computeSyncProgress(sampleLines);
    expect(progress).toEqual({
      totalLines: 3,
      syncedLines: 2,
      totalWords: 3,
      syncedWords: 2,
      lineProgress: 67,
      wordProgress: 67,
    });

    expect(computeSyncProgress([])).toEqual({
      totalLines: 0,
      syncedLines: 0,
      totalWords: 0,
      syncedWords: 0,
      lineProgress: 0,
      wordProgress: 0,
    });
  });
});
