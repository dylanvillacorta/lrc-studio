import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface AccessibleDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Cascarón accesible para diálogos modales: cierre con Escape, foco atrapado,
 * restauración de foco al cerrar y botón de cierre táctil de 44 px.
 */
export function AccessibleDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  closeLabel = 'Cerrar diálogo',
  children,
}: AccessibleDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    closeBtnRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        return;
      }

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relieve w-full max-w-md max-h-[85dvh] rounded-[26px] bg-bg text-ink p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between gap-3 flex-none">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon ? (
              <div
                aria-hidden="true"
                className="w-10 h-10 rounded-full boton grid place-items-center text-acc shrink-0"
              >
                {icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="m-0 text-base font-extrabold tracking-tight text-ink truncate"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="m-0 text-xs font-semibold text-mute truncate">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="boton min-h-11 min-w-11 rounded-full grid place-items-center text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc shrink-0"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
