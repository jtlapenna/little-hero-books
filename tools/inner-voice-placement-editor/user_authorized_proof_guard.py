"""Apply this chat's explicit human space exception to one canonical proof guard."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

GUARD = Path('/Users/jeff/Projects/misc-agent-work/scripts/agent_storage_guard.py')
REPO = Path(__file__).resolve().parents[2]


def load_guard():
    source = GUARD.read_bytes()
    scope = {'__name__': 'lhb_user_authorized_space_exception', '__file__': str(GUARD)}
    exec(compile(source, str(GUARD), 'exec'), scope)
    return scope, hashlib.sha256(source).hexdigest()


def run_authorized(command):
    if Path.cwd().resolve() != REPO or not command:
        raise ValueError('Supply a foreground proof command from this existing project')
    scope, digest = load_guard()
    scope['MIN_FREE'] = 0
    print(json.dumps({'userAuthorization': 'Disregard space requirements and continue until told stop',
                      'scope': 'Little Hero Books proof invocation only',
                      'guardSha256': digest, 'spaceFloorOverride': 0,
                      'sharedExclusiveLock': 'canonical main acquires before exec'}), flush=True)
    previous = sys.argv
    sys.argv = [str(GUARD), '--kind', 'proof', '--', *command]
    try:
        return scope['main']()
    finally:
        sys.argv = previous


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user-space-exception', required=True, action='store_true')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('A foreground proof command is required after --')
    return run_authorized(command)


if __name__ == '__main__':
    sys.exit(main())
