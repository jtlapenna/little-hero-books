# /// script
# requires-python = ">=3.11"
# dependencies = ["pypdf==6.1.1", "pillow==12.0.0"]
# ///
"""Independent read-only preflight of a canonical PDF against its assembly receipt and frozen W4 geometry."""
import sys,json,hashlib,zlib,base64
from pathlib import Path
from pypdf import PdfReader
from PIL import Image
receipt=json.loads(Path(sys.argv[1]).read_text()); w4=json.loads(Path(sys.argv[2]).read_text())
pdf=Path(receipt['pdf']); reader=PdfReader(pdf,strict=True); sha=lambda b:hashlib.sha256(b).hexdigest(); mm=72/25.4
assert sha(pdf.read_bytes())==receipt['sha256']
assert not reader.is_encrypted and len(reader.pages)==35 and pdf.read_bytes()[:8]==b'%PDF-1.6'
assert '/ID' in reader.trailer
catalog=reader.trailer['/Root']; intent=catalog['/OutputIntents'][0].get_object()
assert intent['/S']=='/GTS_PDFX' and intent['/OutputConditionIdentifier']=='GRACoL2006_Coated1v2'
profiles=Path(__file__).resolve().parent.parent/'src/lib/books/print-profiles'
srgb=json.loads((profiles/'srgb.json').read_text()); gracol=json.loads((profiles/'gracol.json').read_text())
assert sha(intent['/DestOutputProfile'].get_data())==gracol['sha256']
assert intent['/DestOutputProfile']['/N']==4
metadata=catalog['/Metadata'].get_data(); assert b'PDF/X-4' in metadata and b'Little Hero Labs' in metadata
assert str(reader.metadata.get('/Trapped'))=='/False'
sources=receipt['sources']; assert len(sources)==33
geometry=w4['providerPrintConfig']['printGeometryMm']; image_count=0; ppi=[]
for index,page in enumerate(reader.pages):
 size=geometry['coverCanvas'] if index==0 else geometry['interiorCanvas']; width,height=size['w']*mm,size['h']*mm; bleed=geometry['bleed']*mm
 for got,expected in [(page.mediabox,[0,0,width,height]),(page.bleedbox,[0,0,width,height]),(page.trimbox,[bleed,bleed,width-bleed,height-bleed])]:
  assert all(abs(float(a)-b)<0.00001 for a,b in zip(got,expected)),index
 assert '/Annots' not in page and '/AA' not in page and '/Font' not in page['/Resources']
 images=[v.get_object() for v in page['/Resources'].get('/XObject',{}).values()]
 blank=index in (1,34); assert len(images)==(0 if blank else 1),index
 if blank: continue
 source=sources[image_count]; body=Path(source['file']).read_bytes(); assert sha(body)==source['sha256']
 image=images[0]; assert image['/Subtype']=='/Image' and image['/BitsPerComponent']==8 and image['/Filter']=='/FlateDecode' and '/SMask' not in image
 assert image['/ColorSpace'][0]=='/ICCBased' and sha(image['/ColorSpace'][1].get_object().get_data())==srgb['sha256']
 assert image['/ColorSpace'][1].get_object()['/N']==3
 # Compare original PNG IDAT octets with the encoded PDF image stream.
 offset=8; idat=[]
 while offset<len(body):
  length=int.from_bytes(body[offset:offset+4],'big'); kind=body[offset+4:offset+8]
  if kind==b'IDAT': idat.append(body[offset+8:offset+8+length])
  offset+=length+12
 assert b''.join(idat)==image._data,source['label']
 expected=Image.open(source['file']).convert('RGB'); decoded=page.images[0].image.convert('RGB')
 assert expected.size==decoded.size and expected.tobytes()==decoded.tobytes(),source['label']
 ppi.extend([expected.width/size['w']*25.4,expected.height/size['h']*25.4]);image_count+=1
assert image_count==33 and min(ppi)>=300
print(json.dumps(dict(passed=True,pdfSha256=receipt['sha256'],pages=35,blankPdfPages=[2,35],exactSourceImages=33,unchangedCompressedStreams=33,minDpi=round(min(ppi),3),sourceProfileSha256=srgb['sha256'],outputProfileSha256=gracol['sha256'],configuredTrimBleed=True,pdfXIndependentCertification=False,providerCalls=0)))
