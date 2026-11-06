"""Test the actual guard namespace and shell control flow with synthetic children."""
import contextlib
import hashlib
import io
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from external_review_paths import resolve_root
import user_authorized_proof_guard as adapter
from run_external_review_job import require_network_denial, SAFE_PATH

TOOLS = Path(__file__).resolve().parent
PYTHON = '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3'


class GuardNamespace(unittest.TestCase):
    def test_canonical_resolver_in_actual_child_environment(self):
        result = subprocess.run(['/Users/jeff/.local/bin/agent-artifact-root', '--project', 'little-hero-books'],
                                env={'PATH': SAFE_PATH, 'PYTHONDONTWRITEBYTECODE': '1'},
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(Path(result.stdout.strip()), resolve_root())

    def test_only_proof_space_floor_changes(self):
        scope, digest = adapter.load_guard()
        original = (scope['WORKTREE_MIN_FREE'], scope['MAX_POPULATED'])
        previous_argv = sys.argv
        def observe():
            self.assertEqual(scope['MIN_FREE'], 0)
            self.assertEqual((scope['WORKTREE_MIN_FREE'], scope['MAX_POPULATED']), original)
            self.assertEqual(sys.argv, [str(adapter.GUARD), '--kind', 'proof', '--', 'synthetic', 'argument'])
            return 75
        scope['main'] = observe
        with patch.object(adapter, 'load_guard', return_value=(scope, digest)), \
                patch.object(adapter.Path, 'cwd', return_value=adapter.REPO), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(adapter.main(['--user-space-exception', '--', 'synthetic', 'argument']), 75)
        self.assertIs(sys.argv, previous_argv)
        self.assertEqual(hashlib.sha256(adapter.GUARD.read_bytes()).hexdigest(), digest)

    def test_missing_acknowledgement_and_command(self):
        for arguments in (['--', 'synthetic'], ['--user-space-exception', '--']):
            with self.subTest(arguments=arguments), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                adapter.main(arguments)

    def test_other_cwd_rejected_before_guard_load(self):
        with patch.object(adapter.Path, 'cwd', return_value=Path('/tmp')), \
                patch.object(adapter, 'load_guard') as load:
            with self.assertRaisesRegex(ValueError, 'existing project'):
                adapter.run_authorized(['synthetic'])
            load.assert_not_called()


class ShellControlFlow(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='lhb-guard-fixture-', dir=resolve_root())
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.tools = self.root / 'tools/editor'
        self.tools.mkdir(parents=True)
        self.logs = self.root / 'logs'
        self.logs.mkdir()
        self.marker = self.root / 'child-started'
        for name in ('child-code', 'guard-code', 'resolver-code'):
            (self.root / name).write_text('0')
        def executable(name, source):
            target = self.tools / name
            target.write_text(f'#!{PYTHON}\n' + source)
            target.chmod(0o700)
            return target
        resolver = executable('resolver', f"from pathlib import Path\nimport sys\nsys.exit(int(Path({str(self.root / 'resolver-code')!r}).read_text())) if int(Path({str(self.root / 'resolver-code')!r}).read_text()) else print({str(self.logs)!r})\n")
        uuid = executable('uuid', "print('SYNTHETIC')\n")
        common = f"from pathlib import Path\nimport os,sys\ncode=int(Path({str(self.root / 'guard-code')!r}).read_text())\n"
        default = executable('guard', common + "assert sys.argv[1:4]==['--kind','proof','--']\nprint('DEFAULT_GUARD',flush=True)\nif code:sys.exit(code)\nos.execv(sys.argv[4],sys.argv[4:])\n")
        executable('user_authorized_proof_guard.py', common + "assert sys.argv[1:3]==['--user-space-exception','--']\nprint('EXCEPTION_GUARD',flush=True)\nif code:sys.exit(code)\nos.execv(sys.argv[3],sys.argv[3:])\n")
        executable('run_external_review_job.py', f"from pathlib import Path\nimport sys\nPath({str(self.marker)!r}).write_text('started')\nprint('z'*12000)\nsys.exit(int(Path({str(self.root / 'child-code')!r}).read_text()))\n")
        source = (TOOLS / 'run_review_command.sh').read_text()
        source = source.replace('/Users/jeff/.local/bin/agent-heavy-job', str(default))
        source = source.replace('/Users/jeff/.local/bin/agent-artifact-root', str(resolver))
        source = source.replace('/usr/bin/uuidgen', str(uuid))
        (self.tools / 'run_review_command.sh').write_text(source)
        (self.tools / 'run-external-review.sh').write_bytes((TOOLS / 'run-external-review.sh').read_bytes())

    def run_stage(self, exception=False):
        command = ['/bin/bash', str(self.tools / 'run-external-review.sh')]
        if exception:
            command += ['--user-space-exception']
        return subprocess.run(command + ['render'], capture_output=True, text=True, timeout=30)

    def log(self):
        return self.logs / 'inner-voice-render-SYNTHETIC.log'

    def test_default_success_private_log_and_bounded_tail(self):
        result = self.run_stage()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.marker.exists())
        self.assertIn('DEFAULT_GUARD', self.log().read_text())
        self.assertIn('Outbound probe denied: EPERM', self.log().read_text())
        self.assertGreater(self.log().stat().st_size, 12000)
        self.assertLess(len(result.stdout.encode()), 4600)
        self.assertEqual(stat.S_IMODE(self.log().stat().st_mode), 0o600)

    def test_exception_child_failure_status_preserved(self):
        (self.root / 'child-code').write_text('7')
        result = self.run_stage(exception=True)
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertIn('EXCEPTION_GUARD', self.log().read_text())
        self.assertTrue(self.marker.exists())

    def test_guard_refusal_preserves_75_without_child(self):
        (self.root / 'guard-code').write_text('75')
        result = self.run_stage(exception=True)
        self.assertEqual(result.returncode, 75)
        self.assertFalse(self.marker.exists())

    def test_existing_log_is_not_overwritten_or_read(self):
        self.log().write_text('existing private evidence')
        result = self.run_stage()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.log().read_text(), 'existing private evidence')
        self.assertNotIn('existing private evidence', result.stdout)
        self.assertFalse(self.marker.exists())

    def test_resolver_failure_stops_before_log_or_child(self):
        (self.root / 'resolver-code').write_text('42')
        result = self.run_stage()
        self.assertEqual(result.returncode, 42)
        self.assertFalse(self.log().exists())
        self.assertFalse(self.marker.exists())

    def test_missing_log_parent_has_no_fallback(self):
        self.logs.rmdir()
        result = self.run_stage(exception=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.logs.exists())
        self.assertFalse(self.marker.exists())


if __name__ == '__main__':
    require_network_denial()
    unittest.main()
