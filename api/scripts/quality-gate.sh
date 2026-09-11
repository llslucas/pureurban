#!/usr/bin/env bash
# Quality gate mínimo (action item epic-3-retro-item-1, retro do Épico 3):
# unit + e2e supertest + Playwright API + E2E browser + openapi:check —
# todos contra a infra real (PostgreSQL/Redis via docker compose).
#
# Sobe o que estiver faltando (banco, API dev server, Expo Web) e encerra no
# fim apenas o que este script iniciou; servidor já de pé é reutilizado e fica
# rodando. Com E2E_SERVERS_UP=1 os specs Playwright FALHAM sem infra em vez de
# skipar — o gate nunca fica verde por omissão.
#
# Portas: padrão API :3000 e Expo Web :8081. A API lê a PORT de api/.env; se
# ela não for 3000, rode com E2E_API_URL=http://localhost:<porta> npm run gate.
#
# O Expo Web é iniciado com EXPO_PUBLIC_USE_MOCKS=0 e EXPO_PUBLIC_E2E=1 — o
# browser prova a UI contra a API real, sem MSW (mesmo ambiente da 4.5).
set -euo pipefail

API_URL="${E2E_API_URL:-http://localhost:3000}"
WEB_URL="${E2E_WEB_URL:-http://localhost:8081}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$REPO_ROOT/api"
MOBILE_DIR="$REPO_ROOT/mobile"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# Espelha reachable() de tests/support/helpers/e2e-servers.ts: qualquer status
# < 500 conta como de pé (o / da API responde 404).
probe_up() {
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" || true)"
  [[ "$status" =~ ^[0-9]+$ ]] && [[ "$status" -lt 500 ]] && [[ "$status" -ne 000 ]]
}

wait_for() { # url timeout_s label
  local url="$1" timeout="$2" label="$3"
  for ((i = 0; i < timeout; i++)); do
    if probe_up "$url"; then
      echo "[gate] $label pronto em $url"
      return 0
    fi
    sleep 1
  done
  echo "[gate] TIMEOUT: $label não respondeu em ${timeout}s ($url)" >&2
  echo "[gate] veja os logs em /tmp/gate-*.log" >&2
  return 1
}

start_if_down() { # url timeout_s label workdir cmd...
  local url="$1" timeout="$2" label="$3" dir="$4"
  shift 4
  if probe_up "$url"; then
    echo "[gate] $label já de pé em $url — reutilizando"
    return 0
  fi
  echo "[gate] subindo $label (log: /tmp/gate-${label}.log) ..."
  (
    cd "$dir"
    "$@" >"/tmp/gate-${label}.log" 2>&1
  ) &
  pids+=("$!")
  wait_for "$url" "$timeout" "$label"
}

cd "$API_DIR"

echo "== [1/5] unit (vitest) =="
npm test

echo "== [2/5] e2e supertest (banco real) =="
npm run test:e2e

echo "== [3/5] infra + servidores =="
docker compose -f "$REPO_ROOT/docker-compose.yml" up -d
start_if_down "$API_URL" 120 api "$API_DIR" npm run start:dev
start_if_down "$WEB_URL" 300 web "$MOBILE_DIR" env \
  EXPO_PUBLIC_USE_MOCKS=0 \
  "EXPO_PUBLIC_API_URL=$API_URL" \
  EXPO_PUBLIC_E2E=1 \
  npm run web

echo "== [4/5] Playwright api + browser (E2E_SERVERS_UP=1) =="
GATE_PW_ENV=(E2E_SERVERS_UP=1 "E2E_API_URL=$API_URL" "E2E_WEB_URL=$WEB_URL" "BASE_URL=$API_URL")
env "${GATE_PW_ENV[@]}" npm run test:pw:api
env "${GATE_PW_ENV[@]}" npm run test:pw:e2e

echo "== [5/5] openapi:check (drift de contrato) =="
npm run openapi:check

echo "[gate] VERDE — gate completo"
