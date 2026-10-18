#!/usr/bin/env python3
"""Recorded evidence consistency only. No credentials, network or production access."""
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def require(value, message):
    if not value:
        raise SystemExit(message)

def read(name):
    return json.loads((ROOT / name).read_text())

manifest = read('manifest.json')
for name, digest in manifest['files'].items():
    target = ROOT / name
    require(target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == digest, 'Checksum mismatch: ' + name)
bench = read('polling-benchmark.json')
require(bench['liveRequests'] == 0 and len(bench['measurements']) == 16, 'Invalid benchmark envelope')
files = {entry['role']: entry for entry in bench['fixtures']}
require(set(files) == {'WEB-A', 'AMZ-A', 'SIB-A', 'SIB-B'}, 'Fixture set differs')
require(len({v['sha256'] for v in files.values()}) == 4, 'Expected four distinct dummy PDFs')
for measurement in bench['measurements']:
    summary = measurement['summary']
    require(summary['checked'] == 1 and summary['delivered'] == 0 and summary['customerMessages'] is False, 'Unexpected effects summary')
    roles = ['SIB-A','SIB-B'] if measurement['children'] == 2 else ['WEB-A' if measurement['format'] == 'standard' else 'AMZ-A']
    expected = sum(files[role]['bytes'] for role in roles) * 2
    require(measurement['providerReads'] == 1, 'Expected one authoritative provider read')
    if measurement['simulatedChunkDelayMs'] == 100:
        require(summary['errors'] == 1 and summary['refreshed'] == 0 and measurement['elapsedMs'] < 4000 and measurement['downloadedBytes'] < expected, 'Unbounded deadline or unexpected persistence')
    else:
        require(summary['errors'] == 0 and summary['refreshed'] == 1 and measurement['downloadedBytes'] == expected, 'Original/provider byte totals differ')
cases = read('cases.json')
require(len(cases) == 5 and cases['inspection-error']['status'] == 409, 'Browser case envelope differs')
require(cases['overdue-siblings']['body']['polling']['stale'] is True, 'Missing overdue case')
require(cases['current-siblings']['body']['polling']['stale'] is False, 'Current case stale')
unknown = cases['unknown-off']['body']
require(unknown['monetaryQuote'] is None and unknown['orders'][0]['financial'] is None and unknown['polling']['enabled'] is False, 'Unknown must not become zero')
require(len({item['orderId'] for item in unknown['items']}) == 2, 'Sibling identities not distinct')
review = read('browser-review.json')
require(len(review['checks']) == 6 and all(check['passed'] for check in review['checks']), 'Browser observations incomplete')
for name in ['temporary-route-proof','final-route-proof']:
    proof = read('historical-pr27-' + name + '.json')
    require(len(proof['checks']) == 13 and all(check['passed'] for check in proof['checks']), 'Historical route checks differ')
projection = read('historical-pr27-final-route-proof.json')['projection']
require(projection['sourceCheckCount'] == 26 and projection['publishedOneBasedRange'] == [14,26], 'Historical projection provenance differs')
state = read('historical-pr27-final-state-verification.json')
require(state['records'][0]['allSixSettingsAndServingControlsOff'] is True and state['temporaryLocalKeyFileAbsent'] is True, 'Historical OFF receipt differs')
print('PASS: recorded hashes, 16 local benchmark runs, five route cases/six browser observations, 26 historical OFF probes. No live verification performed.')
