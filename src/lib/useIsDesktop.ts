import { useCallback, useSyncExternalStore } from 'react';

export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

/**
 * Hook que detecta si el viewport es de escritorio (`min-width: 768px`).
 * Seguro para renderizado en Node (valor inicial `false`) y reactivo a cambios.
 */
export function useIsDesktop(query = DESKTOP_MEDIA_QUERY): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mediaQuery = window.matchMedia(query);
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', onStoreChange);
        return () => {
          mediaQuery.removeEventListener('change', onStoreChange);
        };
      }
      mediaQuery.addListener(onStoreChange);
      return () => {
        mediaQuery.removeListener(onStoreChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
