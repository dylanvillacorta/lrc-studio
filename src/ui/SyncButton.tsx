import type { ButtonHTMLAttributes } from 'react';

export interface SyncButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  hint?: string;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Botón gigante de sincronización con soporte táctil y de puntero.
 */
export function SyncButton({
  title,
  hint,
  type = 'button',
  className = '',
  ...props
}: SyncButtonProps) {
  return (
    <button
      type={type}
      className={`w-full min-h-[104px] rounded-[34px] text-white border-0 bg-[linear-gradient(145deg,#C8452D,#A93219)] shadow-[var(--shadow-sync)] flex flex-col items-center justify-center gap-1 flex-none cursor-pointer select-none transition-transform active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING} ${className}`.trim()}
      {...props}
    >
      <span className="font-extrabold text-[21px] tracking-[0.05em] leading-tight">
        {title}
      </span>
      {hint ? (
        <span className="text-[13px] font-semibold opacity-95 leading-tight">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
