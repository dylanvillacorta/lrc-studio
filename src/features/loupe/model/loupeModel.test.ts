import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@/types';
import {
  MIN_LINE_DURATION_MS,
  applyInspectorDelta,
  computeDraggedEdge,
  computeZoomWindow,
  msToX,
  normalizeLineBounds,
  nudgeLoupeLine,
  snapMs,
  xToMs,
} from './loupeModel';

describe('loupeModel', () => {
  describe('computeZoomWindow', () => {
    it('calcula ventana con margen configurable alrededor de una línea', () => {
      const win = computeZoomWindow(
        { startMs: 10_000, endMs: 14_000 },
        60_000,
        { marginMs: 1500, minWindowMs: 2000 },
      );
      expect(win.windowStartMs).toBe(8500);
      expect(win.windowEndMs).toBe(15_500);
      expect(win.spanMs).toBe(7000);
      expect(win.zoomFactor).toBe(9);
    });

    it('limita la ventana al inicio (0 ms) y al final (durationMs)', () => {
      const winStart = computeZoomWindow(
        { startMs: 200, endMs: 1200 },
        30_000,
        { marginMs: 1500, minWindowMs: 2000 },
      );
      expect(winStart.windowStartMs).toBe(0);
      expect(winStart.windowEndMs).toBe(2700);

      const winEnd = computeZoomWindow(
        { startMs: 28_800, endMs: 29_900 },
        30_000,
        { marginMs: 1500, minWindowMs: 2000 },
      );
      expect(winEnd.windowStartMs).toBe(27_300);
      expect(winEnd.windowEndMs).toBe(30_000);
    });

    it('expande la ventana cuando es más corta que el mínimo configurado', () => {
      const win = computeZoomWindow(
        { startMs: 10_000, endMs: 10_200 },
        60_000,
        { marginMs: 100, minWindowMs: 2000 },
      );
      expect(win.spanMs).toBe(2000);
      expect(win.windowStartMs).toBeLessThanOrEqual(10_000);
      expect(win.windowEndMs).toBeGreaterThanOrEqual(10_200);
    });

    it('ajusta ventana mínima pegada al borde 0 o a durationMs', () => {
      const nearZero = computeZoomWindow(
        { startMs: 0, endMs: 100 },
        10_000,
        { marginMs: 0, minWindowMs: 2000 },
      );
      expect(nearZero.windowStartMs).toBe(0);
      expect(nearZero.windowEndMs).toBe(2000);

      const nearEnd = computeZoomWindow(
        { startMs: 9900, endMs: 10_000 },
        10_000,
        { marginMs: 0, minWindowMs: 2000 },
      );
      expect(nearEnd.windowStartMs).toBe(8000);
      expect(nearEnd.windowEndMs).toBe(10_000);
    });

    it('maneja duración total menor que el mínimo de ventana y duración 0', () => {
      const shortAudio = computeZoomWindow(
        { startMs: 100, endMs: 500 },
        800,
        { marginMs: 200, minWindowMs: 2000 },
      );
      expect(shortAudio.windowStartMs).toBe(0);
      expect(shortAudio.windowEndMs).toBe(800);
      expect(shortAudio.spanMs).toBe(800);

      const emptyAudio = computeZoomWindow({ startMs: null, endMs: null }, 0);
      expect(emptyAudio.windowStartMs).toBe(0);
      expect(emptyAudio.windowEndMs).toBe(0);
      expect(emptyAudio.spanMs).toBe(0);
    });
  });

  describe('msToX y xToMs', () => {
    it('convierte bidireccionalmente con límite estricto', () => {
      expect(msToX(5000, 5000, 15_000, 400)).toBe(0);
      expect(msToX(10_000, 5000, 15_000, 400)).toBe(200);
      expect(msToX(15_000, 5000, 15_000, 400)).toBe(400);

      // Clamp fuera de rango
      expect(msToX(2000, 5000, 15_000, 400)).toBe(0);
      expect(msToX(20_000, 5000, 15_000, 400)).toBe(400);

      expect(xToMs(200, 5000, 15_000, 400)).toBe(10_000);
      expect(xToMs(-50, 5000, 15_000, 400)).toBe(5000);
      expect(xToMs(900, 5000, 15_000, 400)).toBe(15_000);
    });

    it('retorna valores seguros ante ancho o ventana inválidos', () => {
      expect(msToX(5000, 1000, 1000, 400)).toBe(0);
      expect(msToX(5000, 1000, 2000, 0)).toBe(0);
      expect(xToMs(100, 1000, 1000, 400)).toBe(1000);
      expect(xToMs(100, 1000, 2000, 0)).toBe(1000);
    });
  });

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

  describe('applyInspectorDelta y nudgeLoupeLine', () => {
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

    it('nudgeLoupeLine actualiza la línea vía nudgeLineTime respetando durationMs', () => {
      const lines: LyricLine[] = [
        { id: '1', text: 'Uno', startMs: 1000, endMs: 2980, words: [] },
      ];
      const updated = nudgeLoupeLine(lines, 0, 'endMs', 50, 3000);
      expect(updated[0]?.endMs).toBe(3000);
    });
  });
});
