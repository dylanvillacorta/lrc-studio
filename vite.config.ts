import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  const raw = fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? '0.0.0';
}

function resolveCommitSha(): string {
  const fromEnv = process.env.APP_COMMIT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return 'dev';
  }
}

function versionAndSeoPlugin(
  version: string,
  commit: string,
  siteUrl: string,
): Plugin {
  const normalizedUrl = siteUrl.replace(/\/+$/, '');
  return {
    name: 'lrc-version-and-seo',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          {
            version,
            commit,
            builtAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      });

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${normalizedUrl}/sitemap.xml\n`,
      });

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${normalizedUrl}/</loc>`,
          '    <changefreq>weekly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

const appVersion = readPackageVersion();
const appCommit = resolveCommitSha();
const siteUrl = process.env.VITE_SITE_URL?.trim() || 'https://lrc.dirtykeras.com';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionAndSeoPlugin(appVersion, appCommit, siteUrl),
  ],
  define: {
    APP_VERSION: JSON.stringify(appVersion),
    APP_COMMIT: JSON.stringify(appCommit),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
