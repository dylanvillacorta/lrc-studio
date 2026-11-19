import { describe, expect, it } from 'vitest';
import {
  clearLineMark,
  clearMarksFromLine,
  nudgeLineTime,
  setLineStartTime,
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

  it('tolera arreglo de líneas vacío sin fallar', () => {
    expect(stampLineStart([], 0, 1000)).toEqual({ lines: [], nextLineIndex: 0 });
    expect(stampLineEnd([], 0, 1000)).toEqual({ lines: [], nextLineIndex: 0 });
    expect(undoLineSync([], 0, 4000)).toEqual({
      lines: [],
      nextLineIndex: 0,
      rewindTargetMs: 1500,
    });
    expect(nudgeLineTime([], 0, 'startMs', 50)).toEqual([]);
  });

  it('maneja tiempos iguales y fin menor que inicio al marcar líneas', () => {
    const s1 = stampLineStart(makeLines(), 0, 2000, false);
    const s2 = stampLineStart(s1.lines, 1, 2000, false);
    expect(s2.lines[0]?.endMs).toBe(2100);
    expect(s2.lines[1]?.startMs).toBe(2000);

    // Fin menor que inicio al usar stampLineEnd -> respeta mínimo +150 ms
    const endedEarly = stampLineEnd(s2.lines, 1, 1500, true);
    expect(endedEarly.lines[1]?.endMs).toBe(2150);

    // Re-marcar inicio después del fin existente limpia el endMs inválido
    const reStamped = stampLineStart(endedEarly.lines, 1, 3000, true);
    expect(reStamped.lines[1]?.startMs).toBe(3000);
    expect(reStamped.lines[1]?.endMs).toBeNull();
  });

  it('permite deshacer varias veces seguidas hasta la primera línea', () => {
    const s1 = stampLineStart(makeLines(), 0, 3000, false);
    const s2 = stampLineStart(s1.lines, s1.nextLineIndex, 6000, false);
    expect(s2.nextLineIndex).toBe(2);

    const u1 = undoLineSync(s2.lines, s2.nextLineIndex, 7000);
    expect(u1.nextLineIndex).toBe(1);
    expect(u1.lines[1]?.startMs).toBeNull();
    expect(u1.rewindTargetMs).toBe(4000);

    const u2 = undoLineSync(u1.lines, u1.nextLineIndex, 4000);
    expect(u2.nextLineIndex).toBe(0);
    expect(u2.lines[0]?.startMs).toBeNull();
    expect(u2.rewindTargetMs).toBe(1000);

    const u3 = undoLineSync(u2.lines, u2.nextLineIndex, 1000);
    expect(u3.nextLineIndex).toBe(0);
    expect(u3.rewindTargetMs).toBe(0);
  });

  it('borra la marca de una línea y sus palabras y la deja como objetivo', () => {
    const linesWithWords: LyricLine[] = [
      {
        id: 'l1',
        text: 'Primera línea',
        startMs: 1000,
        endMs: 2500,
        words: [{ id: 'w1', text: 'Primera', startMs: 1000, endMs: 1500 }],
      },
      { id: 'l2', text: 'Segunda línea', startMs: 3000, endMs: 4500, words: [] },
    ];
    const cleared = clearLineMark(linesWithWords, 0);
    expect(cleared.nextLineIndex).toBe(0);
    expect(cleared.lines[0]?.startMs).toBeNull();
    expect(cleared.lines[0]?.endMs).toBeNull();
    expect(cleared.lines[0]?.words[0]?.startMs).toBeNull();
    expect(cleared.lines[0]?.words[0]?.endMs).toBeNull();
    expect(cleared.lines[1]?.startMs).toBe(3000);
  });

  it('borra marcas desde una línea hacia abajo dejando las anteriores intactas', () => {
    const lines: LyricLine[] = [
      { id: 'l1', text: 'Uno', startMs: 1000, endMs: 2000, words: [] },
      { id: 'l2', text: 'Dos', startMs: 2100, endMs: 3000, words: [{ id: 'w2', text: 'Dos', startMs: 2100, endMs: 2900 }] },
      { id: 'l3', text: 'Tres', startMs: 3100, endMs: 4000, words: [] },
    ];
    const cleared = clearMarksFromLine(lines, 1);
    expect(cleared.nextLineIndex).toBe(1);
    expect(cleared.lines[0]?.startMs).toBe(1000);
    expect(cleared.lines[1]?.startMs).toBeNull();
    expect(cleared.lines[1]?.words[0]?.startMs).toBeNull();
    expect(cleared.lines[2]?.startMs).toBeNull();
  });

  it('fija startMs manual y limpia endMs si queda menor o igual', () => {
    const lines: LyricLine[] = [
      { id: 'l1', text: 'Uno', startMs: 1000, endMs: 2000, words: [] },
    ];
    const updatedValid = setLineStartTime(lines, 0, 1500);
    expect(updatedValid[0]?.startMs).toBe(1500);
    expect(updatedValid[0]?.endMs).toBe(2000);

    const updatedResetEnd = setLineStartTime(lines, 0, 2500);
    expect(updatedResetEnd[0]?.startMs).toBe(2500);
    expect(updatedResetEnd[0]?.endMs).toBeNull();
  });
});
