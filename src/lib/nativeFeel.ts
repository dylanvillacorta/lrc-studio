/**
 * Sensación de app nativa: sin zoom de página y sin selección de texto fuera
 * de los campos editables. La decisión (qué se previene) es pura y testeable;
 * `installNativeFeel` solo conecta los listeners a `document`/`window`.
 */

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

const ZOOM_KEYS = new Set(['+', '-', '=', '_', '0', 'Add', 'Subtract']);

/** Campo donde la usuaria escribe o copia texto: la selección debe funcionar. */
export function isEditableTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable === true) return true;
  return typeof target.closest === 'function' && Boolean(target.closest(EDITABLE_SELECTOR));
}

/** Ctrl/Cmd + rueda (incluye el pinch del trackpad) hace zoom del navegador. */
export function shouldPreventWheel(e: { ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return e.ctrlKey === true || e.metaKey === true;
}

/** Ctrl/Cmd + (+, -, =, 0) hace zoom del navegador; el resto de teclas no se toca. */
export function shouldPreventZoomKey(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  return ZOOM_KEYS.has(e.key);
}

/** Pinch de dos o más dedos (iOS Safari ignora user-scalable=no). */
export function shouldPreventTouchMove(e: { touches?: { length: number } }): boolean {
  return (e.touches?.length ?? 0) > 1;
}

/** El doble clic fuera de campos editables no debe seleccionar texto. */
export function shouldPreventDoubleClick(target: TargetLike | null | undefined): boolean {
  return !isEditableTarget(target);
}

/** El menú contextual (pulsación larga o clic derecho) solo se permite en campos editables. */
export function shouldPreventContextMenu(target: TargetLike | null | undefined): boolean {
  return !isEditableTarget(target);
}

/** Arrastre nativo de imágenes y enlaces; las zonas propias usan `data-allow-drag`. */
export function shouldPreventDragStart(target: TargetLike | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  if (target.closest('[data-allow-drag]')) return false;
  return Boolean(target.closest('img, a'));
}

/** Tras cerrar el teclado virtual, la página no debe quedar desplazada. */
export function shouldResetPageScroll(scroll: { x: number; y: number }): boolean {
  return scroll.x !== 0 || scroll.y !== 0;
}

/** Monta los listeners una sola vez; devuelve la función de limpieza. */
export function installNativeFeel(doc: Document = document): () => void {
  const win = doc.defaultView ?? window;
  const stop = (e: Event) => e.preventDefault();

  const onWheel = (e: WheelEvent) => {
    if (shouldPreventWheel(e)) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (shouldPreventZoomKey(e)) e.preventDefault();
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.cancelable && shouldPreventTouchMove(e)) e.preventDefault();
  };
  const onDoubleClick = (e: MouseEvent) => {
    if (!shouldPreventDoubleClick(e.target as TargetLike | null)) return;
    e.preventDefault();
    win.getSelection()?.removeAllRanges();
  };

  const onContextMenu = (e: MouseEvent) => {
    if (shouldPreventContextMenu(e.target as TargetLike | null)) e.preventDefault();
  };
  const onDragStart = (e: DragEvent) => {
    if (shouldPreventDragStart(e.target as TargetLike | null)) e.preventDefault();
  };
  let resetTimer: number | undefined;
  const onFocusOut = (e: FocusEvent) => {
    if (!isEditableTarget(e.target as TargetLike | null)) return;
    win.clearTimeout(resetTimer);
    // Espera a que el teclado virtual termine de cerrarse.
    resetTimer = win.setTimeout(() => {
      const active = doc.activeElement as TargetLike | null;
      if (isEditableTarget(active)) return;
      if (shouldResetPageScroll({ x: win.scrollX, y: win.scrollY })) win.scrollTo(0, 0);
    }, 250);
  };

  const gestures = ['gesturestart', 'gesturechange', 'gestureend'] as const;
  doc.addEventListener('wheel', onWheel, { passive: false });
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('touchmove', onTouchMove, { passive: false });
  doc.addEventListener('dblclick', onDoubleClick);
  doc.addEventListener('contextmenu', onContextMenu);
  doc.addEventListener('dragstart', onDragStart);
  doc.addEventListener('focusout', onFocusOut);
  gestures.forEach((g) => doc.addEventListener(g, stop, { passive: false }));

  return () => {
    win.clearTimeout(resetTimer);
    doc.removeEventListener('contextmenu', onContextMenu);
    doc.removeEventListener('dragstart', onDragStart);
    doc.removeEventListener('focusout', onFocusOut);
    doc.removeEventListener('wheel', onWheel);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('touchmove', onTouchMove);
    doc.removeEventListener('dblclick', onDoubleClick);
    gestures.forEach((g) => doc.removeEventListener(g, stop));
  };
}
