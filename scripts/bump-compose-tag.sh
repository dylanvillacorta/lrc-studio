#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Uso: $0 <X.Y.Z> [ruta/a/docker-compose.yml]" >&2
  exit 1
fi

VERSION="$1"
COMPOSE_FILE="${2:-docker-compose.yml}"
IMAGE_PREFIX="ghcr.io/dylanvillacorta/lrc-studio"

if ! [[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Versión inválida '${VERSION}'. Debe tener formato semver X.Y.Z (ej. 0.1.0)." >&2
  exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "ERROR: No existe el archivo '${COMPOSE_FILE}'." >&2
  exit 1
fi

if ! grep -qE "^([[:space:]]*image:[[:space:]]*)${IMAGE_PREFIX}:[^[:space:]#]+" "${COMPOSE_FILE}"; then
  echo "ERROR: No se encontró una línea 'image: ${IMAGE_PREFIX}:<tag>' en '${COMPOSE_FILE}'." >&2
  exit 1
fi

TMP_FILE=$(mktemp)
trap 'rm -f "${TMP_FILE}"' EXIT

sed -E "s|^([[:space:]]*image:[[:space:]]*)${IMAGE_PREFIX}:[^[:space:]#]+|\1${IMAGE_PREFIX}:${VERSION}|" "${COMPOSE_FILE}" > "${TMP_FILE}"

if ! grep -qE "^[[:space:]]*image:[[:space:]]*${IMAGE_PREFIX}:${VERSION}([[:space:]]|$|#)" "${TMP_FILE}"; then
  echo "ERROR: No se pudo actualizar la etiqueta en '${COMPOSE_FILE}'." >&2
  exit 1
fi

mv "${TMP_FILE}" "${COMPOSE_FILE}"
echo "OK: ${COMPOSE_FILE} actualizado a ${IMAGE_PREFIX}:${VERSION}"
