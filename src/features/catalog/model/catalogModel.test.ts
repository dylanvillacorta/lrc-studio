import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  type CatalogBackup,
  type ProjectFullData,
  type ProjectSummary,
} from '@/types';
import {
  buildBackupFileName,
  buildSingleProjectBackup,
  createEmptyProject,
  duplicateProject,
  filterProjectsByQuery,
  formatRelativeDate,
} from './catalogModel';

function makeSampleProject(): ProjectFullData {
  return {
    id: 'proj-1',
    title: 'Noches de Verano',
    artist: 'Luna Alba',
    audioFileName: 'noches_de_verano.mp3',
    durationMs: 180_000,
    totalLines: 2,
    syncedLines: 1,
    totalWords: 3,
    syncedWords: 2,
    lineProgress: 50,
    wordProgress: 67,
    updatedAt: 1_700_000_000_000,
    createdAt: 1_699_999_000_000,
    waveformPeaks: [0.1, 0.5, 0.8],
    settings: {
      playbackRate: 1,
      preRollSeconds: 2.5,
      sniperMode: true,
      autoAdvance: true,
    },
    lines: [
      {
        id: 'l1',
        text: 'Hola mundo',
        startMs: 1000,
        endMs: 2500,
        words: [
          { id: 'w1', text: 'Hola', startMs: 1000, endMs: 1500 },
          { id: 'w2', text: 'mundo', startMs: 1500, endMs: 2500 },
        ],
      },
      {
        id: 'l2',
        text: 'Adiós',
        startMs: null,
        endMs: null,
        words: [{ id: 'w3', text: 'Adiós', startMs: null, endMs: null }],
      },
    ],
  };
}

describe('catalogModel', () => {
  it('createEmptyProject crea un proyecto único sin audio y en 0%', () => {
    const a = createEmptyProject('Costa Norte', 'Faro', 1000);
    const b = createEmptyProject('Costa Norte', 'Faro', 1000);

    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(a.title).toBe('Costa Norte');
    expect(a.artist).toBe('Faro');
    expect(a.audioFileName).toBe('');
    expect(a.lineProgress).toBe(0);
    expect(a.wordProgress).toBe(0);
    expect(a.lines).toEqual([]);
  });

  it('duplicateProject agrega (copia) y limpia marcas de tiempo corruptas', () => {
    const original = makeSampleProject();
    original.lines[0]!.endMs = 500; // corrupta: endMs < startMs
    original.lines[0]!.words[0]!.startMs = Number.NaN;
    original.lines[1]!.startMs = -100;
    original.lines[1]!.words[0]!.endMs = 900; // huérfana sin startMs

    const copy = duplicateProject(original, 'proj-copy', 2_000_000);

    expect(copy.id).toBe('proj-copy');
    expect(copy.title).toBe('Noches de Verano (copia)');
    expect(copy.createdAt).toBe(2_000_000);
    expect(copy.updatedAt).toBe(2_000_000);
    expect(copy.lines[0]!.startMs).toBe(1000);
    expect(copy.lines[0]!.endMs).toBeNull();
    expect(copy.lines[0]!.words[0]!.startMs).toBeNull();
    expect(copy.lines[0]!.words[0]!.endMs).toBeNull();
    expect(copy.lines[1]!.startMs).toBeNull();
    expect(copy.lines[1]!.words[0]!.endMs).toBeNull();
    // Recalculado tras limpiar la palabra corrupta: 1 de 3 palabras válidas = 33%
    expect(copy.syncedWords).toBe(1);
    expect(copy.wordProgress).toBe(33);
  });

  it('buildSingleProjectBackup genera JSON CatalogBackup válido para un solo proyecto', () => {
    const project = makeSampleProject();
    const audioBytes = new Uint8Array([1, 2, 3, 4]).buffer;

    const json = buildSingleProjectBackup(
      project,
      {
        buffer: audioBytes,
        fileName: 'noches_de_verano.mp3',
        peaks: [0.2, 0.7],
        duration: 180,
      },
      1_700_000_500_000,
    );

    const parsed = JSON.parse(json) as CatalogBackup;
    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.exportedAt).toBe(1_700_000_500_000);
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0]?.id).toBe('proj-1');
    expect(parsed.audios).toHaveLength(1);
    expect(parsed.audios[0]?.mimeType).toBe('audio/mpeg');
    expect(parsed.audios[0]?.base64).toBe('AQIDBA==');
    expect(buildBackupFileName('Noches: de/Verano?')).toBe(
      'Noches- de-Verano-respaldo.json',
    );
  });

  it('formatRelativeDate formatea fechas relativas en español', () => {
    const now = new Date(2026, 10, 18, 14, 0, 0).getTime(); // 18 nov 2026 14:00

    expect(formatRelativeDate(now - 20_000, now)).toBe('hace un momento');
    expect(formatRelativeDate(now - 3 * 60_000, now)).toBe('hace 3 min');
    expect(formatRelativeDate(now - 2 * 3_600_000, now)).toBe('hace 2 h');

    const yesterday = new Date(2026, 10, 17, 22, 10, 0).getTime();
    expect(formatRelativeDate(yesterday, now)).toBe('ayer 22:10');

    const olderSameYear = new Date(2026, 10, 12, 9, 30, 0).getTime();
    expect(formatRelativeDate(olderSameYear, now)).toBe('12 nov');
  });

  it('filterProjectsByQuery filtra por título y artista sin distinguir tildes ni mayúsculas', () => {
    const projects: ProjectSummary[] = [
      {
        ...makeSampleProject(),
        id: '1',
        title: 'Noches de Verano',
        artist: 'Luna Alba',
      },
      {
        ...makeSampleProject(),
        id: '2',
        title: 'Cenizas',
        artist: 'Río Sur',
      },
    ];

    expect(filterProjectsByQuery(projects, '')).toHaveLength(2);
    expect(filterProjectsByQuery(projects, 'rio')).toHaveLength(1);
    expect(filterProjectsByQuery(projects, 'rio')[0]?.id).toBe('2');
    expect(filterProjectsByQuery(projects, 'VERANO')[0]?.id).toBe('1');
    expect(filterProjectsByQuery(projects, 'inexistente')).toHaveLength(0);
  });
});
