import { RaisedButton } from '@/ui';

export interface UpdateBannerProps {
  updateAvailable: boolean;
  onUpdate: () => void | Promise<void>;
}

export function UpdateBanner({ updateAvailable, onUpdate }: UpdateBannerProps) {
  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-[var(--chassis-hi)] px-4 py-2 text-sm text-[var(--ink)] shadow-sm"
    >
      <span>Nueva versión disponible · Actualizar</span>
      <RaisedButton
        type="button"
        variant="acc"
        onClick={() => {
          void onUpdate();
        }}
        className="min-h-[48px] px-4"
      >
        Actualizar
      </RaisedButton>
    </div>
  );
}
