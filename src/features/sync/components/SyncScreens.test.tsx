import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/types';
import { KaraokePreview } from './KaraokePreview';
import { LineRowActionBar, LineTimeEditor } from './LineRowActions';
import { LineSyncScreen } from './LineSyncScreen';
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
      />,
    );

    expect(html).toContain('Sincronizar por línea');
    expect(html).toContain('MARCAR LÍNEA 2');
    expect(html).toContain('Retroceder 5 segundos');
    expect(html).toContain('Adelantar 5 segundos');
    expect(html).toContain('Deshacer última marca');
    expect(html).toContain('Abrir ajuste fino en lupa');
    expect(html).not.toContain('esperando marca');
    expect(html).toContain('--:--.--');
    expect(html).toContain('aria-label="Sin marca de tiempo"');
    expect(html).toContain('w-[8ch]');
    expect(html).toContain('text-acc/70');
    expect(html).toContain('data-playing="true"');
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
        onOpenLoupe={vi.fn()}
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
        onOpenLoupe={vi.fn()}
      />,
    );

    expect(html).toContain('data-expanded="true"');
    expect(html).toContain('data-testid="timeline-expanded-time"');
    expect(html).toContain('data-testid="timeline-floating-indicator"');
    expect(html).toContain('00:14');
  });
});

describe('LineRowActionBar y LineTimeEditor', () => {
  it('renderiza la barra de acciones para línea sincronizada y omite Reproducir desde aquí cuando no tiene marca', () => {
    const syncedHtml = renderToString(
      <LineRowActionBar
        isSynced
        hasSyncedFromHereDown
        onPlayFromHere={vi.fn()}
        onEditTime={vi.fn()}
        onClearMark={vi.fn()}
        onClearMarksFromHere={vi.fn()}
      />,
    );
    expect(syncedHtml).toContain('aria-label="Acciones de línea"');
    expect(syncedHtml).toContain('aria-label="Reproducir desde aquí"');
    expect(syncedHtml).toContain('aria-label="Editar tiempo"');
    expect(syncedHtml).toContain('aria-label="Borrar marca"');
    expect(syncedHtml).toContain('aria-label="Borrar marcas desde esta línea hacia abajo"');
    expect(syncedHtml).toContain('min-h-11 min-w-11');

    const unsyncedHtml = renderToString(
      <LineRowActionBar
        isSynced={false}
        hasSyncedFromHereDown={false}
        onPlayFromHere={vi.fn()}
        onEditTime={vi.fn()}
        onClearMark={vi.fn()}
        onClearMarksFromHere={vi.fn()}
      />,
    );
    expect(unsyncedHtml).not.toContain('Reproducir desde aquí');
    expect(unsyncedHtml).not.toContain('Borrar marca');
    expect(unsyncedHtml).toContain('aria-label="Editar tiempo"');
  });

  it('renderiza el editor de tiempo en línea con botones ±10/±50 ms, aviso de orden y Aceptar/Cancelar', () => {
    const html = renderToString(
      <LineTimeEditor
        lineIndex={1}
        initialStartMs={8_000}
        prevLineStartMs={12_000}
        durationMs={90_000}
        onAccept={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain('Línea 2');
    expect(html).toContain('value="00:08.00"');
    expect(html).toContain('aria-label="Restar 50 milisegundos"');
    expect(html).toContain('aria-label="Restar 10 milisegundos"');
    expect(html).toContain('aria-label="Sumar 10 milisegundos"');
    expect(html).toContain('aria-label="Sumar 50 milisegundos"');
    expect(html).toContain('aria-label="Aceptar tiempo"');
    expect(html).toContain('aria-label="Cancelar edición"');
    expect(html).toContain('Aviso: queda antes de la línea anterior (00:12.00).');
  });
});
