"""Disposable integrity probes; preserve current source and the full retained parent chain."""
from pathlib import Path
import copy, hashlib, json, shutil, subprocess, sys, tempfile
sys.dont_write_bytecode = True
E = Path(__file__).resolve().parent; ROOT = E.parents[2]; REL = E.relative_to(ROOT)
PARENT = 'docs/repo-workflows-planning/gelato-admission-settlement-evidence-2026-10-23'
sha = lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
subprocess.run([sys.executable,str(E/'verify.py'),'--source'],cwd=ROOT,check=True)
original=json.loads((E/'manifest.json').read_text())
# All fixture inputs are public source/evidence paths rooted by the current and historical manifests.
paths={v['path'] for v in original['files']} | {str(REL/'manifest.json')}
queue=[ROOT/PARENT/'manifest.json']+[ROOT/'docs/repo-workflows-planning'/n/'manifest.json' for n in ['gelato-local-launch-evidence-2026-10-21', 'gelato-incident-safeguards-evidence-2026-10-21', 'gelato-draft-approval-evidence-2026-10-22', 'gelato-auth-attestation-evidence-2026-10-22', 'controlled-pipeline-source-evidence-2026-10-22', 'controlled-character-handoff-evidence-2026-10-22', 'lhl-diagnostic-access-evidence-2026-10-23']]; seen=set()
while queue:
    p=queue.pop()
    if p in seen:continue
    seen.add(p); paths.add(str(p.relative_to(ROOT))); m=json.loads(p.read_text())
    for item in m.get('files',[]):
        relative=item.get('path',item.get('file'))
        if not isinstance(relative,str) or Path(relative).is_absolute() or '..' in Path(relative).parts:continue
        if (ROOT/relative).is_file():paths.add(relative)
        if relative.endswith('/manifest.json') and (ROOT/relative).is_file():queue.append(ROOT/relative)
        if relative.endswith('/verify.py') and (ROOT/relative).with_name('manifest.json').is_file():queue.append((ROOT/relative).with_name('manifest.json'))
cases=['changed-repair','changed-ancestor','changed-route','changed-new-regression','changed-inherited-adapter','changed-workflow','lost-prior-coverage','failed-suite','changed-output','nonzero-live','missing-worker-confirmation','unsafe-path','changed-parent','changed-overlay','renewed-authority']
results=[]
for case in cases:
    with tempfile.TemporaryDirectory(prefix='lhl-cron-source-overlay-') as temp:
        root=Path(temp).resolve()
        for relative in paths:
            p=ROOT/relative; assert p.is_file() and p==p.resolve()
            dest=root/relative; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(p,dest)
        overlay=root/REL; m=copy.deepcopy(original); parent=root/PARENT; pm=json.loads((parent/'manifest.json').read_text())
        def reseal_parent(path):
            next(v for v in pm['files'] if v['path']==str(path.relative_to(root)))['sha256']=sha(path)
        if case in ['changed-repair','changed-route','changed-new-regression','changed-inherited-adapter','changed-workflow']:
            target={'changed-repair':'back-end/scripts/helpers/gelato-setup-cleanup.ts','changed-route':'back-end/src/app/api/cron/amazon-orders/route.ts','changed-new-regression':'back-end/scripts/test-amazon-cron-auth-logging.ts','changed-inherited-adapter':'back-end/scripts/helpers/gelato-protected-runner-adapter.ts','changed-workflow':'.github/workflows/check-gelato-local-launch.yml'}[case]
            p=root/target;p.write_text(p.read_text()+'\n# SYNTHETIC CORRUPTION\n');expected='Hash mismatch: '+target
        elif case=='lost-prior-coverage':
            m['files']=[v for v in m['files'] if v['path']!='back-end/src/lib/books/gelato-api-client.ts'];expected='Lost or unexpected source coverage'
        elif case=='changed-output':
            p=parent/'outputs/processes.txt';p.write_text('Synthetic changed output\n');expected='Hash mismatch: '+str(p.relative_to(root))
        elif case=='unsafe-path':
            m['files'].append({'path':'/etc/passwd','kind':'source','sha256':'0'*64});m['files'].sort(key=lambda v:v['path']);expected='Unsafe path'
        elif case=='changed-ancestor':
            relative='docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/manifest.json';p=root/relative;p.write_text(p.read_text()+'\n');expected='Hash mismatch: '+relative
        elif case=='changed-parent':
            p=parent/'manifest.json';p.write_text(p.read_text()+'\n');expected='Hash mismatch: '+str(p.relative_to(root))
        elif case=='changed-overlay':
            p=overlay/'README.md';p.write_text(p.read_text()+'\nSynthetic corruption\n');expected='Hash mismatch: '+str(p.relative_to(root))
        elif case=='renewed-authority':m['canExecute']=True;expected='Unexpected execution authority'
        else:
            p=parent/'checks.json';c=json.loads(p.read_text())
            if case=='failed-suite':c['suites'][0]['exitCode']=1;expected='Failed suite: database'
            elif case=='nonzero-live':c['liveOrderWrites']=1;expected='Unexpected live effect: liveOrderWrites'
            else:
                suite=next(v for v in c['suites'] if v['name']=='processes');log=parent/suite['log'];lines=log.read_text().splitlines();summary=json.loads(lines[-1]);row=next(v for v in summary['cleanupAccounting'] if v['mode']=='lost-ack');row.update(workerKind='failed',workerBytes=0);lines[-1]=json.dumps(summary);log.write_text('\n'.join(lines)+'\n');suite['summary']=summary;suite['logSha256']=sha(log);reseal_parent(log);expected='Missing confirmed cleanup'
            p.write_text(json.dumps(c));reseal_parent(p)
            (parent/'manifest.json').write_text(json.dumps(pm))
            parent_sha=sha(parent/'manifest.json');m['parentManifestSha256']=parent_sha
            next(v for v in m['files'] if v['path']==PARENT+'/manifest.json')['sha256']=parent_sha
        (overlay/'manifest.json').write_text(json.dumps(m))
        r=subprocess.run([sys.executable,str(overlay/'verify.py'),'--source'],cwd=root,capture_output=True,text=True,timeout=30)
        assert r.returncode!=0 and expected in r.stderr,(case,r.stdout,r.stderr)
        results.append({'case':case,'rejected':True})
print(json.dumps({'checks':len(results),'cases':results,'externalRequests':0,'businessSuiteExecutions':0,'retainedEvidenceMutations':0,'scope':'Disposable public source/evidence copies only'}))
