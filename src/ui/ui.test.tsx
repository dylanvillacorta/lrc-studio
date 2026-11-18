import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Gallery } from './Gallery';
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
} from './index';

describe('src/ui componentes', () => {
  it('renderiza RaisedButton en variantes default y acc', () => {
    const htmlDefault = renderToString(<RaisedButton>Guardar</RaisedButton>);
    const htmlAcc = renderToString(<RaisedButton variant="acc">Exportar</RaisedButton>);
    expect(htmlDefault).toContain('<button');
    expect(htmlDefault).toContain('Guardar');
    expect(htmlAcc).toContain('Exportar');
  });

  it('renderiza IconButton con aria-label y estado activo', () => {
    const html = renderToString(
      <IconButton aria-label="Reproducir" size="xl" active>
        <Icon name="play" />
      </IconButton>,
    );
    expect(html).toContain('aria-label="Reproducir"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renderiza WellPanel, Keycap y Pill', () => {
    const html = renderToString(
      <WellPanel>
        <Keycap>Espacio</Keycap>
        <Pill variant="ok">Listo</Pill>
      </WellPanel>,
    );
    expect(html).toContain('Espacio');
    expect(html).toContain('Listo');
    expect(html).toContain('<kbd');
  });

  it('renderiza Segmented con opción activa', () => {
    const html = renderToString(
      <Segmented
        aria-label="Modo"
        value="word"
        onChange={() => {}}
        options={[
          { value: 'line', label: 'Línea' },
          { value: 'word', label: 'Palabra' },
        ]}
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Modo"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('renderiza SyncButton como button real con título y pista', () => {
    const html = renderToString(
      <SyncButton title="MARCAR" hint="Mantén pulsado" onPointerDown={() => {}} onPointerUp={() => {}} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('MARCAR');
    expect(html).toContain('Mantén pulsado');
  });

  it('renderiza Lamps con estado accesible', () => {
    const html = renderToString(<Lamps lit="green" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Pre-Roll: ¡ahora!"');
  });

  it('renderiza ProgressBar con role progressbar y aria-valuenow', () => {
    const html = renderToString(<ProgressBar value={75} variant="acc" label="Progreso" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="75"');
    expect(html).toContain('aria-label="Progreso"');
  });

  it('renderiza NavBar con 4 elementos y uno activo', () => {
    const html = renderToString(
      <NavBar
        activeId="sync"
        onSelect={() => {}}
        items={[
          { id: 'library', label: 'Catálogo', icon: 'library' },
          { id: 'lines', label: 'Letra', icon: 'lines' },
          { id: 'sync', label: 'Sincronizar', icon: 'sync' },
          { id: 'export', label: 'Exportar', icon: 'export' },
        ]}
      />,
    );
    expect(html).toContain('<nav');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Catálogo');
    expect(html).toContain('Exportar');
  });

  it('renderiza Gallery sin errores', () => {
    const html = renderToString(<Gallery />);
    expect(html).toContain('Estudio táctil — Galería UI');
  });
});
