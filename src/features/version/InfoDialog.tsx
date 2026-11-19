import { useEffect, useId, useRef } from 'react';
import { Icon, RaisedButton, ScrollShadow, WellPanel } from '@/ui';

export interface InfoDialogProps {
  open: boolean;
  onClose: () => void;
  version?: string;
  commit?: string;
  builtAt?: string | null;
  domain?: string;
  updateAvailable: boolean;
  checking?: boolean;
  checkMessage?: string | null;
  onCheckUpdates: () => void | Promise<unknown>;
  onApplyUpdate: () => void | Promise<void>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Formatea la fecha de compilación ISO para mostrarla de forma legible.
 */
export function formatBuildDate(builtAt: string | null | undefined): string {
  if (!builtAt) {
    return 'Compilación local';
  }
  const timestamp = Date.parse(builtAt);
  if (Number.isNaN(timestamp)) {
    return builtAt;
  }
  return new Date(timestamp).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Devuelve el dominio actual de la aplicación o el dominio por defecto en SSR.
 */
export function resolveAppDomain(override?: string): string {
  if (override) {
    return override;
  }
  if (typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return 'lrc.dirtykeras.com';
}

/**
 * Diálogo accesible «Info» con versión, commit, fecha de compilación, dominio
 * y botón para buscar actualizaciones reutilizando `useVersionCheck`.
 */
export function InfoDialog({
  open,
  onClose,
  version = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0',
  commit = typeof APP_COMMIT !== 'undefined' ? APP_COMMIT : 'dev',
  builtAt = null,
  domain,
  updateAvailable,
  checking = false,
  checkMessage = null,
  onCheckUpdates,
  onApplyUpdate,
}: InfoDialogProps) {
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

  const resolvedDomain = resolveAppDomain(domain);

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
        className="relieve w-full max-w-sm max-h-[85dvh] rounded-[26px] bg-bg text-ink p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between gap-3 flex-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-full boton grid place-items-center text-acc shrink-0"
            >
              <Icon name="info" size={20} />
            </div>
            <h2
              id={titleId}
              className="m-0 text-lg font-extrabold text-ink truncate"
            >
              LRC Studio
            </h2>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar información"
            className="boton w-11 h-11 min-w-[44px] min-h-[44px] rounded-[14px] grid place-items-center text-ink cursor-pointer active:shadow-[inset_3px_3px_7px_#C4BEB4,inset_-3px_-3px_7px_#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <ScrollShadow className="flex-1 min-h-0" contentClassName="flex flex-col gap-3">
          <WellPanel className="p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-mute">Versión</span>
              <span className="font-mono font-bold text-ink tabular-nums">
                {`v${version}`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-mute">Commit</span>
              <span className="font-mono font-bold text-ink tabular-nums">
                {commit}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-mute">Compilación</span>
              <span className="font-semibold text-ink text-right">
                {formatBuildDate(builtAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-mute">Dominio</span>
              <span className="font-mono text-xs font-bold text-ink truncate">
                {resolvedDomain}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm pt-1 border-t border-lo/40">
              <span className="font-bold text-mute">Creado por</span>
              <a
                href="https://dylanvillacorta.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-[44px] px-2 -mr-2 font-extrabold text-ink underline decoration-acc/60 underline-offset-4 hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc rounded-[10px]"
              >
                Dylan Villacorta
              </a>
            </div>
          </WellPanel>

          <div aria-live="polite" className="min-h-5 text-xs font-bold text-mute">
            {checkMessage ? <p className="m-0 text-ink">{checkMessage}</p> : null}
          </div>
        </ScrollShadow>

        <div className="flex flex-col gap-2.5 flex-none">
          <RaisedButton
            type="button"
            onClick={() => {
              void onCheckUpdates();
            }}
            disabled={checking}
            className="w-full"
          >
            <Icon name="sync" size={18} aria-hidden="true" />
            <span>{checking ? 'Comprobando...' : 'Buscar actualizaciones'}</span>
          </RaisedButton>

          {updateAvailable ? (
            <RaisedButton
              type="button"
              variant="acc"
              onClick={() => {
                void onApplyUpdate();
              }}
              className="w-full"
            >
              <Icon name="download" size={18} aria-hidden="true" />
              <span>Actualizar ahora</span>
            </RaisedButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
