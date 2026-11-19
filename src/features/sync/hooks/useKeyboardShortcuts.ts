import { useEffect, useRef } from 'react';
import {
  isEditableElement,
  resolveKeyboardShortcut,
  type KeyboardEventLike,
  type NudgeDeltaMs,
} from './keyboardShortcutsModel';

export interface KeyboardWindowLike {
  addEventListener: (
    type: 'keydown' | 'keyup',
    listener: (event: KeyboardEvent) => void,
  ) => void;
  removeEventListener: (
    type: 'keydown' | 'keyup',
    listener: (event: KeyboardEvent) => void,
  ) => void;
}

export interface KeyboardShortcutHandlers {
  onStampStart: () => void;
  onStampEnd?: () => void;
  onRepeatPreRoll: () => void;
  onTogglePlay: () => void;
  onNudge: (deltaMs: NudgeDeltaMs) => void;
  onUndo: () => void;
  onRedo?: () => void;
}

export interface UseKeyboardShortcutsOptions extends KeyboardShortcutHandlers {
  enabled?: boolean;
  targetWindow?: KeyboardWindowLike | null;
}

/**
 * Adjunta un único par de listeners (`keydown` / `keyup`) sobre `win`
 * y devuelve la función de limpieza.
 */
export function attachKeyboardShortcutListeners(
  win: KeyboardWindowLike,
  getHandlers: () => KeyboardShortcutHandlers,
): () => void {
  let spaceHeld = false;

  const handleKeyDown = (event: KeyboardEvent) => {
    const eventLike = event as unknown as KeyboardEventLike;
    const isSpace = eventLike.key === ' ' || eventLike.code === 'Space';
    if (
      isSpace &&
      !isEditableElement(eventLike.target) &&
      !eventLike.ctrlKey &&
      !eventLike.metaKey &&
      !eventLike.altKey &&
      typeof event.preventDefault === 'function'
    ) {
      event.preventDefault();
    }

    const action = resolveKeyboardShortcut(eventLike, 'keydown');
    if (!action) {
      return;
    }

    if (action.preventDefault && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const handlers = getHandlers();
    switch (action.type) {
      case 'stamp-start':
        spaceHeld = true;
        handlers.onStampStart();
        break;
      case 'repeat-preroll':
        handlers.onRepeatPreRoll();
        break;
      case 'toggle-play':
        handlers.onTogglePlay();
        break;
      case 'nudge':
        handlers.onNudge(action.deltaMs);
        break;
      case 'undo':
        handlers.onUndo();
        break;
      case 'redo':
        handlers.onRedo?.();
        break;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (!spaceHeld) {
      return;
    }
    const action = resolveKeyboardShortcut(
      event as unknown as KeyboardEventLike,
      'keyup',
    );
    if (action?.type === 'stamp-end') {
      spaceHeld = false;
      if (action.preventDefault && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      getHandlers().onStampEnd?.();
    }
  };

  win.addEventListener('keydown', handleKeyDown);
  win.addEventListener('keyup', handleKeyUp);

  return () => {
    spaceHeld = false;
    win.removeEventListener('keydown', handleKeyDown);
    win.removeEventListener('keyup', handleKeyUp);
  };
}

/**
 * Registra un único par de listeners (`keydown` / `keyup`) sobre `targetWindow`
 * para los atajos de sincronización en escritorio y los limpia al desmontar.
 */
export function useKeyboardShortcuts({
  enabled = true,
  targetWindow,
  onStampStart,
  onStampEnd,
  onRepeatPreRoll,
  onTogglePlay,
  onNudge,
  onUndo,
  onRedo,
}: UseKeyboardShortcutsOptions): void {
  const handlersRef = useRef<KeyboardShortcutHandlers>({
    onStampStart,
    onStampEnd,
    onRepeatPreRoll,
    onTogglePlay,
    onNudge,
    onUndo,
    onRedo,
  });

  useEffect(() => {
    handlersRef.current = {
      onStampStart,
      onStampEnd,
      onRepeatPreRoll,
      onTogglePlay,
      onNudge,
      onUndo,
      onRedo,
    };
  }, [onNudge, onRedo, onRepeatPreRoll, onStampEnd, onStampStart, onTogglePlay, onUndo]);

  useEffect(() => {
    const win: KeyboardWindowLike | null =
      targetWindow !== undefined
        ? targetWindow
        : typeof window !== 'undefined'
          ? window
          : null;

    if (!enabled || !win) {
      return;
    }

    return attachKeyboardShortcutListeners(win, () => handlersRef.current);
  }, [enabled, targetWindow]);
}
