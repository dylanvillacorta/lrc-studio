import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  applyAttachedAudioToProject,
  applyLinesToProject,
} from '@/app/providers/projectMutations';
import { createProjectOperations } from '@/app/providers/projectOperations';
import {
  buildSessionState,
  createAutosaveScheduler,
} from '@/features/session';
import { WebIndexedDBAdapter, type IStorageAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';

function makeProject(
  id: string,
  overrides: Partial<ProjectFullData> = {},
): ProjectFullData {
  return {
    id,
    title: `Proyecto ${id}`,
    artist: 'Artista',
    audioFileName: '',
    durationMs: 0,
    totalLines: 1,
    syncedLines: 0,
    totalWords: 1,
    syncedWords: 0,
    lineProgress: 0,
    wordProgress: 0,
    updatedAt: 1000,
    createdAt: 1000,
    waveformPeaks: [],
    settings: {
      playbackRate: 1,
      preRollSeconds: 2.5,
      autoAdvance: true,
    },
    lines: [
      {
        id: `${id}-l1`,
        text: 'Hola',
        startMs: null,
        endMs: null,
        words: [{ id: `${id}-w1`, text: 'Hola', startMs: null, endMs: null }],
      },
    ],
    ...overrides,
  };
}

describe('projectOperations & projectMutations', () => {
  it('applyAttachedAudioToProject convierte duración de segundos a milisegundos en durationMs', () => {
    const project = makeProject('p1');
    const updated = applyAttachedAudioToProject(
      project,
      'pista.mp3',
      [0.2, 0.8],
      14.375,
      9000,
    );

    expect(updated.audioFileName).toBe('pista.mp3');
    expect(updated.durationMs).toBe(14375);
    expect(updated.waveformPeaks).toEqual([0.2, 0.8]);
    expect(updated.updatedAt).toBe(9000);
  });

  it('al cambiar de proyecto con guardado pendiente hace flush del proyecto anterior antes de cargar el nuevo y nunca guarda el snapshot viejo bajo el id nuevo', async () => {
    const dbName = `lyricsync-switch-${Date.now()}`;
    const adapter = new WebIndexedDBAdapter({ dbName, storage: null });
    await adapter.init();

    const projectA = makeProject('proj-a', { title: 'Original A' });
    const projectB = makeProject('proj-b', {
      title: 'Destino B',
      durationMs: 12_000,
    });
    await adapter.saveProject(projectA);
    await adapter.saveProject(projectB);

    // Simula edición pendiente en proyecto A
    let activeProject: ProjectFullData | null = applyLinesToProject(projectA, [
      {
        id: 'a-l1',
        text: 'Editado en A',
        startMs: 500,
        endMs: 1500,
        words: [
          { id: 'a-w1', text: 'Editado', startMs: 500, endMs: 1500 },
        ],
      },
    ]);

    const savedProjectIds: string[] = [];
    const savedSessionIds: Array<string | null> = [];
    const scheduler = createAutosaveScheduler<{
      project: ProjectFullData;
      session: ReturnType<typeof buildSessionState>;
    }>({
      delayMs: 300,
      save: async (snapshot) => {
        savedProjectIds.push(snapshot.project.id);
        savedSessionIds.push(snapshot.session.projectId);
        await adapter.saveProject(snapshot.project);
        await adapter.saveSessionState(snapshot.session);
      },
    });

    scheduler.schedule({
      project: activeProject,
      session: buildSessionState({
        projectId: activeProject.id,
        currentTime: 900,
        activeLineIndex: 0,
        activeWordIndex: 0,
      }),
    });

    const events: string[] = [];
    const pausePlayback = vi.fn(() => {
      events.push('pause');
    });

    const ops = createProjectOperations({
      adapter,
      getActiveProject: () => activeProject,
      pausePlayback,
      flushAutosave: async () => {
        await scheduler.flush();
        events.push('flushed-a');
      },
      applyLoadedProject: (nextProject, _url, _peaks, durationSec) => {
        events.push(`loaded-${nextProject.id}-${durationSec}`);
        activeProject = nextProject;
        scheduler.schedule({
          project: nextProject,
          session: buildSessionState({
            projectId: nextProject.id,
            currentTime: 0,
          }),
        });
      },
      onAudioAttached: () => {},
    });

    await ops.openProject('proj-b');
    await scheduler.flush();

    expect(events).toEqual(['pause', 'flushed-a', 'loaded-proj-b-12']);
    expect(savedProjectIds).toEqual(['proj-a', 'proj-b']);
    expect(savedSessionIds).toEqual(['proj-a', 'proj-b']);

    const persistedA = await adapter.getProject('proj-a');
    const persistedB = await adapter.getProject('proj-b');
    expect(persistedA?.lines[0]?.text).toBe('Editado en A');
    expect(persistedB?.lines[0]?.text).toBe('Hola');
  });

  it('carreras al abrir proyectos concurrentes: el último gana y revoca el ObjectURL obsoleto sin fugas', async () => {
    const projectB = makeProject('proj-b', { durationMs: 5000 });
    const projectC = makeProject('proj-c', { durationMs: 8000 });

    let resolveB!: (value: ProjectFullData | null) => void;
    const adapter = {
      getProject: vi.fn((id: string) => {
        if (id === 'proj-b') {
          return new Promise<ProjectFullData | null>((resolve) => {
            resolveB = resolve;
          });
        }
        return Promise.resolve(projectC);
      }),
      getAudioBinary: vi.fn(async (id: string) => ({
        blob: new Blob([new Uint8Array([1, 2])]),
        fileName: `${id}.mp3`,
        peaks: [0.5],
        duration: id === 'proj-b' ? 5 : 8,
      })),
    } as unknown as IStorageAdapter;

    const applied: string[] = [];
    const revokedUrls: Array<string | null> = [];
    let urlSeq = 0;

    const ops = createProjectOperations({
      adapter,
      getActiveProject: () => null,
      flushAutosave: async () => {},
      createObjectUrl: (_bin, fileName) => `blob:${fileName}:${++urlSeq}`,
      revokeObjectUrl: (url) => {
        revokedUrls.push(url);
      },
      applyLoadedProject: (nextProject, nextUrl) => {
        applied.push(`${nextProject.id}:${nextUrl}`);
      },
      onAudioAttached: () => {},
    });

    const slowOpenB = ops.openProject('proj-b');
    // Esperar un microtask para que slowOpenB supere flushAutosave y quede esperando getProject('proj-b')
    await Promise.resolve();
    const fastOpenC = ops.openProject('proj-c');

    await fastOpenC;
    resolveB(projectB);
    await slowOpenB;

    expect(applied).toEqual(['proj-c:blob:proj-c.mp3:1']);
    expect(revokedUrls).toEqual([]);
  });

  it('attachAudio interrumpido por cambio de proyecto no guarda ni filtra ObjectURL sobre el proyecto nuevo', async () => {
    const projectA = makeProject('proj-a');
    const projectB = makeProject('proj-b');
    let activeProject: ProjectFullData | null = projectA;

    let resolveDecode!: (value: {
      blob: Blob;
      fileName: string;
      peaks: number[];
      duration: number;
    }) => void;

    const saveAudioBinary = vi.fn(async () => {});
    const adapter = {
      getProject: vi.fn(async () => projectB),
      getAudioBinary: vi.fn(async () => null),
      saveAudioBinary,
    } as unknown as IStorageAdapter;

    const attachedSpy = vi.fn();
    const ops = createProjectOperations({
      adapter,
      getActiveProject: () => activeProject,
      flushAutosave: async () => {},
      importAudio: () =>
        new Promise((resolve) => {
          resolveDecode = resolve;
        }),
      applyLoadedProject: (nextProject) => {
        activeProject = nextProject;
      },
      onAudioAttached: attachedSpy,
    });

    const pendingAttach = ops.attachAudio({
      name: 'lento.mp3',
      arrayBuffer: async () => new ArrayBuffer(4),
    });

    await ops.openProject('proj-b');

    resolveDecode({
      blob: new Blob([new Uint8Array([1])]),
      fileName: 'lento.mp3',
      peaks: [0.4],
      duration: 10,
    });
    await pendingAttach;

    expect(saveAudioBinary).not.toHaveBeenCalled();
    expect(attachedSpy).not.toHaveBeenCalled();
    expect(activeProject?.id).toBe('proj-b');
  });
});
