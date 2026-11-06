/** Opt-in integration fixture. Old rasters are used only to exercise assembly; not a current book proof. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assemble } from './assemble-inner-voice-custom-flow-review';
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
async function main() {
  const project = path.resolve(__dirname, '../..');
  const source = path.join(project, 'output/inner-voice-custom-flow-proof-2026-10-28-r7');
  const priorRasters = path.join(project, 'output/inner-voice-workflow-e2e-2026-10-27/local-editor-aligned-cases/WEB-A/raster');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lhb-pdf-positive-'));
  try {
    const proof = path.join(root,'proof'), raster = path.join(root,'raster'), out = path.join(root,'out');
    await fs.mkdir(path.join(proof,'WEB-A'),{recursive:true}); await fs.mkdir(path.join(proof,'assets')); await fs.mkdir(path.join(raster,'WEB-A'),{recursive:true});
    const manifest = JSON.parse(await fs.readFile(path.join(source,'proof-manifest.json'),'utf8'));
    const child = manifest.cases.find((c: any) => c.role === 'WEB-A'); assert.ok(child); manifest.cases = [child];
    const link = async (rel: string) => fs.link(path.join(source,rel),path.join(proof,rel));
    for (const file of ['flow-config.json','flow-export-manifest.json','source-asset-map.json','source-pose-ledger.json','WEB-A/w0.json','WEB-A/retained-2b.json','WEB-A/prepared-record.json',...child.files.map((p: any) => p.file)]) await link(file);
    for (const file of new Set<string>(Object.values(manifest.assets).map((a: any) => a.file))) await link(file);
    const manifestBytes = Buffer.from(JSON.stringify(manifest)); await fs.writeFile(path.join(proof,'proof-manifest.json'),manifestBytes);
    const pages = [];
    for (const item of child.files) {
      const rel = `WEB-A/${item.label}.png`, data = await fs.readFile(path.join(priorRasters,`${item.label}.png`));
      await fs.writeFile(path.join(raster,rel),data);
      pages.push({role:'WEB-A',label:item.label,file:rel,sha256:sha(data),width:item.width,height:item.height});
    }
    await fs.writeFile(path.join(raster,'render-results.json'),JSON.stringify({schema:'lhb.custom-flow-local-rasters@v1',approved:false,printReady:false,proofManifestSha256:sha(manifestBytes),networkAttempts:[],pages}));
    await assemble(proof,raster,out);
    const receipts = JSON.parse(await fs.readFile(path.join(out,'review-receipts.json'),'utf8'));
    assert.equal(receipts.receipts.length,1); assert.equal(receipts.receipts[0].normalW4DraftRefused,true);
    const file=path.join(out,receipts.receipts[0].pdfFile);
    const verification = spawnSync('python3',['-c',`from pypdf import PdfReader\nfrom PIL import Image\nimport sys,json\nr=PdfReader(sys.argv[1]); config=json.load(open(sys.argv[3])); p=config['formats']['standard']['print']['printGeometryMm']; assert len(r.pages)==35; assert r.metadata.title=='LOCAL PROVISIONAL REVIEW, NOT FOR PRINT'\nfor i,page in enumerate(r.pages):\n g=p['coverCanvas'] if i==0 else p['interiorCanvas']; assert abs(float(page.mediabox.width)-g['w']*72/25.4)<0.0001; assert abs(float(page.mediabox.height)-g['h']*72/25.4)<0.0001\n if i==0 or 2<=i<=33:\n  label='cover' if i==0 else 'p%02d'%(i-2); expected=Image.open(sys.argv[2]+'/'+label+'.png').convert('RGB'); image=page.images[0].image.convert('RGB'); assert image.size==expected.size and image.tobytes()==expected.tobytes(), label\n else: assert len(page.images)==0\nprint('35 pages, configured geometry, metadata, order, and exact RGB verified')`,file,priorRasters,path.join(proof,'flow-config.json')],{encoding:'utf8'});
    assert.equal(verification.status,0,verification.stderr); console.log(verification.stdout.trim());
  } finally { await fs.rm(root,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
