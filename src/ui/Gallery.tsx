import { useState } from 'react';
import {
  Icon,
  IconButton,
  Keycap,
  Lamps,
  NavBar,
  Pill,
  ProgressBar,
  RaisedButton,
  Segmented,
  SyncButton,
  WellPanel,
  type IconName,
} from './index';

const ALL_ICONS: IconName[] = [
  'library',
  'lines',
  'sync',
  'export',
  'play',
  'pause',
  'rewind',
  'forward',
  'undo',
  'replay',
  'copy',
  'download',
  'trash',
  'plus',
  'search',
  'check',
  'back',
  'menu',
];

/**
 * Vista de galería de desarrollo para inspeccionar todos los componentes de «Estudio táctil».
 */
export function Gallery() {
  const [mode, setMode] = useState<'line' | 'word'>('line');
  const [nav, setNav] = useState<'library' | 'lines' | 'sync' | 'export'>('sync');
  const [playing, setPlaying] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6 max-w-3xl mx-auto">
      <header className="relieve rounded-[26px] p-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">Estudio táctil — Galería UI</h1>
          <p className="text-sm text-mute font-semibold">Tokens y componentes base</p>
        </div>
        <Pill variant="ok">Guardado</Pill>
      </header>

      <section className="relieve rounded-[26px] p-5 space-y-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-mute">Botones</h2>
        <div className="flex flex-wrap items-center gap-3">
          <RaisedButton>Por defecto</RaisedButton>
          <RaisedButton variant="acc">Acento</RaisedButton>
          <RaisedButton size="sm">Compacto</RaisedButton>
          <IconButton aria-label="Reproducir" onClick={() => setPlaying((p) => !p)} active={playing}>
            <Icon name={playing ? 'pause' : 'play'} />
          </IconButton>
          <IconButton aria-label="Sincronizar" size="xl" round>
            <Icon name="sync" size={28} />
          </IconButton>
        </div>
        <SyncButton title="MARCAR PALABRA" hint="Mantén pulsado mientras suena" />
      </section>

      <section className="relieve rounded-[26px] p-5 space-y-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-mute">Controles y estado</h2>
        <Segmented
          aria-label="Modo de sincronización"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'line', label: 'Por línea' },
            { value: 'word', label: 'Por palabra' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-4">
          <Lamps lit="amber" />
          <Keycap>Espacio</Keycap>
          <Keycap>R</Keycap>
          <Pill variant="acc">00:42.15</Pill>
          <Pill variant="mute">Pendiente</Pill>
        </div>
        <WellPanel className="space-y-3">
          <ProgressBar value={68} variant="ok" label="Líneas sincronizadas" />
          <ProgressBar value={35} variant="acc" label="Palabras sincronizadas" />
        </WellPanel>
      </section>

      <section className="relieve rounded-[26px] p-5 space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-mute">Iconos</h2>
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-3">
          {ALL_ICONS.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1 text-xs text-mute font-semibold">
              <Icon name={name} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </section>

      <NavBar
        activeId={nav}
        onSelect={setNav}
        items={[
          { id: 'library', label: 'Catálogo', icon: 'library' },
          { id: 'lines', label: 'Letra', icon: 'lines' },
          { id: 'sync', label: 'Sincronizar', icon: 'sync' },
          { id: 'export', label: 'Exportar', icon: 'export' },
        ]}
      />
    </div>
  );
}
