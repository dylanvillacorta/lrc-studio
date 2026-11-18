import { describe, expect, it } from 'vitest';
import { popSyncHistory, pushSyncHistory } from '@/features/sync/model/history';

describe('history', () => {
  it('devuelve snapshot null cuando se intenta deshacer sin historial', () => {
    const res = popSyncHistory([]);
    expect(res.snapshot).toBeNull();
    expect(res.remaining).toEqual([]);
  });

  it('apila y extrae instantáneas respetando el límite máximo', () => {
    let stack = pushSyncHistory([], { lines: [], activeLineIndex: 0, activeWordIndex: 0 }, 2);
    stack = pushSyncHistory(stack, { lines: [], activeLineIndex: 1, activeWordIndex: 0 }, 2);
    stack = pushSyncHistory(stack, { lines: [], activeLineIndex: 2, activeWordIndex: 1 }, 2);

    expect(stack).toHaveLength(2);
    const popped1 = popSyncHistory(stack);
    expect(popped1.snapshot?.activeLineIndex).toBe(2);
    expect(popped1.remaining).toHaveLength(1);

    const popped2 = popSyncHistory(popped1.remaining);
    expect(popped2.snapshot?.activeLineIndex).toBe(1);
    expect(popped2.remaining).toEqual([]);

    const poppedEmpty = popSyncHistory(popped2.remaining);
    expect(poppedEmpty.snapshot).toBeNull();
    expect(poppedEmpty.remaining).toEqual([]);
  });
});
