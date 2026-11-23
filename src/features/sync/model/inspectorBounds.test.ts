import { describe, expect, it } from 'vitest';
import {
  MIN_LINE_DURATION_MS,
  applyInspectorDelta,
  computeDraggedEdge,
  normalizeLineBounds,
  snapMs,
} from './inspectorBounds';

describe('inspectorBounds', () => {
  describe('computeDraggedEdge y normalizeLineBounds', () => {
    it('impide que inicio supere fin menos 50 ms (bordes cruzados)', () => {
      const res = computeDraggedEdge({
        edge: 'start',
        targetMs: 5500,
        startMs: 3000,
        endMs: 5000,
        durationMs: 20_000,
      });
      expect(res.startMs).toBe(5000 - MIN_LINE_DURATION_MS);
      expect(res.endMs).toBe(5000);
    });

    it('impide que fin baje de inicio más 50 ms (bordes cruzados)', () => {
      const res = computeDraggedEdge({
        edge: 'end',
        targetMs: 2500,
        startMs: 3000,
        endMs: 5000,
        durationMs: 20_000,
      });
      expect(res.startMs).toBe(3000);
      expect(res.endMs).toBe(3000 + MIN_LINE_DURATION_MS);
    });

    it('limita bordes a 0 y a durationMs', () => {
      const atZero = computeDraggedEdge({
        edge: 'start',
        targetMs: -400,
        startMs: 500,
        endMs: 2000,
        durationMs: 10_000,
      });
      expect(atZero.startMs).toBe(0);

      const atDuration = computeDraggedEdge({
        edge: 'end',
        targetMs: 12_500,
        startMs: 8000,
        endMs: 9500,
        durationMs: 10_000,
      });
      expect(atDuration.endMs).toBe(10_000);
    });

    it('aplica snapping opcional al arrastrar', () => {
      expect(snapMs(1234, 25)).toBe(1225);
      expect(snapMs(1238, 25)).toBe(1250);

      const snapped = computeDraggedEdge({
        edge: 'start',
        targetMs: 1238,
        startMs: 1000,
        endMs: 3000,
        durationMs: 10_000,
        snapStepMs: 25,
      });
      expect(snapped.startMs).toBe(1250);
    });

    it('normaliza líneas con startMs/endMs invertidos o nulos', () => {
      const inverted = normalizeLineBounds(
        { startMs: 6000, endMs: 4000 },
        10_000,
      );
      expect(inverted.startMs).toBe(6000);
      expect(inverted.endMs).toBe(6050);

      const nulls = normalizeLineBounds({ startMs: null, endMs: null }, 10_000);
      expect(nulls.startMs).toBe(0);
      expect(nulls.endMs).toBe(2000);
    });
  });

  describe('applyInspectorDelta', () => {
    it('aplica deltas de ±10 ms y ±50 ms respetando límites y 50 ms mínimos', () => {
      const plus10 = applyInspectorDelta(
        { startMs: 1000, endMs: 2000 },
        'start',
        10,
        10_000,
      );
      expect(plus10).toEqual({ startMs: 1010, endMs: 2000 });

      const minus50AtZero = applyInspectorDelta(
        { startMs: 20, endMs: 2000 },
        'start',
        -50,
        10_000,
      );
      expect(minus50AtZero).toEqual({ startMs: 0, endMs: 2000 });

      const crossedEnd = applyInspectorDelta(
        { startMs: 1000, endMs: 1060 },
        'end',
        -50,
        10_000,
      );
      expect(crossedEnd).toEqual({ startMs: 1000, endMs: 1050 });
    });
  });
});
