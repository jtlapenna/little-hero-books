import copy
import hashlib
import json
import unittest
from pathlib import Path

from legacy_metadata import derive


def encode(value):
    return json.dumps(value, ensure_ascii=False).encode()


def fixture():
    block = {'id': 'text-01-01', 'text': '[Child Name]',
             'placement': {'left': 1, 'top': 2, 'width': 100, 'rotateDeg': 0, 'zIndex': 50},
             'fontSize': 18, 'lineHeight': 1.3, 'color': '#ffffff', 'align': 'left', 'padding': 0,
             'nameFit': {'thresholdChars': 15, 'minScale': .7},
             'longName': {'minChars': 13, 'placement': {'left': 2, 'top': 3, 'width': 95}, 'fontSize': 16}}
    config = {'schema': 'lhb.book-config@v1', 'status': 'draft', 'bookId': 'test-book', 'version': 3,
              'rendering': {'recipe': {'schema': 'lhb.book-render@v1', 'pagePreviewTemplateId': 'page',
                                       'poses': {}, 'copy': {'page-01': [block]}, 'readingAreas': {},
                                       'animals': {}, 'covers': {}}}}
    draft = {'schema': 'lhb.lettering-review@v1', 'bookId': 'test-book',
             'pages': [{'page': 1, 'pageId': 'page-01', 'blocks': [{'id': block['id']}]},
                       {'page': 2, 'pageId': 'page-02', 'blocks': []}]}
    return config, draft


def source_inputs(config, draft):
    config_bytes, draft_bytes = encode(config), encode(draft)
    plan = {'status': 'LOCAL_REVIEW_ONLY', 'uploadApproved': False, 'canExecute': False,
            'configVersion': config['version'], 'configSha256': hashlib.sha256(config_bytes).hexdigest()}
    hashes = {'draftSha256': hashlib.sha256(draft_bytes).hexdigest()}
    return config_bytes, encode(plan), draft_bytes, encode(hashes)


class MetadataTest(unittest.TestCase):
    def setUp(self):
        self.config, self.draft = fixture()

    def test_preserves_render_source_without_mutation(self):
        original = copy.deepcopy(self.config)
        values = source_inputs(self.config, self.draft)
        result = derive(*values)
        self.assertEqual(result['schema'], 'lhb.legacy-render-metadata@v1')
        self.assertEqual(result['pages']['page-01']['blocks']['text-01-01'], self.config['rendering']['recipe']['copy']['page-01'][0])
        self.assertEqual(result['pages']['page-02'], {'sourcePagePresent': False, 'blockOrder': [], 'blocks': {}})
        self.assertEqual(result['source']['config']['sha256'], hashlib.sha256(values[0]).hexdigest())
        self.assertEqual(original, self.config)

    def test_source_hash_mismatch(self):
        values = list(source_inputs(self.config, self.draft))
        values[0] += b' '
        with self.assertRaisesRegex(ValueError, 'hash'):
            derive(*values)
        values = list(source_inputs(self.config, self.draft))
        values[2] += b' '
        with self.assertRaisesRegex(ValueError, 'hash'):
            derive(*values)

    def test_wrong_page_or_block_fails_even_with_matching_hashes(self):
        self.draft['pages'][0]['blocks'][0]['id'] = 'other'
        with self.assertRaisesRegex(ValueError, 'page/block'):
            derive(*source_inputs(self.config, self.draft))
        self.draft['pages'][0]['pageId'] = 'page-02'
        with self.assertRaisesRegex(ValueError, 'page ID'):
            derive(*source_inputs(self.config, self.draft))

    def test_duplicate_id_fails_even_if_editor_matches(self):
        block = copy.deepcopy(self.config['rendering']['recipe']['copy']['page-01'][0])
        self.config['rendering']['recipe']['copy']['page-01'].append(block)
        self.draft['pages'][0]['blocks'].append({'id': block['id']})
        with self.assertRaisesRegex(ValueError, 'block ID'):
            derive(*source_inputs(self.config, self.draft))

    def test_unknown_render_fields_and_recipe_schema_rejected(self):
        self.config['rendering']['recipe']['copy']['page-01'][0]['future'] = True
        with self.assertRaisesRegex(ValueError, 'Unsupported legacy copy fields'):
            derive(*source_inputs(self.config, self.draft))
        del self.config['rendering']['recipe']['copy']['page-01'][0]['future']
        self.config['rendering']['recipe']['schema'] = 'lhb.book-render@v2'
        with self.assertRaisesRegex(ValueError, 'recipe'):
            derive(*source_inputs(self.config, self.draft))

    def test_nested_unknown_fields_and_nonfinite_rejected(self):
        self.config['rendering']['recipe']['copy']['page-01'][0]['longName']['bogus'] = 1
        with self.assertRaisesRegex(ValueError, 'longName fields'):
            derive(*source_inputs(self.config, self.draft))
        del self.config['rendering']['recipe']['copy']['page-01'][0]['longName']['bogus']
        self.config['rendering']['recipe']['copy']['page-01'][0]['fontSize'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Invalid JSON number'):
            derive(*source_inputs(self.config, self.draft))

    def test_source_page_presence_is_explicit(self):
        result = derive(*source_inputs(self.config, self.draft))
        self.assertTrue(result['pages']['page-01']['sourcePagePresent'])
        self.assertFalse(result['pages']['page-02']['sourcePagePresent'])
        self.config['rendering']['recipe']['copy']['page-02'] = []
        with self.assertRaisesRegex(ValueError, 'page copy shape'):
            derive(*source_inputs(self.config, self.draft))

    def test_separate_hashes_do_not_claim_source_binding(self):
        original = derive(*source_inputs(self.config, self.draft))
        self.draft['pages'][0]['blocks'][0]['text'] = 'Changed editor copy'
        changed = derive(*source_inputs(self.config, self.draft))
        self.assertEqual(changed['source']['sourcePairing'],
                         'not established; matching page and block keys only')
        self.assertEqual(changed['pages']['page-01']['blocks']['text-01-01']['text'], '[Child Name]')
        self.assertEqual(changed['source']['config']['sha256'], original['source']['config']['sha256'])
        self.assertNotEqual(changed['source']['editorDraft']['sha256'], original['source']['editorDraft']['sha256'])

    def test_unreviewed_plan_rejected(self):
        values = list(source_inputs(self.config, self.draft))
        plan = json.loads(values[1]); plan['canExecute'] = True; values[1] = encode(plan)
        with self.assertRaisesRegex(ValueError, 'review status'):
            derive(*values)

    def test_actual_retained_sources(self):
        root = Path(__file__).resolve().parents[2]
        base = root / 'output/inner-voice-workflow-e2e-2026-10-27/editor-fidelity-audit'
        paths = [base / 'candidate/authoring-draft.json', base / 'editor-selected-publication-plan.json',
                 base / 'editor-lettering.json', root / 'output/inner-voice-flow-candidate-2026-10-28-r6/source-hashes.json']
        if not all(path.is_file() for path in paths):
            self.skipTest('Retained local proof sources are unavailable')
        result = derive(*(path.read_bytes() for path in paths))
        self.assertEqual(len(result['pages']), 32)
        self.assertEqual(result['pages']['page-26']['blocks']['text-26-01']['longName']['fontSize'], 68)


if __name__ == '__main__':
    unittest.main()
