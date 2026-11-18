import { describe, expect, it } from 'vitest';
import {
  distributeWordsEvenlyInLine,
  nudgeWordTime,
} from '@/features/sync/model/wordAdjust';
import {
  stampWordEndOnRelease,
  stampWordStart,
} from '@/features/sync/model/wordSync';
import type { LyricLine } from '@/types';

const makeWordLines = (): LyricLine[] => [
  {
    id: 'l1',
    text: 'Luces de neón',
    startMs: null,
    endMs: null,
    words: [
      { id: 'w1', text: 'Luces', startMs: null, endMs: null },
      { id: 'w2', text: 'de', startMs: null, endMs: null },
      { id: 'w3', text: 'neón', startMs: null, endMs: null },
    ],
  },
  {
    id: 'l2',
    text: 'Sin palabras',
    startMs: 4000,
    endMs: 6000,
    words: [],
  },
];

describe('wordSync', () => {
  it('en modo Francotirador sin hold avanza a la siguiente palabra y pausa al completar la línea', () => {
    const lines = makeWordLines();
    const step1 = stampWordStart(lines, {
      lineIndex: 0,
      wordIndex: 0,
      nowMs: 1500,
      subMode: 'sniper',
      sniperHoldDuration: false,
      sniperAutoAdvancePreRoll: true,
    });
    expect(step1.lines[0]?.words[0]?.startMs).toBe(1500);
    expect(step1.lines[0]?.words[0]?.endMs).toBe(1880);
    expect(step1.nextWordIndex).toBe(1);
    expect(step1.shouldPause).toBe(false);
    expect(step1.shouldRewindPreRoll).toBe(true);
    expect(step1.completedLine).toBe(false);

    const step2 = stampWordStart(step1.lines, {
      lineIndex: 0,
      wordIndex: 1,
      nowMs: 1800,
      subMode: 'sniper',
      sniperAutoAdvancePreRoll: false,
    });
    expect(step2.lines[0]?.words[0]?.endMs).toBe(1780);
    expect(step2.shouldPause).toBe(true);

    // Última palabra de la línea
    const step3 = stampWordStart(step2.lines, {
      lineIndex: 0,
      wordIndex: 2,
      nowMs: 2400,
      subMode: 'sniper',
    });
    expect(step3.completedLine).toBe(true);
    expect(step3.shouldPause).toBe(true);
    expect(step3.lines[0]?.endMs).toBe(2780);
  });

  it('en modo mantener (hold) marca inicio al presionar y fin al soltar, avanzando de línea al final', () => {
    const lines = makeWordLines();
    const down = stampWordStart(lines, {
      lineIndex: 0,
      wordIndex: 2,
      nowMs: 2500,
      subMode: 'hold',
    });
    expect(down.lines[0]?.words[2]?.endMs).toBeNull();

    const up = stampWordEndOnRelease(down.lines, {
      lineIndex: 0,
      wordIndex: 2,
      nowMs: 2950,
      subMode: 'hold',
    });
    expect(up.lines[0]?.words[2]?.endMs).toBe(2950);
    expect(up.lines[0]?.endMs).toBe(2950);
    expect(up.nextLineIndex).toBe(1);
    expect(up.nextWordIndex).toBe(0);
    expect(up.completedLine).toBe(true);
  });

  it('no falla si la línea no tiene palabras', () => {
    const lines = makeWordLines();
    const res = stampWordStart(lines, {
      lineIndex: 1,
      wordIndex: 0,
      nowMs: 4100,
      subMode: 'tap',
    });
    expect(res.lines).toHaveLength(2);
    expect(distributeWordsEvenlyInLine(lines, 1)[1]?.words).toEqual([]);
  });

  it('distribuye palabras de forma proporcional y aplica nudge de 10 ms y 50 ms', () => {
    const lines = makeWordLines();
    lines[0] = { ...lines[0]!, startMs: 1000, endMs: 4000 };
    const distributed = distributeWordsEvenlyInLine(lines, 0);

    expect(distributed[0]?.words[0]?.startMs).toBe(1000);
    expect(distributed[0]?.words[2]?.endMs).toBeGreaterThan(3500);

    const nudged10 = nudgeWordTime(distributed, 0, 0, 'startMs', -10);
    expect(nudged10[0]?.words[0]?.startMs).toBe(990);
    expect(nudged10[0]?.startMs).toBe(990);

    const nudged50 = nudgeWordTime(nudged10, 0, 2, 'endMs', 50);
    expect(nudged50[0]?.words[2]?.endMs).toBe(
      (distributed[0]?.words[2]?.endMs ?? 0) + 50,
    );
  });

  it('soporta palabras repetidas, tiempos iguales y fin menor que inicio', () => {
    const repeatedLines: LyricLine[] = [
      {
        id: 'rep',
        text: 'sí sí sí',
        startMs: 3000,
        endMs: 2000, // fin menor que inicio
        words: [
          { id: 'w1', text: 'sí', startMs: null, endMs: null },
          { id: 'w2', text: 'sí', startMs: null, endMs: null },
          { id: 'w3', text: 'sí', startMs: null, endMs: null },
        ],
      },
    ];

    // Tiempos iguales al marcar palabras repetidas secuencialmente en modo tap
    const t1 = stampWordStart(repeatedLines, {
      lineIndex: 0,
      wordIndex: 0,
      nowMs: 3000,
      subMode: 'tap',
    });
    const t2 = stampWordStart(t1.lines, {
      lineIndex: 0,
      wordIndex: t1.nextWordIndex,
      nowMs: 3000,
      subMode: 'tap',
    });
    expect(t2.lines[0]?.words[0]?.endMs).toBe(3050);
    expect(t2.lines[0]?.words[1]?.startMs).toBe(3000);
    expect(t2.nextWordIndex).toBe(2);

    // En modo hold: presionar última palabra no marca completedLine hasta soltar, y release con fin < inicio aplica +60 ms
    const holdDown = stampWordStart(t2.lines, {
      lineIndex: 0,
      wordIndex: 2,
      nowMs: 3500,
      subMode: 'hold',
    });
    expect(holdDown.completedLine).toBe(false);
    const holdUp = stampWordEndOnRelease(holdDown.lines, {
      lineIndex: 0,
      wordIndex: 2,
      nowMs: 3200,
      subMode: 'hold',
    });
    expect(holdUp.lines[0]?.words[2]?.endMs).toBe(3560);
    expect(holdUp.completedLine).toBe(true);

    // distributeWordsEvenlyInLine con fin menor que inicio garantiza endMs >= startMs
    const distributed = distributeWordsEvenlyInLine(repeatedLines, 0);
    expect(distributed[0]?.startMs).toBe(3000);
    expect(distributed[0]?.endMs).toBe(3500);
    expect(distributed[0]?.words[2]?.endMs).toBeGreaterThan(3000);
  });

  it('en Francotirador con sniperHoldDuration marca inicio al presionar y rebobina al soltar', () => {
    const lines = makeWordLines();
    const down = stampWordStart(lines, {
      lineIndex: 0,
      wordIndex: 0,
      nowMs: 1600,
      subMode: 'sniper',
      sniperHoldDuration: true,
      sniperAutoAdvancePreRoll: true,
    });
    expect(down.lines[0]?.words[0]?.endMs).toBeNull();
    expect(down.nextWordIndex).toBe(0);
    expect(down.shouldRewindPreRoll).toBe(false);

    const up = stampWordEndOnRelease(down.lines, {
      lineIndex: 0,
      wordIndex: 0,
      nowMs: 2050,
      subMode: 'sniper',
      sniperHoldDuration: true,
      sniperAutoAdvancePreRoll: true,
    });
    expect(up.lines[0]?.words[0]?.endMs).toBe(2050);
    expect(up.nextWordIndex).toBe(1);
    expect(up.shouldPause).toBe(false);
    expect(up.shouldRewindPreRoll).toBe(true);
  });
});
