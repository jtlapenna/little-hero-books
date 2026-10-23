#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_root="$(mktemp -d /tmp/lhl-book-config-activation.XXXXXX)"
pg_port=55482
cleanup() {
  pg_ctl -D "$pg_root/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$pg_root"
}
trap cleanup EXIT

initdb -D "$pg_root/data" --no-sync -A trust >/dev/null
pg_ctl -D "$pg_root/data" -o "-k $pg_root -p $pg_port -c listen_addresses=''" -l "$pg_root/server.log" start >/dev/null
psql_local=(psql -X -v ON_ERROR_STOP=1 -h "$pg_root" -p "$pg_port" -d postgres)
activation_file="$pg_root/activation.sql"
python3 - "$repo_root/docs/database/migration-activate-book-config-version.sql" "$activation_file" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
assert '$lhl_install$' not in source and '$lhl_ddl$' not in source
Path(sys.argv[2]).write_text('DO $lhl_install$\nBEGIN\n  EXECUTE $lhl_ddl$\n' + source + '\n$lhl_ddl$;\nEND\n$lhl_install$;\n')
PY

"${psql_local[@]}" >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.book_configs (
  book_id text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL,
  config_json jsonb NOT NULL,
  checksum text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, version)
);
CREATE UNIQUE INDEX one_active_book ON public.book_configs(book_id) WHERE is_active;
INSERT INTO public.book_configs(book_id, version, status, config_json, checksum, is_active) VALUES
  ('book-test', 1, 'active', '{"bookId":"book-test","version":1,"status":"active","copy":"first"}', repeat('a',64), true),
  ('book-test', 2, 'active', '{"bookId":"book-test","version":2,"status":"active","copy":"second"}', repeat('b',64), false),
  ('book-test', 3, 'draft', '{"bookId":"book-test","version":3,"status":"draft","copy":"draft"}', repeat('c',64), false);
SQL
"${psql_local[@]}" -f "$activation_file" >/dev/null
"${psql_local[@]}" >/dev/null <<'SQL'
CREATE FUNCTION assert_activation_rejected(p_version integer, p_checksum text, p_json jsonb, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.activate_book_config_version('book-test', p_version, p_checksum, p_json);
  EXCEPTION WHEN OTHERS THEN
    IF position(p_message in SQLERRM) = 0 THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Activation unexpectedly succeeded'; END IF;
END;
$$;
SELECT assert_activation_rejected(99, repeat('f',64), '{}'::jsonb, 'target is missing');
SELECT assert_activation_rejected(2, repeat('f',64), '{"bookId":"book-test","version":2,"status":"active","copy":"second"}'::jsonb, 'checksum differs');
SELECT assert_activation_rejected(3, repeat('c',64), '{"bookId":"book-test","version":3,"status":"draft","copy":"draft"}'::jsonb, 'requires an active');
SELECT public.activate_book_config_version('book-test', 2, repeat('b',64), '{"bookId":"book-test","version":2,"status":"active","copy":"second"}'::jsonb);
SELECT public.activate_book_config_version('book-test', 2, repeat('b',64), '{"bookId":"book-test","version":2,"status":"active","copy":"second"}'::jsonb);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.book_configs WHERE book_id='book-test' AND is_active) <> 1
     OR NOT (SELECT is_active FROM public.book_configs WHERE book_id='book-test' AND version=2) THEN
    RAISE EXCEPTION 'Activation did not leave exactly version 2 active';
  END IF;
END $$;
UPDATE public.book_configs SET config_json = '{"bookId":"book-test","version":2,"status":"active","copy":"tampered"}' WHERE book_id='book-test' AND version=2;
SELECT assert_activation_rejected(2, repeat('b',64), '{"bookId":"book-test","version":2,"status":"active","copy":"second"}'::jsonb, 'JSON does not match');
UPDATE public.book_configs SET config_json = '{"bookId":"book-test","version":2,"status":"active","copy":"second"}' WHERE book_id='book-test' AND version=2;
DO $$ BEGIN
  IF to_regprocedure('public.activate_book_config_version(text,integer,text)') IS NOT NULL
     OR has_function_privilege('anon', 'public.activate_book_config_version(text,integer,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.activate_book_config_version(text,integer,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.activate_book_config_version(text,integer,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Activation RPC signature or grants are wrong';
  END IF;
END $$;
SQL

"${psql_local[@]}" -c "SELECT public.activate_book_config_version('book-test', 1, repeat('a',64), '{\"bookId\":\"book-test\",\"version\":1,\"status\":\"active\",\"copy\":\"first\"}'::jsonb)" >/dev/null &
first_pid=$!
"${psql_local[@]}" -c "SELECT public.activate_book_config_version('book-test', 2, repeat('b',64), '{\"bookId\":\"book-test\",\"version\":2,\"status\":\"active\",\"copy\":\"second\"}'::jsonb)" >/dev/null &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
active_count="$("${psql_local[@]}" -At -c "SELECT count(*) FROM public.book_configs WHERE book_id='book-test' AND is_active")"
[[ "$active_count" == 1 ]]

"${psql_local[@]}" -c 'CREATE DATABASE book_config_full' >/dev/null
psql_full=(psql -X -v ON_ERROR_STOP=1 -h "$pg_root" -p "$pg_port" -d book_config_full)
"${psql_full[@]}" -f "$repo_root/docs/database/migration-add-book-configs.sql" >/dev/null
"${psql_full[@]}" >/dev/null <<'SQL'
INSERT INTO public.book_configs
  (book_id, version, schema, status, default_format_id, config_json, checksum, is_active)
VALUES
  ('book-full', 1, 'lhb.book-config@v1', 'active', 'standard',
   '{"bookId":"book-full","version":1,"schema":"lhb.book-config@v1","status":"active","defaultFormatId":"standard"}'::jsonb,
   repeat('d',64), false);
INSERT INTO public.book_configs
  (book_id, version, schema, status, default_format_id, config_json, checksum, is_active)
VALUES
  ('book-full', 2, 'lhb.book-config@v1', 'active', 'standard',
   '{"bookId":"book-full","version":2,"schema":"lhb.book-config@v1","status":null,"defaultFormatId":"standard"}'::jsonb,
   repeat('e',64), false),
  ('book-full', 3, 'lhb.book-config@v1', 'active', 'standard',
   '{"bookId":null,"version":3,"schema":"lhb.book-config@v1","status":"active","defaultFormatId":"standard"}'::jsonb,
   repeat('f',64), false),
  ('book-full', 4, 'lhb.book-config@v1', 'active', 'standard',
   '{"bookId":"book-full","version":null,"schema":"lhb.book-config@v1","status":"active","defaultFormatId":"standard"}'::jsonb,
   repeat('a',64), false);
SQL
"${psql_full[@]}" -f "$activation_file" >/dev/null
"${psql_full[@]}" >/dev/null <<'SQL'
SELECT public.activate_book_config_version(
  'book-full', 1, repeat('d',64),
  '{"bookId":"book-full","version":1,"schema":"lhb.book-config@v1","status":"active","defaultFormatId":"standard"}'::jsonb
);
DO $$
DECLARE invalid public.book_configs%ROWTYPE; rejected boolean;
BEGIN
  FOR invalid IN SELECT * FROM public.book_configs WHERE book_id='book-full' AND version>1 LOOP
    rejected := false;
    BEGIN
      PERFORM public.activate_book_config_version('book-full', invalid.version, invalid.checksum, invalid.config_json);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Book config activation requires an active%'
         AND SQLERRM NOT LIKE 'Book config activation JSON does not match%' THEN RAISE; END IF;
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'JSON null identity/status unexpectedly activated version %', invalid.version; END IF;
  END LOOP;
  IF NOT (SELECT is_active FROM public.book_configs WHERE book_id='book-full' AND version=1) THEN
    RAISE EXCEPTION 'Rejected activation changed prior active version';
  END IF;
END $$;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.book_configs WHERE book_id='book-full' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Full-schema activation did not select exactly one row';
  END IF;
END $$;
SQL
echo 'Book config activation migration checks passed'
