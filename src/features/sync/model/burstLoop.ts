export interface BurstLoopCheckParams {
  burstActive: boolean;
  isPlaying: boolean;
  isEditing?: boolean;
  currentTimeMs: number;
  windowStartMs: number;
  windowEndMs: number;
}

export interface BurstTransitionResult {
  burstActive: boolean;
  shouldPlay: boolean;
  shouldPause: boolean;
  shouldClearTimer: boolean;
}

/**
 * Al entrar en la pestaña Ráfaga nunca se inicia la reproducción automáticamente.
 */
export function computeBurstEnterState(): BurstTransitionResult {
  return {
    burstActive: true,
    shouldPlay: false,
    shouldPause: false,
    shouldClearTimer: false,
  };
}

/**
 * Al salir de Ráfaga se detiene el bucle, se pausa y se limpia cualquier temporizador.
 */
export function computeBurstExitState(wasBurstActive: boolean): BurstTransitionResult {
  return {
    burstActive: false,
    shouldPlay: false,
    shouldPause: wasBurstActive,
    shouldClearTimer: true,
  };
}

/**
 * Devuelve el instante de reinicio del bucle cuando corresponde repetir la ventana, o `null`.
 */
export function getBurstLoopSeekTargetMs({
  burstActive,
  isPlaying,
  isEditing = true,
  currentTimeMs,
  windowStartMs,
  windowEndMs,
}: BurstLoopCheckParams): number | null {
  if (!burstActive || !isPlaying || !isEditing) {
    return null;
  }
  if (
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(windowEndMs) ||
    windowEndMs <= windowStartMs
  ) {
    return null;
  }
  if (currentTimeMs >= windowEndMs) {
    return Math.max(0, windowStartMs);
  }
  return null;
}
