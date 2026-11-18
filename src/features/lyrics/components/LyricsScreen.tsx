import { memo, useMemo, useState } from 'react';
import { INITIAL_DEMO_LYRICS } from '@/features/lyrics/model/lyricsParser';
import {
  countLyricsStats,
  estimateLyricsApplyImpact,
} from '@/features/lyrics/components/lyricsStats';
import { Icon, Pill, RaisedButton, WellPanel } from '@/ui';
import type { LyricLine } from '@/types';

export interface LyricsScreenProps {
  title: string;
  artist: string;
  rawText: string;
  existingLines: readonly LyricLine[];
  onTitleChange: (title: string) => void;
  onArtistChange: (artist: string) => void;
  onApply: (rawText: string) => void;
  onLoadDemo?: () => void;
}

const INPUT_CLASS =
  'hundido w-full min-h-12 rounded-[16px] px-3.5 py-2.5 text-sm font-semibold text-ink placeholder:text-mute/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-1 focus-visible:ring-offset-bg';

/**
 * Pantalla de edición y pegado de letra con preservación de marcas temporales.
 */
export const LyricsScreen = memo(function LyricsScreen({
  title,
  artist,
  rawText,
  existingLines,
  onTitleChange,
  onArtistChange,
  onApply,
  onLoadDemo,
}: LyricsScreenProps) {
  const [draftText, setDraftText] = useState(rawText);
  const [lastSyncedRawText, setLastSyncedRawText] = useState(rawText);

  if (rawText !== lastSyncedRawText) {
    setLastSyncedRawText(rawText);
    setDraftText(rawText);
  }

  const hasUnsavedChanges = draftText !== rawText;
  const stats = useMemo(() => countLyricsStats(draftText), [draftText]);
  const impact = useMemo(
    () => estimateLyricsApplyImpact(draftText, existingLines),
    [draftText, existingLines],
  );

  const handleLoadDemo = () => {
    if (onLoadDemo) {
      onLoadDemo();
      return;
    }
    setDraftText(INITIAL_DEMO_LYRICS);
  };

  return (
    <section
      aria-label="Editor de letra"
      className="flex flex-col gap-4 w-full max-w-4xl mx-auto"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-mute">
            Título de la canción
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Ej. Luces de neón"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-mute">
            Artista
          </span>
          <input
            type="text"
            value={artist}
            onChange={(e) => onArtistChange(e.target.value)}
            placeholder="Ej. Estudio Nocturno"
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>
            {`${stats.lineCount} ${stats.lineCount === 1 ? 'línea' : 'líneas'} · ${stats.wordCount} ${stats.wordCount === 1 ? 'palabra' : 'palabras'}`}
          </Pill>
          <Pill className={hasUnsavedChanges ? 'text-acc font-extrabold' : ''}>
            {hasUnsavedChanges ? 'Cambios sin aplicar' : 'Letra aplicada'}
          </Pill>
        </div>

        <RaisedButton size="sm" onClick={handleLoadDemo}>
          <Icon name="lines" size={16} aria-hidden="true" />
          <span>Cargar letra de ejemplo</span>
        </RaisedButton>
      </div>

      {hasUnsavedChanges && impact.lostMarks > 0 && (
        <div
          role="status"
          className="hundido rounded-[18px] px-4 py-3 text-sm text-ink flex items-start gap-2.5 border border-acc/30"
        >
          <Icon
            name="sync"
            size={18}
            className="text-acc shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="leading-snug">
            Al aplicar esta letra se conservarán{' '}
            <strong>{impact.preservedMarks}</strong>{' '}
            {impact.preservedMarks === 1 ? 'marca' : 'marcas'} y se perderán{' '}
            <strong>{impact.lostMarks}</strong>{' '}
            {impact.lostMarks === 1 ? 'marca ya sincronizada' : 'marcas ya sincronizadas'}
            .
          </p>
        </div>
      )}

      <WellPanel className="p-2">
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Letra de la canción, una línea por verso</span>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={12}
            placeholder="Pega o escribe aquí la letra, una línea por verso..."
            className="w-full min-h-[260px] bg-transparent p-2.5 text-base leading-relaxed text-ink placeholder:text-mute/70 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc rounded-[14px]"
          />
        </label>
      </WellPanel>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <RaisedButton
          variant="acc"
          onClick={() => onApply(draftText)}
          disabled={!hasUnsavedChanges}
        >
          <Icon name="check" size={18} aria-hidden="true" />
          <span>Aplicar letra</span>
        </RaisedButton>
      </div>
    </section>
  );
});
