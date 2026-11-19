import type { HTMLAttributes } from 'react';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'ok' | 'acc' | 'mute';
}

const VARIANT_CLASSES: Record<NonNullable<PillProps['variant']>, string> = {
  ok: 'text-ok',
  acc: 'text-acc',
  mute: 'text-mute',
};

/**
 * Insignia hundida para tiempos, estados y etiquetas.
 */
export function Pill({
  variant = 'mute',
  className = '',
  children,
  ...props
}: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[10px] text-xs font-extrabold bg-bg shadow-[var(--shadow-hundido-sm)] ${VARIANT_CLASSES[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
