"""Run a reviewed local driver against a disposable external PostgreSQL cluster."""
import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]
HELPERS = REPO / 'tools/inner-voice-placement-editor'
sys.path.insert(0, str(HELPERS))
from external_review_paths import fresh_output, check_binding, source_hashes, check_sources

PG = Path('/opt/homebrew/bin')
PORT = '55432'


def denied_network():
    for host in ('127.0.0.1', '192.0.2.1'):
        try:
            with socket.create_connection((host, 443), timeout=2):
                raise RuntimeError('Network unexpectedly connected')
        except OSError as error:
            if error.errno not in (errno.EPERM, errno.EACCES):
                raise RuntimeError('OS network denial not proven') from error


def source_path(value):
    path = Path(value)
    if not path.is_absolute():
        path = REPO / path
    if not path.is_relative_to(REPO) or not path.is_file() or path.resolve(strict=True) != path:
        raise ValueError('Driver/source must be a regular canonical repository file')
    return path


def unreaped_exit(process):
    if process.returncode is not None:
        raise RuntimeError('Owned group leader was reaped before drain')
    result = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    if result is None or result.si_pid == 0:
        return None
    return result.si_status if result.si_code == os.CLD_EXITED else -result.si_status


def wait_unreaped(process, timeout):
    deadline = time.monotonic() + timeout
    while True:
        code = unreaped_exit(process)
        if code is not None:
            return code
        if time.monotonic() >= deadline:
            raise subprocess.TimeoutExpired(['owned-process', str(process.pid)], timeout)
        time.sleep(0.05)


def active_members(group):
    output = subprocess.check_output(['/bin/ps', '-axo', 'pid=,pgid=,stat='], text=True, timeout=3)
    return [int(fields[0]) for line in output.splitlines() if len(fields := line.split()) == 3
            and int(fields[1]) == group and not fields[2].startswith('Z')]


def stop_owned(process, first_signal, details, label):
    if process is None:
        return True
    unreaped_exit(process)
    group = process.pid
    escalated = False
    inspection_error = None
    try:
        os.killpg(group, first_signal)
    except ProcessLookupError:
        pass
    force = False
    try:
        deadline = time.monotonic() + 3
        while active_members(group) and time.monotonic() < deadline:
            time.sleep(0.1)
        force = bool(active_members(group))
    except Exception as error:
        inspection_error = str(error)
        force = True
    if force:
        try:
            os.killpg(group, signal.SIGKILL)
        except ProcessLookupError:
            pass
        escalated = True
    wait_unreaped(process, 5)
    try:
        deadline = time.monotonic() + 3
        while active_members(group) and time.monotonic() < deadline:
            time.sleep(0.1)
        drained = not active_members(group)
    except Exception as error:
        inspection_error = str(error)
        drained = False
    details[label] = {'group': group, 'escalated': escalated, 'drained': drained, 'inspectionError': inspection_error}
    if drained:
        process.wait(timeout=1)
    return drained


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--driver', required=True)
    parser.add_argument('--source', action='append', default=[])
    parser.add_argument('--driver-arg', action='append', default=[])
    parser.add_argument('--timeout', type=int, default=120)
    args = parser.parse_args()
    if not all(hasattr(os, name) for name in ('waitid', 'WNOWAIT', 'WEXITED', 'WNOHANG')):
        raise ValueError('Unreaped process ownership is required; no unsafe fallback')
    if not hasattr(signal, 'pthread_sigmask'):
        raise ValueError('Atomic owned process launch requires signal masking')
    if sys.platform != 'darwin' or not 1 <= args.timeout <= 240:
        raise ValueError('This successor supports macOS and a 1..240 second driver deadline')
    if Path.cwd() != REPO:
        raise ValueError('Run from the existing repository root')
    denied_network()
    probe = subprocess.Popen([sys.executable, '-B', '-c', 'pass'])
    try:
        wait_unreaped(probe, 5)
    finally:
        probe.wait(timeout=5)
    driver = source_path(args.driver)
    if driver.suffix != '.py':
        raise ValueError('Supply a reviewed Python proof driver')
    selected = [Path(__file__).resolve(), HELPERS / 'external_review_paths.py', driver]
    selected.extend(source_path(value) for value in args.source)
    sources = source_hashes(sorted(set(selected)))
    binding = fresh_output(args.output)
    check_binding(binding)
    os.umask(0o077)
    binding.output.mkdir(mode=0o700)
    output_identity = (binding.output.stat().st_dev, binding.output.stat().st_ino)

    def check_output():
        check_binding(binding, require_output=True)
        current = binding.output.stat()
        if (current.st_dev, current.st_ino) != output_identity:
            raise RuntimeError('Owned output directory replaced')

    data = binding.output / 'data'
    socket_dir = Path(tempfile.mkdtemp(prefix='lhbpg2-', dir='/private/tmp'))
    if len(str(socket_dir / f'.s.PGSQL.{PORT}')) >= 100:
        raise ValueError('Private socket path too long')
    environment = {
        'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C',
        'PGHOST': str(socket_dir), 'PGPORT': PORT, 'PGUSER': 'postgres', 'PGDATABASE': 'postgres',
        'PGCONNECT_TIMEOUT': '2', 'PGOPTIONS': '-c statement_timeout=15000 -c lock_timeout=5000 -c timezone=UTC',
        'LHB_CHECKOUT_PROOF_ROOT': str(binding.output), 'PYTHONDONTWRITEBYTECODE': '1',
    }
    bootstrap = None
    server = None
    child = None
    status = 1
    failure = None
    cleanup = {'bootstrapDrained': False, 'driverDrained': False, 'serverDrained': False, 'socketRemoved': False}
    cleanup_details = {}
    cleanup_errors = []
    driver_code = None
    previous = {}
    owned = {'bootstrap': None, 'server': None, 'driver': None}
    handled = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGQUIT)

    def launch(label, command, **kwargs):
        prior_mask = signal.pthread_sigmask(signal.SIG_BLOCK, handled)
        try:
            process = subprocess.Popen([sys.executable, '-B', str(Path(__file__).resolve()), '--owned-exec', '--', *command], start_new_session=True, **kwargs)
            owned[label] = process
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, prior_mask)
        return process

    def interrupted(signum, _frame):
        raise RuntimeError(f'Owned proof interrupted by signal {signum}')

    for signum in handled:
        previous[signum] = signal.signal(signum, interrupted)
    try:
        check_output()
        with (binding.output / 'initdb.log').open('x') as log:
            bootstrap = launch('bootstrap', [str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
                           env=environment, stdout=log, stderr=subprocess.STDOUT)
            if wait_unreaped(bootstrap, 40) != 0:
                raise RuntimeError('Owned initialization failed')
        check_output()
        with (binding.output / 'server.log').open('x') as log:
            server = launch('server', [str(PG / 'postgres'), '-D', str(data), '-p', PORT,
                '-c', 'listen_addresses=', '-c', f'unix_socket_directories={socket_dir}',
                '-c', 'unix_socket_permissions=0700', '-c', 'timezone=UTC'],
                env=environment, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 20
            while True:
                if unreaped_exit(server) is not None:
                    raise RuntimeError('Owned PostgreSQL exited before readiness')
                ready = subprocess.run([str(PG / 'pg_isready'), '-q'], env=environment, timeout=3)
                if ready.returncode == 0:
                    break
                if time.monotonic() >= deadline:
                    raise TimeoutError('Owned PostgreSQL readiness timed out')
                time.sleep(0.1)
            if int((data / 'postmaster.pid').read_text().splitlines()[0]) != server.pid:
                raise RuntimeError('Cluster ownership PID mismatch')
            settings = subprocess.check_output([str(PG / 'psql'), '-XAt', '-v', 'ON_ERROR_STOP=1', '-c',
                "SELECT json_build_object('listen',current_setting('listen_addresses'),'sockets',current_setting('unix_socket_directories'),'data',current_setting('data_directory'))"],
                env=environment, text=True, timeout=5)
            settings = json.loads(settings)
            if settings != {'listen': '', 'sockets': str(socket_dir), 'data': str(data)}:
                raise RuntimeError('Owned PostgreSQL isolation settings mismatch')
            check_sources(sources)
            check_output()
            with (binding.output / 'driver.log').open('x') as log:
                child = launch('driver', [sys.executable, '-B', str(driver), *args.driver_arg], cwd=REPO,
                    env=environment, stdout=log, stderr=subprocess.STDOUT)
                driver_code = wait_unreaped(child, args.timeout)
                status = driver_code if driver_code >= 0 else 128 - driver_code
            if unreaped_exit(server) is not None:
                raise RuntimeError('Owned PostgreSQL exited during proof')
    except Exception as error:
        failure = {'type': type(error).__name__, 'message': str(error)}
        status = 124 if isinstance(error, subprocess.TimeoutExpired) else 1
    finally:
        for signum in previous:
            signal.signal(signum, signal.SIG_IGN)
        try:
            for label, process, first_signal in [('driver', owned['driver'], signal.SIGTERM), ('server', owned['server'], signal.SIGINT), ('bootstrap', owned['bootstrap'], signal.SIGTERM)]:
                try:
                    cleanup[label + 'Drained'] = stop_owned(process, first_signal, cleanup_details, label)
                except Exception as error:
                    cleanup_errors.append({'group': label, 'error': str(error)})
            if all(cleanup[key] for key in ('bootstrapDrained', 'driverDrained', 'serverDrained')):
                for item in socket_dir.iterdir():
                    if item.name not in (f'.s.PGSQL.{PORT}', f'.s.PGSQL.{PORT}.lock'):
                        raise RuntimeError('Unexpected file in owned socket directory; preserve it')
                    item.unlink()
                socket_dir.rmdir()
                cleanup['socketRemoved'] = True
        except Exception as error:
            cleanup_errors.append({'group': 'socket', 'error': str(error)})
        finally:
            for signum, handler in previous.items():
                signal.signal(signum, handler)
    check_output()
    check_sources(sources)
    if not all(cleanup.values()) or cleanup_errors:
        status = 1
    receipt = {'schema': 'lhb.checkout-postgres-proof@v2', 'status': 'passed' if status == 0 else 'failed',
        'exitCode': status, 'driverReturnCode': driver_code, 'failure': failure, 'outputIdentity': {'device': output_identity[0], 'inode': output_identity[1]}, 'sources': sources, 'outputBinding': binding.receipt(),
        'networkDenied': True, 'listenAddresses': '', 'socketDirectory': str(socket_dir),
        'serverPid': owned['server'].pid if owned['server'] else None, 'driverPid': owned['driver'].pid if owned['driver'] else None,
        'cleanup': cleanup, 'cleanupDetails': cleanup_details, 'cleanupErrors': cleanup_errors, 'limits': 'Owned local cluster/driver only. Not hosted schema, roles, or provider evidence. SIGKILL/host failure can interrupt cleanup; preserve uncertain state for inspection.'}
    check_output()
    with (binding.output / 'receipt.json').open('x') as log:
        json.dump(receipt, log, indent=2)
        log.write('\n')
    check_output()
    print(json.dumps({'receipt': str(binding.output / 'receipt.json'), 'exitCode': status, 'cleanup': cleanup}), flush=True)
    return status


if __name__ == '__main__':
    if len(sys.argv) >= 4 and sys.argv[1:3] == ['--owned-exec', '--']:
        signal.pthread_sigmask(signal.SIG_UNBLOCK, (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGQUIT))
        os.execvpe(sys.argv[3], sys.argv[3:], os.environ)
    try:
        sys.exit(main())
    except Exception as error:
        print(f'CHECKOUT_POSTGRES_PROOF_FAILED: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
