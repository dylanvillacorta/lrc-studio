import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaveScheduler } from './autosaveScheduler';

describe('createAutosaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hace debounce de 300 ms y fusiona (coalesce) varios cambios en un solo guardado', async () => {
    const saved: string[] = [];
    let clock = 1000;
    const scheduler = createAutosaveScheduler<string>({
      delayMs: 300,
      now: () => clock,
      save: async (snapshot) => {
        saved.push(snapshot);
      },
    });

    expect(scheduler.getState().status).toBe('idle');

    scheduler.schedule('v1');
    expect(scheduler.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(150);

    scheduler.schedule('v2');
    await vi.advanceTimersByTimeAsync(150);

    // Aún no han pasado 300 ms desde v2
    expect(saved).toEqual([]);

    clock = 2500;
    await vi.advanceTimersByTimeAsync(150);

    expect(saved).toEqual(['v2']);
    expect(scheduler.getState()).toEqual({
      status: 'saved',
      lastSavedAt: 2500,
      error: null,
    });
  });

  it('flush() guarda de inmediato lo pendiente y cancel() aborta el timer', async () => {
    const saved: number[] = [];
    const scheduler = createAutosaveScheduler<number>({
      delayMs: 300,
      save: async (snapshot) => {
        saved.push(snapshot);
      },
    });

    scheduler.schedule(1);
    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([]);
    expect(scheduler.getState().status).toBe('idle');

    scheduler.schedule(42);
    await scheduler.flush();
    expect(saved).toEqual([42]);
    expect(scheduler.getState().status).toBe('saved');
  });

  it('serializa guardados en vuelo para que nunca se solapen ni un guardado viejo pise uno nuevo', async () => {
    let activeSaves = 0;
    let maxConcurrent = 0;
    const savedOrder: string[] = [];
    let resolveFirst: (() => void) | null = null;

    const scheduler = createAutosaveScheduler<string>({
      delayMs: 300,
      save: async (snapshot) => {
        activeSaves += 1;
        maxConcurrent = Math.max(maxConcurrent, activeSaves);
        if (snapshot === 'primero') {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
        savedOrder.push(snapshot);
        activeSaves -= 1;
      },
    });

    scheduler.schedule('primero');
    const firstFlush = scheduler.flush();
    expect(scheduler.getState().status).toBe('saving');

    // Mientras 'primero' sigue guardando, llegan 'segundo' y 'tercero'
    scheduler.schedule('segundo');
    scheduler.schedule('tercero');

    expect(activeSaves).toBe(1);
    resolveFirst!();
    await firstFlush;

    // Aún falta esperar el debounce de 'tercero' o hacer flush
    await scheduler.flush();

    expect(maxConcurrent).toBe(1);
    expect(savedOrder).toEqual(['primero', 'tercero']);
    expect(scheduler.getState().status).toBe('saved');
  });

  it('ante un error de guardado pasa a error y reintenta en el siguiente cambio sin perder el dato', async () => {
    let shouldFail = true;
    const saved: string[] = [];

    const scheduler = createAutosaveScheduler<string>({
      delayMs: 300,
      save: async (snapshot) => {
        if (shouldFail) {
          throw new Error('Fallo de escritura en IndexedDB');
        }
        saved.push(snapshot);
      },
    });

    scheduler.schedule('dato-critico');
    await scheduler.flush();

    expect(scheduler.getState().status).toBe('error');
    expect(scheduler.getState().error).toBe('Fallo de escritura en IndexedDB');
    expect(saved).toEqual([]);

    // Se recupera el almacenamiento y un flush() reintenta el dato conservado
    shouldFail = false;
    await scheduler.flush();
    expect(saved).toEqual(['dato-critico']);
    expect(scheduler.getState().status).toBe('saved');

    // También funciona cuando llega un nuevo cambio tras un error
    shouldFail = true;
    scheduler.schedule('dato-fallido-2');
    await scheduler.flush();
    expect(scheduler.getState().status).toBe('error');

    shouldFail = false;
    scheduler.schedule('dato-nuevo-3');
    await vi.advanceTimersByTimeAsync(300);
    expect(saved).toEqual(['dato-critico', 'dato-nuevo-3']);
    expect(scheduler.getState().status).toBe('saved');
  });
});
