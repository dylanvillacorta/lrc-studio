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
  - **Multi-arquitectura:** el workflow `.github/workflows/docker.yml` ejecuta primero un job de verificación (`pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, `build` con Node 24 y Corepack) y luego construye el manifiesto multi-arch para `linux/amd64` y `linux/arm64` usando `docker/setup-qemu-action` y `docker/setup-buildx-action` con caché por plataforma en GitHub Actions.
  - En `pull_request` hacia `develop` o `main` construye ambas plataformas sin publicar.
  - **Solo publica en GHCR al empujar un tag `vX.Y.Z`** (el tag lo crea el usuario tras aprobar G1).

| Tag | Cuándo se genera | Descripción |
| :--- | :--- | :--- |
| `X.Y.Z` | Al empujar tag `vX.Y.Z` | Versión exacta fijada en `docker-compose.yml` |
| `X.Y` | Al empujar tag `vX.Y.Z` | Último parche de la serie menor |
| `latest` | Al empujar tag `vX.Y.Z` | Última release estable |
| `<sha-corto>` | En PRs y tags | Trazabilidad por commit |

- **Actualización de `docker-compose.yml` en cada release:**
  - Al preparar la rama `release/vX.Y.Z` (sin puerta), ejecutar `bash scripts/bump-compose-tag.sh X.Y.Z` para fijar la línea `image:` de `docker-compose.yml` al tag exacto `X.Y.Z` dentro del mismo PR hacia `main`. Así, al aprobar G1, `main` queda apuntando a la última release publicada. El push del tag `vX.Y.Z` y la publicación de la imagen siguen siendo puerta G1.

## 4. Despliegue en producción y stack local (LAN)

### Producción (`docker-compose.yml`)

- Usa la imagen multi-arch publicada en `ghcr.io/dylanvillacorta/lrc-studio:<TAG>` (sin `platform` forzada para que Docker elija `amd64` o `arm64` automáticamente), `read_only: true` con `tmpfs` en `/tmp`, `/var/cache/nginx` y `/var/run`, `cap_drop: [ALL]`, `no-new-privileges:true`, `healthcheck` y límites de memoria/CPU.
- Para levantar en producción:
  ```bash
  docker compose up -d
  ```
- **Nota previa a `v0.1.0`:** mientras no se haya publicado la primera release `v0.1.0` en GHCR, `docker compose up -d` o `docker compose pull` fallarán al descargar la imagen (comportamiento esperado hasta aprobar G1 de `v0.1.0`).

### Stack local de pruebas desde código fuente (`docker-compose.dev.yml`)

- Compila el build de producción desde el `Dockerfile` (`lrc-studio:local`) y lo sirve con `nginx` (sin `vite dev` ni volúmenes de código) escuchando en `0.0.0.0:30601` (configurable vía `.env` tomando como plantilla `.env.example`).
- Comandos principales mediante `scripts/dev-stack.sh`:
  ```bash
  bash scripts/dev-stack.sh up      # Compila, levanta, espera healthy y muestra URLs local y LAN
  bash scripts/dev-stack.sh status  # Estado del contenedor
  bash scripts/dev-stack.sh logs    # Logs en vivo
  bash scripts/dev-stack.sh down    # Detiene y elimina el stack local
  ```

### Acceso desde el celular por red local (Windows)

- `nginx` escucha en todas las interfaces (`listen 8080;`) y la aplicación opera por HTTP en la LAN (`crypto.randomUUID` y `navigator.clipboard` cuentan con respaldos sin requerir HTTPS, y no se usa Service Worker).
- Para permitir conexiones entrantes desde el segmento `10.1.10.0/24` en el perfil de red **Privado**, ejecutar en **PowerShell como Administrador**:
  ```powershell
  New-NetFirewallRule -DisplayName "LyricSync Studio Dev (LAN 30601)" -Direction Inbound -Protocol TCP -LocalPort 30601 -RemoteAddress 10.1.10.0/24 -Profile Private -Action Allow
  ```
- Para eliminar la regla cuando terminen las pruebas:
  ```powershell
  Remove-NetFirewallRule -DisplayName "LyricSync Studio Dev (LAN 30601)"
  ```

## 5. SEO

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
