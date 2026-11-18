import { describe, expect, it } from 'vitest';
import {
  nudgeLineTime,
  stampLineEnd,
  stampLineStart,
  undoLineSync,
} from '@/features/sync/model/lineSync';
import type { LyricLine } from '@/types';

const makeLines = (): LyricLine[] => [
  { id: 'l1', text: 'Primera línea', startMs: null, endMs: null, words: [] },
  { id: 'l2', text: 'Segunda línea', startMs: null, endMs: null, words: [] },
  { id: 'l3', text: 'Tercera línea', startMs: null, endMs: null, words: [] },
];

describe('lineSync', () => {
  it('marca el inicio de línea y avanza al siguiente índice si lineHoldMode es false', () => {
    const original = makeLines();
    const res1 = stampLineStart(original, 0, 1500, false);

    expect(original[0]?.startMs).toBeNull();
    expect(res1.lines[0]?.startMs).toBe(1500);
    expect(res1.nextLineIndex).toBe(1);

    const res2 = stampLineStart(res1.lines, 1, 5200, false);
    expect(res2.lines[0]?.endMs).toBe(5160);
    expect(res2.lines[1]?.startMs).toBe(5200);
    expect(res2.nextLineIndex).toBe(2);
  });

  it('no avanza de línea cuando lineHoldMode es true', () => {
    const res = stampLineStart(makeLines(), 0, 1500, true);
    expect(res.nextLineIndex).toBe(0);
  });

  it('marca el fin de línea respetando duración mínima de 150 ms', () => {
    const started = stampLineStart(makeLines(), 0, 2000, true).lines;
    const ended = stampLineEnd(started, 0, 2050, true);
    expect(ended.lines[0]?.endMs).toBe(2150);
    expect(ended.nextLineIndex).toBe(1);
  });

  it('deshace la línea anterior y calcula el rebobinado mínimo en 0 ms', () => {
    const started = stampLineStart(makeLines(), 0, 1000, false);
    const undone = undoLineSync(started.lines, started.nextLineIndex, 1500);
    expect(undone.lines[0]?.startMs).toBeNull();
    expect(undone.lines[0]?.endMs).toBeNull();
    expect(undone.nextLineIndex).toBe(0);
    expect(undone.rewindTargetMs).toBe(0);
  });

  it('deshace sin marcas previas usando fallback de -2500 ms', () => {
    const undone = undoLineSync(makeLines(), 0, 4000);
    expect(undone.rewindTargetMs).toBe(1500);
  });

  it('aplica nudge de línea en pasos de 10 ms y 50 ms sin bajar de 0', () => {
    const started = stampLineStart(makeLines(), 0, 30, true).lines;
    const plus10 = nudgeLineTime(started, 0, 'startMs', 10);
    expect(plus10[0]?.startMs).toBe(40);
    const minus50 = nudgeLineTime(plus10, 0, 'startMs', -50);
    expect(minus50[0]?.startMs).toBe(0);
  });
});
