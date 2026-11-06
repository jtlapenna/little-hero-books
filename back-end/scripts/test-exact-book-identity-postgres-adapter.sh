#!/usr/bin/env bash
set -euo pipefail

# Isolated socket-only database. Never uses a hosted database or credentials.
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
pg_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/lhl-book-adapter.XXXXXXXX")"
cleanup() {
  pg_ctl -D "$pg_test_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$pg_test_dir"
}
trap cleanup EXIT
initdb -D "$pg_test_dir/data" -A trust -U postgres >/dev/null
pg_ctl -D "$pg_test_dir/data" -o "-c listen_addresses='' -c unix_socket_directories='$pg_test_dir'" -w start >/dev/null
export PGHOST="$pg_test_dir" PGUSER=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.orders (id bigint, "orderId" text, order_id text);
GRANT SELECT ON public.orders TO service_role;
INSERT INTO public.orders VALUES
  (9007199254740993,'BOOK-A','BOOK-A'),
  (2,'DUPLICATE',NULL),
  (3,NULL,'DUPLICATE'),
  (4,'CONFLICT','OTHER');
SQL
psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000000_lhl_strict_book_identity.sql"
cd "$repo_root/back-end"
node --import tsx scripts/test-exact-book-identity-postgres-adapter.ts
