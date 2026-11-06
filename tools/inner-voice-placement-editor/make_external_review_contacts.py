"""Create provisional contact sheets in a fresh validated external directory."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

from external_review_paths import check_binding, check_sources, fresh_output, source_hashes
from local_custom_flow_pdf import checked, owned, validate


def sha(data):
    return hashlib.sha256(data).hexdigest()


def make_contacts(proof, rasters, output):
    binding = fresh_output(output)
    sources = source_hashes([Path(__file__), Path(__file__).with_name('external_review_paths.py'),
                             Path(__file__).with_name('local_custom_flow_pdf.py')])
    proof, rasters = (Path(p).resolve(strict=True) for p in (proof, rasters))
    manifest, manifest_hash, _ = validate(proof)
    render_bytes = owned(rasters, 'render-results.json').read_bytes()
    renders = json.loads(render_bytes)
    if (renders.get('schema') != 'lhb.custom-flow-local-rasters@v1'
            or renders.get('proofManifestSha256') != manifest_hash
            or renders.get('networkAttempts') != []
            or renders.get('approved') is not False or renders.get('printReady') is not False):
        raise ValueError('Expected matching provisional local rasters')
    expected = {(child['role'], item['label']): item
                for child in manifest['cases'] for item in child['files']}
    pages = renders['pages']
    keys = [(page['role'], page['label']) for page in pages]
    if len(keys) != len(expected) or len(set(keys)) != len(keys) or set(keys) != set(expected):
        raise ValueError('Raster roster must match proof exactly')
    indexed = dict(zip(keys, pages))
    for key, raster in indexed.items():
        item = expected[key]
        if (raster['file'] != f'{key[0]}/{key[1]}.png'
                or (raster['width'], raster['height']) != (item['width'], item['height'])):
            raise ValueError('Wrong raster ownership or recorded dimensions')
        with Image.open(checked(rasters, raster['file'], raster['sha256'])) as source:
            if source.size != (item['width'], item['height']):
                raise ValueError('Wrong decoded raster dimensions')
    check_sources(sources)
    check_binding(binding)
    binding.output.mkdir(mode=0o700)
    sheets = []
    for child in manifest['cases']:
        canvas = Image.new('RGB', (1920, 40 + 350 * math.ceil(len(child['files']) / 6)), '#ece8df')
        draw = ImageDraw.Draw(canvas)
        selection = child['selection']
        draw.text((18, 12), f"{child['role']} | {selection['name']} | {selection['animalGuide']} | provisional local review", fill='#111111')
        inputs = []
        for index, item in enumerate(child['files']):
            raster = indexed[(child['role'], item['label'])]
            left, top = (index % 6) * 320 + 10, (index // 6) * 350 + 40
            with Image.open(checked(rasters, raster['file'], raster['sha256'])) as source:
                image = source.convert('RGB')
                image.thumbnail((300, 310))
                canvas.paste(image, (left + (300 - image.width) // 2, top))
            draw.text((left, top + 315), item['label'], fill='#111111')
            inputs.append({'file': raster['file'], 'sha256': raster['sha256']})
        target = binding.output / (child['role'] + '-contact.jpg')
        with target.open('xb') as handle:
            canvas.save(handle, format='JPEG', quality=92)
        sheets.append({'role': child['role'], 'file': target.name,
                       'sha256': sha(target.read_bytes()), 'inputs': inputs})
    for sheet in sheets:
        for item in sheet['inputs']:
            checked(rasters, item['file'], item['sha256'])
        checked(binding.output, sheet['file'], sheet['sha256'])
    if (validate(proof)[1] != manifest_hash
            or owned(rasters, 'render-results.json').read_bytes() != render_bytes):
        raise ValueError('Contact inputs changed during capture')
    check_sources(sources)
    check_binding(binding, require_output=True)
    result = {'schema': 'lhb.local-review-contact-sheets@v1', 'approved': False,
              'printReady': False, 'writerSourceSha256': sources,
              'proofManifestSha256': manifest_hash, 'rasterManifestSha256': sha(render_bytes),
              'externalStorage': binding.receipt(), 'sheets': sheets}
    with (binding.output / 'contact-receipt.json').open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    check_binding(binding, require_output=True)
    check_sources(sources)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('proof', 'rasters', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    result = make_contacts(args.proof, args.rasters, args.output)
    print(f"Wrote {len(result['sheets'])} provisional contact sheets")


if __name__ == '__main__':
    main()
