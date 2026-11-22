import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFullData, SessionState } from '@/types';
import {
  classifyAutosaveChange,
  createAutosaveScheduler,
  createDualAutosaveCoordinator,
  hasProjectChanged,
  hasSessionChanged,
} from './autosaveScheduler';

function makeProject(
  id: string,
  overrides: Partial<ProjectFullData> = {},
): ProjectFullData {
  return {
    id,
    title: `Proyecto ${id}`,
    artist: 'Artista',
    audioFileName: 'pista.wav',
    durationMs: 12_000,
    totalLines: 1,
    syncedLines: 0,
    totalWords: 1,
    syncedWords: 0,
    lineProgress: 0,
    wordProgress: 0,
    updatedAt: 1000,
    createdAt: 1000,
    waveformPeaks: [0.2, 0.8],
    settings: {
      playbackRate: 1,
      preRollSeconds: 2.5,
      autoAdvance: true,
    },
    lines: [
      {
        id: 'l1',
        text: 'Hola mundo',
        startMs: null,
        endMs: null,
        words: [{ id: 'w1', text: 'Hola', startMs: null, endMs: null }],
      },
    ],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    projectId: 'p1',
    activeTab: 'sync',
    currentTime: 0,
    activeLineIndex: 0,
    activeWordIndex: 0,
    updatedAt: 1000,
    ...overrides,
  };
}

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

  it('cancel() durante un guardado en vuelo regresa a idle sin emitir saved', async () => {
    let resolveSave: (() => void) | null = null;
    const states: string[] = [];

    const scheduler = createAutosaveScheduler<string>({
      delayMs: 300,
      save: async () => {
        await new Promise<void>((resolve) => {
          resolveSave = resolve;
        });
      },
    });
    scheduler.subscribe((s) => states.push(s.status));

    scheduler.schedule('v1');
    const flushPromise = scheduler.flush();
    expect(scheduler.getState().status).toBe('saving');

    scheduler.cancel();
    resolveSave!();
    await flushPromise;

    expect(scheduler.getState().status).toBe('idle');
    expect(states).not.toContain('saved');
  });

  it('múltiples flush() concurrentes esperan el guardado en curso y drenan cambios intermedios', async () => {
    let resolveFirst: (() => void) | null = null;
    const saved: string[] = [];

    const scheduler = createAutosaveScheduler<string>({
      delayMs: 300,
      save: async (snapshot) => {
        if (snapshot === 'v1') {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
        saved.push(snapshot);
      },
    });

    scheduler.schedule('v1');
    const flush1 = scheduler.flush();
    const flush2 = scheduler.flush();

    scheduler.schedule('v2');
    resolveFirst!();

    await Promise.all([flush1, flush2]);
    expect(saved).toEqual(['v1', 'v2']);
    expect(scheduler.getState().status).toBe('saved');
  });

  it('QuotaExceededError y SecurityError dejan saveStatus en error en español, conservan el snapshot y reintentan', async () => {
    let mode: 'quota' | 'security' | 'ok' = 'quota';
    const saved: string[] = [];

    const scheduler = createAutosaveScheduler<string>({
      delayMs: 300,
      save: async (snapshot) => {
        if (mode === 'quota') {
          const err = new Error('The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        if (mode === 'security') {
          const err = new Error('IndexedDB access denied');
          err.name = 'SecurityError';
          throw err;
        }
        saved.push(snapshot);
      },
    });

    scheduler.schedule('snapshot-cuota');
    await scheduler.flush();

    expect(scheduler.getState().status).toBe('error');
    expect(scheduler.getState().error).toMatch(/cuota de almacenamiento llena/i);
    expect(saved).toEqual([]);

    // Reintento con SecurityError -> sigue en español y conserva el snapshot
    mode = 'security';
    await scheduler.flush();
    expect(scheduler.getState().status).toBe('error');
    expect(scheduler.getState().error).toMatch(/indexeddb no está disponible/i);

    // Al liberarse el espacio, flush() persiste el snapshot conservado en memoria
    mode = 'ok';
    await scheduler.flush();
    expect(saved).toEqual(['snapshot-cuota']);
    expect(scheduler.getState().status).toBe('saved');
    expect(scheduler.getState().error).toBeNull();
  });
});

describe('clasificación y coordinador dual de autoguardado (visible vs silencioso)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clasifica cambios reales del proyecto como visible, solo sesión como silent y sin cambios como none', () => {
    const p1 = makeProject('p1');
    const s1 = makeSession({ projectId: 'p1', activeTab: 'sync', currentTime: 0 });

    expect(hasProjectChanged(p1, p1)).toBe(false);
    expect(hasProjectChanged({ ...p1 }, p1)).toBe(false);
    expect(hasSessionChanged(makeSession({ ...s1, updatedAt: 9999 }), s1)).toBe(false);

    expect(
      classifyAutosaveChange({
        project: p1,
        lastSavedProject: p1,
        session: makeSession({ ...s1, updatedAt: 9999 }),
        lastSavedSession: s1,
      }),
    ).toBe('none');

    expect(
      classifyAutosaveChange({
        project: p1,
        lastSavedProject: p1,
        session: makeSession({ ...s1, activeTab: 'word', currentTime: 2400 }),
        lastSavedSession: s1,
      }),
    ).toBe('silent');

    const p1Edited = makeProject('p1', { title: 'Nuevo título', updatedAt: 2000 });
    expect(
      classifyAutosaveChange({
        project: p1Edited,
        lastSavedProject: p1,
        session: s1,
        lastSavedSession: s1,
      }),
    ).toBe('visible');
  });

  it('cambios de pestaña, línea o currentTime se guardan en silencio sin tocar saveProject ni el indicador visible', async () => {
    const saveProject = vi.fn(async () => {});
    const saveSession = vi.fn(async () => {});
    const states: string[] = [];

    const coordinator = createDualAutosaveCoordinator({
      saveProject,
      saveSession,
      projectDelayMs: 300,
      sessionDelayMs: 800,
    });
    coordinator.subscribe((s) => states.push(s.status));

    const project = makeProject('p1');
    const initialSession = makeSession({ projectId: 'p1', activeTab: 'sync', currentTime: 0 });
    coordinator.markBaseline(project, initialSession);

    // Cambio de pestaña/modo y línea activa
    const tabSession = makeSession({
      projectId: 'p1',
      activeTab: 'word',
      activeLineIndex: 1,
      activeWordIndex: 2,
      currentTime: 3500,
    });
    expect(coordinator.schedule({ project, session: tabSession })).toBe('silent');

    // Antes de 800 ms no guarda aún
    await vi.advanceTimersByTimeAsync(400);
    expect(saveSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(saveSession).toHaveBeenCalledWith(tabSession);
    expect(states).toEqual([]);
    expect(coordinator.getState().status).toBe('idle');

    // Repetir con el mismo valor (solo distinto updatedAt) no vuelve a guardar
    expect(
      coordinator.schedule({
        project,
        session: { ...tabSession, updatedAt: 99_999 },
      }),
    ).toBe('none');
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveSession).toHaveBeenCalledTimes(1);
  });

  it('cambios en el proyecto disparan pending -> saving -> saved en 300 ms y preservan la última sesión', async () => {
    const saveProject = vi.fn(async () => {});
    const saveSession = vi.fn(async () => {});
    const states: string[] = [];

    const coordinator = createDualAutosaveCoordinator({
      saveProject,
      saveSession,
      projectDelayMs: 300,
      sessionDelayMs: 800,
    });
    coordinator.subscribe((s) => states.push(s.status));

    const p1 = makeProject('p1');
    const s1 = makeSession({ projectId: 'p1', activeTab: 'sync', currentTime: 0 });
    coordinator.markBaseline(p1, s1);

    const p2 = makeProject('p1', {
      updatedAt: 2000,
      lines: [
        {
          id: 'l1',
          text: 'Hola mundo',
          startMs: 1200,
          endMs: null,
          words: [{ id: 'w1', text: 'Hola', startMs: 1200, endMs: null }],
        },
      ],
    });
    const s2 = makeSession({ projectId: 'p1', activeLineIndex: 1, currentTime: 1200 });

    expect(coordinator.schedule({ project: p2, session: s2 })).toBe('visible');
    expect(coordinator.getState().status).toBe('pending');

    await vi.advanceTimersByTimeAsync(300);

    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject).toHaveBeenCalledWith(p2);
    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(saveSession).toHaveBeenCalledWith(s2);
    expect(states).toEqual(['pending', 'saving', 'saved']);

    // Flush sin cambios posteriores no escribe nada
    await coordinator.flush({ project: p2, session: s2 });
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveSession).toHaveBeenCalledTimes(1);
  });

  it('flush() con solo cambios de sesión persiste saveSessionState en silencio y un error de proyecto no se oculta', async () => {
    let failProject = true;
    const saveProject = vi.fn(async () => {
      if (failProject) {
        throw new Error('Fallo temporal de disco');
      }
    });
    const saveSession = vi.fn(async () => {});

    const coordinator = createDualAutosaveCoordinator({
      saveProject,
      saveSession,
    });

    const p1 = makeProject('p1');
    const s1 = makeSession({ projectId: 'p1', currentTime: 0 });
    coordinator.markBaseline(p1, s1);

    // Flush solo de sesión (p. ej. al pausar u ocultar pestaña)
    const sPaused = makeSession({ projectId: 'p1', activeTab: 'export', currentTime: 4200 });
    await coordinator.flush({ project: p1, session: sPaused });
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().status).toBe('idle');

    // Un error al guardar proyecto permanece en 'error' aunque luego haya cambios silenciosos de sesión
    const p2 = makeProject('p1', { title: 'Editado', updatedAt: 5000 });
    coordinator.scheduleProject({ project: p2, session: sPaused });
    await coordinator.flush({ project: p2, session: sPaused });
    expect(coordinator.getState().status).toBe('error');

    const sTab = makeSession({ projectId: 'p1', activeTab: 'lyrics', currentTime: 4200 });
    coordinator.scheduleSession(sTab);
    await vi.advanceTimersByTimeAsync(800);
    expect(saveSession).toHaveBeenCalledTimes(2);
    expect(coordinator.getState().status).toBe('error');

    // Al recuperarse el almacenamiento, el flush finaliza el guardado pendiente del proyecto
    failProject = false;
    await coordinator.flush({ project: p2, session: sTab });
    expect(coordinator.getState().status).toBe('saved');
  });
});
