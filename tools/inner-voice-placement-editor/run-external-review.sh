#!/bin/bash
set -euo pipefail
review_tools=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
review_exception=false
if [[ ${1:-} == --user-space-exception ]]; then
  review_exception=true
  shift
fi
if [[ $review_exception == true ]]; then
  exec /bin/bash "$review_tools/run_review_command.sh" --user-space-exception --label "${1:-job}" -- \
    /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -B \
    "$review_tools/run_external_review_job.py" "$@"
fi
exec /bin/bash "$review_tools/run_review_command.sh" --label "${1:-job}" -- \
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -B \
  "$review_tools/run_external_review_job.py" "$@"
