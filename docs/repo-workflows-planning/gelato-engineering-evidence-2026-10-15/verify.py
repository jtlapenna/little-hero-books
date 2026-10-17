#!/usr/bin/env python3
"""Check exported recorded evidence locally. No network, env loading or writes."""
import copy
import hashlib
import json
import pathlib
import re
import sys
from datetime import datetime

TABLES = ('orders', 'print_provider_submissions', 'print_provider_submission_items',
          'print_provider_submission_orders', 'print_provider_submission_notifications')
FLAGS = ('GELATO_DRAFT_SUBMISSION_ENABLED', 'GELATO_CANCEL_ENABLED',
         'GELATO_STATUS_RELAY_ENABLED', 'GELATO_STATUS_POLLING_ENABLED', 'GELATO_NOTIFICATIONS_ENABLED')
PIN = 'e5ab870341842206ca04f933341aab0e66f3da0c'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def keys(value, expected):
    require(isinstance(value, dict) and set(value) == set(expected), 'Unexpected or missing fields')


def sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def hash_value(value):
    require(isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value), 'Invalid SHA-256')


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def rows(value):
    keys(value, TABLES)
    for table in TABLES:
        require(isinstance(value[table], list), 'Invalid row inventory')
        ids = set()
        for row in value[table]:
            keys(row, ('id', 'hash'))
            require(str(row['id']) not in ids, 'Duplicate row')
            ids.add(str(row['id']))
            hash_value(row['hash'])


def runtime(value, enabled):
    require(value['contextAvailable'] is True and value['draftsEnabled'] is enabled, 'Factory runtime differs')
    require(type(value['buildTimestampMs']) is int and value['buildTimestampMs'] > 0, 'Missing runtime build time')
    for name in ('cloudflare', 'globalProcess', 'nodeProcess'):
        keys(value[name], ('present', 'isString', 'isTrue', 'isFalse'))
        require(value[name] == {'present': True, 'isString': True, 'isTrue': enabled, 'isFalse': not enabled}, 'Runtime view differs')


def proof(value, count, quarantine=False):
    keys(value, ('quarantined', 'nativeCaseVerified', 'submissionId', 'executionId', 'children',
                 'rootOrderId', 'shipmentMethodUid', 'quoteFreshAtSend', 'financiallyDraft',
                 'unconverted', 'cancelUnavailable', 'notifications', 'requestSha256', 'artifacts', 'graph', 'verifiedInventory'))
    require(value['children'] == count and value['quarantined'] is quarantine and value['nativeCaseVerified'] is (not quarantine), 'Case classification differs')
    for key in ('quoteFreshAtSend', 'financiallyDraft', 'unconverted', 'cancelUnavailable'):
        require(value[key] is True, 'Draft/quote receipt differs')
    require(value['notifications'] == 0, 'Notification intents recorded')
    hash_value(value['requestSha256'])
    require(len(value['artifacts']) == count, 'PDF count differs')
    children = set()
    for artifact in value['artifacts']:
        keys(artifact, ('childId', 'itemReferenceId', 'bytes', 'sha256', 'pageCount', 'geometryAndSequenceVerified'))
        require(type(artifact['childId']) is int and artifact['childId'] not in children, 'Duplicate child')
        children.add(artifact['childId'])
        require(artifact['itemReferenceId'] == f"lhb-item-{artifact['childId']}", 'Item reference differs')
        require(artifact['bytes'] > 0 and artifact['pageCount'] == 35 and artifact['geometryAndSequenceVerified'] is True, 'PDF receipt differs')
        hash_value(artifact['sha256'])
    require(value['graph'] and len({node['id'] for node in value['graph']}) == len(value['graph']), 'Invalid provider graph')
    require(value['rootOrderId'] in {node['id'] for node in value['graph']}, 'Provider root absent')
    for node in value['graph']:
        keys(node, ('id', 'orderType', 'financialStatus', 'fulfillmentStatus'))
        require(all(node[k] == 'draft' for k in ('orderType', 'financialStatus', 'fulfillmentStatus')), 'Provider is not financially draft')
    rows(value['verifiedInventory'])
    return children


def verify(data):
    keys(data, ('schemaVersion', 'scope', 'source', 'pullRequest', 'releaseJournalSha256', 'release', 'originalRows', 'cases', 'localAudit', 'metadataObjects'))
    require(data['schemaVersion'] == 1 and data['source'] == PIN, 'Source/schema differs')
    require(data['pullRequest'] == 'https://github.com/jtlapenna/little-hero-books/pull/12', 'Release link differs')
    hash_value(data['releaseJournalSha256'])
    pool = data['metadataObjects']
    for digest, obj in pool.items():
        hash_value(digest)
        require(sha(obj) == digest, 'Metadata content hash differs')
        if 'flags' in obj:
            keys(obj, ('id', 'createdAt', 'environment', 'source', 'stage', 'status', 'flags'))
            keys(obj['flags'], FLAGS)
            require(all(v in ('true', 'false', 'unknown') for v in obj['flags'].values()), 'Unexpected flag value')
        else:
            keys(obj, ('id', 'attempt', 'source', 'workflowId', 'path', 'branch', 'event', 'actor', 'createdAt', 'status', 'conclusion'))

    def inventory(value):
        keys(value, ('canonical', 'deployments', 'runs'))
        for family in ('deployments', 'runs'):
            for identity, digest in value[family].items():
                require(digest in pool and str(pool[digest]['id']) == identity, 'Inventory reference differs')
                require(('flags' in pool[digest]) == (family == 'deployments'), 'Inventory family differs')
        require(value['canonical'] in value['deployments'], 'Serving deployment absent')
        serving = pool[value['deployments'][value['canonical']]]
        require(serving['source'] == PIN and serving['environment'] == 'production' and serving['stage'] == 'deploy' and serving['status'] == 'success', 'Serving identity differs')
        require(all(v == 'false' for v in serving['flags'].values()), 'Serving controls are not OFF')

    release = data['release']
    keys(release, ('at', 'workflowHash', 'configDigest', 'retainedDigest', 'artifactDigest', 'idempotencyDigest', 'verified', 'runtime', 'inventory'))
    require(release['verified'] is True, 'Release verification missing')
    runtime(release['runtime'], False)
    prior = release['inventory']
    inventory(prior)
    rows(data['originalRows'])
    previous_owned = None
    require([c['kind'] for c in data['cases']] == ['website-single', 'amazon-single', 'amazon-siblings'], 'Case order differs')
    audit = data['localAudit']
    require(audit['localEvidenceAuditPassed'] is True and audit['nativeWorkflowAndLiveRecoveryEvidenceVerified'] is True and audit['source'] == PIN, 'Private audit result differs')
    require(audit['paidPrinting'] is False and audit['customerMessages'] is False and audit['serviceRequests'] == 0, 'Audit scope differs')
    for index, case in enumerate(data['cases']):
        count = 2 if case['kind'] == 'amazon-siblings' else 1
        hash_value(case['journalSha256'])
        require(case['journalSha256'] == audit['cases'][index]['journalSha256'], 'Journal binding differs')
        counts = case['eventCounts']
        require(sum(counts.values()) == case['recordCount'] and counts.get('issue', 0) == 0, 'Journal issue/count differs')
        require(case['closureVerified'] is True, 'Closure missing')
        proof(case['refreshed'], count)
        previous_proof = case['beforeRefresh'] if index == 0 else case['created']
        proof(previous_proof, count, quarantine=(index == 0))
        for field in ('executionId', 'submissionId', 'requestSha256', 'rootOrderId', 'artifacts', 'graph'):
            require(previous_proof[field] == case['refreshed'][field], 'Refresh changed identity/PDF/provider graph')
        rows(case['ownedRows'])
        for table in TABLES:
            expected = data['originalRows'][table] + case['ownedRows'][table]
            observed = case['refreshed']['verifiedInventory'][table]
            require(sorted(expected, key=lambda r: str(r['id'])) == sorted(observed, key=lambda r: str(r['id'])), 'Original/owned preservation differs')
        current = case['inventory']
        inventory(current)
        for family in ('deployments', 'runs'):
            require(all(current[family].get(k) == v for k, v in prior[family].items()), 'Historical full metadata changed or removed')
        if index == 0:
            require(current == prior and case['refreshAckKnown'] is True, 'Website recovery inventory/ACK differs')
            require(counts.get('post-fix-refresh-intent') == 1, 'Website refresh count differs')
            require(all(counts.get(k, 0) == 0 for k in ('native-claim-intent', 'native-webhook-intent', 'native-refresh-intent')), 'Website replay recorded')
        else:
            for field in ('source', 'workflowHash', 'configDigest', 'retainedDigest', 'artifactDigest', 'idempotencyDigest'):
                require(case['baseline'][field] == (PIN if field == 'source' else release[field]), 'Source/preservation baseline differs')
            for name in ('native-claim-intent', 'native-claim-owned', 'native-webhook-intent', 'native-execution', 'native-refresh-intent', 'native-case-passed', 'closure', 'post-fix-inventory'):
                require(counts.get(name) == 1, 'Native intent/result missing or duplicated')
            require(case['execution']['status'] == 'success' and case['execution']['executionId'] == case['refreshed']['executionId'], 'Execution differs')
            require(set(case['childIds']) == {a['childId'] for a in case['refreshed']['artifacts']}, 'Child mapping differs')
            require(case['result'] == {'proofPassed': True, 'closureVerified': True, 'issue': False}, 'Native result failed')
            require(case['controls'] == {'passed': True, 'dispatchClosed': True, 'draftClosed': True, 'workflowCopiesClosed': [True, True]}, 'Controls not closed')
            observations = case['observations']
            require([o['value'] for o in observations] == [True, False], 'Runtime transition differs')
            added_deployments = set(current['deployments']) - set(prior['deployments'])
            added_runs = set(current['runs']) - set(prior['runs'])
            require(len(added_deployments) == len(added_runs) == 2, 'Unexpected inventory additions')
            require({o['deployment'] for o in observations} == added_deployments and current['canonical'] == observations[-1]['deployment'], 'Runtime ownership differs')
            for observation in observations:
                runtime(observation, observation['value'])
                deployed = pool[current['deployments'][observation['deployment']]]
                require(deployed['source'] == PIN and deployed['status'] == 'success' and deployed['flags'][FLAGS[0]] == str(observation['value']).lower(), 'Owned deployment differs')
                require(all(deployed['flags'][k] == 'false' for k in FLAGS[1:]), 'Other controls enabled')
            require(timestamp(observations[0]['at']) < timestamp(observations[1]['at']) <= timestamp(case['closureAt']) < timestamp(case['inventoryAt']), 'Closure ordering differs')
            for identity in added_runs:
                run = pool[current['runs'][identity]]
                require(run['source'] == PIN and run['branch'] == 'main' and run['event'] == 'workflow_dispatch' and run['attempt'] == 1 and run['status'] == 'completed' and run['conclusion'] == 'success', 'Owned deployment run differs')
            child_ids = set(case['childIds'])
            allowed = {'orders': child_ids, 'print_provider_submissions': {case['refreshed']['submissionId']}, 'print_provider_submission_items': child_ids, 'print_provider_submission_orders': {g['id'] for g in case['refreshed']['graph']}, 'print_provider_submission_notifications': set()}
            for table in TABLES:
                for old in previous_owned[table]:
                    if old['id'] not in allowed[table]:
                        require(old in case['ownedRows'][table], 'Unrelated owned row changed')
        prior = current
        previous_owned = case['ownedRows']
    require(audit['finalCanonical'] == prior['canonical'] and audit['deployments'] == len(prior['deployments']) and audit['runs'] == len(prior['runs']), 'Final inventory result differs')
    return {'recordedEvidenceChecksPassed': True, 'cases': 3, 'finalControlsRecordedOff': True, 'serviceRequests': 0}


def self_test(data):
    changes = [lambda d: d['cases'][2]['refreshed']['graph'][0].update(financialStatus='paid'),
               lambda d: d['cases'][1]['observations'][1].update(draftsEnabled=True),
               lambda d: d['cases'][2]['eventCounts'].update(**{'native-webhook-intent': 2}),
               lambda d: d['cases'][2]['refreshed']['artifacts'][0].update(sha256='0' * 64),
               lambda d: d['cases'][2]['inventory']['runs'].pop(next(iter(d['release']['inventory']['runs']))),
               lambda d: d['cases'][2]['controls'].update(dispatchClosed=False),
               lambda d: d['cases'][2]['refreshed'].update(notifications=1)]
    for change in changes:
        altered = copy.deepcopy(data)
        change(altered)
        try:
            verify(altered)
        except (ValueError, KeyError):
            continue
        raise ValueError('Verifier accepted altered evidence')
    return len(changes)


if __name__ == '__main__':
    try:
        require(sys.argv[1:] in ([], ['--self-test']), 'Usage: python3 verify.py [--self-test]')
        directory = pathlib.Path(__file__).parent
        manifest = json.loads((directory / 'manifest.json').read_text())
        keys(manifest, ('schemaVersion', 'testedSource', 'files'))
        require(manifest['schemaVersion'] == 1 and manifest['testedSource'] == PIN, 'Manifest source/schema differs')
        keys(manifest['files'], ('README.md', 'evidence.json', 'verify.py', 'local-recovery-tests.patch'))
        for name, digest in manifest['files'].items():
            hash_value(digest)
            require(hashlib.sha256((directory / name).read_bytes()).hexdigest() == digest, 'Published file checksum differs')
        evidence = json.loads((directory / 'evidence.json').read_text())
        result = verify(evidence)
        if sys.argv[1:]:
            result['tamperCasesRejected'] = self_test(evidence)
        print(json.dumps(result))
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f'Evidence verification failed: {error}', file=sys.stderr)
        sys.exit(1)
