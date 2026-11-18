"""Build the reviewed final-book candidate without mutating published versions.

Initialize once from the current immutable config + saved authoring. Later builds
read the saved revision seed/draft and export through the existing flow boundary.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw
from export_flow_candidate import migrate_reviewed_copy, export_reviewed_copy
from migrate_flow_candidate import write_candidate

GUIDES = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 'unicorn', 't-rex']


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def flow_group(source, block_id, paragraphs, **placement):
    block = copy.deepcopy(source)
    block.update(id=block_id, flow={'paragraphs': [{'runs': runs} for runs in paragraphs]})
    block['text'] = '\n'.join(''.join(run['text'] for run in runs) for runs in paragraphs)
    block['placement'].update(placement)
    block['placement']['rotateDeg'] = 0
    for key in ('nameFit', 'longName'):
        block.pop(key, None)
    return block


def reviewed_copy(config):
    recipe = config['rendering']['recipe']
    p12 = {block['id']: block for block in recipe['copy']['page-12']}
    trail = flow_group(p12['text-12-01'], 'text-12-trail-dialogue', [
        [{'text': 'On the path lay a trail of '},
         {'text': '[animal clues]', 'atomicPhrase': True, 'keepWithNext': True,
          'style': {'sizeRatio': 1.15, 'rotateDeg': -3}}, {'text': '.'}],
        [{'text': '[Child Name] looked '}, {'text': 'left.', 'style': {'sizeRatio': 1.15, 'rotateDeg': -3}},
         {'text': ' Then '}, {'text': 'right.', 'style': {'sizeRatio': 1.15, 'rotateDeg': 3}}],
        [{'text': '"Where are you?"', 'style': {'sizeRatio': 1.1}}, {'text': ' called [Child Name].'}],
    ], left=613, top=540, width=1900, height=700)
    p20 = copy.deepcopy(recipe['copy']['page-20'])
    intro = next(block for block in p20 if block['id'] == 'text-20-01')
    intro['placement']['top'] = 360
    intro['lineHeight'] = 1.3125
    p28 = recipe['copy']['page-28']
    dialogue = flow_group(next(block for block in p28 if block['id'] == 'text-28-04'),
                         'text-28-responsive-dialogue', [
        [{'text': '[Child Name] looked at the child waiting behind [object pronoun].'}],
        [{'text': '"You go first," said [Child Name]. "I\'m almost ready."'}],
        [{'text': 'And this time, [Child Name] smiled.'}],
    ], left=185, top=449, width=2350, height=680)
    publisher = [
        {'id': 'publisher-heading', 'text': 'Little Hero Labs', 'placement': {'left': 250, 'top': 1050, 'width': 2125, 'zIndex': 50},
         'fontSize': 112, 'lineHeight': 1.2, 'color': '#17354b', 'align': 'center', 'padding': 0},
        {'id': 'publisher-tagline', 'text': 'Every child is the hero\nof their own story.',
         'placement': {'left': 300, 'top': 1300, 'width': 2025, 'zIndex': 50},
         'fontSize': 88, 'lineHeight': 1.4, 'color': '#17354b', 'align': 'center', 'padding': 0},
        {'id': 'publisher-description', 'text': 'Personalized books for little readers\nand the people who love them.',
         'placement': {'left': 300, 'top': 1710, 'width': 2025, 'zIndex': 50},
         'fontSize': 72, 'lineHeight': 1.5, 'color': '#17354b', 'align': 'center', 'padding': 0},
        {'id': 'publisher-website', 'text': 'www.LittleHeroLabs.com',
         'placement': {'left': 300, 'top': 2210, 'width': 2025, 'zIndex': 50},
         'fontSize': 74, 'lineHeight': 1.3, 'color': '#17354b', 'align': 'center', 'padding': 0},
    ]
    return {'page-01': [{'id': 'title-artwork-text', 'text': '',
                         'placement': {'left': 0, 'top': 0, 'width': 2625, 'zIndex': 50},
                         'fontSize': 74, 'lineHeight': 1.2, 'color': '#000000', 'align': 'left', 'padding': 0}], 'page-12': [trail], 'page-20': p20,
            'page-28': [copy.deepcopy(block) for block in p28 if block['id'] in {'text-28-01', 'text-28-02', 'text-28-03'}] + [dialogue],
            'page-31': publisher}


def add_asset(config, asset_dir, local_map, name, category='overlays'):
    file = asset_dir / name
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    key = f"{config['bookId']}/v{config['version']}/{category}/{digest}/{name}"
    local_map['assets'][key] = {'path': str(file.resolve()), 'sha256': digest}
    return key


def build(directory, source_map, version=5, release=False):
    source = read(directory / 'source-config.json')
    if version <= source['version']:
        raise ValueError('A revision requires a new immutable book version')
    config = export_reviewed_copy(source, read(directory / 'lettering-data.json'),
                                  read(directory / 'lettering.json'), read(directory / 'copy-revision.json'))
    config.update(version=version, status='draft')
    assets = directory / 'assets'
    local_map = copy.deepcopy(source_map)
    title = add_asset(config, assets, local_map, 'original-title-page.png', 'backgrounds')
    white = add_asset(config, assets, local_map, 'white-page.png', 'backgrounds')
    logo = add_asset(config, assets, local_map, 'lhl-color-mark.png')
    panel = add_asset(config, assets, local_map, 'back-imprint-panel.png')
    config['assets']['backgrounds'].update(title=title, blank=white, credits=white)
    config['assets']['overlays'].update({'lhl-color-mark': logo, 'back-imprint-panel': panel})
    for fmt in config['formats'].values():
        flying_page = next(page for page in fmt['interior']['pageSequence'] if page['id'] == 'page-26')
        flying_hero = next(layer for layer in flying_page['layers'] if layer['id'] == 'hero')
        if flying_hero.get('poseId') != 'fly' or flying_hero.get('poseNumber') != 11:
            raise ValueError('Unexpected flying pose contract')
        flying_hero['placement']['flipX'] = False
        page = next(page for page in fmt['interior']['pageSequence'] if page['id'] == 'page-31')
        page['layers'] = [{'id': 'publisher-color-mark', 'kind': 'overlay', 'assetSlot': 'lhl-color-mark',
                           'placement': {'left': 1112.5, 'top': 330, 'width': 400, 'height': 523.4, 'zIndex': 15}}]
    for format_id, cover in config['rendering']['recipe']['covers'].items():
        cover['layers'] = [layer for layer in cover['layers'] if layer['id'] != 'cover-logo'] + [
            {'id': 'back-imprint-backing', 'kind': 'overlay', 'assetSlot': 'back-imprint-panel',
             'placement': {'left': 180, 'top': 1800, 'width': 1450, 'height': 620, 'zIndex': 40}},
            {'id': 'back-color-mark', 'kind': 'overlay', 'assetSlot': 'lhl-color-mark',
             'placement': {'left': 285, 'top': 2145, 'width': 150, 'height': 196.275, 'zIndex': 60}},
        ]
        texts = {text['id']: text for text in cover['texts']}
        if 'front-byline' in texts:
            texts['front-byline']['placement']['top'] = 690
            texts['front-byline']['fontSize'] = 76
            texts['front-personalization-label']['placement']['top'] = 920
            texts['front-personalization-label']['fontSize'] = 100
            name = texts['front-personalization-name']
            new_name = flow_group(name, name['id'], [[{'text': '[Child Name]'}]], top=1070, height=420)
            new_name.update(fontSize=160, lineHeight=1.15)
            cover['texts'] = [new_name if text['id'] == name['id'] else text for text in cover['texts']]
        dedication = copy.deepcopy(texts['back-dedication'])
        dedication.update(text='Made with love for', color='#17354b', fontSize=83, lineHeight=1.2)
        dedication['placement'].update(left=250, top=1850, width=1310)
        for field in ('edgeStyle', 'nameFit', 'longName'):
            dedication.pop(field, None)
        cover['texts'] = [dedication if text['id'] == dedication['id'] else text for text in cover['texts']]
        cover['texts'].extend([
            {'id': 'back-dedication-name', 'text': '[Child Name]',
             'placement': {'left': 250, 'top': 1970, 'width': 1310, 'zIndex': 50},
             'fontSize': 110, 'lineHeight': 1.2, 'color': '#17354b', 'align': 'center', 'padding': 0,
             'nameFit': {'thresholdChars': 14, 'minScale': .45}},
            {'id': 'back-website', 'text': 'www.LittleHeroLabs.com',
             'placement': {'left': 510, 'top': 2220, 'width': 1080, 'zIndex': 60},
             'fontSize': 54, 'lineHeight': 1.3, 'color': '#17354b', 'align': 'left', 'padding': 0},
        ])
    trails = read(directory / 'trails.json') if (directory / 'trails.json').exists() else {}
    for slot in ('page_12', 'page_13'):
        for guide, name in trails.get(slot, {}).items():
            if guide not in GUIDES:
                raise ValueError('Unexpected guide')
            config['assets']['guideBackgrounds'][slot][guide] = add_asset(config, assets, local_map, name, 'backgrounds')
    if release:
        if any(set(trails.get(slot, {})) != set(GUIDES) for slot in ('page_12', 'page_13')):
            raise ValueError('All eight reviewed clue spreads are required before release')
        config['status'] = 'active'
    return config, local_map


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--source-config', type=Path)
    parser.add_argument('--source-seed', type=Path)
    parser.add_argument('--source-draft', type=Path)
    parser.add_argument('--original-title', type=Path)
    parser.add_argument('--color-logo', type=Path)
    parser.add_argument('--asset-map', type=Path, required=True)
    parser.add_argument('--version', type=int, default=5)
    parser.add_argument('--release', action='store_true')
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not directory.exists():
        required = [args.source_config, args.source_seed, args.source_draft, args.original_title, args.color_logo]
        if not all(required):
            parser.error('First build requires source config, seed, draft, original title and color logo')
        config, source_seed, source_draft = read(args.source_config), read(args.source_seed), read(args.source_draft)
        seed, draft, receipt = migrate_reviewed_copy(config, source_seed, source_draft, reviewed_copy(config))
        write_candidate(directory, [('source-config.json', config), ('lettering-data.json', seed),
                                    ('lettering.json', draft), ('copy-revision.json', receipt)])
        assets = directory / 'assets'
        assets.mkdir()
        shutil.copyfile(args.original_title, assets / 'original-title-page.png')
        shutil.copyfile(args.color_logo, assets / 'lhl-color-mark.png')
        write(directory / 'source-files.json', {str(file.resolve()): hashlib.sha256(file.read_bytes()).hexdigest() for file in required})
    assets = directory / 'assets'
    Image.new('RGB', (2625, 2625), 'white').save(assets / 'white-page.png')
    # Code-native compact backing; source illustration remains its own immutable layer.
    panel = Image.new('RGBA', (1450, 620))
    ImageDraw.Draw(panel).rounded_rectangle((0, 0, 1449, 619), radius=55, fill=(255, 249, 235, 225))
    panel.save(assets / 'back-imprint-panel.png')
    config, asset_map = build(directory, read(args.asset_map), args.version, args.release)
    write(directory / ('release-config.json' if args.release else 'candidate-config.json'), config)
    write(directory / 'local-asset-map.json', asset_map)
    print(json.dumps({'directory': str(directory), 'version': config['version'], 'status': config['status'],
                      'copyRevision': read(directory / 'lettering.json')['revision']}))


if __name__ == '__main__':
    main()
