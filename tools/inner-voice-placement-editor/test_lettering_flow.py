import copy
import json
import unittest
from pathlib import Path
from lettering_state import clean_lettering

ROOT = Path(__file__).parent

class LetteringFlowTest(unittest.TestCase):
    def setUp(self):
        self.seed = json.loads((ROOT / 'lettering-data.json').read_text())
        self.state = json.loads((ROOT / 'lettering.json').read_text())
        self.seed['stateSchema'] = 'lhb.lettering-review@v2'
        self.seed['layoutFingerprint'] = 'flow-test-fingerprint'
        self.state['schema'] = self.seed['stateSchema']
        self.state['layoutFingerprint'] = self.seed['layoutFingerprint']
        for item in (self.seed['pages'][25], self.state['pages'][25]):
            first, emphasis, rest = item['blocks'][:3]
            group = copy.deepcopy(first)
            group['text'] = first['text'] + ' ' + emphasis['text'] + ' ' + rest['text']
            group['height'] = 300
            group['flow'] = {'paragraphs': [{'runs': [
                {'text': first['text'] + ' '},
                {'text': emphasis['text'], 'style': {'color': emphasis['color'], 'sizeRatio': emphasis['size'] / first['size'], 'rotateDeg': emphasis['rotation']}},
                {'text': ' ' + rest['text']},
            ]}]}
            item['blocks'][:3] = [group]

    def test_flow_survives_and_old_draft_is_rejected(self):
        result = clean_lettering(self.state, self.seed)
        self.assertEqual(result['pages'][25]['blocks'][0]['flow'], self.state['pages'][25]['blocks'][0]['flow'])
        old = copy.deepcopy(self.state)
        old['schema'] = 'lhb.lettering-review@v1'
        with self.assertRaises(ValueError):
            clean_lettering(old, self.seed)

    def test_emphasis_style_can_change_without_changing_words(self):
        edited = copy.deepcopy(self.state)
        run = edited['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][1]
        run['style'] = {'color': '#123456', 'sizeRatio': 1.4, 'rotateDeg': -3}
        edited['pages'][25]['blocks'][0]['padding'] = 16
        saved = clean_lettering(edited, self.seed)
        self.assertEqual(saved['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][1]['style'], run['style'])
        self.assertEqual(saved['pages'][25]['blocks'][0]['padding'], 16)

    def test_grouping_is_validated_and_locked_to_seed(self):
        for value in (self.seed, self.state):
            value['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][0]['keepWithNext'] = True
        saved = clean_lettering(self.state, self.seed)
        self.assertTrue(saved['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][0]['keepWithNext'])
        for change in ('removed', 'changed', 'nonboolean', 'dangling'):
            edited = copy.deepcopy(self.state)
            runs = edited['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs']
            if change == 'removed': del runs[0]['keepWithNext']
            if change == 'changed': runs[0]['keepWithNext'] = False
            if change == 'nonboolean': runs[0]['keepWithNext'] = 'true'
            if change == 'dangling': runs[-1]['keepWithNext'] = False
            with self.subTest(change=change), self.assertRaises(ValueError): clean_lettering(edited, self.seed)
        tampered_seed = copy.deepcopy(self.seed)
        tampered_seed['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][0]['keepWithNext'] = False
        with self.assertRaises(ValueError): clean_lettering(self.state, tampered_seed)

    def test_atomic_phrase_survives_and_is_seed_locked(self):
        for value in (self.seed, self.state):
            block = value['pages'][25]['blocks'][0]
            runs = block['flow']['paragraphs'][0]['runs']
            runs[1]['text'] = 'flew with [Animal Guide]'
            runs[1]['atomicPhrase'] = True
            runs[1]['style'] = {'rotateDeg': 5}
            block['text'] = ''.join(r['text'] for r in runs)
        saved = clean_lettering(self.state, self.seed)
        self.assertTrue(saved['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][1]['atomicPhrase'])
        for change in ('remove', 'false', 'add', 'bad_token', 'hard_break', 'too_long', 'lone_high', 'lone_low', 'punctuation'):
            bad, seed = copy.deepcopy(self.state), copy.deepcopy(self.seed)
            block = bad['pages'][25]['blocks'][0]
            run = block['flow']['paragraphs'][0]['runs'][1]
            if change == 'remove': del run['atomicPhrase']
            if change == 'false': run['atomicPhrase'] = False
            if change == 'add': block['flow']['paragraphs'][0]['runs'][0]['atomicPhrase'] = True
            if change in ('bad_token', 'hard_break', 'too_long', 'lone_high', 'lone_low', 'punctuation'):
                run['text'] = {'bad_token':'[Child Name]', 'hard_break':'a\u2028b', 'too_long':'a'*257, 'lone_high':'\ud800', 'lone_low':'\udc00', 'punctuation':'[Animal Guide]'}[change]
                if change == 'punctuation': block['flow']['paragraphs'][0]['runs'][2]['text'] = '.'
                block['text'] = ''.join(r['text'] for r in block['flow']['paragraphs'][0]['runs'])
                seed['pages'][25]['blocks'][0] = copy.deepcopy(block)
            with self.subTest(change=change), self.assertRaises(ValueError): clean_lettering(bad, seed)
        for value in (self.seed, self.state):
            block = value['pages'][25]['blocks'][0]
            runs = block['flow']['paragraphs'][0]['runs']
            runs[1]['text'] = '[Animal Guide] 😀'
            runs[1]['keepWithNext'] = True
            runs[2]['text'] = '.'
            block['text'] = ''.join(r['text'] for r in runs)
        self.assertTrue(clean_lettering(self.state, self.seed)['pages'][25]['blocks'][0]['flow']['paragraphs'][0]['runs'][1]['keepWithNext'])

    def test_rotated_next_line_character_matches_render_contract(self):
        for value in (self.seed, self.state):
            block = value['pages'][25]['blocks'][0]
            block['flow']['paragraphs'][0]['runs'][1]['text'] = 'f\u0085ly'
            block['text'] = ''.join(run['text'] for run in block['flow']['paragraphs'][0]['runs'])
        clean_lettering(self.state, self.seed)

    def test_atomic_punctuation_chains_across_whitespace(self):
        from lettering_state import clean_flow
        sentences = {'paragraphs': [{'runs': [{'text': 'left. '}, {'text': 'Then right.', 'atomicPhrase': True}]}]}
        self.assertEqual(clean_flow(sentences, 'left. Then right.'), sentences)
        for before in (False, True):
            for bound in (0, 1, 2):
                runs = ([{'text': '“'}, {'text': ' '}, {'text': '[Animal Guide]', 'atomicPhrase': True}]
                        if before else [{'text': '[Animal Guide]', 'atomicPhrase': True}, {'text': ' '}, {'text': '.'}])
                for run in runs[:bound]:
                    run['keepWithNext'] = True
                flow = {'paragraphs': [{'runs': runs}]}
                text = ''.join(run['text'] for run in runs)
                if bound == 2:
                    self.assertEqual(clean_flow(flow, text), flow)
                else:
                    with self.assertRaisesRegex(ValueError, 'Adjacent punctuation'): clean_flow(flow, text)

    def test_mismatched_or_unsafe_flow_is_rejected(self):
        for mutate in ('text', 'style', 'null_style', 'token', 'height', 'excess_padding', 'removed_flow', 'replaced_id', 'invalid_id', 'utf16_length', 'stripped_styles', 'added_flow', 'rotated_unicode_space'):
            bad = copy.deepcopy(self.state)
            seed = copy.deepcopy(self.seed)
            block = bad['pages'][25]['blocks'][0]
            if mutate == 'text': block['flow']['paragraphs'][0]['runs'][0]['text'] += 'x'
            if mutate == 'style': block['flow']['paragraphs'][0]['runs'][1]['style']['color'] = 'url(evil)'
            if mutate == 'null_style': block['flow']['paragraphs'][0]['runs'][1]['style'] = None
            if mutate == 'token': block['flow']['paragraphs'][0]['runs'][0]['text'] = '[Unknown Token] '
            if mutate == 'height': block['height'] = 0
            if mutate == 'excess_padding': block['padding'] = block['height'] / 2
            if mutate == 'removed_flow': del block['flow']
            if mutate == 'replaced_id': block['id'] = 'replacement'
            if mutate == 'invalid_id': block['id'] = '_invalid'
            if mutate == 'stripped_styles': block['flow']['paragraphs'][0]['runs'] = [{'text': block['text']}]
            if mutate == 'added_flow':
                added = bad['pages'][24]['blocks'][0]
                added['height'] = 200
                added['flow'] = {'paragraphs': [{'runs': [{'text': added['text']}]}]}
            if mutate == 'rotated_unicode_space':
                block['text'] = 'fly\ufeff'
                block['flow']['paragraphs'][0]['runs'] = [{'text': block['text'], 'style': {'rotateDeg': 3}}]
                seed['pages'][25]['blocks'][0] = copy.deepcopy(block)
            if mutate == 'utf16_length':
                block['text'] = '😀' * 4001
                block['flow']['paragraphs'][0]['runs'] = [{'text': block['text']}]
                seed['pages'][25]['blocks'][0] = copy.deepcopy(block)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                clean_lettering(bad, seed)

if __name__ == '__main__':
    unittest.main()
