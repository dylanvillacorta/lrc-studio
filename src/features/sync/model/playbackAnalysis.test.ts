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
  resolvePlaybackTracking,
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

  it('reproduce hipótesis (a): no retrocede ni salta dos líneas cuando una línea previa tiene endMs null o solapado', () => {
    const linesWithOpenFirst: LyricLine[] = [
      { id: 'a1', text: 'Primera abierta', startMs: 1000, endMs: null, words: [] },
      { id: 'a2', text: 'Segunda cerrada', startMs: 2000, endMs: 2500, words: [] },
      { id: 'a3', text: 'Tercera final', startMs: 4000, endMs: 5500, words: [] },
    ];

    let maxSeenLine = -1;
    let prevActive = -1;
    for (let t = 0; t <= 6000; t += 10) {
      const idx = findActiveLineIndex(linesWithOpenFirst, t);
      if (idx >= 0) {
        expect(idx).toBeGreaterThanOrEqual(maxSeenLine);
        if (prevActive >= 0) {
          expect(idx - prevActive).toBeLessThanOrEqual(1);
        }
        maxSeenLine = Math.max(maxSeenLine, idx);
        prevActive = idx;
      }
    }
    expect(maxSeenLine).toBe(2);

    // Solapamiento explícito (endMs de l0 > startMs de l1 y > endMs de l1)
    const overlappingLines: LyricLine[] = [
      { id: 'o1', text: 'Línea solapada', startMs: 1000, endMs: 5000, words: [] },
      { id: 'o2', text: 'Línea corta', startMs: 2500, endMs: 3200, words: [] },
      { id: 'o3', text: 'Línea siguiente', startMs: 4500, endMs: 6000, words: [] },
    ];
    expect(findActiveLineIndex(overlappingLines, 3900)).toBe(-1);
    expect(findActiveLineIndex(overlappingLines, 4500)).toBe(2);
  });

  it('mantiene línea activa continua entre líneas contiguas y marca pasadas sin desordenar en avance cada 10 ms', () => {
    const contiguousLines: LyricLine[] = [
      { id: 'c0', text: 'Uno', startMs: 1000, endMs: 1960, words: [] },
      { id: 'c1', text: 'Dos', startMs: 2000, endMs: 2960, words: [] },
      { id: 'c2', text: 'Tres', startMs: 3000, endMs: 3960, words: [] },
      { id: 'c3', text: 'Cuatro', startMs: 4000, endMs: null, words: [] },
    ];

    let prevIdx = -1;
    for (let t = 1000; t <= 5000; t += 10) {
      const state = computeKaraokeState(contiguousLines, t);
      expect(state.activeLineIndex).toBeGreaterThanOrEqual(0);
      if (prevIdx >= 0) {
        expect(state.activeLineIndex - prevIdx).toBeGreaterThanOrEqual(0);
        expect(state.activeLineIndex - prevIdx).toBeLessThanOrEqual(1);
      }
      prevIdx = state.activeLineIndex;
    }
    expect(prevIdx).toBe(3);
  });

  it('maneja marcas desordenadas, líneas sin sincronizar intermedias y palabras fuera de rango', () => {
    // Marcas desordenadas: l0 empieza después de l1
    const unordered: LyricLine[] = [
      { id: 'u0', text: 'Tardía', startMs: 5000, endMs: 6000, words: [] },
      { id: 'u1', text: 'Temprana', startMs: 2000, endMs: 3000, words: [] },
    ];
    const at2500 = computeKaraokeState(unordered, 2500);
    expect(at2500.activeLineIndex).toBe(1);
    expect(at2500.lines[0]?.isPast).toBe(false);
    expect(at2500.lines[1]?.isActive).toBe(true);

    // Línea sin sincronizar entre líneas sincronizadas
    const withUnsyncedMiddle: LyricLine[] = [
      { id: 's0', text: 'Inicio', startMs: 1000, endMs: null, words: [] },
      { id: 's1', text: 'Sin marca', startMs: null, endMs: null, words: [] },
      { id: 's2', text: 'Final', startMs: 3000, endMs: 4500, words: [] },
    ];
    const at2200 = computeKaraokeState(withUnsyncedMiddle, 2200);
    expect(at2200.activeLineIndex).toBe(0);
    expect(at2200.lines[1]?.isActive).toBe(false);
    expect(at2200.lines[1]?.isPast).toBe(false);
    const at3200 = computeKaraokeState(withUnsyncedMiddle, 3200);
    expect(at3200.activeLineIndex).toBe(2);
    expect(at3200.lines[0]?.isPast).toBe(true);
    expect(at3200.lines[1]?.isPast).toBe(false);

    // Palabras fuera del rango de una línea futura no se pre-iluminan, y findActiveWordIndex no retrocede
    const outOfRangeWords: LyricLine[] = [
      {
        id: 'wline0',
        text: 'uno dos',
        startMs: 1000,
        endMs: 2500,
        words: [
          { id: 'ow1', text: 'uno', startMs: 1000, endMs: null },
          { id: 'ow2', text: 'dos', startMs: 1500, endMs: 1800 },
        ],
      },
      {
        id: 'wline1',
        text: 'futura',
        startMs: 4000,
        endMs: 5500,
        words: [{ id: 'ow3', text: 'futura', startMs: 500, endMs: 1200 }],
      },
    ];
    expect(findActiveWordIndex(outOfRangeWords[0], 1950)).toBe(-1);
    const at1400 = computeKaraokeState(outOfRangeWords, 1400);
    expect(at1400.lines[1]?.wordProgressPct).toEqual([0]);
  });

  it('coordina seguimiento automático de reproducción y selección manual en resolvePlaybackTracking', () => {
    // Al avanzar la reproducción a otra línea con marca, acompaña la selección y limpia override
    const step1 = resolvePlaybackTracking({
      lines: sampleLines,
      currentTimeMs: 5200,
      isPlaying: true,
      activeLineIndex: 0,
      lastPlayingLineIndex: 0,
      manualOverrideAtPlayingIndex: null,
    });
    expect(step1).toEqual({
      playingLineIndex: 1,
      trackedListIndex: 1,
      nextActiveLineIndex: 1,
      nextManualOverride: null,
    });

    // Selección manual manda mientras la reproducción siga en la misma línea
    const manual = resolvePlaybackTracking({
      lines: sampleLines,
      currentTimeMs: 5500,
      isPlaying: true,
      activeLineIndex: 2,
      lastPlayingLineIndex: 1,
      manualOverrideAtPlayingIndex: 1,
    });
    expect(manual).toEqual({
      playingLineIndex: 1,
      trackedListIndex: 2,
      nextActiveLineIndex: null,
      nextManualOverride: 1,
    });

    // Si la línea activa está sin marca (esperando ser marcada), no sobreescribe activeLineIndex
    const waitingUnsynced = resolvePlaybackTracking({
      lines: sampleLines,
      currentTimeMs: 1600,
      isPlaying: true,
      activeLineIndex: 2,
      lastPlayingLineIndex: -1,
      manualOverrideAtPlayingIndex: null,
    });
    expect(waitingUnsynced.playingLineIndex).toBe(0);
    expect(waitingUnsynced.trackedListIndex).toBe(0);
    expect(waitingUnsynced.nextActiveLineIndex).toBeNull();
  });
});
