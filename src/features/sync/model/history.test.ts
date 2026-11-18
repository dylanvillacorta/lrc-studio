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
    const popped = popSyncHistory(stack);
    expect(popped.snapshot?.activeLineIndex).toBe(2);
    expect(popped.remaining).toHaveLength(1);
  });
});
