"""Behavior checks for the immutable final-book content revision."""
import copy
import hashlib
import json
from pathlib import Path
import unittest
import tempfile
import shutil
from build_final_book_candidate import build

ROOT = Path(__file__).parent / 'final-book-revisions-20261117'

class FinalCandidateTest(unittest.TestCase):
    def setUp(self):
        self.source = json.loads((ROOT/'source-config.json').read_text())
        self.config, self.assets = build(ROOT, {'assets': {}})

    def test_build_is_repeatable_and_does_not_change_source(self):
        before = (ROOT/'source-config.json').read_bytes()
        second, assets = build(ROOT, {'assets': {}})
        self.assertEqual(second, self.config)
        self.assertEqual(assets, self.assets)
        self.assertEqual(before, (ROOT/'source-config.json').read_bytes())
        self.assertEqual(self.config['version'], 5)
        self.assertEqual(self.config['status'], 'draft')

    def test_unrelated_recipe_and_accepted_placements_are_preserved(self):
        before = copy.deepcopy(self.source['rendering']['recipe'])
        after = copy.deepcopy(self.config['rendering']['recipe'])
        for page in ('page-01','page-12','page-20','page-28','page-31'):
            before['copy'].pop(page, None)
            after['copy'].pop(page, None)
        before.pop('covers'); after.pop('covers')
        self.assertEqual(before, after)
        self.assertEqual(self.source['assets']['poses'], self.config['assets']['poses'])
        self.assertEqual(set(self.source['assets']['guideBackgrounds']), set(self.config['assets']['guideBackgrounds']))

    def test_flying_scene_uses_accepted_orientation_in_both_formats(self):
        for format_id, fmt in self.config['formats'].items():
            page = next(p for p in fmt['interior']['pageSequence'] if p['id'] == 'page-26')
            hero = next(layer for layer in page['layers'] if layer['id'] == 'hero')
            self.assertEqual(hero['poseNumber'], 11)
            self.assertIs(hero['placement']['flipX'], False, format_id)
            original = copy.deepcopy(next(p for p in self.source['formats'][format_id]['interior']['pageSequence'] if p['id'] == 'page-26'))
            next(layer for layer in original['layers'] if layer['id'] == 'hero')['placement']['flipX'] = False
            self.assertEqual(page, original)

    def test_original_title_bytes_and_white_blanks(self):
        key = self.config['assets']['backgrounds']['title']
        self.assertEqual(self.assets['assets'][key]['sha256'], hashlib.sha256((ROOT/'assets/original-title-page.png').read_bytes()).hexdigest())
        self.assertTrue(all(block['text'] == '' for block in self.config['rendering']['recipe']['copy']['page-01']))
        self.assertEqual(self.config['assets']['backgrounds']['blank'], self.config['assets']['backgrounds']['credits'])
        for slot, key in self.source['assets']['backgrounds'].items():
            if slot not in {'title', 'blank', 'credits'}:
                self.assertEqual(self.config['assets']['backgrounds'][slot], key)

    def test_release_requires_all_reviewed_trails(self):
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            for file in ROOT.glob('*.json'):
                if file.name not in {'trails.json', 'local-asset-map.json', 'source-files.json'}:
                    shutil.copyfile(file, directory/file.name)
            (directory/'assets').symlink_to((ROOT/'assets').resolve())
            with self.assertRaisesRegex(ValueError, 'All eight'):
                build(directory, {'assets': {}}, release=True)
        self.assertEqual(build(ROOT, {'assets': {}}, release=True)[0]['status'], 'active')
        with self.assertRaises(ValueError):
            build(ROOT, {'assets': {}}, version=4)

    def test_name_dialogue_uses_one_responsive_block(self):
        copy_blocks = self.config['rendering']['recipe']['copy']
        for page, ident in [('page-12','text-12-trail-dialogue'),('page-28','text-28-responsive-dialogue')]:
            block = next(x for x in copy_blocks[page] if x['id'] == ident)
            self.assertIn('flow', block)
            self.assertNotIn('nameFit', block)
            self.assertNotIn('longName', block)
        self.assertIn('[Child Name] looked left. Then right.', copy_blocks['page-12'][0]['text'])

if __name__ == '__main__': unittest.main()
