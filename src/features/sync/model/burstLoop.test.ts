import { describe, expect, it } from 'vitest';
import {
  computeBurstEnterState,
  computeBurstExitState,
  getBurstLoopSeekTargetMs,
} from './burstLoop';

describe('burstLoop', () => {
  it('entrar a Ráfaga no inicia reproducción automáticamente', () => {
    const enter = computeBurstEnterState();
    expect(enter.burstActive).toBe(true);
    expect(enter.shouldPlay).toBe(false);
    expect(enter.shouldPause).toBe(false);
  });

  it('salir de Ráfaga detiene el bucle y limpia temporizador', () => {
    const exitActive = computeBurstExitState(true);
    expect(exitActive).toEqual({
      burstActive: false,
      shouldPlay: false,
      shouldPause: true,
      shouldClearTimer: true,
    });

    const exitInactive = computeBurstExitState(false);
    expect(exitInactive.shouldPause).toBe(false);
    expect(exitInactive.shouldClearTimer).toBe(true);
  });

  it('solo reinicia el bucle cuando está activo, reproduciendo, editando y supera windowEndMs', () => {
    expect(
      getBurstLoopSeekTargetMs({
        burstActive: true,
        isPlaying: false,
        isEditing: true,
        currentTimeMs: 9000,
        windowStartMs: 2000,
        windowEndMs: 8000,
      }),
    ).toBeNull();

    expect(
      getBurstLoopSeekTargetMs({
        burstActive: false,
        isPlaying: true,
        isEditing: true,
        currentTimeMs: 9000,
        windowStartMs: 2000,
        windowEndMs: 8000,
      }),
    ).toBeNull();

    expect(
      getBurstLoopSeekTargetMs({
        burstActive: true,
        isPlaying: true,
        isEditing: false,
        currentTimeMs: 9000,
        windowStartMs: 2000,
        windowEndMs: 8000,
      }),
    ).toBeNull();

    expect(
      getBurstLoopSeekTargetMs({
        burstActive: true,
        isPlaying: true,
        isEditing: true,
        currentTimeMs: 5000,
        windowStartMs: 2000,
        windowEndMs: 8000,
      }),
    ).toBeNull();

    expect(
      getBurstLoopSeekTargetMs({
        burstActive: true,
        isPlaying: true,
        isEditing: true,
        currentTimeMs: 8000,
        windowStartMs: 2000,
        windowEndMs: 8000,
      }),
    ).toBe(2000);
  });
});
