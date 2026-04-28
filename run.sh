#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# E-Commerce AI Automation System — Project Runner
# ─────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── helpers ────────────────────────────────────────────────────
require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is not installed. Please install it and try again."
    exit 1
  fi
}

app() { docker compose exec app "$@"; }

wait_healthy() {
  local service=$1 retries=30
  info "Waiting for $service to become healthy..."
  while [[ $retries -gt 0 ]]; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$(docker compose ps -q "$service" 2>/dev/null)" 2>/dev/null || echo "missing")
    [[ "$status" == "healthy" ]] && { success "$service is healthy"; return 0; }
    retries=$((retries - 1))
    sleep 2
  done
  error "$service did not become healthy in time"
  docker compose logs "$service" | tail -20
  exit 1
}

print_banner() {
  echo -e "${CYAN}"
  echo "╔════════════════════════════════════════════════════╗"
  echo "║     E-Commerce AI Automation System                ║"
  echo "║     NestJS · PostgreSQL · Redis · Docker           ║"
  echo "╚════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

usage() {
  cat <<EOF
Usage: ./run.sh [command]

Commands:
  start          Build images and start all services (default)
  stop           Stop all services
  restart        Restart all services
  rebuild        Rebuild images from scratch and start
  logs           Follow app logs
  seed           Seed the database with demo data for Postman testing
  migrate        Run Prisma migrations
  studio         Open Prisma Studio (localhost:5555)
  test           Run unit tests inside the container
  typecheck      Run TypeScript compiler check
  shell          Open a shell inside the app container
  status         Show status of all containers
  reset          !! Destroy all data and start fresh !!
  help           Show this help message
EOF
}

# ── commands ───────────────────────────────────────────────────
cmd_start() {
  print_banner
  require_cmd docker

  info "Starting services..."
  docker compose up -d --build

  wait_healthy postgres
  wait_healthy redis

  info "Running Prisma migrations..."
  app npx prisma migrate deploy 2>/dev/null || app npx prisma migrate dev --name init

  info "Generating Prisma client..."
  app npx prisma generate

  info "Seeding database with demo data..."
  app npx prisma db seed
  success "Seed complete — demo merchants, products, orders, and customers are ready."

  success "All services are up!"
  echo ""
  echo -e "  App        → ${GREEN}http://localhost:3000${NC}"
  echo -e "  Swagger    → ${GREEN}http://localhost:3000/api/docs${NC}"
  echo -e "  DB port    → ${GREEN}localhost:5433${NC}"
  echo -e "  Redis port → ${GREEN}localhost:6379${NC}"
  echo ""
  echo -e "  Postman merchantId → ${YELLOW}00000000-0000-0000-0000-000000000001${NC}"
  echo -e "  Get a token        → POST http://localhost:3000/auth/token"
  echo ""
  info "Run './run.sh logs' to follow app output"
}

cmd_stop() {
  info "Stopping all services..."
  docker compose down
  success "Stopped."
}

cmd_restart() {
  info "Restarting services..."
  docker compose restart
  success "Restarted."
}

cmd_rebuild() {
  info "Rebuilding images from scratch..."
  docker compose down
  docker compose build --no-cache
  cmd_start
}

cmd_logs() {
  docker compose logs -f app
}

cmd_seed() {
  info "Seeding database with demo data..."
  app npx prisma db seed
  success "Seed complete."
  echo ""
  echo -e "  Postman merchantId → ${YELLOW}00000000-0000-0000-0000-000000000001${NC}"
  echo -e "  Get a token        → POST http://localhost:3000/auth/token"
}

cmd_migrate() {
  info "Running Prisma migrations..."
  app npx prisma migrate dev
  app npx prisma generate
  success "Migrations complete."
}

cmd_studio() {
  info "Opening Prisma Studio at http://localhost:5555 ..."
  app npx prisma studio
}

cmd_test() {
  info "Running tests..."
  app npx jest --passWithNoTests "${@:-}"
}

cmd_typecheck() {
  info "Running TypeScript check..."
  app npx tsc --noEmit
  success "Type check passed."
}

cmd_shell() {
  info "Opening shell in app container..."
  docker compose exec app sh
}

cmd_status() {
  docker compose ps
}

cmd_reset() {
  warn "This will DELETE all database volumes and rebuild everything."
  read -rp "Are you sure? (yes/N): " confirm
  [[ "$confirm" == "yes" ]] || { info "Aborted."; exit 0; }
  docker compose down -v
  cmd_start
}

# ── entry point ────────────────────────────────────────────────
COMMAND="${1:-start}"

case "$COMMAND" in
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_restart ;;
  rebuild)   cmd_rebuild ;;
  logs)      cmd_logs ;;
  seed)      cmd_seed ;;
  migrate)   cmd_migrate ;;
  studio)    cmd_studio ;;
  test)      shift; cmd_test "$@" ;;
  typecheck) cmd_typecheck ;;
  shell)     cmd_shell ;;
  status)    cmd_status ;;
  reset)     cmd_reset ;;
  help|-h|--help) usage ;;
  *)
    error "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac
