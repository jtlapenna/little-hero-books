"""Local regression checks for final-book proof input and cache identity."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
import rasterize_final_book_proof as rasterizer


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ProofDigestTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.proof = (Path(self.temp.name) / 'proof').resolve()
        (self.proof / 'assets').mkdir(parents=True)
        (self.proof / 'luca').mkdir()
        self.png = self.proof / 'assets/image.png'
        Image.new('RGB', (20, 20), 'red').save(self.png)
        self.font = self.proof / 'assets/font.ttf'
        self.font.write_bytes(b'font identity fixture')
        self.html = self.proof / 'luca/p00.html'
        self.html.write_text('<style>@font-face{font-family:Fixture;src:url(../assets/font.ttf)}</style>'
                             '<img src="../assets/image.png" width="20" height="20">')
        self.row = {'role': 'luca', 'pageLabel': 'p00', 'file': 'luca/p00.html',
                    'width': 20, 'height': 20, 'sha256': sha(self.html),
                    'dependencies': {'assets/image.png': sha(self.png), 'assets/font.ttf': sha(self.font)}}
        self.renderer = {'browser': 'fixture-browser', 'platform': 'fixture-platform', 'script': 'fixture-script'}

    def digest(self, row=None, renderer=None):
        return rasterizer.checked_input_digest(self.proof, row or self.row, renderer or self.renderer)

    def test_unchanged_inputs_are_stable(self):
        self.assertEqual(self.digest(), self.digest(copy.deepcopy(self.row), copy.deepcopy(self.renderer)))

    def test_changed_png_is_rejected_before_cache_lookup(self):
        Image.new('RGB', (20, 20), 'blue').save(self.png)
        with self.assertRaisesRegex(ValueError, 'asset dependencies changed'):
            self.digest()

    def test_changed_font_is_rejected_before_cache_lookup(self):
        self.font.write_bytes(b'changed font')
        with self.assertRaisesRegex(ValueError, 'asset dependencies changed'):
            self.digest()

    def test_changed_html_is_rejected_before_cache_lookup(self):
        self.html.write_text(self.html.read_text() + '<!-- changed -->')
        with self.assertRaisesRegex(ValueError, 'HTML changed'):
            self.digest()

    def test_reexported_asset_has_new_identity(self):
        before = self.digest()
        Image.new('RGB', (20, 20), 'blue').save(self.png)
        self.row['dependencies']['assets/image.png'] = sha(self.png)
        self.assertNotEqual(before, self.digest())

    def test_dimensions_and_renderer_each_invalidate_identity(self):
        before = self.digest()
        for field in ('width', 'height'):
            row = copy.deepcopy(self.row)
            row[field] += 1
            with self.subTest(field=field):
                self.assertNotEqual(before, self.digest(row))
        for field in ('browser', 'platform', 'script'):
            renderer = dict(self.renderer, **{field: 'changed'})
            with self.subTest(field=field):
                self.assertNotEqual(before, self.digest(renderer=renderer))

    def test_omitted_or_extra_dependency_is_rejected(self):
        for dependencies in ({}, {**self.row['dependencies'], 'assets/extra.png': 'unreferenced'}):
            row = dict(self.row, dependencies=dependencies)
            with self.assertRaisesRegex(ValueError, 'asset dependencies changed'):
                self.digest(row)

    def test_html_and_asset_symlink_escape_is_rejected(self):
        row = dict(self.row, file='../outside.html')
        with self.assertRaisesRegex(ValueError, 'HTML must remain within bundle'):
            self.digest(row)
        outside = self.proof.parent / 'outside.png'
        outside.write_bytes(self.png.read_bytes())
        self.png.unlink()
        self.png.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'asset must remain within bundle'):
            self.digest()

    def test_real_browser_cache_hit_and_reexported_asset_refresh(self):
        # Keep contact-sheet generation bounded while exercising the complete CLI path.
        self.html.write_text('<html><body style="margin:0"><img src="../assets/image.png" '
                             'width="20" height="20"></body></html>')
        self.row.update(sha256=sha(self.html), dependencies={'assets/image.png': sha(self.png)})
        cover = dict(self.row, pageLabel='cover')
        manifest = self.proof / 'proof-manifest.json'

        def render():
            manifest.write_text(json.dumps({'files': [self.row, cover]}))
            with patch('sys.argv', ['rasterizer', str(self.proof)]):
                rasterizer.main()
            return json.loads((self.proof.parent / 'render-results.json').read_text())['results'][0]

        first = render()
        target = Path(first['raster'])
        with Image.open(target) as image:
            self.assertEqual(image.getpixel((5, 5)), (255, 0, 0))
        first_mtime = target.stat().st_mtime_ns
        self.assertEqual(render()['inputDigest'], first['inputDigest'])
        self.assertEqual(target.stat().st_mtime_ns, first_mtime, 'Unchanged input should reuse the raster')
        Image.new('RGB', (20, 20), 'blue').save(self.png)
        with self.assertRaisesRegex(ValueError, 'asset dependencies changed'):
            render()
        self.row['dependencies']['assets/image.png'] = sha(self.png)
        refreshed = render()
        self.assertNotEqual(refreshed['inputDigest'], first['inputDigest'])
        with Image.open(target) as image:
            self.assertEqual(image.getpixel((5, 5)), (0, 0, 255))
        self.row['width'] = 24
        self.row['height'] = 26
        resized = render()
        self.assertNotEqual(resized['inputDigest'], refreshed['inputDigest'])
        with Image.open(target) as image:
            self.assertEqual(image.size, (24, 26))


if __name__ == '__main__':
    unittest.main()
