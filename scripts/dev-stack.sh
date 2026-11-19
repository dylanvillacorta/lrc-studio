#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"
SERVICE_NAME="lrc-studio"
PORT="${DEV_PORT:-30601}"

detect_lan_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then
    ip=$(ipconfig 2>/dev/null | grep -oE '10\.1\.10\.[0-9]+' | head -n 1 || true)
  elif command -v ipconfig.exe >/dev/null 2>&1; then
    ip=$(ipconfig.exe 2>/dev/null | grep -oE '10\.1\.10\.[0-9]+' | head -n 1 || true)
  fi
  if [ -z "${ip}" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | head -n 1 || true)
  fi
  printf '%s' "${ip}"
}

wait_for_healthy() {
  local container_id=""
  local status=""
  echo "==> Esperando a que el contenedor esté healthy..."
  for _ in $(seq 1 40); do
    container_id=$(docker compose -f "${COMPOSE_FILE}" ps -q "${SERVICE_NAME}" 2>/dev/null || true)
    if [ -n "${container_id}" ]; then
      status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)
      if [ "${status}" = "healthy" ]; then
        return 0
      fi
    fi
    sleep 0.5
  done
  echo "ERROR: El servicio '${SERVICE_NAME}' no alcanzó estado healthy a tiempo (estado actual: ${status:-desconocido})." >&2
  docker compose -f "${COMPOSE_FILE}" logs --tail 30 "${SERVICE_NAME}" >&2 || true
  return 1
}

cmd="${1:-}"
case "${cmd}" in
  up)
    docker compose -f "${COMPOSE_FILE}" up -d --build
    wait_for_healthy
    LAN_IP=$(detect_lan_ip)
    echo ""
    echo "Stack local listo:"
    echo "  Local: http://localhost:${PORT}"
    if [ -n "${LAN_IP}" ]; then
      echo "  LAN:   http://${LAN_IP}:${PORT}"
    else
      echo "  LAN:   http://<IP-LAN>:${PORT}"
    fi
    ;;
  down)
    docker compose -f "${COMPOSE_FILE}" down
    ;;
  logs)
    shift
    docker compose -f "${COMPOSE_FILE}" logs -f "$@"
    ;;
  status)
    docker compose -f "${COMPOSE_FILE}" ps
    ;;
  *)
    echo "Uso: $0 {up|down|logs|status}" >&2
    exit 1
    ;;
esac
