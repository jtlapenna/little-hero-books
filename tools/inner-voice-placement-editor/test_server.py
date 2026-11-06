"""Exercise the local editor HTTP boundary against disposable saved files."""
import copy
import json
import socket
import subprocess
import sys
import time
from pathlib import Path
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server
import test_lettering_flow

ROOT = Path(__file__).resolve().parent


class EditorHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.STATE = Path(cls.temp.name) / 'placements.json'
        server.LETTERING_STATE = Path(cls.temp.name) / 'lettering.json'
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        server.PORT = cls.httpd.server_address[1]
        cls.base = f'http://127.0.0.1:{server.PORT}'
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def setUp(self):
        self.text = json.loads((ROOT / 'lettering.json').read_text())
        self.text['revision'] = 0
        self.figures = json.loads((ROOT / 'placements.json').read_text())
        server.STATE.write_text(json.dumps(self.figures))
        server.LETTERING_STATE.write_text(json.dumps(self.text))

    def request(self, path, value=None, headers=None):
        fields = {'Origin': self.base, 'Content-Type': 'application/json'}
        fields.update(headers or {})
        body = None if value is None else json.dumps(value).encode()
        request = Request(self.base + path, data=body, headers=fields)
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, response.read(), response.headers
        except HTTPError as error:
            return error.code, error.read(), error.headers

    def test_assets_and_private_files(self):
        status, body, headers = self.request('/')
        self.assertEqual(status, 200)
        self.assertIn(b'lettering.js', body)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        asset = next(iter(server.ASSETS))
        self.assertEqual(self.request('/asset/' + asset)[0], 200)
        self.assertEqual(self.request('/lettering.json')[0], 404)
        self.assertEqual(self.request('/asset/../server.py')[0], 404)

    def test_null_state_then_first_save(self):
        server.LETTERING_STATE.unlink()
        self.assertEqual(json.loads(self.request('/text-state')[1]), None)
        self.assertEqual(self.request('/text-state', self.text)[0], 200)
        saved = json.loads(self.request('/text-state')[1])
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(saved['pages'], self.text['pages'])

    def test_roundtrip_and_stale_revision(self):
        before = server.STATE.read_bytes()
        self.text['pages'][13]['notes'] += '\nHTTP review note'
        self.text['pages'][13]['blocks'][0]['left'] += 1
        self.assertEqual(self.request('/text-state', self.text)[0], 200)
        self.assertEqual(json.loads(self.request('/text-state')[1])['pages'], self.text['pages'])
        self.assertEqual(self.request('/text-state', self.text)[0], 409)
        self.assertEqual(server.STATE.read_bytes(), before)

    def test_concurrent_saves_keep_one_winner(self):
        first, second = copy.deepcopy(self.text), copy.deepcopy(self.text)
        first['pages'][13]['notes'] = 'First concurrent draft'
        second['pages'][13]['notes'] = 'Second concurrent draft'
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda d: self.request('/text-state', d)[0], [first, second]))
        self.assertEqual(sorted(statuses), [200, 409])
        saved = json.loads(self.request('/text-state')[1])
        self.assertIn(saved['pages'], [first['pages'], second['pages']])
        self.assertEqual(saved['revision'], 1)

    def test_wrong_identity_words_and_geometry_do_not_write(self):
        before = server.LETTERING_STATE.read_bytes()
        for key, bad in [('layoutFingerprint', 'old-copy'), ('bookId', 'another-book')]:
            candidate = copy.deepcopy(self.text)
            candidate[key] = bad
            self.assertEqual(self.request('/text-state', candidate)[0], 400)
        candidate = copy.deepcopy(self.text)
        candidate['pages'][13]['blocks'][0]['text'] = 'Changed story words'
        self.assertEqual(self.request('/text-state', candidate)[0], 400)
        candidate = copy.deepcopy(self.text)
        candidate['pages'][13]['blocks'][0]['size'] = -1
        self.assertEqual(self.request('/text-state', candidate)[0], 400)
        self.assertEqual(server.LETTERING_STATE.read_bytes(), before)

    def test_existing_draft_with_different_identity_cannot_be_overwritten(self):
        before = server.LETTERING_STATE.read_bytes()
        original_seed = server.LETTERING_SEED
        try:
            seed = copy.deepcopy(original_seed)
            seed['stateSchema'] = 'lhb.lettering-review@v2'
            seed['layoutFingerprint'] = 'new-layout'
            server.LETTERING_SEED = seed
            candidate = copy.deepcopy(self.text)
            candidate['schema'] = seed['stateSchema']
            candidate['layoutFingerprint'] = seed['layoutFingerprint']
            self.assertEqual(self.request('/text-state', candidate)[0], 409)
            self.assertEqual(server.LETTERING_STATE.read_bytes(), before)
        finally:
            server.LETTERING_SEED = original_seed

    def test_v2_flow_http_roundtrip_and_conflict(self):
        fixture = test_lettering_flow.LetteringFlowTest()
        fixture.setUp()
        original_seed = server.LETTERING_SEED
        try:
            server.LETTERING_SEED = fixture.seed
            self.assertEqual(json.loads(self.request('/lettering-data.json')[1])['stateSchema'], 'lhb.lettering-review@v2')
            status, _, headers = self.request('/flow-layout.mjs')
            self.assertEqual(status, 200)
            self.assertEqual(headers['Content-Type'], 'text/javascript')
            server.LETTERING_STATE.unlink()
            candidate = copy.deepcopy(fixture.state)
            candidate['revision'] = 0
            self.assertEqual(self.request('/text-state', candidate)[0], 200)
            saved = json.loads(self.request('/text-state')[1])
            self.assertEqual(saved['pages'][25]['blocks'][0]['flow'], candidate['pages'][25]['blocks'][0]['flow'])
            self.assertEqual(saved['pages'][25]['blocks'][0]['height'], candidate['pages'][25]['blocks'][0]['height'])
            before = server.LETTERING_STATE.read_bytes()
            self.assertEqual(self.request('/text-state', candidate)[0], 409)
            self.assertEqual(server.LETTERING_STATE.read_bytes(), before)
            saved['pages'][25]['blocks'][0]['left'] += 1
            self.assertEqual(self.request('/text-state', saved)[0], 200)
            self.assertEqual(json.loads(self.request('/text-state')[1])['revision'], 2)
        finally:
            server.LETTERING_SEED = original_seed

    def test_v1_extra_flow_field_keeps_legacy_cleaning(self):
        candidate = copy.deepcopy(self.text)
        candidate['pages'][0]['blocks'][0]['flow'] = {'legacy-extra': True}
        self.assertEqual(self.request('/text-state', candidate)[0], 200)
        saved = json.loads(self.request('/text-state')[1])
        self.assertNotIn('flow', saved['pages'][0]['blocks'][0])

    def test_personalization_fields_stay_in_one_block(self):
        page = self.text['pages'][4]
        block = page['blocks'][0]
        original = block['text']
        cursor = original.index('[Child Name]') + len('[Child')
        second = copy.deepcopy(block)
        second['id'] = 'split-field-test'
        block['text'], second['text'] = original[:cursor], original[cursor:].lstrip()
        page['blocks'].insert(1, second)
        before = server.LETTERING_STATE.read_bytes()
        self.assertEqual(self.request('/text-state', self.text)[0], 400)
        self.assertEqual(server.LETTERING_STATE.read_bytes(), before)
        cursor = original.index('[Child Name]')
        block['text'], second['text'] = original[:cursor].rstrip(), original[cursor:]
        self.assertEqual(self.request('/text-state', self.text)[0], 200)

    def test_origin_host_and_placement_isolation(self):
        self.assertEqual(self.request('/text-state', self.text, {'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request('/text-state', self.text, {'Host': 'example.com'})[0], 403)
        before = server.LETTERING_STATE.read_bytes()
        self.figures['pages'][0]['notes'] += '\nPlacement-only note'
        self.assertEqual(self.request('/state', self.figures)[0], 200)
        self.assertEqual(server.LETTERING_STATE.read_bytes(), before)
        older = copy.deepcopy(self.figures)
        older['savedAt'] = '2000-01-01T00:00:00.000Z'
        self.assertEqual(self.request('/state', older)[0], 409)

    def test_stale_placement_with_later_timestamp_cannot_overwrite(self):
        first, stale = copy.deepcopy(self.figures), copy.deepcopy(self.figures)
        first['pages'][0]['notes'] = 'First tab'
        first['savedAt'] = '2030-01-01T00:00:00.000Z'
        stale['pages'][0]['notes'] = 'Stale tab'
        stale['savedAt'] = '2031-01-01T00:00:00.000Z'
        status, body, _ = self.request('/state', first)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['revision'], 1)
        self.assertEqual(self.request('/state', stale)[0], 409)
        saved = json.loads(self.request('/state')[1])
        self.assertEqual(saved['pages'][0]['notes'], 'First tab')
        saved['pages'][0]['notes'] = 'Updated after reload'
        self.assertEqual(self.request('/state', saved)[0], 200)

    def test_concurrent_placement_saves_have_one_winner(self):
        first, second = copy.deepcopy(self.figures), copy.deepcopy(self.figures)
        first['pages'][0]['notes'], second['pages'][0]['notes'] = 'First', 'Second'
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda d: self.request('/state', d)[0], [first, second]))
        self.assertEqual(sorted(statuses), [200, 409])

    def test_placement_saves_across_server_processes(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        other = f'http://127.0.0.1:{port}'
        process = subprocess.Popen([sys.executable, str(ROOT / 'server.py'), '--port', str(port), '--state-dir', self.temp.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    with urlopen(other + '/state', timeout=1):
                        break
                except OSError:
                    time.sleep(.02)
            else:
                self.fail('Second server did not start')
            first, second = copy.deepcopy(self.figures), copy.deepcopy(self.figures)
            first['pages'][0]['notes'], second['pages'][0]['notes'] = 'First server', 'Second server'
            def post_other():
                request = Request(other + '/state', data=json.dumps(second).encode(), headers={'Origin':other,'Content-Type':'application/json'})
                try:
                    with urlopen(request, timeout=5) as response:
                        return response.status
                except HTTPError as error:
                    return error.code
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = [pool.submit(self.request, '/state', first), pool.submit(post_other)]
                statuses = [results[0].result()[0], results[1].result()]
            self.assertEqual(sorted(statuses), [200, 409])
        finally:
            process.terminate()
            process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
