import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@/types';
import { CatalogPanel } from './CatalogPanel';
import { ProjectCard } from './ProjectCard';

const noop = () => {};

const sampleProjects: ProjectSummary[] = [
  {
    id: 'p1',
    title: 'Noches de Verano',
    artist: 'Luna Alba',
    audioFileName: 'noches_de_verano.mp3',
    durationMs: 210_000,
    totalLines: 24,
    syncedLines: 18,
    totalWords: 120,
    syncedWords: 74,
    lineProgress: 75,
    wordProgress: 62,
    updatedAt: 1_700_000_000_000,
  },
  {
    id: 'p2',
    title: 'Costa Norte',
    artist: 'Faro',
    audioFileName: '',
    durationMs: 0,
    totalLines: 20,
    syncedLines: 0,
    totalWords: 80,
    syncedWords: 0,
    lineProgress: 0,
    wordProgress: 0,
    updatedAt: 1_699_990_000_000,
  },
];

describe('CatalogPanel y ProjectCard', () => {
  it('ProjectCard renderiza título, porcentajes, progressbar y aria-label de acciones', () => {
    const html = renderToString(
      <ProjectCard
        project={sampleProjects[0]!}
        isActive
        now={1_700_000_180_000}
        onOpen={noop}
        onDuplicate={noop}
        onExportBackup={noop}
        onDelete={noop}
      />,
    );

    expect(html).toContain('Noches de Verano');
    expect(html).toContain('Luna Alba');
    expect(html).toContain('noches_de_verano.mp3');
    expect(html).toContain('EN CURSO');
    expect(html).toContain('18/24 · 75%');
    expect(html).toContain('62%');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Duplicar"');
    expect(html).toContain('aria-label="Exportar respaldo .json"');
    expect(html).toContain('aria-label="Eliminar"');
    expect(html).toContain('Continuar');
    expect(html).toContain('hace 3 min');
  });

  it('CatalogPanel renderiza cabecera, buscador, botón Nueva y tarjetas', () => {
    const html = renderToString(
      <CatalogPanel
        projects={sampleProjects}
        activeProjectId="p1"
        now={1_700_000_180_000}
        onOpen={noop}
        onCreate={noop}
        onDuplicate={noop}
        onExportBackup={noop}
        onDelete={noop}
      />,
    );

    expect(html).toContain('Mis transcripciones');
    expect(html).toContain('2 canciones');
    expect(html).toContain('Buscar título o artista');
    expect(html).toContain('aria-label="Nueva transcripción"');
    expect(html).toContain('Noches de Verano');
    expect(html).toContain('Costa Norte');
    expect(html).toContain('NUEVA');
    expect(html).toContain('Abrir');
  });

  it('CatalogPanel muestra estado vacío en español cuando no hay canciones', () => {
    const html = renderToString(
      <CatalogPanel
        projects={[]}
        activeProjectId={null}
        onOpen={noop}
        onCreate={noop}
        onDuplicate={noop}
        onExportBackup={noop}
        onDelete={noop}
      />,
    );

    expect(html).toContain('0 canciones');
    expect(html).toContain('Aún no tienes transcripciones guardadas.');
  });
});
