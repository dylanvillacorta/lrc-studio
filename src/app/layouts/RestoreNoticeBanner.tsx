import { useState } from 'react';
import { RaisedButton } from '@/ui';

export interface RestoreNoticeBannerProps {
  /** Mensaje de restauración (error o proyecto no restaurable); `null` oculta el aviso. */
  message: string | null;
}

/**
 * Aviso visible cuando la sesión guardada no se pudo restaurar. Nunca se pierde en silencio.
 */
export function RestoreNoticeBanner({ message }: RestoreNoticeBannerProps) {
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  if (!message || dismissedMessage === message) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="restore-notice"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-[var(--chassis-hi)] px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-sm"
    >
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <RaisedButton
        type="button"
        size="sm"
        onClick={() => setDismissedMessage(message)}
        className="min-h-[48px] px-4"
      >
        Entendido
      </RaisedButton>
    </div>
  );
}
