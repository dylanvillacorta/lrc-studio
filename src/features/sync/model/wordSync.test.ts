import { describe, expect, it } from 'vitest';
import {
  distributeWordsEvenlyInLine,
  nudgeWordTime,
} from '@/features/sync/model/wordAdjust';
import {
  findNextUnsyncedWord,
  firstUnsyncedWordIndex,
  hasWordStampToUndo,
  resolveSmartWordFocus,
  resolveWordEntryFocus,
  stampWord,
  undoLastWordStamp,
} from '@/features/sync/model/wordSync';
import type { LyricLine } from '@/types';

const makeWordLines = (): LyricLine[] => [
  {
    id: 'l1',
    text: 'Luces de neón',
    startMs: null,
    endMs: null,
    words: [
      { id: 'w1', text: 'Luces', startMs: null, endMs: null },
      { id: 'w2', text: 'de', startMs: null, endMs: null },
      { id: 'w3', text: 'neón', startMs: null, endMs: null },
    ],
  },
  {
    id: 'l2',
    text: 'Sin palabras',
    startMs: 4000,
    endMs: 6000,
    words: [],
  },
  {
    id: 'l3',
    text: 'Ciudad dormida',
    startMs: null,
    endMs: null,
    words: [
      { id: 'w4', text: 'Ciudad', startMs: null, endMs: null },
      { id: 'w5', text: 'dormida', startMs: null, endMs: null },
    ],
  },
];

/** Marca las palabras pedidas en orden y devuelve las líneas resultantes. */
function stampSequence(
  lines: LyricLine[],
  startAt: { lineIndex: number; wordIndex: number },
  times: number[],
): { lines: LyricLine[]; lineIndex: number; wordIndex: number } {
  let current = lines;
  let lineIndex = startAt.lineIndex;
  let wordIndex = startAt.wordIndex;
  for (const nowMs of times) {
    const res = stampWord(current, { lineIndex, wordIndex, nowMs });
    current = res.lines;
    lineIndex = res.nextLineIndex;
    wordIndex = res.nextWordIndex;
  }
  return { lines: current, lineIndex, wordIndex };
}

describe('wordSync · marcar', () => {
  it('marca la palabra, fija 380 ms por defecto y avanza a la siguiente sin marca', () => {
    const res = stampWord(makeWordLines(), { lineIndex: 0, wordIndex: 0, nowMs: 1500 });
    expect(res.lines[0]?.words[0]?.startMs).toBe(1500);
    expect(res.lines[0]?.words[0]?.endMs).toBe(1880);
    expect(res.lines[0]?.startMs).toBe(1500);
    expect(res.nextLineIndex).toBe(0);
    expect(res.nextWordIndex).toBe(1);
    expect(res.completedAll).toBe(false);
  });

  it('cierra la palabra anterior si seguía abierta o se solapa', () => {
    const step1 = stampWord(makeWordLines(), { lineIndex: 0, wordIndex: 0, nowMs: 1500 });
    const step2 = stampWord(step1.lines, { lineIndex: 0, wordIndex: 1, nowMs: 1800 });
    expect(step2.lines[0]?.words[0]?.endMs).toBe(1780);
    expect(step2.nextWordIndex).toBe(2);
  });

  it('cruza de línea saltando líneas sin palabras y fija el fin de la línea', () => {
    const res = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500, 2400,
    ]);
    expect(res.lines[0]?.endMs).toBe(2780);
    expect(res.lineIndex).toBe(2);
    expect(res.wordIndex).toBe(0);
  });

  it('al marcar la última palabra sin marca reporta completedAll y conserva el foco', () => {
    const res = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500, 2400, 5000, 5600,
    ]);
    expect(res.lineIndex).toBe(2);
    expect(res.wordIndex).toBe(1);
    expect(stampWord(res.lines, { lineIndex: 2, wordIndex: 1, nowMs: 5700 }).completedAll).toBe(
      true,
    );
    const lastStep = stampWord(
      stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [1000, 1500, 2400, 5000])
        .lines,
      { lineIndex: 2, wordIndex: 1, nowMs: 5600 },
    );
    expect(lastStep.completedAll).toBe(true);
    expect(lastStep.nextLineIndex).toBe(2);
    expect(lastStep.nextWordIndex).toBe(1);
  });

  it('re-marcar una palabra intermedia salta a la próxima sin marca, no a la siguiente marcada', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500,
    ]);
    const res = stampWord(marked.lines, { lineIndex: 0, wordIndex: 0, nowMs: 1100 });
    expect(res.nextLineIndex).toBe(0);
    expect(res.nextWordIndex).toBe(2);
  });

  it('no falla si la línea no tiene palabras', () => {
    const lines = makeWordLines();
    const res = stampWord(lines, { lineIndex: 1, wordIndex: 0, nowMs: 4100 });
    expect(res.lines).toHaveLength(3);
    expect(res.completedAll).toBe(false);
    expect(distributeWordsEvenlyInLine(lines, 1)[1]?.words).toEqual([]);
  });

  it('distribuye palabras de forma proporcional y aplica nudge de 10 ms y 50 ms', () => {
    const lines = makeWordLines();
    lines[0] = { ...lines[0]!, startMs: 1000, endMs: 4000 };
    const distributed = distributeWordsEvenlyInLine(lines, 0);

    expect(distributed[0]?.words[0]?.startMs).toBe(1000);
    expect(distributed[0]?.words[2]?.endMs).toBeGreaterThan(3500);

    const nudged10 = nudgeWordTime(distributed, 0, 0, 'startMs', -10);
    expect(nudged10[0]?.words[0]?.startMs).toBe(990);
    expect(nudged10[0]?.startMs).toBe(990);

    const nudged50 = nudgeWordTime(nudged10, 0, 2, 'endMs', 50);
    expect(nudged50[0]?.words[2]?.endMs).toBe(
      (distributed[0]?.words[2]?.endMs ?? 0) + 50,
    );
  });

  it('soporta palabras repetidas con tiempos iguales y fin menor que inicio', () => {
    const repeatedLines: LyricLine[] = [
      {
        id: 'rep',
        text: 'sí sí sí',
        startMs: 3000,
        endMs: 2000,
        words: [
          { id: 'w1', text: 'sí', startMs: null, endMs: null },
          { id: 'w2', text: 'sí', startMs: null, endMs: null },
          { id: 'w3', text: 'sí', startMs: null, endMs: null },
        ],
      },
    ];
    const t1 = stampWord(repeatedLines, { lineIndex: 0, wordIndex: 0, nowMs: 3000 });
    const t2 = stampWord(t1.lines, {
      lineIndex: 0,
      wordIndex: t1.nextWordIndex,
      nowMs: 3000,
    });
    expect(t2.lines[0]?.words[0]?.endMs).toBe(3050);
    expect(t2.lines[0]?.words[1]?.startMs).toBe(3000);
    expect(t2.nextWordIndex).toBe(2);

    const distributed = distributeWordsEvenlyInLine(repeatedLines, 0);
    expect(distributed[0]?.startMs).toBe(3000);
    expect(distributed[0]?.endMs).toBe(3500);
    expect(distributed[0]?.words[2]?.endMs).toBeGreaterThan(3000);
  });
});

describe('wordSync · foco automático', () => {
  it('firstUnsyncedWordIndex devuelve la primera palabra sin marca o null', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500,
    ]);
    expect(firstUnsyncedWordIndex(marked.lines[0])).toBe(2);
    expect(firstUnsyncedWordIndex(marked.lines[1])).toBeNull();
    expect(firstUnsyncedWordIndex(undefined)).toBeNull();
  });

  it('findNextUnsyncedWord cruza líneas y salta líneas vacías', () => {
    const lines = makeWordLines();
    expect(findNextUnsyncedWord(lines, { lineIndex: 0, wordIndex: 3 })).toEqual({
      lineIndex: 2,
      wordIndex: 0,
    });
    expect(findNextUnsyncedWord(lines, { lineIndex: 2, wordIndex: 2 })).toBeNull();
  });

  it('resolveSmartWordFocus conserva la palabra en foco si no tiene marca', () => {
    const lines = makeWordLines();
    expect(resolveSmartWordFocus(lines, 0, 1)).toEqual({ lineIndex: 0, wordIndex: 1 });
  });

  it('resolveSmartWordFocus salta a la primera sin marca tras la última marcada', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500, 2400, 5000,
    ]);
    expect(resolveSmartWordFocus(marked.lines, 0, 0)).toEqual({
      lineIndex: 2,
      wordIndex: 1,
    });
  });

  it('resolveSmartWordFocus mantiene el foco si no queda ninguna sin marca', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500, 2400, 5000, 5600,
    ]);
    expect(resolveSmartWordFocus(marked.lines, 0, 1)).toEqual({
      lineIndex: 0,
      wordIndex: 1,
    });
  });

  it('resolveWordEntryFocus elige la primera palabra sin marca de la línea o la inteligente', () => {
    const lines = makeWordLines();
    expect(resolveWordEntryFocus(lines, 2)).toEqual({ lineIndex: 2, wordIndex: 0 });
    // Línea sin palabras: busca hacia delante.
    expect(resolveWordEntryFocus(lines, 1)).toEqual({ lineIndex: 2, wordIndex: 0 });
    const marked = stampSequence(lines, { lineIndex: 0, wordIndex: 0 }, [1000, 1500, 2400]);
    // Línea 0 completa: pasa a la primera sin marca posterior.
    expect(resolveWordEntryFocus(marked.lines, 0)).toEqual({ lineIndex: 2, wordIndex: 0 });
  });
});

describe('wordSync · deshacer', () => {
  it('desmarca la palabra del foco si tiene marca y deja el foco en ella', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500,
    ]);
    const res = undoLastWordStamp(marked.lines, { lineIndex: 0, wordIndex: 1 }, 2500);
    expect(res).not.toBeNull();
    expect(res?.lineIndex).toBe(0);
    expect(res?.wordIndex).toBe(1);
    expect(res?.wordText).toBe('de');
    expect(res?.removedStartMs).toBe(1500);
    expect(res?.lines[0]?.words[1]?.startMs).toBeNull();
    expect(res?.lines[0]?.words[1]?.endMs).toBeNull();
    // La anterior sigue sincronizada y su fin no se toca.
    expect(res?.lines[0]?.words[0]?.startMs).toBe(1000);
    expect(res?.lines[0]?.words[0]?.endMs).toBe(1380);
  });

  it('si el foco no tiene marca, desmarca la más cercana anterior (palabra intermedia)', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500,
    ]);
    // Tras marcar 2 palabras el foco queda en la 3ª (sin marca).
    expect(marked.wordIndex).toBe(2);
    const res = undoLastWordStamp(
      marked.lines,
      { lineIndex: marked.lineIndex, wordIndex: marked.wordIndex },
      2500,
    );
    expect(res?.wordIndex).toBe(1);
    expect(res?.rewindTargetMs).toBe(0);
    expect(res?.removedStartMs).toBe(1500);
  });

  it('desmarcar la primera palabra de la línea recalcula el inicio de la línea', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      3000, 3500,
    ]);
    const res = undoLastWordStamp(marked.lines, { lineIndex: 0, wordIndex: 0 }, 2500);
    expect(res?.wordIndex).toBe(0);
    expect(res?.lines[0]?.startMs).toBe(3500);
    expect(res?.rewindTargetMs).toBe(500);

    const only = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [3000]);
    const res2 = undoLastWordStamp(only.lines, { lineIndex: 0, wordIndex: 0 }, 2500);
    expect(res2?.lines[0]?.startMs).toBeNull();
    expect(res2?.lines[0]?.endMs).toBeNull();
  });

  it('limita el retroceso a 0 en la primera palabra de la canción', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [1200]);
    const res = undoLastWordStamp(marked.lines, { lineIndex: 0, wordIndex: 1 }, 2500);
    expect(res?.wordIndex).toBe(0);
    expect(res?.rewindTargetMs).toBe(0);
  });

  it('cruza de línea hacia atrás y recalcula el fin de la línea al quitar su última palabra', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500, 2400,
    ]);
    // Foco en (línea 2, palabra 0) sin marca.
    expect(marked.lineIndex).toBe(2);
    const res = undoLastWordStamp(marked.lines, { lineIndex: 2, wordIndex: 0 }, 2500);
    expect(res?.lineIndex).toBe(0);
    expect(res?.wordIndex).toBe(2);
    expect(res?.lines[0]?.words[2]?.startMs).toBeNull();
    // El fin de la línea pasa al mayor fin restante (palabra 2 de la línea 0 cerrada en 1480 / 2380).
    expect(res?.lines[0]?.endMs).toBe(res?.lines[0]?.words[1]?.endMs);
    expect(res?.rewindTargetMs).toBe(0);
  });

  it('deshace la última palabra de la canción con el foco marcado', () => {
    const marked = stampSequence(makeWordLines(), { lineIndex: 0, wordIndex: 0 }, [
      1000, 1500, 2400, 5000, 7000,
    ]);
    const res = undoLastWordStamp(marked.lines, { lineIndex: 2, wordIndex: 1 }, 2500);
    expect(res?.lineIndex).toBe(2);
    expect(res?.wordIndex).toBe(1);
    expect(res?.rewindTargetMs).toBe(4500);
    expect(res?.lines[2]?.endMs).toBe(res?.lines[2]?.words[0]?.endMs);
  });

  it('devuelve null si no hay marcas que deshacer', () => {
    const lines = makeWordLines();
    expect(undoLastWordStamp(lines, { lineIndex: 0, wordIndex: 0 }, 2500)).toBeNull();
    expect(hasWordStampToUndo(lines, { lineIndex: 2, wordIndex: 1 })).toBe(false);
  });

  it('tolera datos con endMs null en la palabra desmarcada y en las restantes', () => {
    const lines = makeWordLines();
    lines[0] = {
      ...lines[0]!,
      startMs: 1000,
      endMs: null,
      words: [
        { id: 'w1', text: 'Luces', startMs: 1000, endMs: null },
        { id: 'w2', text: 'de', startMs: 1500, endMs: null },
        { id: 'w3', text: 'neón', startMs: null, endMs: null },
      ],
    };
    const res = undoLastWordStamp(lines, { lineIndex: 0, wordIndex: 2 }, 2500);
    expect(res?.wordIndex).toBe(1);
    expect(res?.lines[0]?.words[1]?.endMs).toBeNull();
    expect(hasWordStampToUndo(lines, { lineIndex: 0, wordIndex: 2 })).toBe(true);
  });
});
