"""Consume a real external successor export through the existing validator."""
import argparse
import json
from pathlib import Path

from external_review_paths import OutputBinding, check_binding, resolve_root, source_hashes
from local_custom_flow_pdf import checked, validate
from run_external_review_job import source_snapshot


def check_job_receipt(proof, digest, root, receipt):
    identity = root.stat()
    binding = OutputBinding(root, proof, identity.st_dev, identity.st_ino)
    if (receipt.get('schema') != 'lhb.external-review-job@v1'
            or receipt.get('stage') != 'export' or receipt.get('status') != 'passed'
            or receipt.get('exitCode') != 0 or receipt.get('approved') is not False
            or receipt.get('printReady') is not False or receipt.get('networkDenialProbe') != 'EPERM'
            or receipt.get('externalStorage') != binding.receipt()
            or receipt.get('outputReceiptSha256') != {str(proof / 'proof-manifest.json'): digest}):
        raise ValueError('Expected successful bound export job receipt')
    if source_snapshot() != receipt.get('sourceSha256'):
        raise ValueError('Caller source changed since export')
    check_binding(binding, require_output=True)


def check_export(proof):
    proof = Path(proof).resolve(strict=True)
    root = resolve_root()
    if proof == root or not proof.is_relative_to(root) or proof.stat().st_dev != root.stat().st_dev:
        raise ValueError('Proof must be under the validated external project root')
    manifest, digest, _ = validate(proof)
    storage = manifest['externalStorage']
    if storage['artifactRoot'] != str(root) or storage['output'] != str(proof):
        raise ValueError('External proof storage binding differs')
    if manifest['globalFetchCalls'] != 0 or len(manifest['cases']) != 4:
        raise ValueError('Expected four local cases without fetch calls')
    html_count = sum(len(child['files']) for child in manifest['cases'])
    if html_count != 132:
        raise ValueError('Expected all 132 HTML files')
    if source_hashes(manifest['writerSourceSha256']) != manifest['writerSourceSha256']:
        raise ValueError('Exporter source changed since export')
    receipt = json.loads(Path(str(proof) + '.job.json').read_bytes())
    for value in manifest['assets'].values():
        checked(proof, value['file'], value['sha256'])
    check_job_receipt(proof, digest, root, receipt)
    return {'htmlFiles': html_count, 'assets': len(manifest['assets']),
            'proofManifestSha256': digest, 'approved': False, 'printReady': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proof', required=True, type=Path)
    print(json.dumps(check_export(parser.parse_args().proof)))
