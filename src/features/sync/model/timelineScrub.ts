export const TIMELINE_COLLAPSE_DELAY_MS = 900;
export const TIMELINE_SEEK_THROTTLE_MS = 75;

/**
 * Calcula la proporción [0, 1] de un puntero dentro de un rectángulo horizontal.
 */
export function computePointerRatio(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
): number {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(rectLeft) ||
    !Number.isFinite(rectWidth) ||
    rectWidth <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(1, (clientX - rectLeft) / rectWidth));
}

/**
 * Convierte la coordenada horizontal del puntero en milisegundos acotados a [0, durationMs].
 */
export function computePointerTimeMs(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  durationMs: number,
): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  const ratio = computePointerRatio(clientX, rectLeft, rectWidth);
  return Math.max(0, Math.min(Math.round(durationMs), Math.round(ratio * durationMs)));
}

/**
 * Acota la posición porcentual del indicador flotante para evitar recortes en los bordes.
 */
export function computeFloatingIndicatorLeftPct(progressPct: number): number {
  if (!Number.isFinite(progressPct)) {
    return 50;
  }
  return Math.max(10, Math.min(90, progressPct));
}

export interface TimelineInteractionState {
  expanded: boolean;
  dragging: boolean;
}

/**
 * Máquina de estados pura para expandir/compactar la barra de tiempo sin saltos.
 */
export function reduceTimelineInteraction(
  state: TimelineInteractionState,
  event: 'pointerdown' | 'pointerup' | 'pointercancel' | 'timeout' | 'focus' | 'blur',
): TimelineInteractionState {
  switch (event) {
    case 'pointerdown':
      return { expanded: true, dragging: true };
    case 'pointerup':
    case 'pointercancel':
      return { expanded: state.expanded, dragging: false };
    case 'timeout':
      return state.dragging ? state : { expanded: false, dragging: false };
    case 'focus':
      return { expanded: true, dragging: state.dragging };
    case 'blur':
      return state.dragging ? state : { expanded: false, dragging: false };
  }
}

/**
 * Determina si corresponde emitir un seek intermedio durante el arrastre según el intervalo mínimo.
 */
export function shouldThrottleSeek(
  nowMs: number,
  lastSeekAtMs: number,
  throttleMs = TIMELINE_SEEK_THROTTLE_MS,
): boolean {
  return nowMs - lastSeekAtMs >= throttleMs;
}
