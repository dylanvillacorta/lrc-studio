import { describe, expect, it } from 'vitest';
import {
  isEditableTarget,
  shouldPreventContextMenu,
  shouldPreventDragStart,
  shouldResetPageScroll,
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

  it('previene el menú contextual fuera de campos editables y no dentro', () => {
    expect(shouldPreventContextMenu({ tagName: 'BUTTON', closest: () => null })).toBe(true);
    expect(shouldPreventContextMenu({ tagName: 'CANVAS', closest: () => null })).toBe(true);
    expect(shouldPreventContextMenu(null)).toBe(true);
    expect(shouldPreventContextMenu({ tagName: 'TEXTAREA' })).toBe(false);
    expect(shouldPreventContextMenu({ tagName: 'INPUT' })).toBe(false);
    expect(shouldPreventContextMenu({ tagName: 'DIV', isContentEditable: true })).toBe(false);
  });

  it('previene el arrastre de imágenes y enlaces salvo zonas propias', () => {
    const closestFor = (hit: string | null) => (sel: string) =>
      hit !== null && sel.includes(hit) ? {} : null;
    expect(shouldPreventDragStart({ tagName: 'IMG', closest: closestFor('img') })).toBe(true);
    expect(shouldPreventDragStart({ tagName: 'A', closest: closestFor('img') })).toBe(true);
    expect(shouldPreventDragStart({ tagName: 'DIV', closest: () => null })).toBe(false);
    expect(shouldPreventDragStart({ tagName: 'IMG', closest: closestFor('data-allow-drag') })).toBe(
      false,
    );
    expect(shouldPreventDragStart(null)).toBe(false);
  });

  it('pide restablecer el scroll solo si la página quedó desplazada', () => {
    expect(shouldResetPageScroll({ x: 0, y: 0 })).toBe(false);
    expect(shouldResetPageScroll({ x: 0, y: 120 })).toBe(true);
    expect(shouldResetPageScroll({ x: 8, y: 0 })).toBe(true);
  });
});
