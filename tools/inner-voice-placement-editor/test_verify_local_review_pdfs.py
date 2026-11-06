"""Exercise the successor against retained canonical PDFs and altered pages."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject, NumberObject, RectangleObject

from verify_local_review_pdfs import sha, verify, verify_page_drawing


ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'output/inner-voice-heart-and-flow-proof-2026-10-29'
RASTERS = ROOT / 'output/inner-voice-heart-and-flow-rasters-2026-10-29-r2'
PDFS = ROOT / 'output/inner-voice-heart-and-flow-review-pdfs-2026-10-29'


class LocalReviewVerificationTests(unittest.TestCase):
    def setUp(self):
        self.reader = PdfReader(PDFS / 'WEB-A-PROVISIONAL-LOCAL-REVIEW.pdf')
        config = json.loads((PROOF / 'flow-config.json').read_text())
        self.geometry = config['formats']['standard']['print']['printGeometryMm']

    def check_cover(self):
        verify_page_drawing(self.reader.pages[0], self.geometry['coverCanvas'], True)

    def replace_content(self, page, data):
        stream = DecodedStreamObject()
        stream.set_data(data)
        page[NameObject('/Contents')] = stream

    def reject_assembled_mutation(self, index, data, message):
        # Keep canonical page count, metadata and image resources. Bind the changed
        # PDF hash so rejection must come from drawing checks, not a stale receipt.
        writer = PdfWriter()
        writer.clone_document_from_reader(self.reader)
        self.replace_content(writer.pages[index], data)
        receipt = json.loads((PDFS / 'review-receipts.json').read_text())
        child, = [item for item in receipt['receipts'] if item['role'] == 'WEB-A']
        with tempfile.TemporaryDirectory(prefix='lhb-verifier-negative-') as directory:
            root = Path(directory)
            target = root / child['pdfFile']
            with target.open('xb') as output:
                writer.write(output)
            child['pdfSha256'] = sha(target.read_bytes())
            (root / 'review-receipts.json').write_text(json.dumps(receipt))
            with self.assertRaisesRegex(AssertionError, message):
                verify(PROOF, RASTERS, root)

    def test_retained_four_book_chain(self):
        result = verify(PROOF, RASTERS, PDFS)
        self.assertEqual(len(result['cases']), 4)
        self.assertFalse(result['approved'])
        self.assertFalse(result['printReady'])

    def test_canonical_cover_interior_and_padding(self):
        self.check_cover()
        verify_page_drawing(self.reader.pages[1], self.geometry['interiorCanvas'], False)
        verify_page_drawing(self.reader.pages[2], self.geometry['interiorCanvas'], True)

    def reject_receipt_change(self, change, message):
        receipt = json.loads((PDFS / 'review-receipts.json').read_text())
        change(receipt)
        with tempfile.TemporaryDirectory(prefix='lhb-verifier-receipt-') as directory:
            root = Path(directory)
            (root / 'review-receipts.json').write_text(json.dumps(receipt))
            with self.assertRaisesRegex(AssertionError, message):
                verify(PROOF, RASTERS, root)

    def test_changed_proof_binding_rejects(self):
        self.reject_receipt_change(lambda receipt: receipt.update(proofManifestSha256='0' * 64),
                                   'Proof manifest binding differs')

    def test_missing_child_rejects(self):
        self.reject_receipt_change(lambda receipt: receipt['receipts'].pop(), 'Unexpected PDF child roster')

    def test_wrong_raster_dimensions_reject_before_image_loading(self):
        receipt = json.loads((PDFS / 'review-receipts.json').read_text())
        renders = json.loads((RASTERS / 'render-results.json').read_text())
        cover, = [item for item in renders['pages'] if item['role'] == 'WEB-A' and item['label'] == 'cover']
        cover['width'] += 1
        with tempfile.TemporaryDirectory(prefix='lhb-verifier-dimensions-') as directory:
            root = Path(directory)
            render_bytes = json.dumps(renders).encode()
            (root / 'render-results.json').write_bytes(render_bytes)
            receipt['rasterManifestSha256'] = sha(render_bytes)
            (root / 'review-receipts.json').write_text(json.dumps(receipt))
            # Copy only the first reached PDF into this disposable owned root.
            original_pdf = PDFS / 'WEB-A-PROVISIONAL-LOCAL-REVIEW.pdf'
            with original_pdf.open('rb') as source, (root / original_pdf.name).open('xb') as target:
                shutil.copyfileobj(source, target)
            with self.assertRaisesRegex(AssertionError, 'Raster/proof dimensions differ'):
                verify(PROOF, root, root)

    def test_unused_image_resource_cannot_pass_as_drawn_page(self):
        page = self.reader.pages[0]
        self.replace_content(page, page.get_contents().get_data().replace(b'/Im1 Do', b''))
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_shrunken_image_transform_rejects(self):
        page = self.reader.pages[0]
        self.replace_content(page, b'q\n1 0 0 1 0 0 cm\n/Im1 Do\nQ\n')
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_crop_rejects(self):
        self.reader.pages[0][NameObject('/CropBox')] = RectangleObject([0, 0, 100, 100])
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_nonzero_media_origin_rejects(self):
        page = self.reader.pages[0]
        page[NameObject('/MediaBox')] = RectangleObject([10, 10, float(page.mediabox.width) + 10,
                                                        float(page.mediabox.height) + 10])
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_rotation_rejects(self):
        self.reader.pages[0][NameObject('/Rotate')] = NumberObject(90)
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_user_unit_rejects(self):
        self.reader.pages[0][NameObject('/UserUnit')] = NumberObject(2)
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_extra_paint_rejects(self):
        page = self.reader.pages[0]
        self.replace_content(page, page.get_contents().get_data() + b'0 0 10 10 re f\n')
        with self.assertRaises(AssertionError):
            self.check_cover()

    def test_painted_padding_rejects(self):
        page = self.reader.pages[1]
        self.replace_content(page, b'q\n0 0 10 10 re f\nQ\n')
        with self.assertRaises(AssertionError):
            verify_page_drawing(page, self.geometry['interiorCanvas'], False)

    def test_complete_verifier_rejects_missing_draw_with_fresh_pdf_hash(self):
        data = self.reader.pages[0].get_contents().get_data().replace(b'/Im1 Do', b'')
        self.reject_assembled_mutation(0, data, 'Noncanonical page drawing operators')

    def test_complete_verifier_rejects_wrong_transform_with_fresh_pdf_hash(self):
        self.reject_assembled_mutation(0, b'q\n1 0 0 1 0 0 cm\n/Im1 Do\nQ\n',
                                       'Wrong full-page image transform')

    def test_complete_verifier_rejects_painted_padding_with_fresh_pdf_hash(self):
        self.reject_assembled_mutation(1, b'q\n0 0 10 10 re f\nQ\n',
                                       'Noncanonical page drawing operators')


if __name__ == '__main__':
    unittest.main()
