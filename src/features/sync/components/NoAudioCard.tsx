import { useRef, useState, type ChangeEvent } from 'react';
import {
  SUPPORTED_AUDIO_FORMATS_LABEL,
  UNSUPPORTED_AUDIO_FORMAT_MESSAGE,
  getAudioInputAccept,
  isSupportedAudioFile,
} from '@/lib/audioFormats';
import { Icon, Pill, RaisedButton, WellPanel } from '@/ui';
import { formatAudioDecodeError } from './syncViewHelpers';

export interface NoAudioCardProps {
  onUploadAudio: (file: File) => Promise<void>;
  onUseDemo: () => Promise<void>;
}

/**
 * Tarjeta de estado vacío cuando el proyecto activo aún no tiene pista de audio.
 */
export function NoAudioCard({ onUploadAudio, onUseDemo }: NoAudioCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const accept = getAudioInputAccept();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!isSupportedAudioFile(file)) {
      setErrorMsg(UNSUPPORTED_AUDIO_FORMAT_MESSAGE);
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await onUploadAudio(file);
    } catch (err) {
      setErrorMsg(formatAudioDecodeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onUseDemo();
    } catch (err) {
      setErrorMsg(formatAudioDecodeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Sin pista de audio"
      className="flex-1 flex flex-col justify-center gap-4 py-4"
    >
      <WellPanel className="p-5 flex flex-col gap-4 text-center items-center">
        <div
          aria-hidden="true"
          className="w-14 h-14 rounded-[18px] relieve flex items-center justify-center text-acc"
        >
          <Icon name="sync" size={28} />
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-lg font-extrabold text-ink">
            Carga una pista para sincronizar
          </h2>
          <p className="m-0 text-sm font-semibold text-mute leading-relaxed">
            Sube un audio desde tu dispositivo, iCloud, Google Drive u otros proveedores ({SUPPORTED_AUDIO_FORMATS_LABEL}) o prueba al instante con la canción de demostración.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept || undefined}
          onChange={handleFileChange}
          aria-label="Seleccionar archivo de audio"
          className="sr-only"
        />

        <div className="w-full flex flex-col gap-3 pt-1">
          <RaisedButton
            variant="acc"
            disabled={busy}
            aria-busy={busy}
            onClick={() => inputRef.current?.click()}
            className="w-full min-h-12"
          >
            <Icon name="plus" size={20} />
            <span>{busy ? 'Procesando audio…' : 'Subir audio'}</span>
          </RaisedButton>

          <RaisedButton
            disabled={busy}
            onClick={handleDemo}
            className="w-full min-h-12"
          >
            <Icon name="play" size={20} />
            <span>Usar demo</span>
          </RaisedButton>
        </div>

        {busy ? (
          <p role="status" className="m-0 text-xs font-semibold text-mute">
            Leyendo y decodificando el archivo de audio…
          </p>
        ) : null}

        {errorMsg ? (
          <Pill variant="acc" className="w-full justify-center py-2 text-center">
            <span role="alert">{errorMsg}</span>
          </Pill>
        ) : null}
      </WellPanel>
    </section>
  );
}
