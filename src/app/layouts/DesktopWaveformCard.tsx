import { WaveformStrip } from '@/features/sync/components/WaveformStrip';
import { getNextPlaybackRate } from '@/features/sync/components/syncViewHelpers';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { Icon, IconButton, WellPanel } from '@/ui';

export interface DesktopWaveformCardProps {
  peaks: readonly number[];
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  lines: readonly LyricLine[];
  canUndo: boolean;
  canOpenLoupe: boolean;
  onSeek: (targetMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onUndo: () => void;
  onOpenLoupe: () => void;
}

/**
 * Tarjeta superior del centro en escritorio con onda amplia y controles de transporte.
 */
export function DesktopWaveformCard({
  peaks,
  currentTimeMs,
  durationMs,
  isPlaying,
  playbackRate,
  lines,
  canUndo,
  canOpenLoupe,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onTogglePlay,
  onChangePlaybackRate,
  onUndo,
  onOpenLoupe,
}: DesktopWaveformCardProps) {
  return (
    <WellPanel className="px-4 py-3.5 flex flex-col gap-2.5">
      <WaveformStrip
        peaks={peaks}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        lines={lines}
        onSeek={onSeek}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={canOpenLoupe}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs font-bold text-mute tabular-nums">
          {formatTime(currentTimeMs)}
        </span>

        <div className="flex items-center gap-2.5">
          <IconButton
            aria-label={`Velocidad ${playbackRate}x`}
            onClick={() => onChangePlaybackRate(getNextPlaybackRate(playbackRate))}
            className="font-mono text-xs font-extrabold"
          >
            <span>{`${playbackRate}×`}</span>
          </IconButton>

          <IconButton
            round
            aria-label="Retroceder 5 segundos"
            onClick={() => onSeek(Math.max(0, currentTimeMs - 5000))}
          >
            <Icon name="rewind" size={20} />
          </IconButton>

          <IconButton
            round
            size="xl"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            onClick={onTogglePlay}
            className="text-acc"
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={26} />
          </IconButton>

          <IconButton
            round
            aria-label="Adelantar 5 segundos"
            onClick={() => onSeek(Math.min(durationMs, currentTimeMs + 5000))}
          >
            <Icon name="forward" size={20} />
          </IconButton>

          <IconButton
            aria-label="Deshacer última marca"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Icon name="undo" size={20} />
          </IconButton>
        </div>

        <span className="font-mono text-xs font-bold text-mute tabular-nums">
          {formatTime(durationMs)}
        </span>
      </div>
    </WellPanel>
  );
}
