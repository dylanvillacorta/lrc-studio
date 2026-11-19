import { describe, expect, it, vi } from 'vitest';
import { attachKeyboardShortcutListeners } from '@/features/sync/hooks/useKeyboardShortcuts';
import {
  clampLatencyMs,
  computeCompensatedStampMs,
  readCurrentTimeMs,
} from './stampClock';

describe('stampClock', () => {
  it('prioriza getCurrentTimeMs sobre timeStore y currentTimeMs de render', () => {
    const result = readCurrentTimeMs({
      getCurrentTimeMs: () => 5432,
      timeStore: { getTimeMs: () => 2000 },
      currentTimeMs: 1000,
    });
    expect(result).toBe(5432);
  });

  it('usa timeStore si no se provee getCurrentTimeMs y cae a currentTimeMs', () => {
    expect(
      readCurrentTimeMs({
        timeStore: { getTimeMs: () => 2100 },
        currentTimeMs: 1000,
      }),
    ).toBe(2100);
    expect(readCurrentTimeMs({ currentTimeMs: 950 })).toBe(950);
    expect(readCurrentTimeMs({})).toBe(0);
  });

  it('acota latencyMs a enteros entre 0 y 500', () => {
    expect(clampLatencyMs(-50)).toBe(0);
    expect(clampLatencyMs(0)).toBe(0);
    expect(clampLatencyMs(184.6)).toBe(185);
    expect(clampLatencyMs(900)).toBe(500);
    expect(clampLatencyMs(Number.NaN)).toBe(0);
  });

  it('resta latencyMs al instante de audio y nunca baja de 0', () => {
    expect(computeCompensatedStampMs(10_000, 200)).toBe(9800);
    expect(computeCompensatedStampMs(150, 200)).toBe(0);
    expect(computeCompensatedStampMs(0, 200)).toBe(0);
    expect(computeCompensatedStampMs(3456.4, 0)).toBe(3456);
  });

  it('lee el tiempo vivo en el instante de keydown/keyup y nunca el currentTime de render', () => {
    let liveAudioMs = 1000;
    const staleRenderMs = 1000;
    const stamped: number[] = [];

    const listeners = new Map<'keydown' | 'keyup', ((e: KeyboardEvent) => void)[]>();
    const fakeWin = {
      addEventListener: (type: 'keydown' | 'keyup', fn: (e: KeyboardEvent) => void) => {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      },
      removeEventListener: (type: 'keydown' | 'keyup', fn: (e: KeyboardEvent) => void) => {
        const list = listeners.get(type) ?? [];
        listeners.set(type, list.filter((item) => item !== fn));
      },
    };

    const detach = attachKeyboardShortcutListeners(fakeWin, () => ({
      onStampStart: () => {
        const raw = readCurrentTimeMs({
          getCurrentTimeMs: () => liveAudioMs,
          currentTimeMs: staleRenderMs,
        });
        stamped.push(computeCompensatedStampMs(raw, 200));
      },
      onStampEnd: () => {
        const raw = readCurrentTimeMs({
          getCurrentTimeMs: () => liveAudioMs,
          currentTimeMs: staleRenderMs,
        });
        stamped.push(computeCompensatedStampMs(raw, 200));
      },
      onRepeatPreRoll: vi.fn(),
      onTogglePlay: vi.fn(),
      onNudge: vi.fn(),
      onUndo: vi.fn(),
    }));

    // El audio avanza sin re-renderizar React (staleRenderMs sigue en 1000)
    liveAudioMs = 5432;
    const keydownEvent = {
      key: ' ',
      code: 'Space',
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: null,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    listeners.get('keydown')?.forEach((fn) => fn(keydownEvent));

    liveAudioMs = 5890;
    const keyupEvent = {
      key: ' ',
      code: 'Space',
      target: null,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    listeners.get('keyup')?.forEach((fn) => fn(keyupEvent));

    expect(stamped).toEqual([5232, 5690]);
    detach();
  });
});
