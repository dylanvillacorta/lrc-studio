import { describe, expect, it } from 'vitest';
import {
  nextPendingSeekMs,
  shouldApplySeek,
} from '@/features/sync/hooks/audioSeekLogic';

describe('prioridad de seeks pendientes (T26)', () => {
  it('un seek de restauración se aplica si el usuario aún no movió el slider', () => {
    expect(shouldApplySeek('restore', false)).toBe(true);
    expect(nextPendingSeekMs(null, 42_000, 'restore', false)).toBe(42_000);
  });

  it('un seek de restauración no pisa un seek previo del usuario', () => {
    expect(shouldApplySeek('restore', true)).toBe(false);
    expect(nextPendingSeekMs(10_000, 42_000, 'restore', true)).toBe(10_000);
  });

  it('el último seek del usuario siempre prevalece', () => {
    expect(nextPendingSeekMs(42_000, 10_000, 'user', false)).toBe(10_000);
    expect(nextPendingSeekMs(10_000, 5_000, 'user', true)).toBe(5_000);
  });
});
