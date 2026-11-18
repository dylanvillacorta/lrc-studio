import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNewVersionAvailable, parseVersionResponse } from './model';
import { checkVersionOnce } from './useVersionCheck';

describe('version model', () => {
  it('detecta nueva version cuando cambia version o commit', () => {
    const local = { version: '1.0.0', commit: 'abc1234' };
    expect(isNewVersionAvailable(local, { version: '1.0.0', commit: 'abc1234' })).toBe(
      false,
    );
    expect(isNewVersionAvailable(local, { version: '1.0.1', commit: 'abc1234' })).toBe(
      true,
    );
    expect(isNewVersionAvailable(local, { version: '1.0.0', commit: 'def5678' })).toBe(
      true,
    );
  });

  it('devuelve false si faltan campos en remote', () => {
    const local = { version: '1.0.0', commit: 'abc1234' };
    expect(isNewVersionAvailable(local, { version: '', commit: 'abc1234' })).toBe(
      false,
    );
    expect(isNewVersionAvailable(local, { version: '1.0.0', commit: '' })).toBe(
      false,
    );
  });

  it('parsea respuestas validas y descarta invalidas', () => {
    expect(
      parseVersionResponse({
        version: '1.0.0',
        commit: 'abc1234',
        builtAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      version: '1.0.0',
      commit: 'abc1234',
      builtAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parseVersionResponse(null)).toBeNull();
    expect(parseVersionResponse({ version: 123, commit: 'abc' })).toBeNull();
  });
});

describe('checkVersionOnce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consulta /version.json con cache no-store y query timestamp', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ version: '1.1.0', commit: 'fff9999' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const hasUpdate = await checkVersionOnce(
      { version: '1.0.0', commit: 'abc1234' },
      fetchMock,
    );

    expect(hasUpdate).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init).toEqual({ cache: 'no-store' });
  });

  it('ignora errores de red y respuestas no ok sin lanzar', async () => {
    const fetchFail = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    await expect(
      checkVersionOnce({ version: '1.0.0', commit: 'abc1234' }, fetchFail),
    ).resolves.toBe(false);

    const fetch500 = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('error', { status: 500 }));
    await expect(
      checkVersionOnce({ version: '1.0.0', commit: 'abc1234' }, fetch500),
    ).resolves.toBe(false);
  });
});
