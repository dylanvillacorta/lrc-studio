#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUMP_SCRIPT="${SCRIPT_DIR}/bump-compose-tag.sh"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

TMP_COMPOSE="${TMP_DIR}/docker-compose.yml"
cp "${REPO_ROOT}/docker-compose.yml" "${TMP_COMPOSE}"

echo "==> Probando rechazo de formatos inválidos..."
for bad in "v0.2.0" "0.2" "latest" "0.2.0-rc1" "abc"; do
  if bash "${BUMP_SCRIPT}" "${bad}" "${TMP_COMPOSE}" >/dev/null 2>&1; then
    echo "ERROR: Debió fallar con versión inválida '${bad}'" >&2
    exit 1
  fi
done

echo "==> Probando actualización válida a 0.2.0..."
bash "${BUMP_SCRIPT}" "0.2.0" "${TMP_COMPOSE}"
if ! grep -qE "^[[:space:]]*image:[[:space:]]*ghcr\.io/dylanvillacorta/lrc-studio:0\.2\.0([[:space:]]|$|#)" "${TMP_COMPOSE}"; then
  echo "ERROR: No se actualizó la imagen a 0.2.0" >&2
  exit 1
fi

echo "==> Probando idempotencia con 0.2.0..."
BEFORE=$(cat "${TMP_COMPOSE}")
bash "${BUMP_SCRIPT}" "0.2.0" "${TMP_COMPOSE}"
AFTER=$(cat "${TMP_COMPOSE}")
if [ "${BEFORE}" != "${AFTER}" ]; then
  echo "ERROR: La segunda ejecución con la misma versión modificó el archivo" >&2
  exit 1
fi

echo "==> Probando fallo cuando el archivo no contiene la línea esperada..."
BAD_COMPOSE="${TMP_DIR}/empty-compose.yml"
printf 'services:\n  app:\n    image: nginx:alpine\n' > "${BAD_COMPOSE}"
if bash "${BUMP_SCRIPT}" "0.3.0" "${BAD_COMPOSE}" >/dev/null 2>&1; then
  echo "ERROR: Debió fallar cuando no existe la línea image de lrc-studio" >&2
  exit 1
fi

echo "OK: Todas las pruebas de bump-compose-tag.sh pasaron."
