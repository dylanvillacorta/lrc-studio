export interface ProgressBarProps {
  value: number;
  variant?: 'ok' | 'acc';
  label?: string;
  className?: string;
}

/**
 * Barra de progreso hundida con relleno ok o acc.
 */
export function ProgressBar({
  value,
  variant = 'ok',
  label,
  className = '',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fillClass = variant === 'acc' ? 'bg-acc' : 'bg-ok';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-2.5 rounded-[6px] bg-bg shadow-[inset_2px_2px_4px_var(--color-lo),inset_-2px_-2px_4px_var(--color-hi)] overflow-hidden ${className}`.trim()}
    >
      <div
        className={`h-full rounded-[6px] transition-[width] duration-200 ${fillClass}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
