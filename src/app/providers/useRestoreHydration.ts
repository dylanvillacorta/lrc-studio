import { useEffect, useRef } from 'react';
import type { RestorePlan, SessionRestoreStatus } from '@/features/session';

export interface UseRestoreHydrationParams {
  status: SessionRestoreStatus;
  plan: RestorePlan | null;
  hasManualOverride: boolean;
  onHydrate: (plan: RestorePlan) => void;
}

/**
 * Ejecuta la hidratación inicial del proyecto restaurado una sola vez al completarse
 * `useSessionRestore`, resistiendo el doble montaje de `React.StrictMode`.
 */
export function useRestoreHydration({
  status,
  plan,
  hasManualOverride,
  onHydrate,
}: UseRestoreHydrationParams): void {
  const hydratedRef = useRef(false);
  const onHydrateRef = useRef(onHydrate);

  useEffect(() => {
    onHydrateRef.current = onHydrate;
  }, [onHydrate]);

  useEffect(() => {
    if (
      status !== 'ready' ||
      !plan ||
      hydratedRef.current ||
      hasManualOverride
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (hydratedRef.current) {
        return;
      }
      hydratedRef.current = true;
      onHydrateRef.current(plan);
    }, 0);

    return () => clearTimeout(timer);
  }, [hasManualOverride, plan, status]);
}
