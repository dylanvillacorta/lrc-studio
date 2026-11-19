import { describe, expect, it } from 'vitest';
import babiFixture from './__fixtures__/babi-pa-ti.project.json';
import { exportJson, parseProjectJson } from './exporters';
import {
  PROJECT_JSON_SCHEMA_VERSION,
  migrateProjectJson,
} from './projectMigrations';

describe('projectMigrations y parseProjectJson con fixture', () => {
  it('migra todas las versiones de esquema conocidas al formato actual', () => {
    const basePayload = {
      metadata: {
        title: 'Tema de prueba',
        artist: 'Artista',
        album: 'Disco',
        offsetMs: 50,
        timeUnit: 'seconds',
      },
      lines: [
        {
          text: 'Primera línea',
          startTime: 1.25,
          endTime: 3.5,
          words: [
            { text: 'Primera', startTime: 1.25, endTime: 2.0 },
            { text: 'línea', startTime: null, endTime: null },
          ],
        },
      ],
    };

    const versions: unknown[] = [
      undefined,
      1,
      '1',
      '1.0',
      2,
      '2.0',
      '2.0-musixmatch-richsync',
      PROJECT_JSON_SCHEMA_VERSION,
    ];

    for (const schemaVersion of versions) {
      const payload =
        schemaVersion === undefined
          ? basePayload
          : { schemaVersion, ...basePayload };
      const res = migrateProjectJson(payload);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.metadata).toEqual({
          title: 'Tema de prueba',
          artist: 'Artista',
          album: 'Disco',
          offsetMs: 50,
        });
        expect(res.data.lines).toHaveLength(1);
        expect(res.data.lines[0]).toEqual({
          id: 'line-0',
          text: 'Primera línea',
          startMs: 1250,
          endMs: 3500,
          words: [
            { id: 'w-0-0', text: 'Primera', startMs: 1250, endMs: 2000 },
            { id: 'w-0-1', text: 'línea', startMs: null, endMs: null },
          ],
        });
      }
    }
  });

  it('respeta timeUnit ms vs seconds al migrar', () => {
    const asMs = migrateProjectJson({
      schemaVersion: '1.0',
      metadata: { timeUnit: 'ms' },
      lines: [{ text: 'Ms', startTime: 7153, endTime: 8482, words: [] }],
    });
    expect(asMs.ok).toBe(true);
    if (asMs.ok) {
      expect(asMs.data.lines[0]?.startMs).toBe(7153);
      expect(asMs.data.lines[0]?.endMs).toBe(8482);
    }

    const asSeconds = migrateProjectJson({
      schemaVersion: '2.0',
      metadata: { timeUnit: 'seconds' },
      lines: [{ text: 'Seg', startTime: 7.153, endTime: 8.482, words: [] }],
    });
    expect(asSeconds.ok).toBe(true);
    if (asSeconds.ok) {
      expect(asSeconds.data.lines[0]?.startMs).toBe(7153);
      expect(asSeconds.data.lines[0]?.endMs).toBe(8482);
    }
  });

  it('rechaza versiones desconocidas o mayores (incluido lrc-studio.N) con error claro en español', () => {
    const future = migrateProjectJson({
      schemaVersion: 'lrc-studio.2',
      lines: [],
    });
    expect(future.ok).toBe(false);
    if (!future.ok) {
      expect(future.error).toContain('no reconoce el esquema "lrc-studio.2"');
      expect(future.error).toContain('actualiza la app');
    }

    const legacyInvalid = migrateProjectJson({
      schemaVersion: '2.0-musixmatch-richsync',
      metadata: { title: 'Sin líneas' },
    });
    expect(legacyInvalid).toEqual({
      ok: false,
      error: 'El proyecto JSON no contiene una lista válida de líneas.',
    });
  });

  it('parseProjectJson migra el fixture babi-pa-ti.project.json (2.0-musixmatch-richsync) y al re-exportar escribe lrc-studio.1', () => {
    expect(babiFixture.schemaVersion).toBe('2.0-musixmatch-richsync');
    const res = parseProjectJson(JSON.stringify(babiFixture));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata.title).toBe('Pa ti');
      expect(res.data.metadata.artist).toBe('Babi');
      expect(res.data.audioFileName).toBe('Grind – Pa Ti.mp3');
      expect(res.data.lines.length).toBeGreaterThanOrEqual(40);
      expect(res.data.lines[0]?.startMs).toBe(7153);
      expect(res.data.lines[0]?.words[0]?.startMs).toBeNull();

      const reExported = JSON.parse(
        exportJson(res.data.lines, {
          title: res.data.metadata.title ?? '',
          artist: res.data.metadata.artist ?? '',
          album: res.data.metadata.album ?? '',
          offsetMs: res.data.metadata.offsetMs ?? 0,
        }),
      ) as { schemaVersion: string };
      expect(reExported.schemaVersion).toBe('lrc-studio.1');
    }
  });
});
