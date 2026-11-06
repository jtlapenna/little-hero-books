"""Verify provisional review PDFs against their owned local raster inputs."""
import argparse
import hashlib
import json
from pathlib import Path

from local_custom_flow_pdf import checked, owned, validate

if not __debug__:
    raise RuntimeError('PDF verification requires Python assertions; remove -O or PYTHONOPTIMIZE')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_page_drawing(page, size, has_image):
    """Require the canonical assembler's full-page image or blank padding."""
    width, height = size['w'] * 72 / 25.4, size['h'] * 72 / 25.4
    expected_box = (0, 0, width, height)
    for box in (page.mediabox, page.cropbox):
        assert all(abs(float(actual) - expected) < .0001
                   for actual, expected in zip(box, expected_box))
    assert int(page.get('/Rotate', 0)) % 360 == 0
    assert float(page.get('/UserUnit', 1)) == 1
    assert not page.get('/Annots')
    content = page.get_contents()
    assert content is not None
    operations = content.operations
    expected_operators = [b'q', b'cm', b'Do', b'Q'] if has_image else [b'q', b'Q']
    assert [operator for _, operator in operations] == expected_operators, 'Noncanonical page drawing operators'
    assert operations[0][0] == [] and operations[-1][0] == []
    if has_image:
        matrix = operations[1][0]
        assert len(matrix) == 6
        assert all(abs(float(actual) - expected) < .0001
                   for actual, expected in zip(matrix, (width, 0, 0, height, 0, 0))), 'Wrong full-page image transform'
        assert operations[2][0] == ['/Im1']
        resources = page['/Resources'].get_object()
        xobjects = resources['/XObject'].get_object()
        assert set(xobjects) == {'/Im1'}


def verify(proof, rasters, pdfs):
    from PIL import Image
    from pypdf import PdfReader

    proof, rasters, pdfs = (Path(p).resolve(strict=True) for p in (proof, rasters, pdfs))
    manifest, manifest_hash, _ = validate(proof)
    config = json.loads(checked(proof, 'flow-config.json', manifest['configSha256']).read_bytes())
    render_bytes = owned(rasters, 'render-results.json').read_bytes()
    renders = json.loads(render_bytes)
    receipt_bytes = owned(pdfs, 'review-receipts.json').read_bytes()
    assembly = json.loads(receipt_bytes)
    assert renders['schema'] == 'lhb.custom-flow-local-rasters@v1'
    assert assembly['schema'] == 'lhb.local-custom-flow-review-pdfs@v1'
    assert renders['approved'] is False and renders['printReady'] is False
    assert assembly['approved'] is False and assembly['printReady'] is False
    assert renders['proofManifestSha256'] == assembly['proofManifestSha256'] == manifest_hash, 'Proof manifest binding differs'
    assert assembly['rasterManifestSha256'] == sha(render_bytes)
    assert renders['networkAttempts'] == [] and assembly['networkCalls'] == 0
    roles = [child['role'] for child in manifest['cases']]
    assert sorted(r['role'] for r in assembly['receipts']) == sorted(roles), 'Unexpected PDF child roster'
    expected_rasters = {(child['role'], item['label']) for child in manifest['cases'] for item in child['files']}
    assert len(renders['pages']) == len(expected_rasters)
    assert {(r['role'], r['label']) for r in renders['pages']} == expected_rasters
    results = []
    for child in manifest['cases']:
        receipt, = [r for r in assembly['receipts'] if r['role'] == child['role']]
        for field in ('orderId', 'rootOrderId', 'characterHash'):
            assert receipt[field] == child[field], (child['role'], field)
        assert receipt['normalW4DraftRefused'] is True
        assert receipt['localFixture'] is True and receipt['providerRequests'] == 0
        assert receipt['approved'] is False and receipt['printReady'] is False
        path = checked(pdfs, receipt['pdfFile'], receipt['pdfSha256'])
        reader = PdfReader(path)
        assert len(reader.pages) == receipt['pages'] == 35
        assert reader.metadata.title == 'LOCAL PROVISIONAL REVIEW, NOT FOR PRINT'
        fmt = config['formats'][child['selection']['formatId']]
        labels = ['cover', None, *[p['label'] for p in fmt['interior']['pageSequence']], None]
        assert len(labels) == 35
        geometry = fmt['print']['printGeometryMm']
        pages = []
        for index, (page, label) in enumerate(zip(reader.pages, labels)):
            size = geometry['coverCanvas' if index == 0 else 'interiorCanvas']
            assert abs(float(page.mediabox.width) - size['w'] * 72 / 25.4) < .0001
            assert abs(float(page.mediabox.height) - size['h'] * 72 / 25.4) < .0001
            verify_page_drawing(page, size, label is not None)
            if label is None:
                assert len(page.images) == 0
                pages.append({'pdfPage': index + 1, 'label': 'padding', 'noImages': True, 'canonicalBlankDrawing': True})
                continue
            raster, = [r for r in renders['pages'] if r['role'] == child['role'] and r['label'] == label]
            source, = [item for item in child['files'] if item['label'] == label]
            assert (raster['width'], raster['height']) == (source['width'], source['height']), 'Raster/proof dimensions differ'
            assert raster['file'] == f"{child['role']}/{label}.png"
            raster_path = checked(rasters, raster['file'], raster['sha256'])
            assert len(page.images) == 1
            decoded = page.images[0].image.convert('RGB')
            with Image.open(raster_path) as image:
                expected = image.convert('RGB')
                assert expected.size == (raster['width'], raster['height'])
                assert decoded.size == expected.size
                assert decoded.tobytes() == expected.tobytes(), (child['role'], label)
            pages.append({'pdfPage': index + 1, 'label': label,
                          'canonicalFullPageDrawing': True, 'exactDecodedRgbMatch': True})
        checked(pdfs, receipt['pdfFile'], receipt['pdfSha256'])
        results.append({'role': child['role'], 'pdfFile': receipt['pdfFile'],
                        'pdfSha256': receipt['pdfSha256'], 'pages': pages})
        print(child['role'], '35 positions, geometry, metadata, order and exact RGB verified', flush=True)
    assert validate(proof)[1] == manifest_hash
    assert owned(rasters, 'render-results.json').read_bytes() == render_bytes
    assert owned(pdfs, 'review-receipts.json').read_bytes() == receipt_bytes
    return {'schema': 'lhb.local-custom-flow-review-verification@v1',
            'status': 'local provisional PDF verification', 'approved': False, 'printReady': False,
            'proofManifestSha256': manifest_hash, 'renderManifestSha256': sha(render_bytes),
            'assemblyReceiptSha256': sha(receipt_bytes), 'cases': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('proof', 'rasters', 'pdfs', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(args.output)
    script_hash = sha(Path(__file__).read_bytes())
    result = verify(args.proof, args.rasters, args.pdfs)
    assert sha(Path(__file__).read_bytes()) == script_hash
    result['verifierSha256'] = script_hash
    with args.output.open('x') as output:
        output.write(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
