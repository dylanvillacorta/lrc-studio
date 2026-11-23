import { describe, expect, it } from 'vitest';
import { findActiveLineIndex } from '@/features/sync';
import type { AudioBinary, ProjectFullData, SessionState } from '@/types';
import {
  buildSessionState,
  durationMsToSec,
  durationSecToMs,
  planRestore,
  resolveAudioDurationSec,
} from './sessionPlanner';

function makeProject(overrides: Partial<ProjectFullData> = {}): ProjectFullData {
  return {
    id: 'proj-1',
    title: 'Canción',
    artist: 'Artista',
    audioFileName: 'tema.mp3',
    durationMs: 10_000,
    totalLines: 2,
    syncedLines: 1,
    totalWords: 3,
    syncedWords: 1,
    lineProgress: 50,
    wordProgress: 33,
    updatedAt: 1000,
    createdAt: 500,
    waveformPeaks: [0.1, 0.5, 0.9],
    settings: {
      playbackRate: 1,
      preRollSeconds: 2.5,
      autoAdvance: true,
    },
    lines: [
      {
        id: 'l1',
        text: 'Primera línea',
        startMs: 1000,
        endMs: 3000,
        words: [
          { id: 'w1', text: 'Primera', startMs: 1000, endMs: 1800 },
          { id: 'w2', text: 'línea', startMs: 1800, endMs: 3000 },
        ],
      },
      {
        id: 'l2',
        text: 'Fin',
        startMs: null,
        endMs: null,
        words: [{ id: 'w3', text: 'Fin', startMs: null, endMs: null }],
      },
    ],
    ...overrides,
  };
}

describe('sessionPlanner', () => {
  it('buildSessionState sanea valores negativos o no finitos', () => {
    const state = buildSessionState({
      projectId: 'proj-1',
      activeTab: 'word',
      currentTime: -50,
      activeLineIndex: Number.NaN,
      activeWordIndex: 2.9,
      updatedAt: 9999,
    });

    expect(state).toEqual({
      projectId: 'proj-1',
      activeTab: 'word',
      currentTime: 0,
      activeLineIndex: 0,
      activeWordIndex: 2,
      updatedAt: 9999,
    });
  });

  it('planRestore devuelve null sin lanzar si el proyecto no existe o no coincide', () => {
    const session: SessionState = {
      projectId: 'proj-inexistente',
      activeTab: 'sync',
      currentTime: 1200,
      activeLineIndex: 0,
      activeWordIndex: 0,
      updatedAt: 1000,
    };

    expect(planRestore(null, makeProject(), null)).toBeNull();
    expect(planRestore(session, null, null)).toBeNull();
    expect(planRestore(session, makeProject({ id: 'otro-id' }), null)).toBeNull();
    expect(
      planRestore({ ...session, projectId: null }, makeProject(), null),
    ).toBeNull();
  });

  it('planRestore acota índices de línea, palabra y currentTime dentro de los límites válidos', () => {
    const project = makeProject();
    const audio: AudioBinary = {
      blob: new Blob([new Uint8Array([1, 2, 3])]),
      fileName: 'tema.mp3',
      peaks: [0.2, 0.8],
      duration: 8.5,
    };

    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'loupe' as unknown as SessionState['activeTab'],
      currentTime: 99_999,
      activeLineIndex: 99,
      activeWordIndex: 99,
      updatedAt: 2000,
    };

    const plan = planRestore(session, project, audio);
    expect(plan).not.toBeNull();
    // Sesión guardada con la Lupa (eliminada): se restaura como Sincronizar.
    expect(plan?.activeTab).toBe('sync');
    expect(plan?.activeLineIndex).toBe(1);
    expect(plan?.activeWordIndex).toBe(0);
    expect(plan?.currentTime).toBe(8500);
    expect(plan?.peaks).toEqual([0.2, 0.8]);
    expect(plan?.duration).toBe(8.5);
  });

  it('planRestore maneja índices negativos y proyectos sin líneas', () => {
    const emptyProject = makeProject({ lines: [] });
    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'sync',
      currentTime: -100,
      activeLineIndex: -5,
      activeWordIndex: -3,
      updatedAt: 2000,
    };

    const plan = planRestore(session, emptyProject, null);
    expect(plan).not.toBeNull();
    expect(plan?.activeLineIndex).toBe(0);
    expect(plan?.activeWordIndex).toBe(0);
    expect(plan?.currentTime).toBe(0);
  });

  it('convierte con precisión segundos y milisegundos en las fronteras de restauración', () => {
    expect(durationSecToMs(2.5436)).toBe(2544);
    expect(durationSecToMs(-1)).toBe(0);
    expect(durationSecToMs(Number.NaN)).toBe(0);

    expect(durationMsToSec(4500)).toBe(4.5);
    expect(durationMsToSec(0)).toBe(0);

    expect(resolveAudioDurationSec({ duration: 12.25 }, 99_000)).toBe(12.25);
    expect(resolveAudioDurationSec({ duration: 0 }, 9_500)).toBe(9.5);
    expect(resolveAudioDurationSec(null, 9_500)).toBe(9.5);

    const project = makeProject({ durationMs: 4500 });
    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'sync',
      currentTime: 5000,
      activeLineIndex: 0,
      activeWordIndex: 0,
      updatedAt: 1000,
    };
    const planWithoutAudio = planRestore(session, project, null);
    expect(planWithoutAudio?.duration).toBe(4.5);
    expect(planWithoutAudio?.currentTime).toBe(4500);
  });

  it('restaura línea y palabra activas exactas aunque currentTime caiga entre dos líneas', () => {
    const project = makeProject({
      lines: [
        {
          id: 'l1',
          text: 'Primera',
          startMs: 500,
          endMs: 2000,
          words: [{ id: 'w1', text: 'Primera', startMs: 500, endMs: 2000 }],
        },
        {
          id: 'l2',
          text: 'Segunda línea aquí',
          startMs: 4000,
          endMs: 6500,
          words: [
            { id: 'w2', text: 'Segunda', startMs: 4000, endMs: 4800 },
            { id: 'w3', text: 'línea', startMs: 4800, endMs: 5600 },
            { id: 'w4', text: 'aquí', startMs: 5600, endMs: 6500 },
          ],
        },
      ],
    });

    // 3200 ms cae en el silencio entre l1 (endMs 2000 + 600 = 2600) y l2 (startMs 4000)
    expect(findActiveLineIndex(project.lines, 3200)).toBe(-1);

    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'word',
      currentTime: 3200,
      activeLineIndex: 1,
      activeWordIndex: 2,
      updatedAt: 3000,
    };

    const plan = planRestore(session, project, null);
    expect(plan?.currentTime).toBe(3200);
    expect(plan?.activeLineIndex).toBe(1);
    expect(plan?.activeWordIndex).toBe(2);
  });
});
