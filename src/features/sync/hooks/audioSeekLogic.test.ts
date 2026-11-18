import { describe, expect, it } from 'vitest';
import {
  clampTimeMs,
  needsCurrentTimeCorrection,
  resolveDisplayedTimeMs,
  waitForMetadata,
} from './audioSeekLogic';

class FakeAudio {
  readyState = 0;
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
  count() {
    let n = 0;
    this.listeners.forEach((s) => (n += s.size));
    return n;
  }
}

describe('resolveDisplayedTimeMs', () => {
  it('prioriza el seek pendiente sobre el almacén', () => {
    expect(resolveDisplayedTimeMs(54_000, 0)).toBe(54_000);
    expect(resolveDisplayedTimeMs(null, 54_000)).toBe(54_000);
    expect(resolveDisplayedTimeMs(null, Number.NaN)).toBe(0);
  });
});

describe('needsCurrentTimeCorrection', () => {
  it('corrige si la diferencia supera 100 ms (audio recreado en 0, UI en 54 s)', () => {
    expect(needsCurrentTimeCorrection(54_000, 0)).toBe(true);
  });
  it('no corrige dentro de la tolerancia', () => {
    expect(needsCurrentTimeCorrection(54_000, 54.05)).toBe(false);
    expect(needsCurrentTimeCorrection(54_000, 54.1)).toBe(false);
    expect(needsCurrentTimeCorrection(54_000, 54.2)).toBe(true);
  });
});

describe('clampTimeMs', () => {
  it('limita al rango conocido', () => {
    expect(clampTimeMs(-5, 1000)).toBe(0);
    expect(clampTimeMs(5000, 1000)).toBe(1000);
    expect(clampTimeMs(5000, 0)).toBe(5000);
  });
});

describe('waitForMetadata (seek en pausa con readyState 0 y luego play)', () => {
  it('resuelve de inmediato si ya hay metadatos', async () => {
    const a = new FakeAudio();
    a.readyState = 1;
    await expect(waitForMetadata(a)).resolves.toBe(true);
  });
  it('espera loadedmetadata y limpia listeners', async () => {
    const a = new FakeAudio();
    const p = waitForMetadata(a, 1000);
    a.readyState = 1;
    a.emit('loadedmetadata');
    await expect(p).resolves.toBe(true);
    expect(a.count()).toBe(0);
  });
  it('resuelve false al agotar el tiempo sin metadatos', async () => {
    const a = new FakeAudio();
    await expect(waitForMetadata(a, 10)).resolves.toBe(false);
    expect(a.count()).toBe(0);
  });
});
