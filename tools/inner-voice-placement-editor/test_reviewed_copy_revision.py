import copy
import json
from pathlib import Path
import tempfile
import unittest

from export_flow_candidate import migrate_reviewed_copy, export_reviewed_copy

ROOT = Path(__file__).parent


class ReviewedCopyRevisionTest(unittest.TestCase):
    def setUp(self):
        self.seed = json.loads((ROOT / 'lettering-data.json').read_text())
        self.draft = json.loads((ROOT / 'lettering.json').read_text())
        self.config = json.loads((ROOT.parent.parent / 'back-end/src/lib/books/configs/book-finding-our-inner-voice/v3.json').read_text())
        source = copy.deepcopy(self.config['rendering']['recipe']['copy']['page-12'][2])
        source.update(id='text-12-directions', text='[Child Name] looked left. Then right.',
                      flow={'paragraphs': [{'runs': [{'text': '[Child Name] looked '},
                                                   {'text': 'left.', 'style': {'rotateDeg': -3}},
                                                   {'text': ' Then right.'}]}]})
        source['placement'].update(width=1850, height=260, rotateDeg=0)
        for field in ('nameFit', 'longName'):
            source.pop(field, None)
        self.updates = {'page-12': [source]}

    def test_save_reload_and_export_twice_preserves_flow_and_other_release_changes(self):
        before = copy.deepcopy(self.config)
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, self.updates)
        with tempfile.TemporaryDirectory() as tmp:
            files = []
            for name, value in [('seed', seed), ('draft', draft), ('receipt', receipt)]:
                file = Path(tmp) / (name + '.json')
                file.write_text(json.dumps(value))
                files.append(json.loads(file.read_text()))
            first = export_reviewed_copy(self.config, *files)
            second = export_reviewed_copy(self.config, *files)
        self.assertEqual(first, second)
        self.assertEqual(first['rendering']['recipe']['copy']['page-12'], self.updates['page-12'])
        for key, value in before['rendering']['recipe']['copy'].items():
            if key != 'page-12':
                self.assertEqual(first['rendering']['recipe']['copy'][key], value)
        self.assertEqual(first['formats'], before['formats'])
        self.assertEqual(first['assets'], before['assets'])
        self.assertEqual(self.config, before)

    def test_stale_release_seed_and_unapproved_text_are_rejected(self):
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, self.updates)
        stale = copy.deepcopy(self.config)
        stale['version'] += 1
        with self.assertRaisesRegex(ValueError, 'Source config changed'):
            export_reviewed_copy(stale, seed, draft, receipt)
        bad = copy.deepcopy(draft)
        bad['pages'][11]['blocks'][0]['text'] = 'Different story'
        with self.assertRaises(ValueError):
            export_reviewed_copy(self.config, seed, bad, receipt)
        changed_seed = copy.deepcopy(seed)
        changed_seed['pages'][0]['blocks'][0]['text'] = 'Unapproved'
        with self.assertRaisesRegex(ValueError, 'Approved seed changed'):
            export_reviewed_copy(self.config, changed_seed, draft, receipt)

    def test_geometry_edits_roundtrip_but_unlisted_pages_cannot_change(self):
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, self.updates)
        draft['pages'][11]['blocks'][0]['width'] = 1700
        out = export_reviewed_copy(self.config, seed, draft, receipt)
        self.assertEqual(out['rendering']['recipe']['copy']['page-12'][0]['placement']['width'], 1700)
        draft['pages'][4]['blocks'][0]['left'] += 10
        with self.assertRaisesRegex(ValueError, 'Unlisted page changed'):
            export_reviewed_copy(self.config, seed, draft, receipt)

    def test_only_explicitly_approved_empty_copy_roundtrips(self):
        from lettering_state import clean_lettering
        empty = {'id': 'title-artwork-text', 'text': '', 'placement': {'left': 0, 'top': 0, 'width': 2625, 'zIndex': 50},
                 'fontSize': 74, 'lineHeight': 1.2, 'color': '#000000', 'align': 'left', 'padding': 0}
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, {'page-01': [empty]})
        out = export_reviewed_copy(self.config, seed, json.loads(json.dumps(draft)), receipt)
        self.assertEqual(out['rendering']['recipe']['copy']['page-01'][0]['text'], '')
        changed = copy.deepcopy(draft)
        changed['pages'][0]['blocks'][0]['text'] = ' '
        with self.assertRaisesRegex(ValueError, 'Invalid text'):
            clean_lettering(changed, seed)
        changed = copy.deepcopy(draft)
        page = next(p for p in changed['pages'] if p['pageId'] == 'page-12')
        page['blocks'][0]['text'] = ''
        with self.assertRaisesRegex(ValueError, 'Invalid text'):
            clean_lettering(changed, seed)

    def test_title_can_be_restored_as_original_image_without_duplicate_live_text(self):
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, {'page-01': []})
        out = export_reviewed_copy(self.config, seed, draft, receipt)
        self.assertNotIn('page-01', out['rendering']['recipe']['copy'])
        self.assertEqual(draft['pages'][0]['blocks'], [])

    def test_saved_plain_line_breaks_survive_export(self):
        updates = copy.deepcopy(self.updates)
        updates['page-12'][0].pop('flow')
        updates['page-12'][0]['placement'].pop('height')
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, updates)
        draft['pages'][11]['blocks'][0]['text'] = '[Child Name] looked\nleft. Then right.'
        out = export_reviewed_copy(self.config, seed, draft, receipt)
        self.assertEqual(out['rendering']['recipe']['copy']['page-12'][0]['text'], draft['pages'][11]['blocks'][0]['text'])

    def test_invalid_runtime_leading_is_rejected_without_clamping(self):
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, self.updates)
        for size, leading in [(8, 120), (72, 8)]:
            edited = copy.deepcopy(draft)
            edited['pages'][11]['blocks'][0].update(size=size, leading=leading)
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, 'line height'):
                export_reviewed_copy(self.config, seed, edited, receipt)
        draft['pages'][11]['blocks'][0].update(size=20, leading=30)
        self.assertEqual(export_reviewed_copy(self.config, seed, draft, receipt)['rendering']['recipe']['copy']['page-12'][0]['lineHeight'], 1.5)

    def test_source_and_plain_flow_only_metadata_cannot_disappear(self):
        for doc_name in ('seed', 'draft'):
            seed, draft = copy.deepcopy(self.seed), copy.deepcopy(self.draft)
            (seed if doc_name == 'seed' else draft)['pages'][4]['blocks'][0]['customStyle'] = 'retain me'
            with self.subTest(doc=doc_name), self.assertRaisesRegex(ValueError, 'Unsupported.*editor fields'):
                migrate_reviewed_copy(self.config, seed, draft, self.updates)
        updates = copy.deepcopy(self.updates)
        updates['page-12'][0].pop('flow')
        updates['page-12'][0]['placement'].pop('height')
        seed, draft, receipt = migrate_reviewed_copy(self.config, self.seed, self.draft, updates)
        for extra in ({'height': 300}, {'padding': 25}):
            edited = copy.deepcopy(draft)
            edited['pages'][11]['blocks'][0].update(extra)
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, 'Unsupported.*editor fields'):
                export_reviewed_copy(self.config, seed, edited, receipt)

    def test_wrong_scope_and_unknown_copy_fields_rejected(self):
        with self.assertRaisesRegex(ValueError, 'outside the reviewed scope'):
            migrate_reviewed_copy(self.config, self.seed, self.draft, {'page-15': []})
        bad = copy.deepcopy(self.updates)
        bad['page-12'][0]['unexpected'] = True
        with self.assertRaisesRegex(ValueError, 'Unsupported revised copy fields'):
            migrate_reviewed_copy(self.config, self.seed, self.draft, bad)


if __name__ == '__main__':
    unittest.main()
