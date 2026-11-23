import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/types';
import { KaraokePreview } from './KaraokePreview';
import { LineRowActionBar } from './LineRowActions';
import { findLastMarkedLineIndex, LineSyncScreen } from './LineSyncScreen';
import { WaveformStrip } from './WaveformStrip';
import { WordSyncScreen } from './WordSyncScreen';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
        playingLineIndex={0}
        syncMode="line"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onSelectLine={vi.fn()}
        onClearLineMark={vi.fn()}
        onStampLine={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Sincronizar por línea');
    expect(html).toContain('MARCAR LÍNEA 2');
    expect(html).toContain('Retroceder 5 segundos');
    expect(html).toContain('Adelantar 5 segundos');
    expect(html).toContain('aria-label="Deshacer última marca de línea"');
    expect(html).not.toContain('aria-label="Deshacer última marca"');
    expect(html).not.toContain('Abrir ajuste fino en lupa');
    expect(html).not.toContain('Lupa');
    expect(html).not.toContain('esperando marca');
    expect(html).toContain('--:--.--');
    expect(html).toContain('aria-label="Sin marca de tiempo"');
    expect(html).toContain('w-[8ch]');
    expect(html).toContain('text-acc/70');
    expect(html).toContain('data-playing="true"');
    expect(html).toContain('Karaoke');
    expect(html).not.toContain('Ráfaga');
  });

  it('deshabilita el botón de deshacer última marca de línea cuando ninguna línea tiene marca y resuelve el último índice marcado hacia atrás', () => {
    const unmarkedLines: LyricLine[] = SAMPLE_LINES.map((line) => ({
      ...line,
      startMs: null,
      endMs: null,
    }));
    const html = renderToString(
      <LineSyncScreen
        hasAudio
        peaks={[0.2, 0.8, 0.5]}
        currentTimeMs={0}
        durationMs={120_000}
        isPlaying={false}
        playbackRate={1}
        lines={unmarkedLines}
        activeLineIndex={0}
        syncMode="line"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onSelectLine={vi.fn()}
        onClearLineMark={vi.fn()}
        onStampLine={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
      />,
    );
    expect(html).toMatch(/<button[^>]*aria-label="Deshacer última marca de línea"[^>]*disabled=""/);

    const threeLines: LyricLine[] = [
      { id: 'a', text: 'Uno', startMs: 1000, endMs: null, words: [] },
      { id: 'b', text: 'Dos', startMs: null, endMs: null, words: [] },
      { id: 'c', text: 'Tres', startMs: 3000, endMs: null, words: [] },
    ];
    expect(findLastMarkedLineIndex(threeLines)).toBe(2);
    expect(
      findLastMarkedLineIndex(
        threeLines.map((l, idx) => (idx === 2 ? { ...l, startMs: null } : l)),
      ),
    ).toBe(0);
    expect(findLastMarkedLineIndex(unmarkedLines)).toBe(-1);
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
        syncMode="line"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onSelectLine={vi.fn()}
        onStampLine={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Subir audio');
    expect(html).not.toContain('Usar demo');
    expect(html).not.toContain('accept=');
    expect(html).toContain('FLAC');
    expect(html).toContain('iCloud, Google Drive');

    vi.stubGlobal('navigator', undefined);
    const ssrHtml = renderToString(
      <LineSyncScreen
        hasAudio={false}
        peaks={[]}
        currentTimeMs={0}
        durationMs={0}
        isPlaying={false}
        playbackRate={1}
        lines={[]}
        activeLineIndex={0}
        syncMode="line"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onSelectLine={vi.fn()}
        onStampLine={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
      />,
    );
    expect(ssrHtml).not.toContain('accept=');
    expect(ssrHtml).toContain('FLAC');
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
        syncMode="word"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onPlay={vi.fn()}
        playbackRate={1}
        onPlayFrom={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onStampWordStart={vi.fn(() => ({ completedAll: false }))}
        onSelectWord={vi.fn()}
        onUndoWord={vi.fn(() => null)}
        canUndoWord
        onUploadAudio={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('PALABRA OBJETIVO');
    expect(html).toContain('aria-label="Pausar"');
    expect(html).toContain('aria-label="Velocidad 1x"');
    expect(html).toContain('aria-label="Retroceder 5 segundos"');
    expect(html).toContain('text-[72px]');
    expect(html).toContain('luna');
    expect(html).toContain('Repetir Pre-Roll −2.5 s');
    expect(html).toContain('MARCAR PALABRA');
    expect(html).toContain('Pre-Roll:');
    expect(html).toContain('Toca al sonar «luna»');
    expect(html).toContain('aria-label="Deshacer última palabra"');
    expect(html).not.toContain('Francotirador');
    expect(html).not.toContain('Mantener');
    expect(html).not.toContain('← la');
    expect(html).not.toContain('inicio');
    expect(html).not.toContain('fin →');
  });

  it('desactiva Deshacer última palabra sin marcas y MARCAR PALABRA con todo marcado', () => {
    const unmarked: LyricLine[] = SAMPLE_LINES.map((line) => ({
      ...line,
      startMs: null,
      endMs: null,
      words: line.words.map((w) => ({ ...w, startMs: null, endMs: null })),
    }));
    const noMarks = renderToString(
      <WordSyncScreen
        hasAudio
        peaks={[0.3, 0.7]}
        currentTimeMs={0}
        durationMs={120_000}
        isPlaying={false}
        lines={unmarked}
        activeLineIndex={0}
        activeWordIndex={0}
        syncMode="word"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onPlay={vi.fn()}
        playbackRate={1}
        onPlayFrom={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onStampWordStart={vi.fn(() => ({ completedAll: false }))}
        onSelectWord={vi.fn()}
        onUndoWord={vi.fn(() => null)}
        canUndoWord={false}
        onUploadAudio={vi.fn(async () => {})}
      />,
    );
    expect(noMarks).toMatch(
      /<button[^>]*aria-label="Deshacer última palabra"[^>]*disabled=""/,
    );

    const allMarked: LyricLine[] = SAMPLE_LINES.map((line) => ({
      ...line,
      words: line.words.map((w) => ({ ...w, startMs: 1000, endMs: 1500 })),
    }));
    const done = renderToString(
      <WordSyncScreen
        hasAudio
        peaks={[0.3, 0.7]}
        currentTimeMs={0}
        durationMs={120_000}
        isPlaying={false}
        lines={allMarked}
        activeLineIndex={0}
        activeWordIndex={0}
        syncMode="word"
        onSelectMode={vi.fn()}
        onSeek={vi.fn()}
        onPlay={vi.fn()}
        playbackRate={1}
        onPlayFrom={vi.fn()}
        onTogglePlay={vi.fn()}
        onChangePlaybackRate={vi.fn()}
        onStampWordStart={vi.fn(() => ({ completedAll: true }))}
        onSelectWord={vi.fn()}
        onUndoWord={vi.fn(() => null)}
        canUndoWord
        onUploadAudio={vi.fn(async () => {})}
      />,
    );
    expect(done).toContain('Todas las palabras están marcadas');
    expect(done).toContain('aria-label="Reproducir"');
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
      />,
    );

    expect(html).toContain('Vista previa Karaoke');
    expect(html).toContain('60 FPS');
    expect(html).toContain('data-state="active"');
    expect(html).toContain('data-state="upcoming"');
    expect(html).toContain('--karaoke-fill:50%');
    expect(html).toContain('clip-path:inset(0 calc(100% - var(--karaoke-fill, 0%)) 0 0)');
    expect(html).not.toContain('width:var(--karaoke-fill');
    expect(html).not.toContain('transition-all');
    expect(html).toContain('1 línea sin sincronizar');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('omite el selector duplicado cuando showModeSelector es false', () => {
    const html = renderToString(
      <KaraokePreview
        hasAudio
        durationMs={120_000}
        isPlaying={false}
        lines={SAMPLE_LINES}
        syncMode="karaoke"
        pausedTimeMs={13_075}
        getCurrentTimeMs={() => 13_075}
        showModeSelector={false}
        onSelectMode={vi.fn()}
        onTogglePlay={vi.fn()}
        onSeek={vi.fn()}
        onUploadAudio={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Vista previa Karaoke');
    expect(html).not.toContain('Modo de sincronización');
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
      />,
    );

    expect(html).toContain('Subir audio');
    expect(html).not.toContain('Usar demo');
  });
});

describe('WaveformStrip', () => {
  it('renderiza la barra compacta por defecto con touch-action none', () => {
    const html = renderToString(
      <WaveformStrip
        peaks={[0.2, 0.8, 0.5]}
        currentTimeMs={14_000}
        durationMs={120_000}
        lines={SAMPLE_LINES}
        compact
        onSeek={vi.fn()}
      />,
    );

    expect(html).toContain('data-expanded="false"');
    expect(html).toContain('data-testid="timeline-compact-time"');
    expect(html).toContain('touch-action:none');
    expect(html).toContain('00:14');
    expect(html).toContain('02:00');
  });

  it('renderiza la barra expandida con tiempo grande e indicador flotante', () => {
    const html = renderToString(
      <WaveformStrip
        peaks={[0.2, 0.8, 0.5]}
        currentTimeMs={14_000}
        durationMs={120_000}
        lines={SAMPLE_LINES}
        forceExpanded
        onSeek={vi.fn()}
      />,
    );

    expect(html).toContain('data-expanded="true"');
    expect(html).toContain('data-testid="timeline-expanded-time"');
    expect(html).toContain('data-testid="timeline-floating-indicator"');
    expect(html).toContain('00:14');
  });
});

describe('LineRowActionBar', () => {
  it('renderiza la barra de acciones solo con Reproducir desde aquí y Borrar marca cuando tiene marca', () => {
    const syncedHtml = renderToString(
      <LineRowActionBar
        isSynced
        onPlayFromHere={vi.fn()}
        onClearMark={vi.fn()}
      />,
    );
    expect(syncedHtml).toContain('aria-label="Acciones de línea"');
    expect(syncedHtml).toContain('aria-label="Reproducir desde aquí"');
    expect(syncedHtml).toContain('aria-label="Borrar marca"');
    expect(syncedHtml).not.toContain('aria-label="Editar tiempo"');
    expect(syncedHtml).not.toContain('aria-label="Borrar marcas desde esta línea hacia abajo"');
    expect(syncedHtml).toContain('min-h-11 min-w-11');

    const unsyncedHtml = renderToString(
      <LineRowActionBar
        isSynced={false}
        onPlayFromHere={vi.fn()}
        onClearMark={vi.fn()}
      />,
    );
    expect(unsyncedHtml).not.toContain('Reproducir desde aquí');
    expect(unsyncedHtml).not.toContain('Borrar marca');
    expect(unsyncedHtml).not.toContain('Editar tiempo');
    expect(unsyncedHtml).not.toContain('Borrar marcas desde esta línea hacia abajo');
  });
});
