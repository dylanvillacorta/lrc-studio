import { describe, expect, it } from 'vitest';
import {
  computeKaraokeState,
  computePreRollStartMs,
  computeSyncProgress,
  computeWordProgressPct,
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

  it('evalúa el semáforo de Pre-Roll alineado con el wireframe (rojo alto, ámbar mitad, verde final)', () => {
    expect(getPreRollTrafficLight(2500)).toBe('red');
    expect(getPreRollTrafficLight(2000)).toBe('red');
    expect(getPreRollTrafficLight(1651)).toBe('red');
    expect(getPreRollTrafficLight(1650)).toBe('amber');
    expect(getPreRollTrafficLight(1400)).toBe('amber'); // caso -1.4s de Palabra.dc.html
    expect(getPreRollTrafficLight(800)).toBe('amber');
    expect(getPreRollTrafficLight(500)).toBe('green');
    expect(getPreRollTrafficLight(250)).toBe('green');
    expect(getPreRollTrafficLight(0)).toBe('green');
    expect(getPreRollTrafficLight(-50)).toBe('green');

    // Escala proporcional cuando se usa un Pre-Roll distinto (p. ej. 4000 ms)
    expect(getPreRollTrafficLight(3000, 4000)).toBe('red');
    expect(getPreRollTrafficLight(2000, 4000)).toBe('amber');
    expect(getPreRollTrafficLight(700, 4000)).toBe('green');
  });

  it('tolera tiempos iguales, fin menor que inicio, líneas vacías y Pre-Roll con inicio < 2.5 s', () => {
    const edgeLines: LyricLine[] = [
      {
        id: 'e1',
        text: 'Misma marca',
        startMs: 1200,
        endMs: 900, // fin menor que inicio
        words: [
          { id: 'ew1', text: 'Misma', startMs: 1200, endMs: 1200 },
          { id: 'ew2', text: 'marca', startMs: 1200, endMs: 1000 },
        ],
      },
      {
        id: 'e2',
        text: 'Igual inicio',
        startMs: 1200,
        endMs: 2000,
        words: [],
      },
    ];

    expect(findActiveLineIndex(edgeLines, 1200)).toBe(1);
    expect(findActiveLineIndex(edgeLines.slice(0, 1), 1200)).toBe(0);
    expect(findActiveWordIndex(edgeLines[0], 1200)).toBe(1);
    expect(findActiveWordIndex(edgeLines[1], 1200)).toBe(-1);
    expect(findActiveLineIndex([], 1000)).toBe(-1);

    const winEarly = getActiveLineWindow(edgeLines, 0, { preRollMs: 2500 });
    expect(winEarly.lineStartMs).toBe(1200);
    expect(winEarly.lineEndMs).toBe(1700); // clamped >= lineStartMs + 500
    expect(winEarly.windowStartMs).toBe(0);

    expect(computePreRollStartMs(0, 2500)).toBe(0);
    expect(computePreRollStartMs(2499, 2500)).toBe(0);
    expect(computePreRollStartMs(2500, 2500)).toBe(0);
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

  it('calcula el barrido de progreso de palabra (0 a 100%) en computeWordProgressPct', () => {
    const word = { id: 'w1', text: 'Luces', startMs: 1000, endMs: 2000 };
    expect(computeWordProgressPct(word, 900)).toBe(0);
    expect(computeWordProgressPct(word, 1000)).toBe(0);
    expect(computeWordProgressPct(word, 1250)).toBe(25);
    expect(computeWordProgressPct(word, 1500)).toBe(50);
    expect(computeWordProgressPct(word, 2000)).toBe(100);
    expect(computeWordProgressPct(word, 2500)).toBe(100);

    // Palabra sin endMs usa duración por defecto (350 ms)
    const openWord = { id: 'w2', text: 'de', startMs: 2000, endMs: null };
    expect(computeWordProgressPct(openWord, 2175)).toBe(50);
    expect(computeWordProgressPct(openWord, 2400)).toBe(100);

    // Palabra sin startMs solo se ilumina al 100% si la línea está activa sin desglose
    const unsyncedWord = { id: 'w3', text: 'neón', startMs: null, endMs: null };
    expect(computeWordProgressPct(unsyncedWord, 2000, false)).toBe(0);
    expect(computeWordProgressPct(unsyncedWord, 2000, true)).toBe(100);
  });

  it('calcula computeKaraokeState con línea activa, pasada, progreso por palabra y aviso de sin sincronizar', () => {
    const stateAt2900 = computeKaraokeState(sampleLines, 2900);
    expect(stateAt2900.activeLineIndex).toBe(0);
    expect(stateAt2900.activeWordIndex).toBe(1);
    expect(stateAt2900.syncedLinesCount).toBe(2);
    expect(stateAt2900.unsyncedLinesCount).toBe(1);
    expect(stateAt2900.hasUnsyncedLines).toBe(true);
    expect(stateAt2900.lines[0]).toEqual({
      lineIndex: 0,
      isActive: true,
      isPast: false,
      wordProgressPct: [100, 50],
    });
    expect(stateAt2900.lines[1]?.isPast).toBe(false);
    expect(stateAt2900.lines[2]?.isPast).toBe(false);

    // En la segunda línea (solo marca de línea, sin palabras sincronizadas), la palabra se ilumina al 100%
    const stateAt5200 = computeKaraokeState(sampleLines, 5200);
    expect(stateAt5200.activeLineIndex).toBe(1);
    expect(stateAt5200.activeWordIndex).toBe(-1);
    expect(stateAt5200.lines[0]?.isPast).toBe(true);
    expect(stateAt5200.lines[1]).toEqual({
      lineIndex: 1,
      isActive: true,
      isPast: false,
      wordProgressPct: [100],
    });
  });
});
