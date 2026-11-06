"""Run one allowlisted external proof stage. Use run-external-review.sh."""
import argparse
import errno
import json
import os
from pathlib import Path
import socket
import subprocess
import sys

from external_review_paths import check_binding, fresh_output, source_hashes

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parents[1]
BACKEND = REPO / 'back-end'
NODE = Path('/Users/jeff/.nvm/versions/node/v24.22.1/bin/node')
SAFE_PATH = f'{NODE.parent}:/Library/Frameworks/Python.framework/Versions/3.13/bin:/usr/bin:/bin:/usr/sbin:/sbin'


def require_network_denial():
    try:
        with socket.create_connection(('192.0.2.1', 443), timeout=2):
            raise RuntimeError('Network isolation failed')
    except OSError as error:
        if error.errno != errno.EPERM:
            raise RuntimeError('OS network denial was not established') from error


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    stages = result.add_subparsers(dest='stage', required=True)
    fields = {'export': ('flow-config', 'flow-manifest', 'config-sha256', 'asset-map', 'asset-map-sha256'),
              'render': ('proof',), 'assemble': ('proof', 'rasters'),
              'verify': ('proof', 'rasters', 'pdfs'), 'contacts': ('proof', 'rasters')}
    for name, names in fields.items():
        stage = stages.add_parser(name)
        for field in (*names, 'output'):
            stage.add_argument('--' + field, required=True)
    return result


def command_for(args, output):
    def absolute(value):
        return str(Path(value).resolve(strict=True))
    py = [sys.executable, '-B']
    ts = [str(NODE), '--import', 'tsx']
    if args.stage == 'export':
        command = ts + [str(BACKEND / 'scripts/export-inner-voice-external-flow-proof.ts')]
        for field in ('flow_config', 'flow_manifest', 'config_sha256', 'asset_map', 'asset_map_sha256'):
            value = getattr(args, field)
            command += ['--' + field.replace('_', '-'), value if field.endswith('sha256') else absolute(value)]
    elif args.stage == 'assemble':
        return ts + [str(BACKEND / 'scripts/assemble-inner-voice-custom-flow-review.ts'),
                     absolute(args.proof), absolute(args.rasters), str(output)]
    else:
        scripts = {'render': 'local_custom_flow_pdf.py', 'verify': 'verify_local_review_pdfs.py',
                   'contacts': 'make_external_review_contacts.py'}
        command = py + [str(TOOLS / scripts[args.stage]), '--proof', absolute(args.proof)]
        if args.stage != 'render':
            command += ['--rasters', absolute(args.rasters)]
        if args.stage == 'verify':
            command += ['--pdfs', absolute(args.pdfs)]
    return command + ['--output', str(output)]


def source_snapshot():
    # Bind local runtime source, including the frozen exporters and validators.
    files = {Path(__file__), TOOLS / 'external_review_paths.py', BACKEND / 'package.json',
             BACKEND / 'package-lock.json', BACKEND / 'tsconfig.json'}
    for folder in (BACKEND / 'src', BACKEND / 'scripts/helpers', TOOLS):
        files.update(p for p in folder.rglob('*') if p.is_file()
                     and p.suffix in ('.ts', '.tsx', '.js', '.mjs', '.py', '.json', '.sh'))
    files.update(BACKEND / 'scripts' / name for name in
                 ('export-inner-voice-custom-flow-proof.ts', 'export-inner-voice-external-flow-proof.ts',
                  'assemble-inner-voice-custom-flow-review.ts'))
    return source_hashes(sorted(files))


def run_job(args):
    require_network_denial()
    binding = fresh_output(args.output)
    receipt = fresh_output(str(binding.output) + '.job.json')
    pending = fresh_output(str(receipt.output) + '.pending')
    for sidecar in (receipt, pending):
        if (sidecar.root, sidecar.device, sidecar.inode) != (binding.root, binding.device, binding.inode):
            raise ValueError('Artifact root changed before job')
    command = command_for(args, binding.output)
    sources = source_snapshot()
    check_binding(binding)
    check_binding(receipt)
    check_binding(pending)
    completed = subprocess.run(command, cwd=BACKEND,
                               env={'PATH': SAFE_PATH, 'PYTHONDONTWRITEBYTECODE': '1'}, check=False)
    check_binding(binding, require_output=completed.returncode == 0)
    check_binding(receipt)
    if source_snapshot() != sources:
        raise ValueError('Proof tool source changed during job')
    if completed.returncode == 0:
        expected_file = args.stage == 'verify'
        if binding.output.is_file() != expected_file or binding.output.is_dir() == expected_file:
            raise ValueError('Unexpected stage output type')
    receipt_names = {'export': 'proof-manifest.json', 'render': 'render-results.json',
                     'assemble': 'review-receipts.json', 'contacts': 'contact-receipt.json'}
    stage_receipt = binding.output if args.stage == 'verify' else binding.output / receipt_names[args.stage]
    output_hashes = source_hashes([stage_receipt]) if completed.returncode == 0 else {}
    result = {'schema': 'lhb.external-review-job@v1', 'stage': args.stage,
              'status': 'passed' if completed.returncode == 0 else 'failed',
              'approved': False, 'printReady': False, 'exitCode': completed.returncode,
              'networkDenialProbe': 'EPERM', 'command': command,
              'externalStorage': binding.receipt(), 'sourceSha256': sources,
              'outputReceiptSha256': output_hashes}
    # Publish the accepted filename only after checking the prepared receipt.
    with pending.output.open('x') as handle:
        os.chmod(pending.output, 0o600)
        handle.write(json.dumps(result, indent=2) + '\n')
        handle.flush()
        os.fsync(handle.fileno())
    check_binding(binding, require_output=completed.returncode == 0)
    check_binding(receipt)
    check_binding(pending, require_output=True)
    if source_snapshot() != sources:
        raise ValueError('Proof tool source changed while recording job')
    if source_hashes(output_hashes) != output_hashes:
        raise ValueError('Stage receipt changed while recording job')
    # Atomic no-clobber publication. A failed check leaves only .pending evidence.
    os.link(pending.output, receipt.output)
    try:
        pending.output.unlink()
    except OSError:
        pass  # Both names refer to the same complete receipt; cleanup is optional.
    return completed.returncode


if __name__ == '__main__':
    sys.exit(run_job(parser().parse_args()))
