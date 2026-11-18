import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/types';
import { KaraokePreview } from './KaraokePreview';
import { LineSyncScreen } from './LineSyncScreen';
import { WordSyncScreen } from './WordSyncScreen';

const SAMPLE_LINES: LyricLine[] = [
  {
    id: 'l1',
    text: 'Bajo la luna te encontré',
    startMs: 12_400,
    endMs: 16_000,
    words: [
      { id: 'w1', text: 'Bajo', startMs: 12_400, endMs: 12_900 },
      { id: 'w2', text: 'la', startMs: 12_950, endMs: 13_200 },
      { id: 'w3', text: 'luna', startMs: null, endMs: null },
    ],
  },
  {
    id: 'l2',
    text: 'corazón de sal y fuego',
    startMs: null,
    endMs: null,
    words: [
      { id: 'w4', text: 'corazón', startMs: null, endMs: null },
      { id: 'w5', text: 'de', startMs: null, endMs: null },
    ],
  },
];

describe('LineSyncScreen', () => {
  it('renderiza la pantalla de sincronización por línea con controles y botón gigante', () => {
    const html = renderToString(
      <LineSyncScreen
        hasAudio
        peaks={[0.2, 0.8, 0.5]}
        currentTimeMs={14_000}
        durationMs={120_000}
        isPlaying={false}
        playbackRate={1}
        lines={SAMPLE_LINES}
        activeLineIndex={1}
        canUndo
        syncMode="line"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onUndo={vi.fn()}
        onSelectLine={vi.fn()}
        onStampLine={vi.fn()}
        onOpenLoupe={vi.fn()}
        onStopBurst={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
        onUseDemo={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Sincronizar por línea');
    expect(html).toContain('MARCAR LÍNEA 2');
    expect(html).toContain('Retroceder 5 segundos');
    expect(html).toContain('Adelantar 5 segundos');
    expect(html).toContain('Deshacer última marca');
    expect(html).toContain('Abrir ajuste fino en lupa');
    expect(html).toContain('esperando marca');
    expect(html).toContain('Karaoke');
  });

  it('muestra el estado vacío cuando no hay audio', () => {
    const html = renderToString(
      <LineSyncScreen
        hasAudio={false}
        peaks={[]}
        currentTimeMs={0}
        durationMs={0}
        isPlaying={false}
        playbackRate={1}
        lines={[]}
        activeLineIndex={0}
        canUndo={false}
        syncMode="line"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onUndo={vi.fn()}
        onSelectLine={vi.fn()}
        onStampLine={vi.fn()}
        onOpenLoupe={vi.fn()}
        onStopBurst={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
        onUseDemo={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Subir audio');
    expect(html).toContain('Usar demo');
    expect(html).toContain('accept="audio/*"');
  });
});

describe('WordSyncScreen', () => {
  it('renderiza palabra objetivo a 72px, semáforo Pre-Roll y botón MARCAR PALABRA', () => {
    const html = renderToString(
      <WordSyncScreen
        hasAudio
        peaks={[0.3, 0.7]}
        currentTimeMs={11_600}
        durationMs={120_000}
        isPlaying
        lines={SAMPLE_LINES}
        activeLineIndex={0}
        activeWordIndex={2}
        preRollMs={2500}
        sniperMode
        holdMode={false}
        syncMode="word"
        onSelectMode={vi.fn()}
        onToggleSniper={vi.fn()}
        onToggleHold={vi.fn()}
        onSeek={vi.fn()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onStampWordStart={vi.fn(() => ({
          shouldPause: false,
          shouldRewindPreRoll: false,
          completedLine: false,
        }))}
        onStampWordEnd={vi.fn(() => ({
          shouldPause: false,
          shouldRewindPreRoll: false,
          completedLine: false,
        }))}
        onOpenLoupe={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
        onUseDemo={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('PALABRA OBJETIVO');
    expect(html).toContain('text-[72px]');
    expect(html).toContain('luna');
    expect(html).toContain('Repetir Pre-Roll −2.5 s');
    expect(html).toContain('MARCAR PALABRA');
    expect(html).toContain('Pre-Roll:');
    expect(html).toContain('Francotirador');
    expect(html).toContain('Mantener');
  });
});

describe('KaraokePreview', () => {
  it('renderiza la vista previa karaoke con línea activa, barrido por palabra y aviso de líneas sin sincronizar', () => {
    const html = renderToString(
      <KaraokePreview
        hasAudio
        durationMs={120_000}
        isPlaying={false}
        lines={SAMPLE_LINES}
        syncMode="karaoke"
        pausedTimeMs={13_075}
        getCurrentTimeMs={() => 13_075}
        onSelectMode={vi.fn()}
        onTogglePlay={vi.fn()}
        onSeek={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
        onUseDemo={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Vista previa Karaoke');
    expect(html).toContain('60 FPS');
    expect(html).toContain('data-state="active"');
    expect(html).toContain('data-state="upcoming"');
    expect(html).toContain('--karaoke-fill:50%');
    expect(html).toContain('1 línea sin sincronizar');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('muestra la tarjeta de carga cuando no hay audio en KaraokePreview', () => {
    const html = renderToString(
      <KaraokePreview
        hasAudio={false}
        durationMs={0}
        isPlaying={false}
        lines={[]}
        syncMode="karaoke"
        pausedTimeMs={0}
        getCurrentTimeMs={() => 0}
        onSelectMode={vi.fn()}
        onTogglePlay={vi.fn()}
        onSeek={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
        onUseDemo={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Subir audio');
    expect(html).toContain('Usar demo');
  });
});
