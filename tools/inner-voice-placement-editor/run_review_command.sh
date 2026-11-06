#!/bin/bash
set -euo pipefail
umask 077
review_tools=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
review_guard=(/Users/jeff/.local/bin/agent-heavy-job --kind proof --)
if [[ ${1:-} == --user-space-exception ]]; then
  review_guard=(/opt/homebrew/bin/python3.14 "$review_tools/user_authorized_proof_guard.py" --user-space-exception --)
  shift
fi
if [[ $# -lt 4 || $1 != --label ]]; then
  echo 'Usage: run_review_command.sh [--user-space-exception] --label LABEL -- COMMAND...' >&2
  exit 2
fi
review_label=$2
shift 2
if [[ ! $review_label =~ ^[a-z0-9-]+$ || $1 != -- ]]; then
  echo 'Supply a simple log label and -- before the command' >&2
  exit 2
fi
shift
cd -- "$review_tools/../.."
review_root=$(/Users/jeff/.local/bin/agent-artifact-root --project little-hero-books)
review_id=$(/usr/bin/uuidgen)
review_log="$review_root/inner-voice-$review_label-$review_id.log"
review_path=/Users/jeff/.nvm/versions/node/v24.22.1/bin:/Library/Frameworks/Python.framework/Versions/3.13/bin:/usr/bin:/bin:/usr/sbin:/sbin
review_policy='(version 1) (allow default) (deny network-outbound (remote ip "*:*")) (deny network-inbound (local ip "*:*"))'
review_probe='import errno, socket
try:
    with socket.create_connection(("192.0.2.1", 443), timeout=2):
        raise SystemExit("Network isolation failed")
except OSError as error:
    if error.errno != errno.EPERM:
        raise
    print("Outbound probe denied: EPERM", flush=True)'
set -C
exec 3>"$review_log"
if "${review_guard[@]}" /usr/bin/env -i PATH="$review_path" \
  /usr/bin/sandbox-exec -p "$review_policy" /bin/bash -c \
  'python3 -B -c "$1" && shift && exec "$@"' review "$review_probe" "$@" >&3 2>&1; then
  review_status=0
else
  review_status=$?
fi
exec 3>&- || true
echo "Log: $review_log"
if [[ -f $review_log ]]; then
  /usr/bin/tail -c 4096 "$review_log" | /usr/bin/tail -n 32 || true
fi
exit "$review_status"
