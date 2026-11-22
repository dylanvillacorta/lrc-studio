import { describe, expect, it, vi } from 'vitest';
import {
  isEditableElement,
  resolveKeyboardShortcut,
} from '@/features/sync/hooks/keyboardShortcutsModel';
import {
  attachKeyboardShortcutListeners,
  type KeyboardWindowLike,
} from '@/features/sync/hooks/useKeyboardShortcuts';

describe('keyboardShortcutsModel', () => {
  it('mapea Espacio, R, P, flechas, corchetes y Z/Ctrl+Z correctamente', () => {
    expect(resolveKeyboardShortcut({ key: ' ', code: 'Space' })).toEqual({
      type: 'stamp-start',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: ' ', code: 'Space' }, 'keyup')).toEqual({
      type: 'stamp-end',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'r' })).toEqual({
      type: 'repeat-preroll',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'R' })).toEqual({
      type: 'repeat-preroll',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'p' })).toEqual({
      type: 'toggle-play',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'ArrowLeft' })).toEqual({
      type: 'nudge',
      deltaMs: -50,
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'ArrowRight' })).toEqual({
      type: 'nudge',
      deltaMs: 50,
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: '[' })).toEqual({
      type: 'nudge',
      deltaMs: -10,
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: ']' })).toEqual({
      type: 'nudge',
      deltaMs: 10,
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'z' })).toEqual({
      type: 'undo',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'z', ctrlKey: true })).toEqual({
      type: 'undo',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'Z', metaKey: true })).toEqual({
      type: 'undo',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'Backspace' })).toEqual({
      type: 'undo',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'Backspace', repeat: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'Backspace', target: { tagName: 'INPUT' } })).toBeNull();
  });

  it('ignora pulsaciones cuando el foco está en input, textarea, select o contenteditable', () => {
    expect(isEditableElement({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableElement({ tagName: 'textarea' })).toBe(true);
    expect(isEditableElement({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(
      isEditableElement({
        tagName: 'DIV',
        getAttribute: (name) => (name === 'contenteditable' ? 'true' : null),
      }),
    ).toBe(true);
    expect(
      isEditableElement({
        tagName: 'SPAN',
        closest: () => ({ tagName: 'DIV' }),
      }),
    ).toBe(true);
    expect(isEditableElement({ tagName: 'BUTTON' })).toBe(false);

    expect(
      resolveKeyboardShortcut({ key: ' ', target: { tagName: 'INPUT' } }),
    ).toBeNull();
    expect(
      resolveKeyboardShortcut({ key: 'p', target: { tagName: 'TEXTAREA' } }),
    ).toBeNull();
    expect(
      resolveKeyboardShortcut({ key: 'r', target: { tagName: 'SELECT' } }),
    ).toBeNull();
    expect(
      resolveKeyboardShortcut({
        key: 'z',
        ctrlKey: true,
        target: { isContentEditable: true },
      }),
    ).toBeNull();
    expect(
      resolveKeyboardShortcut({ key: ' ', target: { tagName: 'INPUT' } }, 'keyup'),
    ).toBeNull();
  });

  it('ignora modificadores del navegador y repeticiones (e.repeat)', () => {
    expect(resolveKeyboardShortcut({ key: 'r', ctrlKey: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'p', metaKey: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'z', altKey: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'z', shiftKey: true })).toBeNull();

    expect(
      resolveKeyboardShortcut({ key: ' ', code: 'Space', repeat: true }),
    ).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'r', repeat: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'p', repeat: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: 'z', repeat: true })).toBeNull();
  });
});

describe('attachKeyboardShortcutListeners', () => {
  it('registra un solo listener keydown/keyup, previene default y limpia al desmontar', () => {
    const fakeWindow = new EventTarget() as unknown as KeyboardWindowLike & EventTarget;
    const handlers = {
      onStampStart: vi.fn(),
      onStampEnd: vi.fn(),
      onRepeatPreRoll: vi.fn(),
      onTogglePlay: vi.fn(),
      onNudge: vi.fn(),
      onUndo: vi.fn(),
    };

    const cleanup = attachKeyboardShortcutListeners(fakeWindow, () => handlers);

    const spaceDown = new Event('keydown', { cancelable: true });
    Object.assign(spaceDown, { key: ' ', code: 'Space', repeat: false });
    fakeWindow.dispatchEvent(spaceDown);
    expect(spaceDown.defaultPrevented).toBe(true);
    expect(handlers.onStampStart).toHaveBeenCalledTimes(1);

    const spaceRepeat = new Event('keydown', { cancelable: true });
    Object.assign(spaceRepeat, { key: ' ', code: 'Space', repeat: true });
    fakeWindow.dispatchEvent(spaceRepeat);
    expect(spaceRepeat.defaultPrevented).toBe(true);
    expect(handlers.onStampStart).toHaveBeenCalledTimes(1);

    const spaceUp = new Event('keyup', { cancelable: true });
    Object.assign(spaceUp, { key: ' ', code: 'Space' });
    fakeWindow.dispatchEvent(spaceUp);
    expect(handlers.onStampEnd).toHaveBeenCalledTimes(1);

    const arrowLeft = new Event('keydown', { cancelable: true });
    Object.assign(arrowLeft, { key: 'ArrowLeft' });
    fakeWindow.dispatchEvent(arrowLeft);
    expect(handlers.onNudge).toHaveBeenCalledWith(-50);

    const bracketRight = new Event('keydown', { cancelable: true });
    Object.assign(bracketRight, { key: ']' });
    fakeWindow.dispatchEvent(bracketRight);
    expect(handlers.onNudge).toHaveBeenCalledWith(10);

    const ctrlZ = new Event('keydown', { cancelable: true });
    Object.assign(ctrlZ, { key: 'z', ctrlKey: true });
    fakeWindow.dispatchEvent(ctrlZ);
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);

    expect(resolveKeyboardShortcut({ key: 'Z', ctrlKey: true, shiftKey: true })).toEqual({
      type: 'redo',
      preventDefault: true,
    });
    expect(resolveKeyboardShortcut({ key: 'y', ctrlKey: true })).toEqual({
      type: 'redo',
      preventDefault: true,
    });

    cleanup();

    const afterCleanup = new Event('keydown', { cancelable: true });
    Object.assign(afterCleanup, { key: 'p' });
    fakeWindow.dispatchEvent(afterCleanup);
    expect(handlers.onTogglePlay).not.toHaveBeenCalled();
  });
});
