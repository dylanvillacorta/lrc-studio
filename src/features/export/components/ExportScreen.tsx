import { useRef, useState, type ChangeEvent } from 'react';
import {
  exportElrc,
  exportJson,
  exportLrc,
  parseProjectJson,
  type ParsedProjectJson,
} from '@/features/export/model/exporters';
import { downloadTextFile, sanitizeFileName } from '@/lib/download';
import { Icon, Pill, RaisedButton, Segmented, WellPanel } from '@/ui';
import type { ExportFormat, ProjectFullData, SongMetadata } from '@/types';

export interface ExportScreenProps {
  project: ProjectFullData;
  album?: string;
  offsetMs?: number;
  onImport: (parsed: ParsedProjectJson) => void;
}

const FORMAT_OPTIONS: readonly { value: ExportFormat; label: string }[] = [
  { value: 'lrc', label: 'LRC' },
  { value: 'elrc', label: 'ELRC' },
  { value: 'json', label: 'JSON' },
];

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  lrc: 'text/plain;charset=utf-8',
  elrc: 'text/plain;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continúa al respaldo con execCommand
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Pantalla de exportación a LRC, ELRC y JSON e importación de proyectos JSON.
 */
export function ExportScreen({
  project,
  album = '',
  offsetMs = 0,
  onImport,
}: ExportScreenProps) {
  const [format, setFormat] = useState<ExportFormat>('lrc');
  const [copyStatus, setCopyStatus] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [importSuccess, setImportSuccess] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const metadata: SongMetadata = {
    title: project.title,
    artist: project.artist,
    album,
    offsetMs,
  };

  const output =
    format === 'lrc'
      ? exportLrc(project.lines, metadata)
      : format === 'elrc'
        ? exportElrc(project.lines, metadata)
        : exportJson(project.lines, metadata, {
            audioFileName: project.audioFileName,
            durationMs: project.durationMs,
          });

  const missingMarks =
    project.totalLines === 0 || project.syncedLines < project.totalLines;

  const handleCopy = async () => {
    const ok = await copyTextWithFallback(output);
    setCopyStatus(
      ok
        ? `Contenido ${format.toUpperCase()} copiado al portapapeles.`
        : 'No se pudo copiar al portapapeles.',
    );
  };

  const handleDownload = () => {
    const artist = project.artist.trim() || 'Artista';
    const title = project.title.trim() || 'Sin título';
    const fileName = sanitizeFileName(`${artist} - ${title}.${format}`);
    downloadTextFile(fileName, output, MIME_BY_FORMAT[format]);
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }

    setImportError('');
    setImportSuccess('');

    try {
      const text = await file.text();
      const result = parseProjectJson(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      onImport(result.data);
      setImportSuccess(`Proyecto «${file.name}» importado correctamente.`);
    } catch {
      setImportError('No se pudo leer el archivo JSON seleccionado.');
    }
  };

  return (
    <section
      aria-label="Exportar e importar proyecto"
      className="flex flex-col gap-4 w-full max-w-4xl mx-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={FORMAT_OPTIONS}
          value={format}
          onChange={(next) => {
            setFormat(next);
            setCopyStatus('');
          }}
          aria-label="Formato de exportación"
          className="w-full sm:w-auto sm:min-w-[260px]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Pill>
            {`${project.syncedLines} de ${project.totalLines} líneas sincronizadas`}
          </Pill>
          <Pill>
            {`${project.syncedWords} de ${project.totalWords} palabras`}
          </Pill>
        </div>
      </div>

      {missingMarks && (
        <div
          role="status"
          className="hundido rounded-[18px] px-4 py-3 text-sm text-ink flex items-start gap-2.5 border border-acc/30"
        >
          <Icon
            name="sync"
            size={18}
            className="text-acc shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="leading-snug">
            {project.totalLines === 0
              ? 'El proyecto aún no tiene líneas de letra.'
              : 'Faltan marcas de tiempo en algunas líneas; las líneas sin sincronizar se exportarán en 00:00.00.'}
          </p>
        </div>
      )}

      <WellPanel className="p-0 overflow-hidden">
        <pre className="font-mono text-xs sm:text-sm leading-relaxed text-ink p-4 max-h-[340px] overflow-auto overscroll-contain whitespace-pre">
          {output}
        </pre>
      </WellPanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <RaisedButton onClick={handleCopy}>
            <Icon name="copy" size={18} aria-hidden="true" />
            <span>Copiar</span>
          </RaisedButton>

          <RaisedButton variant="acc" onClick={handleDownload}>
            <Icon name="download" size={18} aria-hidden="true" />
            <span>{`Descargar .${format}`}</span>
          </RaisedButton>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="sr-only"
            aria-label="Seleccionar archivo JSON de proyecto"
          />
          <RaisedButton
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="export" size={16} aria-hidden="true" />
            <span>Importar proyecto JSON</span>
          </RaisedButton>
        </div>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm font-semibold">
        {copyStatus && <p className="text-ink">{copyStatus}</p>}
        {importSuccess && <p className="text-ink">{importSuccess}</p>}
        {importError && (
          <p role="alert" className="text-acc">
            {importError}
          </p>
        )}
      </div>
    </section>
  );
}
