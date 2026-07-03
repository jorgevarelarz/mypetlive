#!/usr/bin/env bash
# Deploy de MyPetLive al VPS Valeris (mypetlive.es).
#
# Uso: ./scripts/deploy.sh [api|web|all]
#
#   api  — rsync de src/ a /opt/mypetlive + rebuild y recreate del contenedor API
#   web  — build de CRA (exige frontend/.env.production) + rsync al docroot de Plesk + chown
#   all  — ambos
#
# Requiere el alias SSH "valeris-vps" (~/.ssh/config) con acceso root por clave.
set -euo pipefail

HOST="valeris-vps"
REMOTE_APP="/opt/mypetlive"
DOCROOT="/var/www/vhosts/mypetlive.es/httpdocs"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-all}"

deploy_api() {
  echo "==> Backend: rsync src/ → $HOST:$REMOTE_APP/src/"
  rsync -az --delete "$ROOT/src/" "$HOST:$REMOTE_APP/src/"
  echo "==> Backend: rebuild + recreate del contenedor api"
  ssh "$HOST" "cd $REMOTE_APP && docker compose -f docker-compose.deploy.yml build api && docker compose -f docker-compose.deploy.yml up -d --force-recreate api"
  echo "==> Backend: health check"
  sleep 5
  ssh "$HOST" "curl -sf -o /dev/null -w 'health interno: %{http_code}\n' http://127.0.0.1:3000/health"
}

deploy_web() {
  # Sin .env.production, CRA hereda REACT_APP_API_URL=http://localhost:3000 del .env
  # de desarrollo y el bundle queda roto en producción (bug "Network Error" de jun-2026).
  if [[ ! -f "$ROOT/frontend/.env.production" ]]; then
    echo "ERROR: falta frontend/.env.production (debe fijar REACT_APP_API_URL= vacío)." >&2
    exit 1
  fi
  echo "==> Frontend: npm run build"
  (cd "$ROOT/frontend" && npm run build)
  echo "==> Frontend: rsync build/ → $HOST:$DOCROOT/"
  rsync -az --delete "$ROOT/frontend/build/" "$HOST:$DOCROOT/"
  ssh "$HOST" "chown -R mypetlive:psaserv $DOCROOT"
}

smoke() {
  echo "==> Smoke en vivo"
  curl -sf -o /dev/null -w "web:    %{http_code}\n" https://mypetlive.es/
  curl -sf -o /dev/null -w "health: %{http_code}\n" https://mypetlive.es/health
  curl -sf -o /dev/null -w "api:    %{http_code}\n" "https://mypetlive.es/api/animals?limit=1"
}

case "$MODE" in
  api) deploy_api && smoke ;;
  web) deploy_web && smoke ;;
  all) deploy_api && deploy_web && smoke ;;
  *) echo "Uso: $0 [api|web|all]" >&2; exit 1 ;;
esac
echo "==> Deploy '$MODE' completado."
