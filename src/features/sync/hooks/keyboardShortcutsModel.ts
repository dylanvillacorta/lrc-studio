export interface EditableTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

export interface KeyboardEventLike {
  key: string;
  code?: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EditableTargetLike | null;
}

export type NudgeDeltaMs = -50 | -10 | 10 | 50;

export type KeyboardShortcutAction =
  | { type: 'stamp-start'; preventDefault: true }
  | { type: 'stamp-end'; preventDefault: true }
  | { type: 'repeat-preroll'; preventDefault: true }
  | { type: 'toggle-play'; preventDefault: true }
  | { type: 'nudge'; deltaMs: NudgeDeltaMs; preventDefault: true }
  | { type: 'undo'; preventDefault: true }
  | { type: 'redo'; preventDefault: true };

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Determina si el foco actual está dentro de un campo editable donde deben
 * ignorarse los atajos globales de sincronización.
 */
export function isEditableElement(
  target: EditableTargetLike | null | undefined,
): boolean {
  if (!target) {
    return false;
  }

  const tagName = target.tagName?.toUpperCase();
  if (tagName && EDITABLE_TAGS.has(tagName)) {
    return true;
  }

  if (target.isContentEditable === true) {
    return true;
  }

  if (typeof target.getAttribute === 'function') {
    const attr = target.getAttribute('contenteditable');
    if (attr !== null && attr.toLowerCase() !== 'false') {
      return true;
    }
  }

  if (typeof target.closest === 'function') {
    const ancestor = target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    );
    if (ancestor) {
      return true;
    }
  }

  return false;
}

function isSpaceKey(event: KeyboardEventLike): boolean {
  return event.key === ' ' || event.code === 'Space';
}

/**
 * Función pura que decide qué acción de sincronización corresponde a un evento
 * de teclado, respetando foco en campos, modificadores y `e.repeat`.
 */
export function resolveKeyboardShortcut(
  event: KeyboardEventLike,
  phase: 'keydown' | 'keyup' = 'keydown',
): KeyboardShortcutAction | null {
  if (isEditableElement(event.target)) {
    return null;
  }

  const hasAlt = Boolean(event.altKey);
  const hasCtrlOrMeta = Boolean(event.ctrlKey || event.metaKey);

  if (phase === 'keyup') {
    if (!hasAlt && !hasCtrlOrMeta && isSpaceKey(event)) {
      return { type: 'stamp-end', preventDefault: true };
    }
    return null;
  }

  const keyLower = event.key.toLowerCase();

  if (event.key === 'Backspace' && !hasAlt && !hasCtrlOrMeta && !event.shiftKey) {
    if (event.repeat) {
      return null;
    }
    return { type: 'undo', preventDefault: true };
  }

  if (keyLower === 'z' && !hasAlt && !event.shiftKey) {
    if (event.repeat) {
      return null;
    }
    return { type: 'undo', preventDefault: true };
  }

  if (
    hasCtrlOrMeta &&
    !hasAlt &&
    ((keyLower === 'z' && Boolean(event.shiftKey)) || (keyLower === 'y' && !event.shiftKey))
  ) {
    if (event.repeat) {
      return null;
    }
    return { type: 'redo', preventDefault: true };
  }

  if (hasCtrlOrMeta || hasAlt) {
    return null;
  }

  if (isSpaceKey(event)) {
    if (event.repeat) {
      return null;
    }
    return { type: 'stamp-start', preventDefault: true };
  }

  if (keyLower === 'r') {
    if (event.repeat) {
      return null;
    }
    return { type: 'repeat-preroll', preventDefault: true };
  }

  if (keyLower === 'p') {
    if (event.repeat) {
      return null;
    }
    return { type: 'toggle-play', preventDefault: true };
  }

  if (event.key === 'ArrowLeft') {
    return { type: 'nudge', deltaMs: -50, preventDefault: true };
  }

  if (event.key === 'ArrowRight') {
    return { type: 'nudge', deltaMs: 50, preventDefault: true };
  }

  if (event.key === '[') {
    return { type: 'nudge', deltaMs: -10, preventDefault: true };
  }

  if (event.key === ']') {
    return { type: 'nudge', deltaMs: 10, preventDefault: true };
  }

  return null;
}
