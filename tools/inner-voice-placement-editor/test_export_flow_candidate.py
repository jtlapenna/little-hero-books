import copy
import json
from pathlib import Path
import unittest

from migrate_flow_candidate import migrate
from export_flow_candidate import export_candidate, recipe_text

ROOT = Path(__file__).parent


class FlowExportTest(unittest.TestCase):
    def setUp(self):
        self.source_seed = json.loads((ROOT / 'lettering-data.json').read_text())
        self.source_draft = json.loads((ROOT / 'lettering.json').read_text())
        self.seed, self.draft, self.source_map = migrate(self.source_seed, self.source_draft)
        original = self.source_draft['pages'][25]['blocks']
        self.config = {
            'bookId': self.seed['bookId'],
            'rendering': {'preview': {'interiorPx': {'w': self.seed['units'], 'h': self.seed['units']}},
                          'recipe': {'schema': 'lhb.book-render@v1', 'copy': {'page-26': [
                              {'id': b['id'], 'text': b['text'].replace('Owl', '[animal guide]'),
                               'placement': {'left': b['left'], 'top': b['top'], 'width': b['width'],
                                             'rotateDeg': b['rotation'], 'zIndex': 50},
                               'fontSize': b['size'] * self.seed['units'] / (self.seed['pageSizeMm'] * 72 / 25.4),
                               'lineHeight': b['leading'] / b['size'], 'color': b['color'],
                               'align': b['align'], 'padding': 0,
                               **({'edgeStyle': 'stroke'} if b['edge'] else {})}
                              for b in original]}}}}
        blocks12 = []
        scale = self.seed['units'] / (self.seed['pageSizeMm'] * 72 / 25.4)
        for b in self.source_draft['pages'][11]['blocks']:
            blocks12.append({'id': b['id'], 'text': b['text'].replace('feathers', '[animal clues]'),
                             'placement': {'left': b['left'], 'top': b['top'], 'width': b['width'],
                                           'rotateDeg': b['rotation'], 'zIndex': 50},
                             'fontSize': b['size'] * scale, 'lineHeight': b['leading'] / b['size'],
                             'color': b['color'], 'align': b['align'], 'padding': 0,
                             **({'edgeStyle': 'stroke'} if b['edge'] else {})})
        blocks12[1]['text'] = self.draft['pages'][11]['blocks'][1]['text']
        placements = [(500, 760, 1950, 0), (500, 930, 300, -3), (850, 930, 1100, 3),
                      (500, 1100, 1650, 3), (500, 1260, 1900, 0)]
        for b, (left, top, width, rotation) in zip(blocks12[2:], placements):
            b['longName'] = {'minChars': 13, 'placement': {'left': left, 'top': top, 'width': width, 'rotateDeg': rotation, 'zIndex': 50}}
        for b in (blocks12[2], blocks12[6]):
            b['nameFit'] = {'thresholdChars': 15, 'minScale': .7}
        self.config['rendering']['recipe']['copy']['page-12'] = blocks12
        for page in self.draft['pages']:
            if page['page'] in (12, 26) or not page['blocks']:
                continue
            self.config['rendering']['recipe']['copy'][page['pageId']] = [
                {'id': b['id'], 'text': recipe_text(page['page'], b['text']),
                 'placement': {'left': b['left'], 'top': b['top'], 'width': b['width'],
                               'rotateDeg': b['rotation'], 'zIndex': 50},
                 'fontSize': b['size'] * scale, 'lineHeight': b['leading'] / b['size'],
                 'color': b['color'], 'align': b['align'], 'padding': 0,
                 **({'edgeStyle': 'soft-shadow' if self.seed['pages'][page['page']-1].get('contrastStyle') == 'soft-shadow' else 'stroke'} if b['edge'] else {})}
                for b in page['blocks']]
        first = self.config['rendering']['recipe']['copy']['page-26'][0]
        first['nameFit'] = {'thresholdChars': 15, 'minScale': .7}
        first['longName'] = {'minChars': 13, 'placement': {'left': 200, 'top': 180, 'width': 2225, 'rotateDeg': 0, 'zIndex': 50}, 'fontSize': 68}

    def test_exports_flow_and_preserves_other_copy(self):
        config = copy.deepcopy(self.config)
        out = export_candidate(config, self.source_seed, self.source_draft, self.seed, self.draft)
        blocks = out['rendering']['recipe']['copy']['page-26']
        group = blocks[0]
        self.assertEqual(out['rendering']['recipe']['schema'], 'lhb.book-render@v2')
        self.assertEqual(group['text'], '[Child Name] and [animal guide] flew through the stars.')
        self.assertEqual(group['flow'], self.draft['pages'][25]['blocks'][0]['flow'])
        self.assertEqual(group['placement']['height'], self.draft['pages'][25]['blocks'][0]['height'])
        self.assertNotIn('nameFit', group)
        self.assertEqual(blocks[1:], config['rendering']['recipe']['copy']['page-26'][3:])
        self.assertEqual(config, self.config)

    def test_page12_experimental_candidate_cannot_be_exported(self):
        # An old experimental candidate must not bypass the page 12 hold.
        seed = copy.deepcopy(self.seed)
        draft = copy.deepcopy(self.draft)
        seed['pages'][11]['blocks'][2]['flow'] = {'paragraphs': [{'runs': [{'text': 'changed'}]}]}
        before = copy.deepcopy(self.config)
        with self.assertRaisesRegex(ValueError, 'Flow seed does not match'):
            export_candidate(self.config, self.source_seed, self.source_draft, seed, draft)
        self.assertEqual(self.config, before)

    def test_changed_retained_page12_color_does_not_disappear(self):
        for index in (2, 6):
            for field, value in [('color', '#123456'), ('size', 65), ('leading', 97),
                                 ('left', 410), ('top', 730), ('width', 1250),
                                 ('rotation', 7), ('align', 'right'), ('edge', True)]:
                source = copy.deepcopy(self.source_draft)
                source['pages'][11]['blocks'][index][field] = value
                if value == self.source_draft['pages'][11]['blocks'][index][field]:
                    continue
                seed, draft, _ = migrate(self.source_seed, source)
                with self.subTest(index=index, field=field), self.assertRaisesRegex(ValueError, f'page-12.*text-12-0{index+1}'):
                    export_candidate(self.config, self.source_seed, source, seed, draft)

    def test_unedited_source_and_config_unknown_fields_are_not_ignored(self):
        bad_source = copy.deepcopy(self.source_draft)
        bad_source['pages'][11]['blocks'][6]['customStyle'] = 'lost'
        with self.assertRaisesRegex(ValueError, 'Unsupported retained editor fields.*text-12-07'):
            export_candidate(self.config, self.source_seed, bad_source, self.seed, self.draft)
        for page, index in [('page-12', 6), ('page-26', 5)]:
            bad_config = copy.deepcopy(self.config)
            bad_config['rendering']['recipe']['copy'][page][index]['customStyle'] = 'lost'
            with self.subTest(page=page), self.assertRaises(ValueError):
                export_candidate(bad_config, self.source_seed, self.source_draft, self.seed, self.draft)

    def test_emphasis_style_survives_export(self):
        draft = copy.deepcopy(self.draft)
        draft['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][1]['style'] = {'color': '#123456', 'sizeRatio': 1.4, 'rotateDeg': -3}
        draft['pages'][25]['blocks'][0]['height'] = 525
        draft['pages'][25]['blocks'][0]['padding'] = 16
        out = export_candidate(self.config, self.source_seed, self.source_draft, self.seed, draft)
        style = out['rendering']['recipe']['copy']['page-26'][0]['flow']['paragraphs'][0]['runs'][1]['style']
        self.assertEqual(style, {'color': '#123456', 'sizeRatio': 1.4, 'rotateDeg': -3})
        self.assertEqual(out['rendering']['recipe']['copy']['page-26'][0]['placement']['height'], 525)
        self.assertEqual(out['rendering']['recipe']['copy']['page-26'][0]['padding'], 16)

    def test_retained_geometry_must_match_config_even_when_sources_agree(self):
        seed = copy.deepcopy(self.source_seed)
        source = copy.deepcopy(self.source_draft)
        for document in (seed, source):
            document['pages'][25]['blocks'][1]['left'] += 1
        migrated_seed, migrated_draft, _ = migrate(seed, source)
        with self.assertRaisesRegex(ValueError, 'Config and retained flying page differ'):
            export_candidate(self.config, seed, source, migrated_seed, migrated_draft)

    def test_flow_group_geometry_survives_export(self):
        draft = copy.deepcopy(self.draft)
        group = draft['pages'][25]['blocks'][0]
        group['left'] += 1
        group['width'] += 1
        out = export_candidate(self.config, self.source_seed, self.source_draft, self.seed, draft)
        placement = out['rendering']['recipe']['copy']['page-26'][0]['placement']
        self.assertEqual((placement['left'], placement['width']), (group['left'], group['width']))

    def test_three_paragraph_flow_exports_from_editor_state(self):
        seed, draft, _ = migrate(self.source_seed, self.source_draft, flying_paragraphs=True)
        edited = copy.deepcopy(draft)
        edited['pages'][25]['blocks'][0]['left'] += 1
        out = export_candidate(self.config, self.source_seed, self.source_draft, seed, edited, flying_paragraphs=True)
        blocks = out['rendering']['recipe']['copy']['page-26']
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0]['flow'], edited['pages'][25]['blocks'][0]['flow'])
        self.assertEqual(blocks[0]['placement']['left'], edited['pages'][25]['blocks'][0]['left'])
        self.assertEqual(blocks[1], self.config['rendering']['recipe']['copy']['page-26'][5])
        with self.assertRaisesRegex(ValueError, 'Flow seed does not match'):
            export_candidate(self.config, self.source_seed, self.source_draft, seed, edited)

    def test_heart_cover_uses_named_pose_without_relabeling(self):
        config = copy.deepcopy(self.config)
        recipe = config['rendering']['recipe']
        recipe['poses'] = {'breath': {'poseNumber': 7}, 'cover-base': {'poseNumber': 0}}
        recipe['covers'] = {fmt: {'layers': [{'id': 'cover-child', 'kind': 'pose', 'poseId': 'cover-base', 'poseNumber': 0}]}
                            for fmt in ('standard', 'amazon')}
        before = copy.deepcopy(config)
        out = export_candidate(config, self.source_seed, self.source_draft, self.seed, self.draft, heart_cover=True)
        self.assertEqual(config, before)
        self.assertEqual(out['rendering']['recipe']['poses'], recipe['poses'])
        for fmt in ('standard', 'amazon'):
            layer = out['rendering']['recipe']['covers'][fmt]['layers'][0]
            self.assertEqual((layer['poseId'], layer['poseNumber']), ('breath', 7))
        for mutate in ('missing-pose', 'wrong-number', 'wrong-cover'):
            bad = copy.deepcopy(config)
            if mutate == 'missing-pose':
                del bad['rendering']['recipe']['poses']['breath']
            elif mutate == 'wrong-number':
                bad['rendering']['recipe']['poses']['breath']['poseNumber'] = 8
            else:
                bad['rendering']['recipe']['covers']['amazon']['layers'][0]['poseNumber'] = 2
            with self.subTest(mutate=mutate), self.assertRaisesRegex(ValueError, 'cover'):
                export_candidate(bad, self.source_seed, self.source_draft, self.seed, self.draft, heart_cover=True)

    def test_three_paragraph_export_rejects_source_config_geometry_conflict(self):
        for index in range(5):
            source = copy.deepcopy(self.source_draft)
            source['pages'][25]['blocks'][index]['left'] += 1
            seed, draft, _ = migrate(self.source_seed, source, flying_paragraphs=True)
            with self.subTest(index=index), self.assertRaisesRegex(ValueError, 'Config and retained flying page differ'):
                export_candidate(self.config, self.source_seed, source, seed, draft, flying_paragraphs=True)

    def test_three_paragraph_export_rejects_retained_config_field_changes(self):
        seed, draft, _ = migrate(self.source_seed, self.source_draft, flying_paragraphs=True)
        changes = [('fontSize', 1), ('lineHeight', .1), ('color', '#123456'), ('align', 'right'),
                   ('edgeStyle', 'soft-shadow'), ('left', 1), ('top', 1), ('width', 1), ('rotateDeg', 1)]
        for index in range(5):
            for field, value in changes:
                config = copy.deepcopy(self.config)
                block = config['rendering']['recipe']['copy']['page-26'][index]
                target = block['placement'] if field in ('left', 'top', 'width', 'rotateDeg') else block
                previous = target.get(field)
                target[field] = target[field] + value if isinstance(value, (int, float)) else value
                if target[field] == previous:
                    continue
                with self.subTest(index=index, field=field), self.assertRaisesRegex(ValueError, 'Config and retained flying page differ'):
                    export_candidate(config, self.source_seed, self.source_draft, seed, draft, flying_paragraphs=True)

    def test_exports_legacy_color_and_rejects_unproven_layout_changes(self):
        page = self.draft['pages'][4]
        source = page['blocks'][0]
        scale = self.seed['units'] / (self.seed['pageSizeMm'] * 72 / 25.4)
        def block(b):
            return {'id': b['id'], 'text': b['text'].replace('Grass Valley', '[Hometown]'),
                    'placement': {'left': b['left'], 'top': b['top'], 'width': b['width'],
                                  'rotateDeg': b['rotation'], 'zIndex': 50},
                    'fontSize': b['size'] * scale, 'lineHeight': b['leading'] / b['size'],
                    'color': b['color'], 'align': b['align'], 'padding': 0,
                    **({'edgeStyle': 'stroke'} if b['edge'] else {})}
        page_blocks = [block(b) for b in page['blocks']]
        stored = page_blocks[0]
        page_blocks[1]['nameFit'] = {'thresholdChars': 15, 'minScale': .7}
        self.config['rendering']['recipe']['copy']['page-05'] = page_blocks
        edited = copy.deepcopy(self.draft)
        edited['pages'][4]['blocks'][0]['color'] = '#123456'
        out = export_candidate(self.config, self.source_seed, self.source_draft, self.seed, edited)
        result = out['rendering']['recipe']['copy']['page-05'][0]
        self.assertEqual(result['placement'], stored['placement'])
        self.assertEqual(result['color'], '#123456')
        self.assertEqual(result['text'], stored['text'])
        self.assertEqual(out['rendering']['recipe']['copy']['page-05'][1:], page_blocks[1:])

        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-05'][0]['nameFit'] = {'thresholdChars': 15, 'minScale': .7}
        with self.assertRaisesRegex(ValueError, 'name-fit'):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, edited)
        for field in ('width', 'size', 'leading'):
            bad = copy.deepcopy(edited)
            bad['pages'][4]['blocks'][0][field] += 1
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'wrapping parity'):
                export_candidate(self.config, self.source_seed, self.source_draft, self.seed, bad)
        bad = copy.deepcopy(edited)
        bad['pages'][4]['blocks'][0]['rotation'] += 1
        with self.assertRaisesRegex(ValueError, 'rotation parity'):
            export_candidate(self.config, self.source_seed, self.source_draft, self.seed, bad)
        for field in ('left', 'top'):
            bad = copy.deepcopy(edited)
            bad['pages'][4]['blocks'][0][field] += 1
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'origin parity'):
                export_candidate(self.config, self.source_seed, self.source_draft, self.seed, bad)
        for field, value in [('align', 'right' if source['align'] != 'right' else 'left'), ('edge', not source['edge'])]:
            bad = copy.deepcopy(edited)
            bad['pages'][4]['blocks'][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'style parity'):
                export_candidate(self.config, self.source_seed, self.source_draft, self.seed, bad)
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-05'][0]['longName'] = {'minChars': 13}
        with self.assertRaisesRegex(ValueError, 'long-name'):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, edited)
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-05'][0]['text'] = 'drift'
        with self.assertRaisesRegex(ValueError, 'retained legacy'):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, edited)
        bad = copy.deepcopy(edited)
        bad['pages'][4]['blocks'][0]['unsupported'] = 'not preserved'
        with self.assertRaisesRegex(ValueError, 'unsupported fields'):
            export_candidate(self.config, self.source_seed, self.source_draft, self.seed, bad)
        bad = copy.deepcopy(edited)
        bad['pages'][4]['blocks'][0]['text'] = source['text'].replace('favorite park', 'favorite\npark')
        with self.assertRaisesRegex(ValueError, 'explicit migration'):
            export_candidate(self.config, self.source_seed, self.source_draft, self.seed, bad)

    def test_rejects_changed_legacy_content_and_unrelated_editor_edits(self):
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-26'][1]['text'] = 'drift'
        with self.assertRaises(ValueError):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, self.draft)
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-26'][0]['backgroundColor'] = '#123456'
        with self.assertRaises(ValueError):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, self.draft)
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-26'][0]['placement']['flipX'] = True
        with self.assertRaises(ValueError):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, self.draft)
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-26'][0]['nameFit']['minScale'] = .4
        with self.assertRaises(ValueError):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, self.draft)
        edited = copy.deepcopy(self.draft)
        edited['pages'][4]['blocks'][0]['left'] += 1
        with self.assertRaises(ValueError):
            export_candidate(self.config, self.source_seed, self.source_draft, self.seed, edited)
        bad = copy.deepcopy(self.config)
        bad['rendering']['recipe']['copy']['page-26'][0]['color'] = '#123456'
        with self.assertRaises(ValueError):
            export_candidate(bad, self.source_seed, self.source_draft, self.seed, self.draft)
        edited = copy.deepcopy(self.draft)
        edited['pages'][25]['blocks'][0].update(size=8, leading=120)
        with self.assertRaises(ValueError):
            export_candidate(self.config, self.source_seed, self.source_draft, self.seed, edited)


if __name__ == '__main__':
    unittest.main()
