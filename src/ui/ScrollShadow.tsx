import { useCallback, useEffect, useRef, type ReactNode } from 'react';

export interface ScrollShadowState {
  canScrollUp: boolean;
  canScrollDown: boolean;
}

/**
 * Calcula si existe contenido oculto arriba o abajo en un contenedor con scroll vertical.
 */
export function computeScrollShadows(metrics: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): ScrollShadowState {
  const canScrollUp = metrics.scrollTop > 1;
  const canScrollDown =
    metrics.scrollTop + metrics.clientHeight < metrics.scrollHeight - 1;
  return { canScrollUp, canScrollDown };
}

export interface ScrollShadowProps {
  children: ReactNode;
  /** Clases para el contenedor envolvente exterior. */
  className?: string;
  /** Clases para el elemento interno con `overflow-y-auto`. */
  contentClassName?: string;
  /** Etiqueta semántica del área scrollable (`div` por defecto, o `main`). */
  as?: 'div' | 'main';
  'aria-label'?: string;
}

/**
 * Contenedor con degradados suaves arriba y abajo que aparecen solo cuando hay
 * contenido oculto en esa dirección, sin provocar re-renders durante el scroll.
 */
export function ScrollShadow({
  children,
  className = '',
  contentClassName = '',
  as = 'div',
  'aria-label': ariaLabel,
}: ScrollShadowProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const syncScrollIndicators = useCallback(() => {
    const wrapper = wrapperRef.current;
    const scroller = scrollRef.current;
    if (!wrapper || !scroller) {
      return;
    }
    const { canScrollUp, canScrollDown } = computeScrollShadows({
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    });
    wrapper.dataset.scrollUp = canScrollUp ? 'true' : 'false';
    wrapper.dataset.scrollDown = canScrollDown ? 'true' : 'false';
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }

    syncScrollIndicators();

    const handleScroll = () => {
      syncScrollIndicators();
    };
    scroller.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncScrollIndicators();
      });
      resizeObserver.observe(scroller);
    }

    let mutationObserver: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        syncScrollIndicators();
      });
      mutationObserver.observe(scroller, { childList: true, subtree: true });
    }

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [syncScrollIndicators]);

  const ScrollTag = as;

  return (
    <div
      ref={wrapperRef}
      data-scroll-up="false"
      data-scroll-down="false"
      className={`group/scroll relative flex flex-col min-h-0 ${className}`.trim()}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 inset-x-0 h-6 z-10 opacity-0 group-data-[scroll-up=true]/scroll:opacity-100 transition-opacity duration-150 motion-reduce:transition-none"
        style={{
          background: 'linear-gradient(to bottom, var(--color-bg), transparent)',
        }}
      />
      <ScrollTag
        ref={scrollRef as never}
        aria-label={ariaLabel}
        className={`flex-1 min-h-0 overflow-y-auto ${contentClassName}`.trim()}
      >
        {children}
      </ScrollTag>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 inset-x-0 h-6 z-10 opacity-0 group-data-[scroll-down=true]/scroll:opacity-100 transition-opacity duration-150 motion-reduce:transition-none"
        style={{
          background: 'linear-gradient(to top, var(--color-bg), transparent)',
        }}
      />
    </div>
  );
}
