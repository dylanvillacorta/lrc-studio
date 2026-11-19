import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@/types';
import { getShiftTimingsPreview, shiftTimings } from './shiftTimings';

function makeSampleLines(): LyricLine[] {
  return [
    {
      id: 'l1',
      text: 'Primera línea',
      startMs: 100,
      endMs: 1200,
      words: [
        { id: 'w1', text: 'Primera', startMs: 100, endMs: 600 },
        { id: 'w2', text: 'línea', startMs: 650, endMs: null },
      ],
    },
    {
      id: 'l2',
      text: 'Segunda línea',
      startMs: 4800,
      endMs: 5900,
      words: [
        { id: 'w3', text: 'Segunda', startMs: null, endMs: null },
        { id: 'w4', text: 'línea', startMs: 5200, endMs: 5900 },
      ],
    },
    {
      id: 'l3',
      text: 'Sin marcar',
      startMs: null,
      endMs: null,
      words: [{ id: 'w5', text: 'Sin', startMs: null, endMs: null }],
    },
  ];
}

describe('shiftTimings', () => {
  it('desplaza marcas positivas y negativas en líneas y palabras respetando null y límites', () => {
    const original = makeSampleLines();
    const snapshot = JSON.stringify(original);

    const negative = shiftTimings(original, -200, 6000);
    expect(negative.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(negative[0]?.startMs).toBe(0);
    expect(negative[0]?.endMs).toBe(1000);
    expect(negative[0]?.words[0]?.startMs).toBe(0);
    expect(negative[0]?.words[0]?.endMs).toBe(400);
    expect(negative[0]?.words[1]?.startMs).toBe(450);
    expect(negative[0]?.words[1]?.endMs).toBeNull();

    expect(negative[1]?.startMs).toBe(4600);
    expect(negative[1]?.endMs).toBe(5700);
    expect(negative[1]?.words[0]?.startMs).toBeNull();
    expect(negative[1]?.words[1]?.startMs).toBe(5000);
    expect(negative[1]?.words[1]?.endMs).toBe(5700);

    expect(negative[2]?.startMs).toBeNull();
    expect(negative[2]?.endMs).toBeNull();

    const positive = shiftTimings(original, 300, 6000);
    expect(positive[0]?.startMs).toBe(400);
    expect(positive[1]?.endMs).toBe(6000);
    expect(positive[1]?.words[1]?.endMs).toBe(6000);

    // No muta la entrada original
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('calcula vista previa de primera y última marca antes y después', () => {
    const lines = makeSampleLines();
    const preview = getShiftTimingsPreview(lines, -200, 6000);
    expect(preview).toEqual({
      hasMarks: true,
      firstBeforeMs: 100,
      firstAfterMs: 0,
      lastBeforeMs: 5900,
      lastAfterMs: 5700,
    });

    const emptyPreview = getShiftTimingsPreview(
      [lines[2]!],
      -200,
      6000,
    );
    expect(emptyPreview.hasMarks).toBe(false);
  });
});
