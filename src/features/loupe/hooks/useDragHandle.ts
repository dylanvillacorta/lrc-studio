import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UseDragHandleOptions {
  /** Convierte `clientX` de pantalla a milisegundos dentro de la ventana. */
  clientXToMs: (clientX: number) => number;
  /** Posición actual del borde en ms: permite conservar el offset de agarre al tomarlo. */
  edgeMs?: number;
  /** Se ejecuta en cada movimiento mientras el borde está capturado. */
  onDrag: (targetMs: number) => void;
  /** Se ejecuta al iniciar el arrastre. */
  onDragStart?: (initialMs: number) => void;
  /** Se ejecuta al soltar normalmente el puntero. */
  onDragEnd?: (finalMs: number) => void;
  /** Se ejecuta si el navegador cancela el gesto (`pointercancel`). */
  onDragCancel?: () => void;
  disabled?: boolean;
}

export interface DragHandleHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface UseDragHandleReturn {
  isDragging: boolean;
  handlers: DragHandleHandlers;
}

/**
 * Hook de arrastre inmediato mediante Pointer Events con `setPointerCapture`,
 * `touch-action: none` (aplicado en el manejador) y cancelación por `pointercancel`.
 */
export function useDragHandle({
  clientXToMs,
  edgeMs,
  onDrag,
  onDragStart,
  onDragEnd,
  onDragCancel,
  disabled = false,
}: UseDragHandleOptions): UseDragHandleReturn {
  const [isDragging, setIsDragging] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const grabOffsetMsRef = useRef(0);

  const releaseCapture = useCallback(
    (target: HTMLElement, pointerId: number) => {
      if (
        typeof target.hasPointerCapture === 'function' &&
        target.hasPointerCapture(pointerId)
      ) {
        target.releasePointerCapture(pointerId);
      }
      activePointerIdRef.current = null;
      setIsDragging(false);
    },
    [],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }
      if (event.button !== 0 && event.pointerType === 'mouse') {
        return;
      }
      event.preventDefault();
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      activePointerIdRef.current = event.pointerId;
      setIsDragging(true);

      // El borde sigue al dedo desde donde se agarró: se conserva la distancia dedo-borde.
      const pointerMs = clientXToMs(event.clientX);
      grabOffsetMsRef.current = edgeMs === undefined ? 0 : pointerMs - edgeMs;
      const initialMs = pointerMs - grabOffsetMsRef.current;
      onDragStart?.(initialMs);
      onDrag(initialMs);
    },
    [clientXToMs, disabled, edgeMs, onDrag, onDragStart],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }
      const nextMs = clientXToMs(event.clientX) - grabOffsetMsRef.current;
      onDrag(nextMs);
    },
    [clientXToMs, onDrag],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }
      const finalMs = clientXToMs(event.clientX) - grabOffsetMsRef.current;
      releaseCapture(event.currentTarget, event.pointerId);
      onDragEnd?.(finalMs);
    },
    [clientXToMs, onDragEnd, releaseCapture],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }
      releaseCapture(event.currentTarget, event.pointerId);
      onDragCancel?.();
    },
    [onDragCancel, releaseCapture],
  );

  return {
    isDragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
