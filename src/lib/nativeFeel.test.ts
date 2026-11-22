import { describe, expect, it } from 'vitest';
import {
  isEditableTarget,
  shouldPreventDoubleClick,
  shouldPreventTouchMove,
  shouldPreventWheel,
  shouldPreventZoomKey,
} from '@/lib/nativeFeel';

describe('nativeFeel', () => {
  it('previene Ctrl/Cmd + rueda y no la rueda normal', () => {
    expect(shouldPreventWheel({ ctrlKey: true })).toBe(true);
    expect(shouldPreventWheel({ metaKey: true })).toBe(true);
    expect(shouldPreventWheel({})).toBe(false);
  });

  it('previene Ctrl/Cmd + (+, -, =, 0) y no otras teclas', () => {
    for (const key of ['+', '-', '=', '0']) {
      expect(shouldPreventZoomKey({ key, ctrlKey: true })).toBe(true);
      expect(shouldPreventZoomKey({ key, metaKey: true })).toBe(true);
    }
    expect(shouldPreventZoomKey({ key: '-' })).toBe(false);
    expect(shouldPreventZoomKey({ key: 'z', ctrlKey: true })).toBe(false);
    expect(shouldPreventZoomKey({ key: ' ' })).toBe(false);
    expect(shouldPreventZoomKey({ key: '[' })).toBe(false);
    expect(shouldPreventZoomKey({ key: '0', ctrlKey: true, altKey: true })).toBe(false);
  });

  it('previene touchmove solo con más de un toque', () => {
    expect(shouldPreventTouchMove({ touches: { length: 2 } })).toBe(true);
    expect(shouldPreventTouchMove({ touches: { length: 1 } })).toBe(false);
    expect(shouldPreventTouchMove({})).toBe(false);
  });

  it('detecta campos editables y deja el doble clic natural en ellos', () => {
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'input' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'SPAN', closest: () => ({}) })).toBe(true);
    expect(isEditableTarget({ tagName: 'P', closest: () => null })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(shouldPreventDoubleClick({ tagName: 'P', closest: () => null })).toBe(true);
    expect(shouldPreventDoubleClick({ tagName: 'INPUT' })).toBe(false);
  });
});
