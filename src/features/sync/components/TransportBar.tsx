import { memo } from 'react';
import { Icon, IconButton } from '@/ui';
import { getNextPlaybackRate } from './syncViewHelpers';

export interface TransportBarProps {
  isPlaying: boolean;
  playbackRate: number;
  durationMs: number;
  readNowMs: () => number;
  onSeek: (targetMs: number) => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  /** Reduce alturas (modo Palabra en móvil). */
  compact?: boolean;
}

/** Transporte móvil: velocidad, −5 s, reproducir/pausa y +5 s. */
export const TransportBar = memo(function TransportBar({
  isPlaying,
  playbackRate,
  durationMs,
  readNowMs,
  onSeek,
  onTogglePlay,
  onChangePlaybackRate,
  compact = false,
}: TransportBarProps) {
  const small = compact
    ? 'min-h-10 min-w-10'
    : 'min-h-11 min-w-11 [@media(max-height:720px)]:min-h-10 [@media(max-height:720px)]:min-w-10';
  const big = compact
    ? 'min-h-11 min-w-11'
    : 'min-h-12 min-w-12 [@media(max-height:720px)]:min-h-11 [@media(max-height:720px)]:min-w-11';
  return (
    <div className="flex items-center justify-between px-0.5 flex-none">
      <IconButton
        aria-label={`Velocidad ${playbackRate}x`}
        onClick={() => onChangePlaybackRate(getNextPlaybackRate(playbackRate))}
        className={`font-mono text-xs font-extrabold ${small} ${
          playbackRate !== 1 ? 'text-acc' : ''
        }`}
      >
        <span>{`${playbackRate}×`}</span>
      </IconButton>

      <IconButton
        round
        aria-label="Retroceder 5 segundos"
        onClick={() => onSeek(Math.max(0, readNowMs() - 5000))}
        className={small}
      >
        <Icon name="rewind" size={18} />
      </IconButton>

      <IconButton
        round
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        onClick={onTogglePlay}
        className={`text-acc ${big}`}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
      </IconButton>

      <IconButton
        round
        aria-label="Adelantar 5 segundos"
        onClick={() => onSeek(Math.min(durationMs, readNowMs() + 5000))}
        className={small}
      >
        <Icon name="forward" size={18} />
      </IconButton>
    </div>
  );
});
