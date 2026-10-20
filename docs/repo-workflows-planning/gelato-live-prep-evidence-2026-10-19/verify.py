"""Offline evidence/hash check; optional full PDF/source-pixel reproduction. No network."""
from pathlib import Path
import argparse,json,hashlib,io

def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--private-dir',type=Path);parser.add_argument('--pixels',action='store_true');a=parser.parse_args();base=Path(__file__).resolve().parent
 checks=json.loads((base/'manifest.json').read_text())
 for name,digest in checks.items():assert sha((base/name).read_bytes())==digest,'Evidence checksum: '+name
 frozen=json.loads((base/'frozen-fixtures.json').read_text());inspection=json.loads((base/'pdf-inspection.json').read_text());audit=json.loads((base/'workflow-and-controls.json').read_text())
 assert audit['workflowDefinitionGets']==29 and len(audit['versions'])==21 and audit['normalQueueHasNativePatch'] is False and audit['gelatoDefinitionsAllInactive'] is True
 assert audit['executionReads']==audit['orderReads']==audit['providerOrderReads']==audit['liveMutations']==0
 assert inspection['pdfs']==4 and inspection['pages']==140 and inspection['imageAssociations']==132 and inspection['visualReview']['completed'] is True
 assert len(frozen['records'])==len(set(c['sha256'] for c in frozen['records']))==4
 pages=0;images=0
 if a.private_dir:
  from pypdf import PdfReader
  if a.pixels:from PIL import Image
  raster=json.loads((a.private_dir/'rasters/rasters.json').read_text()) if a.pixels else None
  for c in frozen['records']:
   file=a.private_dir/'output/pdf'/c['filename'];assert sha(file.read_bytes())==c['sha256'];assert file.stat().st_mode&0o222==0
   doc=PdfReader(file);assert len(doc.pages)==35
   ri=next(x for x in inspection['results'] if x['role']==c['role']);assert ri['sha256']==c['sha256']
   if a.pixels:
    assets=next(x['assets'] for x in raster['caseChildren'] if x['role']==c['role']);sources=[next(x for x in assets if x['label']=='cover'),None]+[x for x in assets if x['label']!='cover']+[None]
   for i,page in enumerate(doc.pages):
    box=[float(v) for v in page.mediabox];assert all(abs(x-y)<.000002 for x,y in zip(box,ri['pages'][i]['mediaBox']))
    resources=page.get('/Resources');resources=resources.get_object() if resources else {};xobj=resources.get('/XObject');xobj=xobj.get_object() if xobj else {};assert len(xobj)==(0 if i in [1,34] else 1)
    if i in [1,34]:assert page.get_contents().get_data().strip()==b'q\nQ'
    elif a.pixels:
     source=sources[i];png=a.private_dir/'rasters'/source['filename'];assert sha(png.read_bytes())==source['pngSha256'];embedded=Image.open(io.BytesIO(list(page.images)[0].data)).convert('L');original=Image.open(png).convert('L');assert embedded.size==original.size and embedded.tobytes()==original.tobytes();assert sha(embedded.tobytes())==ri['pages'][i]['grayPixelsSha256'];images+=1
    pages+=1
 assert not a.pixels or a.private_dir,'--pixels requires --private-dir'
 print(json.dumps({'evidenceChecksums':'passed','localPdfPagesChecked':pages,'localSourcePixelsChecked':images,'liveRequests':0,'doesNotProveLiveWorkflowOrProviderProcessing':True}))
if __name__=='__main__':main()
