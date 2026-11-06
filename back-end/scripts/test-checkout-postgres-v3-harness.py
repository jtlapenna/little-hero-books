"""Synthetic driver for successor startup, rejection and timeout proofs."""
import argparse
import json
import os
import subprocess
import time
import sys
import signal
import selectors
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--fail', action='store_true')
parser.add_argument('--sleep', action='store_true')
parser.add_argument('--ignore-term', action='store_true')
parser.add_argument('--orphan', action='store_true')
parser.add_argument('--signal-self', action='store_true')
parser.add_argument('--signal-runner', choices=['HUP', 'QUIT'])
parser.add_argument('--replace-output', action='store_true')
args = parser.parse_args()
value = subprocess.check_output(['/opt/homebrew/bin/psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c',
    "SELECT json_build_object('user',current_user,'database',current_database(),'listen',current_setting('listen_addresses'),'tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'))"], text=True, timeout=5)
record = json.loads(value)
assert record == {'user': 'postgres', 'database': 'postgres', 'listen': '', 'tables': 0}
assert not set(signal.pthread_sigmask(signal.SIG_BLOCK, ())) & {signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGQUIT}, 'Owned child inherited blocked termination signals'
assert os.environ['PGHOST'].startswith('/private/tmp/lhbpg2-')
assert os.environ['LHB_CHECKOUT_PROOF_ROOT'].startswith('/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/')
print(json.dumps({'phase': 'sql-and-environment-checked'}), flush=True)
if args.orphan:
    descendant = subprocess.Popen([sys.executable, '-c', 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("ignoring-term",flush=True); time.sleep(60)'], stdout=subprocess.PIPE, text=True)
    with selectors.DefaultSelector() as ready:
        ready.register(descendant.stdout, selectors.EVENT_READ)
        assert ready.select(timeout=2), 'Descendant readiness missing'
        assert descendant.stdout.readline().strip() == 'ignoring-term'
    Path(os.environ['LHB_CHECKOUT_PROOF_ROOT'], 'descendant.json').write_text(json.dumps({'pid': descendant.pid}))
    print(json.dumps({'phase': 'ignoring-descendant-started', 'pid': descendant.pid}), flush=True)
if args.replace_output:
    output = Path(os.environ['LHB_CHECKOUT_PROOF_ROOT'])
    output.rename(str(output) + '-moved')
    output.mkdir(mode=0o700)
if args.signal_runner:
    os.kill(os.getppid(), getattr(signal, 'SIG' + args.signal_runner))
    time.sleep(30)
if args.signal_self:
    os.kill(os.getpid(), signal.SIGTERM)
if args.ignore_term:
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    print(json.dumps({'phase': 'ignoring-term-leader'}), flush=True)
    time.sleep(30)
if args.sleep:
    time.sleep(30)
if args.fail:
    raise SystemExit(7)
print(json.dumps({'schema': 'lhb.postgres-harness-smoke@v1', 'synthetic': True, 'settings': record}))
