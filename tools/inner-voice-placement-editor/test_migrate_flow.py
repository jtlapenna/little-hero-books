import copy
import json
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path
from migrate_flow_candidate import migrate, write_candidate
from lettering_state import clean_lettering

ROOT = Path(__file__).parent

class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.seed = json.loads((ROOT / 'lettering-data.json').read_text())
        self.draft = json.loads((ROOT / 'lettering.json').read_text())

    def test_migration_preserves_text_and_source_ids(self):
        seed_before, draft_before = copy.deepcopy(self.seed), copy.deepcopy(self.draft)
        seed, draft, source_map = migrate(self.seed, self.draft)
        self.assertEqual(self.seed, seed_before)
        self.assertEqual(self.draft, draft_before)
        self.assertEqual(seed['stateSchema'], 'lhb.lettering-review@v2')
        self.assertNotEqual(seed['layoutFingerprint'], self.seed['layoutFingerprint'])
        self.assertEqual(draft['revision'], 0)
        self.assertEqual(source_map['page-26']['text-26-01'], ['text-26-01', 'text-26-02', 'text-26-03'])
        self.assertEqual(source_map['personalization']['page-26'], ['text-26-01', 'text-26-06'])
        self.assertEqual(draft['pages'][25]['blocks'][0]['text'], '[Child Name] and [animal guide] flew through the stars.')
        self.assertEqual(draft['pages'][25]['blocks'][-1]['text'], '[animal guide] stayed close. So did the quiet voice.')
        for block in draft['pages'][24]['blocks']:
            self.assertNotIn('Owl', block['text'])
        self.assertEqual(sum('[animal guide]' in block['text'] for block in draft['pages'][24]['blocks']), 3)
        self.assertIn('[animal clues]', draft['pages'][23]['blocks'][1]['text'])
        self.assertEqual(clean_lettering(draft, seed)['pages'][25]['blocks'][0]['flow'], draft['pages'][25]['blocks'][0]['flow'])
        self.assertEqual(len(draft['pages'][25]['blocks']), len(self.draft['pages'][25]['blocks']) - 2)
        with self.assertRaises(ValueError):
            clean_lettering(self.draft, seed)

    def test_page12_migration_is_held_for_unreviewed_v2_and_changed_styles(self):
        before = copy.deepcopy(self.draft)
        for index, field, value in [(2, 'color', '#654321'), (6, 'color', '#123456'),
                                    (6, 'size', 77), (6, 'rotation', 3)]:
            changed = copy.deepcopy(self.draft)
            changed['pages'][11]['blocks'][index][field] = value
            with self.subTest(index=index, field=field), self.assertRaisesRegex(ValueError, 'Page 12.*on hold'):
                migrate(self.seed, changed, page12=True)
        with self.assertRaisesRegex(ValueError, 'Page 12.*on hold'):
            migrate(self.seed, self.draft, page12=True)
        self.assertEqual(self.draft, before)

    def test_source_mismatch_and_wrong_blocks_reject(self):
        bad = copy.deepcopy(self.draft)
        bad['layoutFingerprint'] = 'stale'
        with self.assertRaises(ValueError): migrate(self.seed, bad)

    def test_flying_headline_does_not_drop_individual_alignment_or_leading_edits(self):
        for index, field, value in [(0, 'align', 'center'), (1, 'align', 'right'), (2, 'align', 'center'),
                                    (0, 'leading', 25), (1, 'leading', 27), (2, 'leading', 29)]:
            changed = copy.deepcopy(self.draft)
            changed['pages'][25]['blocks'][index][field] = value
            with self.subTest(index=index, field=field), self.assertRaisesRegex(ValueError, 'headline.*manual migration'):
                migrate(self.seed, changed)

    def test_flying_headline_retains_common_alignment_and_leading_edits(self):
        changed = copy.deepcopy(self.draft)
        for block in changed['pages'][25]['blocks'][:3]:
            block['align'] = 'center'
            block['leading'] = 25
        _, draft, _ = migrate(self.seed, changed)
        headline = draft['pages'][25]['blocks'][0]
        self.assertEqual((headline['align'], headline['leading']), ('center', 25))

    def test_flying_headline_rejects_discarded_block_geometry_edits(self):
        for index in (1, 2):
            for field in ('left', 'top', 'width'):
                changed = copy.deepcopy(self.draft)
                changed['pages'][25]['blocks'][index][field] += 1
                with self.subTest(index=index, field=field), self.assertRaisesRegex(ValueError, 'headline.*geometry.*manual migration'):
                    migrate(self.seed, changed)

    def test_flying_headline_rejects_seed_only_geometry_difference(self):
        changed = copy.deepcopy(self.seed)
        changed['pages'][25]['blocks'][1]['left'] += 1
        with self.assertRaisesRegex(ValueError, 'headline.*geometry.*manual migration'):
            migrate(changed, self.draft)

    def test_flying_paragraph_candidate_preserves_copy_and_source_mapping(self):
        seed, draft, mapping = migrate(self.seed, self.draft, flying_paragraphs=True)
        page = draft['pages'][25]
        self.assertEqual([b['id'] for b in page['blocks']], ['text-26-01', 'text-26-06'])
        self.assertEqual(mapping['page-26']['text-26-01'], [f'text-26-0{i}' for i in range(1, 6)])
        flow = page['blocks'][0]['flow']['paragraphs']
        self.assertEqual(len(flow), 3)
        self.assertEqual(flow[1]['runs'][0]['text'], self.draft['pages'][25]['blocks'][3]['text'])
        self.assertEqual(flow[2]['runs'][0]['text'], ' '.join(self.draft['pages'][25]['blocks'][4]['text'].split()))
        self.assertEqual(flow[0]['runs'][1]['text'], 'flew')
        self.assertFalse(page['reviewed'])
        self.assertEqual(mapping['replacements']['page-26']['after'], page['blocks'][0])
        self.assertEqual(clean_lettering(draft, seed)['pages'][25]['blocks'][0]['flow'], page['blocks'][0]['flow'])

    def test_flying_paragraph_candidate_records_replaced_source_geometry(self):
        for index in range(5):
            for field, value in [('left', 5), ('top', 5), ('width', 5), ('size', 1), ('leading', 1)]:
                changed = copy.deepcopy(self.draft)
                block = changed['pages'][25]['blocks'][index]
                block[field] += value
                with self.subTest(index=index, field=field):
                    _, _, mapping = migrate(self.seed, changed, flying_paragraphs=True)
                    self.assertEqual(mapping['replacements']['page-26']['before'][index], block)

    def test_flying_paragraph_candidate_refuses_incompatible_retained_styles(self):
        for index in (3, 4):
            for field, value in [('color', '#123456'), ('rotation', 2), ('align', 'right'), ('edge', False)]:
                seed, draft = copy.deepcopy(self.seed), copy.deepcopy(self.draft)
                seed['pages'][25]['blocks'][index][field] = value
                draft['pages'][25]['blocks'][index][field] = value
                with self.subTest(index=index, field=field), self.assertRaisesRegex(ValueError, 'paragraph.*style.*manual migration'):
                    migrate(seed, draft, flying_paragraphs=True)

    def test_page12_changed_final_block_color_cannot_be_lost(self):
        changed = copy.deepcopy(self.draft)
        changed['pages'][11]['blocks'][6]['color'] = '#123456'
        with self.assertRaisesRegex(ValueError, 'Page 12'):
            migrate(self.seed, changed, page12=True)
        bad = copy.deepcopy(self.draft)
        bad['pages'][25]['blocks'][0]['rotation'] = 10
        with self.assertRaises(ValueError): migrate(self.seed, bad)
        bad = copy.deepcopy(self.draft)
        bad['pages'][25]['blocks'][1]['edge'] = not bad['pages'][25]['blocks'][0]['edge']
        with self.assertRaises(ValueError): migrate(self.seed, bad)
        bad = copy.deepcopy(self.draft)
        bad['pages'][25]['blocks'][0]['top'] = bad['pages'][25]['blocks'][3]['top'] + 10
        with self.assertRaises(ValueError): migrate(self.seed, bad)
        bad = copy.deepcopy(self.draft)
        bad['pages'][25]['blocks'][-1]['text'] = 'Owl stayed nearby.'
        with self.assertRaises(ValueError): migrate(self.seed, bad)

    def test_seed_metadata_participates_in_identity(self):
        a, _, _ = migrate(self.seed, self.draft)
        altered = copy.deepcopy(self.seed)
        altered['units'] += 1
        b, _, _ = migrate(altered, self.draft)
        self.assertNotEqual(a['layoutFingerprint'], b['layoutFingerprint'])
        altered = copy.deepcopy(self.seed)
        altered['pages'][0]['blocks'][0]['left'] += 1
        b, _, _ = migrate(altered, self.draft)
        self.assertNotEqual(a['layoutFingerprint'], b['layoutFingerprint'])
        bad = copy.deepcopy(self.draft)
        bad['pages'][25]['blocks'][1]['text'] = 'changed'
        with self.assertRaises(ValueError): migrate(self.seed, bad)

    def test_failed_write_cleans_candidate_and_allows_retry(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'candidate'
            original_write = Path.write_text
            def fail_second(path, text, *args, **kwargs):
                if path.name == 'second.json':
                    raise OSError('synthetic write failure')
                return original_write(path, text, *args, **kwargs)
            entries = [('first.json', {'first': True}), ('second.json', {'second': True})]
            with patch.object(Path, 'write_text', fail_second), self.assertRaises(OSError):
                write_candidate(target, entries)
            self.assertFalse(target.exists())
            write_candidate(target, entries)
            with self.assertRaises(FileExistsError):
                write_candidate(target, entries)
            self.assertEqual(json.loads((target / 'first.json').read_text()), {'first': True})

if __name__ == '__main__': unittest.main()
