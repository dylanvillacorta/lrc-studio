#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="lrc-studio:verify"
CONTAINER_NAME="lrc-studio-verify-$$"
PORT="${VERIFY_PORT:-18080}"
BASE_URL="http://127.0.0.1:${PORT}"

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Construyendo imagen ${IMAGE_TAG}..."
docker build -t "${IMAGE_TAG}" .

echo "==> Iniciando contenedor ${CONTAINER_NAME} en puerto ${PORT}..."
docker run -d --name "${CONTAINER_NAME}" -p "${PORT}:8080" "${IMAGE_TAG}" >/dev/null

echo "==> Esperando a que /healthz responda 200..."
for i in $(seq 1 20); do
  if curl -sf "${BASE_URL}/healthz" >/dev/null; then
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "ERROR: El contenedor no respondió a tiempo en /healthz"
    exit 1
  fi
  sleep 0.5
done

check_header() {
  local headers="$1"
  local pattern="$2"
  local label="$3"
  if ! printf '%s' "${headers}" | grep -qiE "${pattern}"; then
    echo "ERROR: Falta o es incorrecta la cabecera '${label}' (patrón: ${pattern})"
    exit 1
  fi
}

echo "==> Validando / (no-cache y cabeceras de seguridad)..."
ROOT_HEADERS=$(curl -sI "${BASE_URL}/")
check_header "${ROOT_HEADERS}" "^HTTP/.* 200" "HTTP 200 en /"
check_header "${ROOT_HEADERS}" "^Cache-Control:.*no-cache" "Cache-Control: no-cache en /"
check_header "${ROOT_HEADERS}" "^X-Content-Type-Options:.*nosniff" "X-Content-Type-Options"
check_header "${ROOT_HEADERS}" "^Referrer-Policy:.*strict-origin-when-cross-origin" "Referrer-Policy"
check_header "${ROOT_HEADERS}" "^X-Frame-Options:.*SAMEORIGIN" "X-Frame-Options"
check_header "${ROOT_HEADERS}" "^Permissions-Policy:" "Permissions-Policy"
check_header "${ROOT_HEADERS}" "^Content-Security-Policy:" "Content-Security-Policy"

echo "==> Validando asset con hash en /assets/..."
ASSET_PATH=$(docker exec "${CONTAINER_NAME}" sh -c 'ls /usr/share/nginx/html/assets/*.js | head -n 1' | tr -d '\r')
if [ -z "${ASSET_PATH}" ]; then
  echo "ERROR: No se encontró ningún archivo JS en /usr/share/nginx/html/assets/"
  exit 1
fi
ASSET_URL="${BASE_URL}/assets/$(basename "${ASSET_PATH}")"
ASSET_HEADERS=$(curl -sI "${ASSET_URL}")
check_header "${ASSET_HEADERS}" "^HTTP/.* 200" "HTTP 200 en ${ASSET_URL}"
check_header "${ASSET_HEADERS}" "^Cache-Control:.*max-age=31536000" "max-age=31536000 en asset"
check_header "${ASSET_HEADERS}" "^Cache-Control:.*immutable" "immutable en asset"

echo "==> Validando fallback SPA en /catalogo..."
SPA_HEADERS=$(curl -sI "${BASE_URL}/catalogo")
check_header "${SPA_HEADERS}" "^HTTP/.* 200" "HTTP 200 en /catalogo"
check_header "${SPA_HEADERS}" "^Content-Type:.*text/html" "Content-Type text/html en /catalogo"

echo "==> Validando 404 real en /assets/inexistente.js..."
MISSING_HEADERS=$(curl -sI "${BASE_URL}/assets/inexistente.js")
check_header "${MISSING_HEADERS}" "^HTTP/.* 404" "HTTP 404 en /assets/inexistente.js"

if docker exec "${CONTAINER_NAME}" test -f /usr/share/nginx/html/robots.txt; then
  echo "==> Validando /robots.txt (no-cache)..."
  ROBOTS_HEADERS=$(curl -sI "${BASE_URL}/robots.txt")
  check_header "${ROBOTS_HEADERS}" "^Cache-Control:.*no-cache" "Cache-Control: no-cache en /robots.txt"
fi

if docker exec "${CONTAINER_NAME}" test -f /usr/share/nginx/html/sitemap.xml; then
  echo "==> Validando /sitemap.xml (no-cache)..."
  SITEMAP_HEADERS=$(curl -sI "${BASE_URL}/sitemap.xml")
  check_header "${SITEMAP_HEADERS}" "^Cache-Control:.*no-cache" "Cache-Control: no-cache en /sitemap.xml"
fi

if docker exec "${CONTAINER_NAME}" test -f /usr/share/nginx/html/version.json; then
  echo "==> Validando /version.json (no-store)..."
  VERSION_HEADERS=$(curl -sI "${BASE_URL}/version.json")
  check_header "${VERSION_HEADERS}" "^Cache-Control:.*no-store" "Cache-Control: no-store en /version.json"
fi

echo "==> Validando /healthz..."
HEALTH_HEADERS=$(curl -sI "${BASE_URL}/healthz")
check_header "${HEALTH_HEADERS}" "^HTTP/.* 200" "HTTP 200 en /healthz"

echo "==> Validando que el contenedor corre sin root..."
CONTAINER_UID=$(docker exec "${CONTAINER_NAME}" id -u | tr -d '\r')
if [ "${CONTAINER_UID}" -eq 0 ]; then
  echo "ERROR: El contenedor está corriendo como root (uid=0)"
  exit 1
fi
echo "OK: Contenedor corriendo con uid=${CONTAINER_UID}"

echo "==> Todas las verificaciones de Docker pasaron correctamente."
