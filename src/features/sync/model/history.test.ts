import { describe, expect, it } from 'vitest';
import {
  createSyncHistoryState,
  MAX_SYNC_HISTORY,
  popSyncHistory,
  pushSyncHistory,
  recordSyncHistory,
  redoSyncHistory,
  undoSyncHistory,
} from '@/features/sync/model/history';

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

  it('recorre varios niveles de deshacer y rehacer en orden y limpia rehacer tras nueva edición', () => {
    const snap = (idx: number) => ({ lines: [], activeLineIndex: idx, activeWordIndex: 0 });
    let state = createSyncHistoryState();
    state = recordSyncHistory(state, snap(0));
    state = recordSyncHistory(state, snap(1));
    state = recordSyncHistory(state, snap(2));

    const u1 = undoSyncHistory(state, snap(3));
    expect(u1.snapshot?.activeLineIndex).toBe(2);
    const u2 = undoSyncHistory(u1.state, snap(2));
    expect(u2.snapshot?.activeLineIndex).toBe(1);

    const r1 = redoSyncHistory(u2.state, snap(1));
    expect(r1.snapshot?.activeLineIndex).toBe(2);

    const afterEdit = recordSyncHistory(r1.state, snap(2));
    expect(afterEdit.future).toEqual([]);
  });

  it('mantiene un máximo de 50 pasos en el historial', () => {
    let state = createSyncHistoryState();
    for (let i = 0; i < 65; i++) {
      state = recordSyncHistory(state, { lines: [], activeLineIndex: i, activeWordIndex: 0 });
    }
    expect(state.past).toHaveLength(MAX_SYNC_HISTORY);
    expect(state.past[0]?.activeLineIndex).toBe(15);
    expect(state.past[49]?.activeLineIndex).toBe(64);
  });
});
