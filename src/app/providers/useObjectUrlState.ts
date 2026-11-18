import { useCallback, useEffect, useRef, useState } from 'react';
import { revokeAudioObjectUrl } from '@/features/session';

/**
 * Administra una `ObjectURL` de audio revocando automáticamente la anterior
 * al reemplazarla o al desmontar el componente.
 */
export function useObjectUrlState(): {
  audioUrl: string | null;
  replaceAudioUrl: (nextUrl: string | null) => void;
} {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  const replaceAudioUrl = useCallback((nextUrl: string | null) => {
    if (activeUrlRef.current && activeUrlRef.current !== nextUrl) {
      revokeAudioObjectUrl(activeUrlRef.current);
    }
    activeUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }, []);

  useEffect(() => {
    return () => {
      revokeAudioObjectUrl(activeUrlRef.current);
      activeUrlRef.current = null;
    };
  }, []);

  return { audioUrl, replaceAudioUrl };
}
