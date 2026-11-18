import { describe, expect, it, vi } from 'vitest';
import { createPlaybackTimeStore } from '@/features/sync/hooks/playbackTimeStore';

describe('createPlaybackTimeStore', () => {
  it('normaliza el valor inicial y solo notifica a suscriptores cuando el tiempo cambia', () => {
    const store = createPlaybackTimeStore(-50);
    expect(store.getTimeMs()).toBe(0);

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = store.subscribe(listenerA);
    store.subscribe(listenerB);

    store.setTimeMs(0);
    expect(listenerA).not.toHaveBeenCalled();

    store.setTimeMs(1234.6);
    expect(store.getTimeMs()).toBe(1235);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    // Mismo valor redondeado no vuelve a notificar
    store.setTimeMs(1235.2);
    expect(listenerA).toHaveBeenCalledTimes(1);

    unsubA();
    store.setTimeMs(2000);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(2);
  });

  it('trata NaN o valores infinitos como 0 sin propagar errores', () => {
    const store = createPlaybackTimeStore(500);
    store.setTimeMs(Number.NaN);
    expect(store.getTimeMs()).toBe(0);

    store.setTimeMs(Number.POSITIVE_INFINITY);
    expect(store.getTimeMs()).toBe(0);
  });
});
