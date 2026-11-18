export type LampColor = 'red' | 'amber' | 'green';

export interface LampsProps {
  lit?: LampColor | null;
  className?: string;
}

const LABELS: Record<LampColor, string> = {
  red: 'Pre-Roll: espera',
  amber: 'Pre-Roll: prepárate',
  green: 'Pre-Roll: ¡ahora!',
};

/**
 * Semáforo de tres luces (rojo, ámbar, verde) para Pre-Roll.
 */
export function Lamps({ lit = null, className = '' }: LampsProps) {
  const statusLabel = lit ? LABELS[lit] : 'Pre-Roll: inactivo';

  return (
    <div
      role="status"
      aria-label={statusLabel}
      className={`flex items-center gap-2.5 ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className={`w-7 h-7 rounded-full transition-shadow ${
          lit === 'red'
            ? 'bg-[#C62F2F] shadow-[0_0_14px_rgba(198,47,47,0.55)] ring-2 ring-ink/20'
            : 'bg-[#D5D0C8] shadow-[inset_3px_3px_6px_var(--color-lo),inset_-3px_-3px_6px_var(--color-hi)]'
        }`}
      />
      <span
        aria-hidden="true"
        className={`w-7 h-7 rounded-full transition-shadow ${
          lit === 'amber'
            ? 'bg-[#E3A008] shadow-[0_0_14px_rgba(227,160,8,0.7)] ring-2 ring-ink/20'
            : 'bg-[#D5D0C8] shadow-[inset_3px_3px_6px_var(--color-lo),inset_-3px_-3px_6px_var(--color-hi)]'
        }`}
      />
      <span
        aria-hidden="true"
        className={`w-7 h-7 rounded-full transition-shadow ${
          lit === 'green'
            ? 'bg-[#1F9D6B] shadow-[0_0_14px_rgba(31,157,107,0.6)] ring-2 ring-ink/20'
            : 'bg-[#D5D0C8] shadow-[inset_3px_3px_6px_var(--color-lo),inset_-3px_-3px_6px_var(--color-hi)]'
        }`}
      />
    </div>
  );
}
