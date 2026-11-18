import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { restoreSessionFromAdapter } from '@/features/session/hooks/useSessionRestore';
import { buildSessionState } from '@/features/session/model/sessionPlanner';
import { formatStorageErrorMessage } from '@/features/session/model/storageError';
import { WebIndexedDBAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';

describe('useSessionRestore integration', () => {
  it('restauración completa contra WebIndexedDBAdapter real tras simular recarga', async () => {
    const dbName = `lyricsync-session-restore-${Date.now()}`;
    const writerAdapter = new WebIndexedDBAdapter({ dbName, storage: null });
    await writerAdapter.init();

    const project: ProjectFullData = {
      id: 'proj-restore-1',
      title: 'Noche de Estrellas',
      artist: 'Dúo Demo',
      audioFileName: 'noche.wav',
      durationMs: 28_000,
      totalLines: 2,
      syncedLines: 1,
      totalWords: 4,
      syncedWords: 2,
      lineProgress: 50,
      wordProgress: 50,
      updatedAt: 1_700_000_123,
      createdAt: 1_700_000_000,
      waveformPeaks: [0.15, 0.65, 0.92, 0.35],
      settings: {
        playbackRate: 1.25,
        preRollSeconds: 2.5,
        sniperMode: true,
        autoAdvance: true,
      },
      lines: [
        {
          id: 'l-1',
          text: 'Bajo la luna',
          startMs: 500,
          endMs: 2500,
          words: [
            { id: 'w-1', text: 'Bajo', startMs: 500, endMs: 1100 },
            { id: 'w-2', text: 'la', startMs: 1100, endMs: 1500 },
            { id: 'w-3', text: 'luna', startMs: 1500, endMs: 2500 },
          ],
        },
        {
          id: 'l-2',
          text: 'Brilla el mar',
          startMs: 3000,
          endMs: 5500,
          words: [{ id: 'w-4', text: 'Brilla', startMs: 3000, endMs: 4000 }],
        },
      ],
    };

    const audioBytes = new Uint8Array([82, 73, 70, 70, 42, 99, 128, 255]);
    const audioBlob = new Blob([audioBytes], { type: 'audio/wav' });
    const peaks = [0.15, 0.65, 0.92, 0.35];

    await writerAdapter.saveProject(project);
    await writerAdapter.saveAudioBinary(
      project.id,
      audioBlob,
      'noche.wav',
      peaks,
      28,
    );
    await writerAdapter.saveSessionState(
      buildSessionState({
        projectId: project.id,
        activeTab: 'word',
        currentTime: 1850,
        activeLineIndex: 0,
        activeWordIndex: 2,
      }),
    );

    // Simular recarga instanciando un adaptador nuevo sobre la misma base
    const reloadedAdapter = new WebIndexedDBAdapter({ dbName, storage: null });
    const result = await restoreSessionFromAdapter(reloadedAdapter);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error('Se esperaba restauración ready');
    }

    expect(result.plan.projectId).toBe('proj-restore-1');
    expect(result.plan.activeTab).toBe('word');
    expect(result.plan.activeLineIndex).toBe(0);
    expect(result.plan.activeWordIndex).toBe(2);
    expect(result.plan.currentTime).toBe(1850);
    expect(result.plan.peaks).toEqual(peaks);
    expect(result.plan.duration).toBe(28);
    expect(result.plan.project.lines).toEqual(project.lines);

    expect(result.plan.audio).not.toBeNull();
    const restoredBytes = new Uint8Array(
      await (result.plan.audio!.blob as Blob).arrayBuffer(),
    );
    expect(restoredBytes).toEqual(audioBytes);
  });

  it('sesión apuntando a un proyecto borrado cae a estado empty sin lanzar', async () => {
    const dbName = `lyricsync-deleted-project-${Date.now()}`;
    const writer = new WebIndexedDBAdapter({ dbName, storage: null });
    await writer.init();

    const project: ProjectFullData = {
      id: 'proj-to-delete',
      title: 'Temporal',
      artist: 'Demo',
      audioFileName: '',
      durationMs: 0,
      totalLines: 0,
      syncedLines: 0,
      totalWords: 0,
      syncedWords: 0,
      lineProgress: 0,
      wordProgress: 0,
      updatedAt: 1000,
      createdAt: 1000,
      waveformPeaks: [],
      settings: {
        playbackRate: 1,
        preRollSeconds: 2.5,
        sniperMode: false,
        autoAdvance: true,
      },
      lines: [],
    };

    await writer.saveProject(project);
    await writer.saveSessionState(
      buildSessionState({
        projectId: project.id,
        activeTab: 'lyrics',
        currentTime: 500,
      }),
    );
    await writer.deleteProject(project.id);

    const reader = new WebIndexedDBAdapter({ dbName, storage: null });
    const result = await restoreSessionFromAdapter(reader);
    expect(result).toEqual({ status: 'empty', plan: null });
  });

  it('ida y vuelta con currentTime entre dos líneas restaura línea y palabra activas exactas', async () => {
    const dbName = `lyricsync-gap-restore-${Date.now()}`;
    const writer = new WebIndexedDBAdapter({ dbName, storage: null });
    await writer.init();

    const project: ProjectFullData = {
      id: 'proj-gap-1',
      title: 'Silencio',
      artist: 'Tester',
      audioFileName: 'gap.mp3',
      durationMs: 10_000,
      totalLines: 2,
      syncedLines: 2,
      totalWords: 2,
      syncedWords: 2,
      lineProgress: 100,
      wordProgress: 100,
      updatedAt: 5000,
      createdAt: 1000,
      waveformPeaks: [0.3, 0.7],
      settings: {
        playbackRate: 1,
        preRollSeconds: 2.5,
        sniperMode: true,
        autoAdvance: true,
      },
      lines: [
        {
          id: 'l1',
          text: 'Inicio',
          startMs: 200,
          endMs: 1200,
          words: [{ id: 'w1', text: 'Inicio', startMs: 200, endMs: 1200 }],
        },
        {
          id: 'l2',
          text: 'Desenlace',
          startMs: 5000,
          endMs: 7000,
          words: [{ id: 'w2', text: 'Desenlace', startMs: 5000, endMs: 7000 }],
        },
      ],
    };

    await writer.saveProject(project);
    await writer.saveAudioBinary(
      project.id,
      new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/mpeg' }),
      'gap.mp3',
      [0.3, 0.7],
      10,
    );
    // 3000 ms cae entre l1 (endMs 1200) y l2 (startMs 5000)
    await writer.saveSessionState(
      buildSessionState({
        projectId: project.id,
        activeTab: 'word',
        currentTime: 3000,
        activeLineIndex: 1,
        activeWordIndex: 0,
      }),
    );

    const reader = new WebIndexedDBAdapter({ dbName, storage: null });
    const result = await restoreSessionFromAdapter(reader);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error('Se esperaba restauración ready');
    }

    expect(result.plan.currentTime).toBe(3000);
    expect(result.plan.activeLineIndex).toBe(1);
    expect(result.plan.activeWordIndex).toBe(0);
    expect(result.plan.duration).toBe(10);
  });

  it('IndexedDB no disponible produce mensaje de error en español', () => {
    expect(
      formatStorageErrorMessage(
        new Error('IndexedDB is not available in this environment'),
        'Fallo genérico',
      ),
    ).toBe('IndexedDB no está disponible en este entorno.');
  });
});
