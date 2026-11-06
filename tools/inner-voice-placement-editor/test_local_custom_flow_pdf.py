import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('local_custom_flow_pdf', Path(__file__).with_name('local_custom_flow_pdf.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class LocalProofValidation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.asset = self.write('assets/asset.png', b'asset')
        config = {'formats': {'standard': {'interior': {'pageSequence':[{'label':'p00'}]}}}, 'rendering': {'preview': {'coverPx':{'w':20, 'h':10}, 'interiorPx':{'w':10, 'h':10}}}}
        config_hash = self.write('flow-config.json', json.dumps(config).encode())
        flow_hash = self.write('flow-export-manifest.json', b'{}')
        map_hash = self.write('source-asset-map.json', b'{}')
        ledger_hash = self.write('source-pose-ledger.json', b'{}')
        record_hash = self.write('CHILD/prepared-record.json', b'{}')
        w0_hash = self.write('CHILD/w0.json', b'{}')
        two_b_hash = self.write('CHILD/retained-2b.json', json.dumps({'characterHash':'hash-child','order':{'orderId':'order1'},'entries':[]}).encode())
        cover = self.write('CHILD/cover.html', b'cover')
        page = self.write('CHILD/p00.html', b'page')
        self.manifest = {'schema':'lhb.custom-flow-local-proof@v1', 'approved':False, 'printReady':False, 'configSha256':config_hash, 'flowManifestSha256':flow_hash,
            'assetMapSha256':map_hash, 'poseLedgerSha256':ledger_hash, 'recordSha256':{'CHILD':record_hash}, 'assets':{'key':{'file':'assets/asset.png','sha256':self.asset}},
            'cases':[{'role':'CHILD', 'orderId':'order1', 'characterHash':'hash-child', 'selection':{'formatId':'standard'}, 'w0Sha256':w0_hash, 'twoBSha256':two_b_hash,
                'files':[{'label':'cover', 'file':'CHILD/cover.html', 'sha256':cover, 'width':20, 'height':10}, {'label':'p00', 'file':'CHILD/p00.html', 'sha256':page, 'width':10, 'height':10}]}]}
        self.save()

    def write(self, name, data):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return digest(data)

    def save(self):
        self.write('proof-manifest.json', json.dumps(self.manifest).encode())

    def test_validates_then_rejects_mutation(self):
        module.validate(self.root)
        (self.root/'assets/asset.png').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'Hash mismatch'):
            module.validate(self.root)

    def test_order_and_ownership(self):
        self.manifest['cases'][0]['files'].reverse(); self.save()
        with self.assertRaisesRegex(ValueError, 'Wrong page order'):
            module.validate(self.root)
        self.manifest['cases'][0]['files'].reverse()
        self.manifest['cases'][0]['files'][1]['file'] = 'OTHER/p00.html'; self.save()
        with self.assertRaisesRegex(ValueError, 'Wrong page ownership'):
            module.validate(self.root)

    def test_rejects_child_path_and_dimensions(self):
        self.manifest['cases'][0]['role'] = '../CHILD'; self.save()
        with self.assertRaisesRegex(ValueError, 'child identity'):
            module.validate(self.root)
        self.manifest['cases'][0]['role'] = 'CHILD'
        self.manifest['cases'][0]['files'][1]['width'] = 11; self.save()
        with self.assertRaisesRegex(ValueError, 'Wrong page dimensions'):
            module.validate(self.root)

    def test_rejects_another_child_pose_even_with_valid_html_hash(self):
        key = 'book/order-generated-assets/characters/other/pose.png'
        pose_hash = self.write('assets/other.png', b'other-child-pose')
        self.manifest['assets'][key] = {'file':'assets/other.png','sha256':pose_hash}
        other = {'role':'OTHER','orderId':'order2','characterHash':'hash-other','selection':{'formatId':'standard'}}
        self.manifest['recordSha256']['OTHER'] = self.write('OTHER/prepared-record.json', b'{}')
        other['w0Sha256'] = self.write('OTHER/w0.json', b'{}')
        other['twoBSha256'] = self.write('OTHER/retained-2b.json', json.dumps({'characterHash':'hash-other','order':{'orderId':'order2'},'entries':[{'bgRemovedKey':key}]}).encode())
        other['files'] = [{'label':'cover','file':'OTHER/cover.html','sha256':self.write('OTHER/cover.html',b'cover'),'width':20,'height':10},
                          {'label':'p00','file':'OTHER/p00.html','sha256':self.write('OTHER/p00.html',b'page'),'width':10,'height':10}]
        self.manifest['cases'].append(other)
        self.save(); module.validate(self.root)
        swapped = f'<img src="{(self.root / "assets/other.png").as_uri()}">'.encode()
        self.manifest['cases'][0]['files'][1]['sha256'] = self.write('CHILD/p00.html', swapped)
        self.save()
        with self.assertRaisesRegex(ValueError, 'Unowned HTML asset'):
            module.validate(self.root)

    def test_existing_output_is_never_overwritten(self):
        target = self.root/'existing'; target.mkdir(); (target/'keep').write_text('keep')
        with self.assertRaises(FileExistsError):
            module.render(self.root, target)
        self.assertEqual((target/'keep').read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
