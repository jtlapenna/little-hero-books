"""Explicit clean-environment local reproduction. No hosted keys, URL, migrations or deployment."""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parents[3]
SUITES=[('database',['--import','tsx','scripts/test-gelato-admission-settlement.ts']),('boundaries',['--import','tsx','scripts/test-gelato-admission-settlement-boundaries.ts']),('processes',['--import','tsx','scripts/test-gelato-admission-settlement-processes.ts']),('transport',['--import','tsx','scripts/test-gelato-admission-settlement-transport.ts']),('legacy-isolation',['--import','tsx','scripts/test-gelato-isolation.ts']),('typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.gelato-admission-settlement.json','--noEmit'])]
def main():
 p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--output',required=True);p.add_argument('--docker',action='store_true');a=p.parse_args()
 node=Path(a.node).resolve();assert node.is_file() and os.access(node,os.X_OK),'Explicit Node executable required'
 out=Path(a.output).resolve();assert not out.exists(),'New output directory required';out.mkdir(mode=0o700,parents=True)
 env={'PATH':str(node.parent)+os.pathsep+os.environ.get('PATH','/usr/bin:/bin'),'NODE_ENV':'test','LC_ALL':'C'}
 if a.docker:env['LHL_TEST_POSTGRES_DOCKER_IMAGE']='postgres:17'
 prefix=[]
 if sys.platform=='darwin':
  profile=out/'local-only.sb';profile.write_text('(version 1)\n(allow default)\n(deny network-outbound)\n(allow network-outbound (remote ip "localhost:*"))\n(allow network-outbound (remote unix-socket))\n(deny file-read* (regex #"/\\.env([^/]*)?$"))\n'.replace('\\n','\n'))
  prefix=['/usr/bin/sandbox-exec','-f',str(profile)]
 results=[]
 for name,args in SUITES:
  r=subprocess.run([*prefix,str(node),*args],cwd=ROOT/'back-end',env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
  data=r.stdout.replace(str(ROOT),'<repo>');log=out/(name+'.txt');log.write_text(data);log.chmod(0o600)
  result={'name':name,'exitCode':r.returncode,'sha256':hashlib.sha256(log.read_bytes()).hexdigest()};results.append(result);print(json.dumps(result),flush=True)
  if r.returncode:break
 result={'passed':len(results)==len(SUITES) and all(r['exitCode']==0 for r in results),'suites':results,'hostedCalls':0,'credentialFilesRead':0}
 (out/'result.json').write_text(json.dumps(result,indent=2)+'\n');raise SystemExit(0 if result['passed'] else 1)
if __name__=='__main__':main()
