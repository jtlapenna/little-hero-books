#!/bin/bash
set -euo pipefail
if [ "${DISPATCH_LAB_SANDBOX:-}" != 1 ]; then
  if [ "$(uname -s)" != Darwin ] || ! command -v sandbox-exec >/dev/null; then echo 'Requires macOS network sandbox.' >&2; exit 1; fi
  exec env -i PATH="$PATH" HOME="${HOME:?}" DISPATCH_LAB_SANDBOX=1 /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network-outbound (remote ip "*:*")) (deny network-inbound (local ip "*:*"))' "$0"
fi
node -e 'const net=require("node:net");Promise.all(["127.0.0.1","192.0.2.1"].map(host=>new Promise((resolve,reject)=>{const s=net.connect(443,host);s.setTimeout(1500,()=>reject(Error("network denial not proven")));s.on("connect",()=>reject(Error("unexpected connection")));s.on("error",e=>e.code === "EPERM" || e.code === "EACCES" ? resolve() : reject(e));}))).catch(e=>{console.error(e);process.exitCode=1});'
root="$(cd "$(dirname "$0")/../.." && pwd)"
dir="$(mktemp -d /tmp/lhl-dispatch-lab.XXXXXXXX)"
cleanup() { pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
initdb -D "$dir/data" -A trust -U postgres >/dev/null
pg_ctl -D "$dir/data" -o "-c listen_addresses='' -c unix_socket_directories='$dir'" -w start >/dev/null
export PGHOST="$dir" PGUSER=postgres PGDATABASE=postgres
if psql -X -v ON_ERROR_STOP=1 -q -c "SELECT dispatch_lab.prepare('x','a',1,1,'d','p')" >"$dir/before" 2>&1; then echo 'unexpected existing dispatch primitive' >&2; exit 1; fi
if ! grep -q 'does not exist' "$dir/before"; then cat "$dir/before" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q -f "$root/back-end/scripts/fixtures/provider-dispatch-local-prototype.sql"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE lab_unauthorized NOLOGIN;
DO $$ BEGIN
 IF has_schema_privilege('lab_unauthorized','dispatch_lab','USAGE') OR has_table_privilege('lab_unauthorized','dispatch_lab.intent','SELECT,INSERT,UPDATE,DELETE') OR has_function_privilege('lab_unauthorized','dispatch_lab.prepare(text,text,bigint,bigint,text,text)','EXECUTE') THEN RAISE EXCEPTION 'prototype grants public access'; END IF;
END $$;
INSERT INTO dispatch_lab.operation VALUES ('race','a',true,1,1,clock_timestamp()+interval '1 hour');
INSERT INTO dispatch_lab.operation VALUES ('nulls','a',true,1,1,clock_timestamp()+interval '1 hour');
DO $$ BEGIN
 IF dispatch_lab.prepare('nulls',NULL,1,1,'d','p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL admission accepted'; END IF;
 IF dispatch_lab.prepare('nulls','a',NULL,1,'d','p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL prepare attempt accepted'; END IF;
 IF dispatch_lab.prepare('nulls','a',1,NULL,'d','p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL prepare fence accepted'; END IF;
 IF dispatch_lab.prepare('nulls','a',1,1,'d','p') <> 'prepared' THEN RAISE EXCEPTION 'null test setup'; END IF;
 IF dispatch_lab.start('nulls',NULL,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='nulls' AND state<>'cleared'),'d','p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL start attempt sent'; END IF;
 IF dispatch_lab.start('nulls',1,NULL,(SELECT id FROM dispatch_lab.intent WHERE operation_key='nulls' AND state<>'cleared'),'d','p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL start fence sent'; END IF;
 IF dispatch_lab.start('nulls',1,1,NULL,'d','p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL intent sent'; END IF;
 IF dispatch_lab.start('nulls',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='nulls' AND state<>'cleared'),NULL,'p') <> 'hold_scope' THEN RAISE EXCEPTION 'NULL digest sent'; END IF;
 IF dispatch_lab.start('nulls',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='nulls' AND state<>'cleared'),'d',NULL) <> 'hold_scope' THEN RAISE EXCEPTION 'NULL provider key sent'; END IF;
END $$;
INSERT INTO dispatch_lab.operation VALUES ('delayed','a',true,1,1,clock_timestamp()+interval '1 hour');
DO $$ DECLARE old_id bigint; BEGIN
 IF dispatch_lab.prepare('delayed','a',1,1,'old-digest','old-key') <> 'prepared' THEN RAISE EXCEPTION 'old prepare'; END IF;
 SELECT id INTO old_id FROM dispatch_lab.intent WHERE operation_key='delayed' AND state='prepared';
 INSERT INTO dispatch_lab.proof VALUES(old_id,'nonexecution','synthetic');
 IF dispatch_lab.clear_with_test_proof(old_id) <> 'cleared' THEN RAISE EXCEPTION 'old clear'; END IF;
 IF dispatch_lab.prepare('delayed','a',1,1,'new-digest','new-key') <> 'prepared' THEN RAISE EXCEPTION 'new prepare'; END IF;
 IF dispatch_lab.start('delayed',1,1,old_id,'old-digest','old-key') <> 'hold_scope' THEN RAISE EXCEPTION 'delayed old start authorized replacement'; END IF;
 IF dispatch_lab.start('delayed',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='delayed' AND state='prepared'),'old-digest','old-key') <> 'hold_scope' THEN RAISE EXCEPTION 'stale request identity accepted'; END IF;
 IF dispatch_lab.start('delayed',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='delayed' AND state='prepared'),'old-digest','new-key') <> 'hold_scope' THEN RAISE EXCEPTION 'wrong digest accepted'; END IF;
 IF dispatch_lab.start('delayed',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='delayed' AND state='prepared'),'new-digest','old-key') <> 'hold_scope' THEN RAISE EXCEPTION 'wrong provider key accepted'; END IF;
 IF dispatch_lab.start('delayed',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='delayed' AND state='prepared'),'new-digest','new-key') <> 'send_once' THEN RAISE EXCEPTION 'replacement not authorized'; END IF;
END $$;
INSERT INTO dispatch_lab.operation VALUES ('stale-proof','a',true,1,1,clock_timestamp()+interval '1 hour');
DO $$ DECLARE i bigint; BEGIN
 IF dispatch_lab.prepare('stale-proof','a',1,1,'d','p') <> 'prepared' THEN RAISE EXCEPTION 'stale test setup'; END IF;
 SELECT id INTO i FROM dispatch_lab.intent WHERE operation_key='stale-proof';
 INSERT INTO dispatch_lab.proof VALUES(i,'nonexecution','synthetic earlier proof');
 IF dispatch_lab.start('stale-proof',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='stale-proof' AND state<>'cleared'),'d','p') <> 'send_once' THEN RAISE EXCEPTION 'stale test start'; END IF;
 IF dispatch_lab.clear_with_test_proof(i) <> 'hold_no_proof' THEN RAISE EXCEPTION 'stale proof cleared a send'; END IF;
 IF dispatch_lab.unknown(i) <> 'unknown_hold' THEN RAISE EXCEPTION 'unknown transition'; END IF;
 IF dispatch_lab.clear_with_test_proof(i) <> 'hold_no_proof' THEN RAISE EXCEPTION 'proof cleared unknown'; END IF;
END $$;
SQL
# Concurrent requests are serialized by the operation row and unique index.
for n in 1 2; do psql -X -v ON_ERROR_STOP=1 -Atq -c "SELECT dispatch_lab.prepare('race','a',1,1,'digest','provider-key')" >"$dir/race.$n" & done
wait
[ "$(cat "$dir/race.1" "$dir/race.2" | sort)" = "$(printf 'hold_unresolved\nprepared\n' | sort)" ] || { echo 'concurrent prepare did not serialize' >&2; exit 1; }
# Force each order of the start-versus-clear race. The second transaction must
# wait on the operation row, then observe the first transaction's committed state.
for first_action in start clear; do
  op="forced-$first_action"
  psql -X -v ON_ERROR_STOP=1 -Atq -c "INSERT INTO dispatch_lab.operation VALUES ('$op','a',true,1,1,clock_timestamp()+interval '1 hour'); SELECT dispatch_lab.prepare('$op','a',1,1,'d','p'); INSERT INTO dispatch_lab.proof SELECT id,'nonexecution','synthetic' FROM dispatch_lab.intent WHERE operation_key='$op'" >/dev/null
  intent_id="$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SELECT id FROM dispatch_lab.intent WHERE operation_key='$op'")"
  first_sql="SELECT dispatch_lab.start('$op',1,1,$intent_id,'d','p')"
  second_sql="SELECT dispatch_lab.clear_with_test_proof($intent_id)"
  expected_first=send_once; expected_second=hold_no_proof
  if [ "$first_action" = clear ]; then
    first_sql="SELECT dispatch_lab.clear_with_test_proof($intent_id)"
    second_sql="SELECT dispatch_lab.start('$op',1,1,$intent_id,'d','p')"
    expected_first=cleared; expected_second=hold_missing
  fi
  marker="$dir/locked-$first_action"
  psql -X -v ON_ERROR_STOP=1 -Atq >"$dir/first-$first_action" <<SQL &
BEGIN;
$first_sql;
\! touch "$marker"
SELECT pg_sleep(1);
COMMIT;
SQL
  first_pid=$!
  for unused in {1..100}; do [ -e "$marker" ] && break; sleep 0.02; done
  [ -e "$marker" ] || { echo 'race first transaction did not lock' >&2; exit 1; }
  if psql -X -v ON_ERROR_STOP=1 -Atq -c "SET lock_timeout='200ms'; $second_sql" >"$dir/second-$first_action" 2>&1; then echo 'competing transaction bypassed lock' >&2; exit 1; fi
  grep -q 'lock timeout' "$dir/second-$first_action" || { cat "$dir/second-$first_action" >&2; exit 1; }
  wait "$first_pid"
  grep -qx "$expected_first" "$dir/first-$first_action" || { echo 'unexpected first race result' >&2; exit 1; }
  [ "$(psql -X -v ON_ERROR_STOP=1 -Atq -c "$second_sql")" = "$expected_second" ] || { echo 'unexpected second race result' >&2; exit 1; }
done
# Inject a synthetic provider adapter only after a committed send authorization.
: >"$dir/provider-calls"
start="$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SELECT dispatch_lab.start('race',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='race' AND state<>'cleared'),'digest','provider-key')")"
[ "$start" = send_once ] || exit 1
printf 'synthetic call\n' >>"$dir/provider-calls"
[ "$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SELECT dispatch_lab.start('race',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='race' AND state<>'cleared'),'digest','provider-key')")" = hold_scope ] || exit 1
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
UPDATE dispatch_lab.operation SET current_attempt=2,fence=2,lease_until=clock_timestamp()+interval '1 hour' WHERE operation_key='race';
DO $$ DECLARE i bigint; BEGIN
 SELECT id INTO i FROM dispatch_lab.intent WHERE operation_key='race';
 IF dispatch_lab.unknown(i) <> 'unknown_hold' THEN RAISE EXCEPTION 'unknown'; END IF;
 IF dispatch_lab.prepare('race','a',2,2,'digest','provider-key') <> 'hold_unresolved' THEN RAISE EXCEPTION 'unknown permitted redispatch'; END IF;
 IF dispatch_lab.clear_with_test_proof(i) <> 'hold_no_proof' THEN RAISE EXCEPTION 'cleared without proof'; END IF;
 IF dispatch_lab.late_result(i,'late-bytes') <> 'result_held_no_receipt' THEN RAISE EXCEPTION 'late result'; END IF;
 IF dispatch_lab.clear_with_test_proof(i) <> 'hold_no_proof' THEN RAISE EXCEPTION 'late result cleared'; END IF;
 IF dispatch_lab.prepare('race','a',2,2,'digest','provider-key') <> 'hold_unresolved' THEN RAISE EXCEPTION 'late result enabled redispatch'; END IF;
END $$;
-- Transaction rollback leaves no intent, while a lost acknowledgement leaves one.
INSERT INTO dispatch_lab.operation VALUES ('rollback','a',true,1,1,clock_timestamp()+interval '1 hour');
BEGIN;
SELECT dispatch_lab.prepare('rollback','a',1,1,'digest','key');
ROLLBACK;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM dispatch_lab.intent WHERE operation_key='rollback') THEN RAISE EXCEPTION 'rollback persisted'; END IF;
 IF dispatch_lab.prepare('rollback','a',1,1,'digest','key') <> 'prepared' THEN RAISE EXCEPTION 'rollback blocked retry'; END IF;
 IF dispatch_lab.prepare('rollback','a',1,1,'digest','key') <> 'hold_unresolved' THEN RAISE EXCEPTION 'lost acknowledgement did not hold'; END IF;
 UPDATE dispatch_lab.operation SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_key='rollback';
 IF dispatch_lab.start('rollback',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='rollback' AND state<>'cleared'),'digest','key') <> 'hold_scope' THEN RAISE EXCEPTION 'expired lease dispatched'; END IF;
 IF dispatch_lab.prepare('rollback','a',1,1,'digest','key') <> 'hold_scope' THEN RAISE EXCEPTION 'expired lease prepared'; END IF;
 UPDATE dispatch_lab.operation SET lease_until=clock_timestamp()+interval '1 hour' WHERE operation_key='rollback';
 IF dispatch_lab.prepare('rollback','a',1,1,'digest','key') <> 'hold_unresolved' THEN RAISE EXCEPTION 'lease renewal cleared intent'; END IF;
END $$;
-- A prepared intent remains unresolved across lease expiry even if no send was observed.
INSERT INTO dispatch_lab.operation VALUES ('crash-before','a',true,1,1,clock_timestamp()+interval '1 hour');
DO $$ DECLARE i bigint; BEGIN
 IF dispatch_lab.prepare('crash-before','a',1,1,'digest','key') <> 'prepared' THEN RAISE EXCEPTION 'prepare'; END IF;
 UPDATE dispatch_lab.operation SET current_attempt=2,fence=2,lease_until=clock_timestamp()+interval '1 hour' WHERE operation_key='crash-before';
 IF dispatch_lab.start('crash-before',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='crash-before' AND state<>'cleared'),'digest','key') <> 'hold_scope' THEN RAISE EXCEPTION 'old attempt started'; END IF;
 IF dispatch_lab.prepare('crash-before','a',2,2,'digest','key') <> 'hold_unresolved' THEN RAISE EXCEPTION 'crash before send not held'; END IF;
 SELECT id INTO i FROM dispatch_lab.intent WHERE operation_key='crash-before';
 INSERT INTO dispatch_lab.proof VALUES(i,'nonexecution','synthetic verified proof');
 IF dispatch_lab.clear_with_test_proof(i) <> 'cleared' THEN RAISE EXCEPTION 'nonexecution proof'; END IF;
 IF dispatch_lab.prepare('crash-before','a',2,2,'digest','key2') <> 'prepared' THEN RAISE EXCEPTION 'proof did not allow new intent'; END IF;
END $$;
INSERT INTO dispatch_lab.operation VALUES ('cancel','a',true,1,1,clock_timestamp()+interval '1 hour');
DO $$ DECLARE i bigint; BEGIN
 PERFORM dispatch_lab.prepare('cancel','a',1,1,'digest','key');
 SELECT id INTO i FROM dispatch_lab.intent WHERE operation_key='cancel';
 INSERT INTO dispatch_lab.proof VALUES(i,'cancelled_no_late_effect','synthetic verified cancellation');
 IF dispatch_lab.clear_with_test_proof(i) <> 'cleared' THEN RAISE EXCEPTION 'cancel proof'; END IF;
 UPDATE dispatch_lab.operation SET current_attempt=2,fence=2 WHERE operation_key='cancel';
 IF dispatch_lab.prepare('cancel','a',2,2,'digest','key2') <> 'prepared' THEN RAISE EXCEPTION 'cancel did not allow new intent'; END IF;
 IF dispatch_lab.late_result(i,'late') <> 'hold_state' THEN RAISE EXCEPTION 'closed intent accepted late result'; END IF;
END $$;
INSERT INTO dispatch_lab.operation VALUES ('closed','a',true,1,1,clock_timestamp()+interval '1 hour');
DO $$ BEGIN
 PERFORM dispatch_lab.prepare('closed','a',1,1,'digest','key');
 UPDATE dispatch_lab.operation SET admission_open=false WHERE operation_key='closed';
 IF dispatch_lab.start('closed',1,1,(SELECT id FROM dispatch_lab.intent WHERE operation_key='closed' AND state<>'cleared'),'digest','key') <> 'hold_scope' THEN RAISE EXCEPTION 'closed scope dispatched'; END IF;
END $$;
SQL
[ "$(wc -l <"$dir/provider-calls" | tr -d ' ')" = 1 ] || { echo 'unexpected synthetic provider calls' >&2; exit 1; }
echo 'Local dispatch prototype passed; one synthetic provider call; no provider guarantees or receipt implemented.'
