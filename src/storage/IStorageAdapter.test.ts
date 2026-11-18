import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  type ActiveTab,
  type AudioBinary,
  type CatalogBackup,
  type LyricLine,
  type ProjectFullData,
  type ProjectSummary,
  type SessionState,
  type WordTiming,
} from '@/types';
import type { IStorageAdapter } from './IStorageAdapter';

describe('Tipos del dominio y contrato IStorageAdapter', () => {
  it('define BACKUP_SCHEMA_VERSION como 1', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
  });

  it('permite construir objetos válidos del dominio sin any', () => {
    const tab: ActiveTab = 'sync';
    const word: WordTiming = { id: 'w1', text: 'hola', startMs: 100, endMs: 400 };
    const line: LyricLine = {
      id: 'l1',
      text: 'hola',
      startMs: 100,
      endMs: 400,
      words: [word],
    };
    const summary: ProjectSummary = {
      id: 'p1',
      title: 'Demo',
      artist: 'Artista',
      audioFileName: 'demo.wav',
      durationMs: 1000,
      totalLines: 1,
      syncedLines: 1,
      totalWords: 1,
      syncedWords: 1,
      lineProgress: 100,
      wordProgress: 100,
      updatedAt: 1700000000000,
    };
    const full: ProjectFullData = {
      ...summary,
      lines: [line],
      waveformPeaks: [0.1, 0.5],
      settings: {
        playbackRate: 1,
        preRollSeconds: 2.5,
        sniperMode: false,
        autoAdvance: true,
      },
      createdAt: 1700000000000,
    };
    const audio: AudioBinary = {
      blob: new ArrayBuffer(8),
      fileName: 'demo.wav',
      peaks: [0.1, 0.5],
      duration: 1,
    };
    const session: SessionState = {
      projectId: 'p1',
      activeTab: tab,
      currentTime: 0,
      activeLineIndex: 0,
      activeWordIndex: 0,
      updatedAt: 1700000000000,
    };
    const backup: CatalogBackup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: 1700000000000,
      projects: [full],
      audios: [],
    };

    const _adapterCheck: IStorageAdapter | null = null;
    expect(backup.schemaVersion).toBe(1);
    expect(audio.fileName).toBe('demo.wav');
    expect(session.activeTab).toBe('sync');
    expect(_adapterCheck).toBeNull();
  });
});
