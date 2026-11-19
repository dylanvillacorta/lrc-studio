import { describe, expect, it } from 'vitest';
import babiFixture from './__fixtures__/babi-pa-ti.project.json';
import { parseProjectJson } from './exporters';
import { migrateProjectJson } from './projectMigrations';

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

  it('rechaza versiones desconocidas o mayores con error claro en español', () => {
    const future = migrateProjectJson({
      schemaVersion: '3.0',
      lines: [],
    });
    expect(future.ok).toBe(false);
    if (!future.ok) {
      expect(future.error).toContain('no reconoce el esquema "3.0"');
      expect(future.error).toContain('actualiza la app');
    }
  });

  it('parseProjectJson importa el fixture real babi-pa-ti.project.json', () => {
    const res = parseProjectJson(JSON.stringify(babiFixture));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata.title).toBe('Pa ti');
      expect(res.data.metadata.artist).toBe('Babi');
      expect(res.data.audioFileName).toBe('Grind – Pa Ti.mp3');
      expect(res.data.lines.length).toBeGreaterThanOrEqual(40);
      expect(res.data.lines[0]?.startMs).toBe(7153);
      expect(res.data.lines[0]?.words[0]?.startMs).toBeNull();
    }
  });
});
