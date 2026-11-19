import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { computeCenteredScrollTop } from '@/features/sync/components/syncViewHelpers';

const SCROLL_ANIMATION_MS = 220;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function cancelScrollAnimationRef(rafRef: MutableRefObject<number | null>): void {
  if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
}

export interface AnimateScrollToCenterParams {
  container: HTMLElement;
  targetEl: HTMLElement;
  instant: boolean;
  rafRef: MutableRefObject<number | null>;
  onProgrammaticScroll?: () => void;
}

/**
 * Centra verticalmente `targetEl` dentro de `container` reutilizando `computeCenteredScrollTop`,
 * con animación suave cancelable o salto instantáneo si `instant` o `prefers-reduced-motion`.
 */
export function animateScrollToCenter({
  container,
  targetEl,
  instant,
  rafRef,
  onProgrammaticScroll,
}: AnimateScrollToCenterParams): void {
  if (typeof container.getBoundingClientRect !== 'function') {
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const targetScrollTop = computeCenteredScrollTop({
    containerScrollTop: container.scrollTop,
    containerClientHeight: container.clientHeight,
    containerScrollHeight: container.scrollHeight,
    containerTop: containerRect.top,
    elementTop: targetRect.top,
    elementHeight: targetRect.height,
  });

  cancelScrollAnimationRef(rafRef);

  if (
    instant ||
    prefersReducedMotion() ||
    typeof requestAnimationFrame !== 'function' ||
    Math.abs(targetScrollTop - container.scrollTop) < 1
  ) {
    onProgrammaticScroll?.();
    container.scrollTop = targetScrollTop;
    return;
  }

  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / SCROLL_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    onProgrammaticScroll?.();
    container.scrollTop = startScrollTop + distance * eased;
    if (progress < 1) {
      rafRef.current = requestAnimationFrame(step);
    } else {
      rafRef.current = null;
    }
  };

  rafRef.current = requestAnimationFrame(step);
}

export interface UseCenteredListScrollOptions {
  containerRef: RefObject<HTMLElement | null>;
  itemRefs: MutableRefObject<(HTMLElement | null)[]>;
  targetIndex: number;
  enabled?: boolean;
  itemCount: number;
}

/**
 * Mantiene centrada la línea activa o seleccionada en un contenedor con scroll,
 * cediendo ante el scroll manual del usuario hasta que cambie `targetIndex`.
 */
export function useCenteredListScroll({
  containerRef,
  itemRefs,
  targetIndex,
  enabled = true,
  itemCount,
}: UseCenteredListScrollOptions): void {
  const scrollRafRef = useRef<number | null>(null);
  const userScrolledRef = useRef(false);
  const hasCenteredInitiallyRef = useRef(false);
  const lastTargetIndexRef = useRef<number>(-1);
  const lastProgrammaticAtRef = useRef<number>(0);

  const markProgrammaticScroll = useCallback(() => {
    lastProgrammaticAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, []);

  // Detecta scroll manual del usuario para no pelear con él; se limpia al cambiar de línea.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const pauseAutoCenter = () => {
      cancelScrollAnimationRef(scrollRafRef);
      userScrolledRef.current = true;
    };

    const handleScroll = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const isProgrammatic =
        scrollRafRef.current !== null || now - lastProgrammaticAtRef.current < 80;
      if (!isProgrammatic) {
        userScrolledRef.current = true;
      }
    };

    container.addEventListener('wheel', pauseAutoCenter, { passive: true });
    container.addEventListener('touchstart', pauseAutoCenter, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', pauseAutoCenter);
      container.removeEventListener('touchstart', pauseAutoCenter);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef]);

  // Centra cuando cambia la línea objetivo o se reactiva el modo.
  useEffect(() => {
    if (!enabled) {
      cancelScrollAnimationRef(scrollRafRef);
      hasCenteredInitiallyRef.current = false;
      return;
    }
    if (targetIndex < 0 || targetIndex >= itemCount) {
      return;
    }
    if (targetIndex !== lastTargetIndexRef.current) {
      userScrolledRef.current = false;
      lastTargetIndexRef.current = targetIndex;
    }
    if (userScrolledRef.current) {
      return;
    }
    const container = containerRef.current;
    const targetEl = itemRefs.current[targetIndex];
    if (!container || !targetEl) {
      return;
    }
    const isInitial = !hasCenteredInitiallyRef.current;
    hasCenteredInitiallyRef.current = true;
    animateScrollToCenter({
      container,
      targetEl,
      instant: isInitial,
      rafRef: scrollRafRef,
      onProgrammaticScroll: markProgrammaticScroll,
    });
  }, [containerRef, enabled, itemCount, itemRefs, markProgrammaticScroll, targetIndex]);

  // Re-centra al redimensionar el contenedor si el usuario no desplazó manualmente.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const idx = lastTargetIndexRef.current;
      const targetEl = itemRefs.current[idx];
      if (enabled && !userScrolledRef.current && idx >= 0 && targetEl) {
        animateScrollToCenter({
          container,
          targetEl,
          instant: true,
          rafRef: scrollRafRef,
          onProgrammaticScroll: markProgrammaticScroll,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, enabled, itemRefs, markProgrammaticScroll]);

  useEffect(() => () => cancelScrollAnimationRef(scrollRafRef), []);
}
