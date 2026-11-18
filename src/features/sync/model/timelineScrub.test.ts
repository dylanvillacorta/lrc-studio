import { describe, expect, it } from 'vitest';
import {
  computeFloatingIndicatorLeftPct,
  computePointerRatio,
  computePointerTimeMs,
  reduceTimelineInteraction,
  shouldThrottleSeek,
} from './timelineScrub';

describe('timelineScrub', () => {
  it('calcula proporción y tiempo con clamp entre 0 y durationMs', () => {
    expect(computePointerRatio(50, 100, 200)).toBe(0);
    expect(computePointerRatio(400, 100, 200)).toBe(1);
    expect(computePointerRatio(200, 100, 200)).toBe(0.5);
    expect(computePointerRatio(200, 100, 0)).toBe(0);

    expect(computePointerTimeMs(50, 100, 200, 30_000)).toBe(0);
    expect(computePointerTimeMs(200, 100, 200, 30_000)).toBe(15_000);
    expect(computePointerTimeMs(500, 100, 200, 30_000)).toBe(30_000);
    expect(computePointerTimeMs(200, 100, 200, 0)).toBe(0);
    expect(computePointerTimeMs(Number.NaN, 100, 200, 30_000)).toBe(0);
  });

  it('acota el indicador flotante entre 10% y 90%', () => {
    expect(computeFloatingIndicatorLeftPct(0)).toBe(10);
    expect(computeFloatingIndicatorLeftPct(50)).toBe(50);
    expect(computeFloatingIndicatorLeftPct(100)).toBe(90);
    expect(computeFloatingIndicatorLeftPct(Number.NaN)).toBe(50);
  });

  it('gestiona expansión y compactación de la barra sin perder arrastre activo', () => {
    const initial = { expanded: false, dragging: false };
    const down = reduceTimelineInteraction(initial, 'pointerdown');
    expect(down).toEqual({ expanded: true, dragging: true });

    // Timeout mientras arrastra no colapsa
    expect(reduceTimelineInteraction(down, 'timeout')).toEqual({
      expanded: true,
      dragging: true,
    });

    const up = reduceTimelineInteraction(down, 'pointerup');
    expect(up).toEqual({ expanded: true, dragging: false });

    expect(reduceTimelineInteraction(up, 'timeout')).toEqual({
      expanded: false,
      dragging: false,
    });

    expect(reduceTimelineInteraction(down, 'pointercancel')).toEqual({
      expanded: true,
      dragging: false,
    });
  });

  it('aplica throttle al seek durante arrastre', () => {
    expect(shouldThrottleSeek(1000, 950, 75)).toBe(false);
    expect(shouldThrottleSeek(1075, 1000, 75)).toBe(true);
  });
});
