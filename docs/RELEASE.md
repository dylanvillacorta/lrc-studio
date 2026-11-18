# Release, Caché, Docker y SEO — LyricSync Studio

## 1. Cache busting

- **Assets con hash:** Vite genera `assets/[name]-[hash].js` y `.css`. Nginx sirve `/assets/` con:
  `Cache-Control: public, max-age=31536000, immutable`
- **Archivos de entrada:** `index.html`, `manifest.webmanifest`, `robots.txt` y `sitemap.xml` se sirven con:
  `Cache-Control: no-cache` (revalidación por ETag) para que cada despliegue se refleje de inmediato.
- **Manifiesto de versión:** `/version.json` se sirve con `Cache-Control: no-store`.

## 2. Versión visible y actualización en caliente

- En build se inyectan mediante `define` de Vite las constantes `APP_VERSION` (desde `package.json`) y `APP_COMMIT` (SHA corto de Git).
- Se emite `/version.json` con `{ "version": "...", "commit": "...", "builtAt": "..." }`.
- La app consulta `/version.json` al abrir y en `visibilitychange`. Si `version` o `commit` difieren de los cargados en memoria, muestra el aviso **«Nueva versión disponible · Actualizar»**.
- Al pulsar **Actualizar**, primero se vacía (`flush`) el autoguardado y luego se recarga la página.
- Mostrar la versión actual en un pie discreto de la interfaz.
- **PWA / Service Worker:** fuera del primer sprint salvo decisión del usuario; si se agrega en el futuro, usar precache versionado y actualización con aviso, nunca silenciosa.

## 3. Docker y GHCR

- **Dockerfile multi-stage:**
  1. `node:24-alpine`: activa `corepack`, ejecuta `pnpm install --frozen-lockfile` y `pnpm build` (`vite build`).
  2. `nginxinc/nginx-unprivileged:alpine`: copia únicamente `dist/` y `nginx.conf`, usuario no-root, puerto `8080`.
- **Etiquetas OCI:** `org.opencontainers.image.version`, `revision`, `source`, `created`.
- **`nginx.conf`:**
  - Fallback SPA (`try_files $uri $uri/ /index.html`).
  - Compresión `gzip`.
  - Cabeceras de seguridad:
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `X-Frame-Options: SAMEORIGIN`
    - `Permissions-Policy` restrictiva
    - `Content-Security-Policy` compatible con `blob:` para audio local y sin recursos externos.
  - `HEALTHCHECK` en el contenedor.
- **Publicación en GHCR (`ghcr.io/dylanvillacorta/lrc-studio`):**
  - Tags: `X.Y.Z`, `X.Y`, `latest` y `<sha-corto>`.
  - Workflow de GitHub Actions: en PRs solo construye la imagen sin publicar; **solo publica a GHCR al empujar un tag `vX.Y.Z`** (el tag lo crea el usuario tras aprobar G1).

## 4. SEO

La app es una herramienta cliente (sin SSR). `index.html` y archivos estáticos deben incluir:
- `<html lang="es">`
- `<title>` y `<meta name="description">` únicos.
- `<link rel="canonical">` y URLs de Open Graph usando `VITE_SITE_URL=https://lrc.dirtykeras.com`.
- Open Graph y Twitter Card con imagen `1200x630`.
- `theme-color`, `viewport`, favicons, `apple-touch-icon` y `manifest.webmanifest`.
- `robots.txt` (apuntando a `https://lrc.dirtykeras.com/sitemap.xml`) y `sitemap.xml` (con `https://lrc.dirtykeras.com`).
- Datos estructurados JSON-LD (`SoftwareApplication`).
- HTML semántico (un único `<h1>`, landmarks `<main>`, `<nav>`, `<header>`).
- `<noscript>` con descripción del producto.
- Fuentes autoalojadas con `font-display: swap` para no bloquear el render.
- Un test E2E en Playwright debe verificar la presencia de meta etiquetas SEO, `robots.txt` y `sitemap.xml`.
