"""Focused storage and contact contract tests. No browser or provider calls."""
import copy
import errno
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import external_review_paths as paths
import make_external_review_contacts as contacts
import run_external_review_job as jobs
import check_external_export as export_check
import test_local_custom_flow_pdf as proof_fixture


class ExternalPaths(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.real_resolver = paths.resolve_root
        resolver = patch.object(paths, 'resolve_root', return_value=self.root)
        resolver.start()
        self.addCleanup(resolver.stop)

    def test_fresh_leaf_and_root_identity(self):
        binding = paths.fresh_output(self.root / 'fresh')
        self.assertFalse(binding.output.exists())
        binding.output.mkdir()
        paths.check_binding(binding, require_output=True)
        with patch.object(paths, 'resolve_root', return_value=self.root.parent):
            with self.assertRaisesRegex(ValueError, 'root changed'):
                paths.check_binding(binding)

    def test_reject_paths_before_mutation(self):
        (self.root / 'directory').mkdir()
        (self.root / 'file').write_text('existing')
        (self.root / 'dangling').symlink_to(self.root / 'missing')
        (self.root / 'alias').symlink_to(self.root / 'directory', target_is_directory=True)
        invalid = ['relative', self.root, self.root.parent / (self.root.name + '-sibling') / 'out',
                   self.root / 'missing' / 'out', self.root / 'directory', self.root / 'file',
                   self.root / 'dangling', self.root / 'alias' / 'out']
        before = sorted(str(p) for p in self.root.rglob('*'))
        for output in invalid:
            with self.subTest(output=output), self.assertRaises((ValueError, FileExistsError)):
                paths.fresh_output(output)
        self.assertEqual(before, sorted(str(p) for p in self.root.rglob('*')))

    def test_resolver_failure_creates_nothing(self):
        with patch.object(paths, 'resolve_root', side_effect=subprocess.CalledProcessError(1, 'resolver')):
            with self.assertRaises(subprocess.CalledProcessError):
                paths.fresh_output(self.root / 'absent')
        self.assertFalse((self.root / 'absent').exists())

    def test_resolver_contract(self):
        # Exercise the fixed resolver call without changing shared mount state.
        with patch.object(paths.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'relative\n', '')):
            with self.assertRaisesRegex(ValueError, 'Invalid external'):
                self.real_resolver()


class ContactContract(unittest.TestCase):
    def setUp(self):
        self.fixture = proof_fixture.LocalProofValidation(methodName='runTest')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.proof = self.fixture.root
        self.fixture.manifest['cases'][0]['selection'].update(name='A', animalGuide='Dog')
        self.fixture.save()
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.rasters = self.root / 'rasters'
        (self.rasters / 'CHILD').mkdir(parents=True)
        pages = []
        for item in self.fixture.manifest['cases'][0]['files']:
            name = f"CHILD/{item['label']}.png"
            target = self.rasters / name
            Image.new('RGB', (item['width'], item['height']), '#123456').save(target)
            pages.append({'role': 'CHILD', 'label': item['label'], 'file': name,
                          'sha256': contacts.sha(target.read_bytes()),
                          'width': item['width'], 'height': item['height']})
        self.renders = {'schema': 'lhb.custom-flow-local-rasters@v1', 'approved': False,
                        'printReady': False, 'networkAttempts': [], 'pages': pages,
                        'proofManifestSha256': contacts.sha((self.proof / 'proof-manifest.json').read_bytes())}
        self.save()
        resolver = patch.object(paths, 'resolve_root', return_value=self.root)
        resolver.start()
        self.addCleanup(resolver.stop)

    def save(self):
        (self.rasters / 'render-results.json').write_text(json.dumps(self.renders))

    def test_valid_contacts_bind_inputs_and_external_output(self):
        output = self.root / 'contacts'
        result = contacts.make_contacts(self.proof, self.rasters, output)
        self.assertEqual(result['externalStorage']['output'], str(output))
        self.assertEqual(result['proofManifestSha256'], self.renders['proofManifestSha256'])
        self.assertEqual(len(result['sheets']), 1)
        self.assertEqual(len(result['sheets'][0]['inputs']), 2)
        self.assertFalse(result['approved'])
        self.assertTrue((output / 'contact-receipt.json').is_file())

    def test_reject_schema_binding_and_roster(self):
        valid = copy.deepcopy(self.renders)
        mutations = [lambda data: data.update(schema='wrong'),
                     lambda data: data.update(proofManifestSha256='0' * 64),
                     lambda data: data['pages'].append(copy.deepcopy(data['pages'][0])),
                     lambda data: data['pages'].pop(),
                     lambda data: data['pages'][0].update(role='UNKNOWN'),
                     lambda data: data['pages'][0].update(label='extra')]
        for index, mutate in enumerate(mutations):
            self.renders = copy.deepcopy(valid)
            mutate(self.renders)
            self.save()
            output = self.root / f'rejected-{index}'
            with self.subTest(index=index), self.assertRaises(ValueError):
                contacts.make_contacts(self.proof, self.rasters, output)
            self.assertFalse(output.exists())

    def test_reject_recorded_dimensions(self):
        self.renders['pages'][0]['width'] += 1
        self.save()
        with self.assertRaisesRegex(ValueError, 'recorded dimensions'):
            contacts.make_contacts(self.proof, self.rasters, self.root / 'rejected')
        self.assertFalse((self.root / 'rejected').exists())

    def test_reject_decoded_dimensions_with_fresh_hash(self):
        raster = self.renders['pages'][0]
        target = self.rasters / raster['file']
        Image.new('RGB', (1, 1)).save(target)
        raster['sha256'] = contacts.sha(target.read_bytes())
        self.save()
        with self.assertRaisesRegex(ValueError, 'decoded raster dimensions'):
            contacts.make_contacts(self.proof, self.rasters, self.root / 'rejected')


class JobContract(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.input = self.root / 'input'
        self.input.mkdir()

    def args(self, stage):
        fields = {'export': ['flow-config', 'flow-manifest', 'config-sha256', 'asset-map', 'asset-map-sha256'],
                  'render': ['proof'], 'assemble': ['proof', 'rasters'],
                  'verify': ['proof', 'rasters', 'pdfs'], 'contacts': ['proof', 'rasters']}
        argv = [stage, '--output', str(self.root / stage)]
        for field in fields[stage]:
            argv += ['--' + field, '0' * 64 if field.endswith('sha256') else str(self.input)]
        return jobs.parser().parse_args(argv)

    def test_each_stage_explicit_output_mapping(self):
        for stage in ('export', 'render', 'assemble', 'verify', 'contacts'):
            args = self.args(stage)
            command = jobs.command_for(args, Path(args.output))
            self.assertEqual(command[-1], args.output)
            self.assertEqual(command[-2] == '--output', stage != 'assemble')
            self.assertNotIn('export-inner-voice-custom-flow-proof.ts', command)

    def test_network_probe_requires_eperm(self):
        with patch.object(jobs.socket, 'create_connection', side_effect=OSError(errno.EPERM, 'denied')):
            jobs.require_network_denial()
        with patch.object(jobs.socket, 'create_connection', side_effect=OSError(errno.ECONNREFUSED, 'refused')):
            with self.assertRaisesRegex(RuntimeError, 'not established'):
                jobs.require_network_denial()

    def test_each_stage_rechecks_root_and_binds_completion(self):
        for stage in ('export', 'render', 'assemble', 'verify', 'contacts'):
            args = self.args(stage)
            def child(command, **kwargs):
                output = Path(args.output)
                if stage == 'verify':
                    output.write_text('{}')
                else:
                    output.mkdir()
                    names = {'export': 'proof-manifest.json', 'render': 'render-results.json',
                             'assemble': 'review-receipts.json', 'contacts': 'contact-receipt.json'}
                    (output / names[stage]).write_text('{}')
                return subprocess.CompletedProcess(command, 0)
            with self.subTest(stage=stage), patch.object(paths, 'resolve_root', return_value=self.root) as resolver, \
                    patch.object(jobs, 'require_network_denial'), patch.object(jobs, 'source_snapshot', return_value={}), \
                    patch.object(jobs.subprocess, 'run', side_effect=child):
                self.assertEqual(jobs.run_job(args), 0)
                self.assertGreaterEqual(resolver.call_count, 8)
            receipt = json.loads(Path(args.output + '.job.json').read_text())
            self.assertEqual(receipt['status'], 'passed')
            self.assertEqual(len(receipt['outputReceiptSha256']), 1)

    def test_changed_root_after_child_leaves_no_completion(self):
        args = self.args('render')
        def child(*unused, **kwargs):
            Path(args.output).mkdir()
            resolver.return_value = self.root.parent
            return subprocess.CompletedProcess([], 0)
        with patch.object(paths, 'resolve_root', return_value=self.root) as resolver, \
                patch.object(jobs, 'require_network_denial'), patch.object(jobs, 'source_snapshot', return_value={}), \
                patch.object(jobs.subprocess, 'run', side_effect=child):
            with self.assertRaisesRegex(ValueError, 'root changed'):
                jobs.run_job(args)
        self.assertFalse(Path(args.output + '.job.json').exists())

    def test_changed_source_after_child_leaves_no_completion(self):
        args = self.args('render')
        def child(*unused, **kwargs):
            Path(args.output).mkdir()
            return subprocess.CompletedProcess([], 0)
        with patch.object(paths, 'resolve_root', return_value=self.root), \
                patch.object(jobs, 'require_network_denial'), \
                patch.object(jobs, 'source_snapshot', side_effect=[{}, {'changed': 'hash'}]), \
                patch.object(jobs.subprocess, 'run', side_effect=child):
            with self.assertRaisesRegex(ValueError, 'source changed'):
                jobs.run_job(args)
        self.assertFalse(Path(args.output + '.job.json').exists())

    def test_existing_receipt_prevents_child(self):
        args = self.args('render')
        Path(args.output + '.job.json').write_text('existing')
        with patch.object(paths, 'resolve_root', return_value=self.root), \
                patch.object(jobs, 'require_network_denial'), patch.object(jobs.subprocess, 'run') as child:
            with self.assertRaises(FileExistsError):
                jobs.run_job(args)
            child.assert_not_called()
        self.assertFalse(Path(args.output).exists())

    def test_failed_child_receipt_cannot_claim_pass(self):
        args = self.args('render')
        with patch.object(paths, 'resolve_root', return_value=self.root), \
                patch.object(jobs, 'require_network_denial'), patch.object(jobs, 'source_snapshot', return_value={}), \
                patch.object(jobs.subprocess, 'run', return_value=subprocess.CompletedProcess([], 7)):
            self.assertEqual(jobs.run_job(args), 7)
        receipt = json.loads(Path(args.output + '.job.json').read_text())
        self.assertEqual(receipt['status'], 'failed')
        self.assertEqual(receipt['outputReceiptSha256'], {})

    def test_late_source_change_leaves_only_pending_receipt(self):
        args = self.args('render')
        def child(*unused, **kwargs):
            output = Path(args.output)
            output.mkdir()
            (output / 'render-results.json').write_text('{}')
            return subprocess.CompletedProcess([], 0)
        with patch.object(paths, 'resolve_root', return_value=self.root), \
                patch.object(jobs, 'require_network_denial'), \
                patch.object(jobs, 'source_snapshot', side_effect=[{}, {}, {'late': 'change'}]), \
                patch.object(jobs.subprocess, 'run', side_effect=child):
            with self.assertRaisesRegex(ValueError, 'source changed while recording'):
                jobs.run_job(args)
        self.assertFalse(Path(args.output + '.job.json').exists())
        self.assertTrue(Path(args.output + '.job.json.pending').is_file())

    def test_late_root_change_leaves_only_pending_receipt(self):
        args = self.args('render')
        def child(*unused, **kwargs):
            output = Path(args.output)
            output.mkdir()
            (output / 'render-results.json').write_text('{}')
            return subprocess.CompletedProcess([], 0)
        real_check = jobs.check_binding
        def check(binding, require_output=False):
            if str(binding.output).endswith('.job.json.pending') and binding.output.exists():
                resolver.return_value = self.root.parent
            return real_check(binding, require_output)
        with patch.object(paths, 'resolve_root', return_value=self.root) as resolver, \
                patch.object(jobs, 'require_network_denial'), patch.object(jobs, 'source_snapshot', return_value={}), \
                patch.object(jobs, 'check_binding', side_effect=check), \
                patch.object(jobs.subprocess, 'run', side_effect=child):
            with self.assertRaisesRegex(ValueError, 'root changed'):
                jobs.run_job(args)
        self.assertFalse(Path(args.output + '.job.json').exists())

    def test_export_consumer_checks_full_caller_binding(self):
        proof = self.input
        identity = self.root.stat()
        storage = paths.OutputBinding(self.root, proof, identity.st_dev, identity.st_ino).receipt()
        receipt = {'schema': 'lhb.external-review-job@v1', 'stage': 'export', 'status': 'passed',
                   'exitCode': 0, 'approved': False, 'printReady': False, 'networkDenialProbe': 'EPERM',
                   'externalStorage': storage, 'sourceSha256': {'transitive.ts': 'old'},
                   'outputReceiptSha256': {str(proof / 'proof-manifest.json'): 'digest'}}
        with patch.object(paths, 'resolve_root', return_value=self.root), \
                patch.object(export_check, 'source_snapshot', return_value={'transitive.ts': 'old'}):
            export_check.check_job_receipt(proof, 'digest', self.root, receipt)
            receipt['externalStorage']['inode'] += 1
            with self.assertRaisesRegex(ValueError, 'bound export'):
                export_check.check_job_receipt(proof, 'digest', self.root, receipt)
        receipt['externalStorage']['inode'] -= 1
        with patch.object(export_check, 'source_snapshot', return_value={'transitive.ts': 'changed'}):
            with self.assertRaisesRegex(ValueError, 'Caller source changed'):
                export_check.check_job_receipt(proof, 'digest', self.root, receipt)


if __name__ == '__main__':
    jobs.require_network_denial()
    unittest.main()
