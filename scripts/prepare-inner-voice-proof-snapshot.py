#!/usr/bin/env python3
"""Freeze an existing render worktree and its approved local inputs for offline proof."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--retained-assets', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--name', default='Alexandra')
    args = parser.parse_args()
    source, out = args.source.resolve(), args.out.resolve()
    if not 1 <= len(args.name) <= 30:
        raise SystemExit('Proof name must contain 1 to 30 characters')
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    frozen = out / 'source'
    renderer = frozen / 'back-end'
    shutil.copytree(source / 'back-end/src', renderer / 'src')
    (renderer / 'node_modules').symlink_to(source / 'back-end/node_modules', target_is_directory=True)
    for name in ['tsconfig.json', 'package.json', 'package-lock.json']:
        shutil.copy2(source / 'back-end' / name, renderer / name)
    script_names = ['export-inner-voice-v2-local-proof.ts', 'create-inner-voice-w3-pdf-manifest.py', 'create-gelato-engineering-pdfs.ts']
    for name in script_names:
        target = renderer / 'scripts' / name
        target.parent.mkdir(exist_ok=True)
        shutil.copy2(source / 'back-end/scripts' / name, target)
    local_scripts = ['render-inner-voice-v2-local-proof.py', 'audit-inner-voice-v2-lettering-proof.py']
    for name in local_scripts:
        target = frozen / 'scripts' / name
        target.parent.mkdir(exist_ok=True)
        shutil.copy2(source / 'scripts' / name, target)
    planning = 'docs/new-planning/finding-our-inner-voice-30-page-expansion'
    doc_names = [planning + '/inner-voice-v2-upload-plan.json', 'docs/repo-workflows-planning/inner-voice-draft-asset-inventory.json']
    for name in doc_names:
        target = frozen / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / name, target)
    editor = frozen / 'tools/inner-voice-placement-editor'
    editor.mkdir(parents=True)
    for name in ['editor-data.json', 'asset-map.json', 'placements.json', 'lettering.json', 'lettering-data.json']:
        shutil.copy2(source / 'tools/inner-voice-placement-editor' / name, editor / name)
    seed = json.loads((editor / 'editor-data.json').read_text())
    assets = json.loads((editor / 'asset-map.json').read_text())
    config_path = renderer / 'src/lib/books/configs/book-finding-our-inner-voice/v2.json'
    config = json.loads(config_path.read_text())
    plan = json.loads((frozen / planning / 'inner-voice-v2-upload-plan.json').read_text())
    overrides = {}
    for entry in plan['entries']:
        path = source / entry['source']
        if sha(path) != entry['sha256']:
            raise SystemExit('Approved upload-plan source checksum mismatch: ' + entry['taskId'])
        overrides[entry['r2Key']] = str(path)
    # Guide-specific approved images take precedence over the editor's owl preview.
    for page in seed['pages']:
        slot = config['formats']['standard']['interior']['pageSequence'][page['page'] - 1]['backgroundSlot']
        if slot in config['assets'].get('guideBackgrounds', {}):
            continue
        key = config['assets']['backgrounds'][slot]
        path = str((source / 'tools/inner-voice-placement-editor' / assets[page['background']]).resolve())
        if key in overrides and overrides[key] != path:
            # Blank title/credits slots can share a key only when bytes agree.
            if sha(Path(overrides[key])) != sha(Path(path)):
                raise SystemExit('Conflicting shared background key: ' + key)
        overrides[key] = path
    override_path = out / 'asset-overrides.private.json'
    override_path.write_text(json.dumps(overrides, indent=2) + '\n')
    export = renderer / 'scripts/export-inner-voice-v2-local-proof.ts'
    original = export.read_text()
    anchor = "  const poseHash = 'synthetic-proof-hash';"
    if original.count(anchor) != 1:
        raise SystemExit('Exporter adapter anchor changed')
    # The derivative changes local byte resolution only. Frozen config identity stays intact.
    export.write_text(original.replace(anchor, "  for (const [key, value] of Object.entries(JSON.parse(readFileSync(process.env.INNER_VOICE_PROOF_ASSET_OVERRIDES!, 'utf8')) as Record<string,string>)) source.set(key, value);\n" + anchor))
    source_records = []
    for path in sorted(frozen.rglob('*')):
        if path.is_file() and 'node_modules' not in path.parts:
            relative = path.relative_to(frozen)
            origin = source / relative
            expected = hashlib.sha256(original.encode()).hexdigest() if path == export else sha(path)
            if not origin.is_file() or sha(origin) != expected:
                raise SystemExit('Source changed while copying: ' + str(relative))
            source_records.append({'path': str(relative), 'frozenSha256': sha(path), 'originalSha256': expected})
    import os
    deny = out / 'deny-network.cjs'
    deny.write_text("const deny = () => { throw new Error('Offline proof forbids network'); }; globalThis.fetch = deny; globalThis.WebSocket = deny; for (const name of ['http', 'https', 'net', 'tls', 'http2', 'dgram', 'dns']) { const module = require('node:' + name); for (const key of Object.keys(module)) if (/^(request|get|connect|createConnection|createSocket|lookup|resolve)/.test(key) && typeof module[key] === 'function') module[key] = deny; if (module.Socket) for (const key of ['connect','send']) if (module.Socket.prototype[key]) module.Socket.prototype[key] = deny; } require('node:module').syncBuiltinESMExports(); for (const probe of [() => new (require('node:net').Socket)().connect(443, 'example.invalid'), () => require('node:https').get('https://example.invalid'), () => require('node:dns').lookup('example.invalid')]) { try { probe(); throw new Error('Network deny probe unexpectedly succeeded'); } catch (error) { if (error.message !== 'Offline proof forbids network') throw error; } }\n")
    env = {key: os.environ[key] for key in ['PATH', 'LANG', 'TMPDIR'] if key in os.environ}
    env.update(NODE_OPTIONS='--require=' + str(deny),
               INNER_VOICE_RETAINED_ASSET_ROOT=str(args.retained_assets.resolve()),
               INNER_VOICE_PROOF_ASSET_OVERRIDES=str(override_path), INNER_VOICE_PROOF_CHILD_NAME=args.name)
    html_root = out / 'html'
    subprocess.run(['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)', 'node', '--import', 'tsx', str(export), str(html_root)], cwd=renderer, env=env, check=True)
    manifest = json.loads((html_root / 'manifest.json').read_text())
    input_paths = set()
    import re
    pattern = re.compile(r'file:///[^\s"\'<>]+')
    for item in manifest['pages'] + manifest['coverItems']:
        input_paths.update(Path(unquote(urlparse(url).path)) for url in pattern.findall(Path(item['htmlFile']).read_text()))
    asset_dir = out / 'assets'
    asset_dir.mkdir()
    mappings = {}
    asset_records = []
    for path in sorted(input_paths):
        digest = sha(path)
        target = asset_dir / (digest + path.suffix.lower())
        if not target.exists():
            shutil.copyfile(path, target)
        if sha(path) != digest or sha(target) != digest:
            raise SystemExit('Asset changed while copying: ' + str(path))
        mappings[path.as_uri()] = target.as_uri()
        asset_records.append({'source': str(path), 'sha256': digest, 'frozen': str(target), 'bytes': target.stat().st_size})
    for item in manifest['pages'] + manifest['coverItems']:
        path = Path(item['htmlFile'])
        html = path.read_text()
        for original_url, frozen_url in mappings.items():
            html = html.replace(original_url, frozen_url)
        path.write_text(html)
    for name in ['editor-data.json', 'asset-map.json', 'placements.json', 'lettering.json', 'lettering-data.json']:
        path = editor / name
        target = out / 'editor-inputs' / name
        target.parent.mkdir(exist_ok=True)
        shutil.copy2(path, target)
    html_records = [{'file': item['htmlFile'], 'sha256': sha(Path(item['htmlFile']))} for item in manifest['pages'] + manifest['coverItems']]
    ledger = {'preparerSha256': sha(Path(__file__)), 'htmlFiles': html_records, 'schema': 'lhb.cover-independent-source-freeze@v1', 'sourceWorktree': str(source),
              'sourceFiles': source_records, 'assets': asset_records, 'configRawSha256': sha(config_path),
              'sharedBackgroundOverrides': overrides, 'letteringRevision': json.loads((editor / 'lettering.json').read_text())['revision'],
              'htmlManifestSha256': sha(html_root / 'manifest.json'), 'poseInputs': manifest['poseInputs'],
              'limits': ['Existing mixed source worktree, not committed release runtime', 'Retained pose references, no new W2 output',
                         'Approved guide assets plus editor-selected shared backgrounds resolved locally', 'Cover is provisional, no print approval', 'Dependency lock is frozen; node_modules remains an external local symlink'],
              'liveRequests': 0}
    # Reject concurrent source edits rather than silently mixing source revisions.
    for record in source_records:
        origin = source / record['path']
        if record['originalSha256'] is not None and sha(origin) != record['originalSha256']:
            raise SystemExit('Source changed during freeze: ' + record['path'])
    (out / 'source-freeze.private.json').write_text(json.dumps(ledger, indent=2) + '\n')
    for path in out.rglob('*'):
        if not path.is_symlink():
            path.chmod(0o700 if path.is_dir() else 0o600)
    print(json.dumps({'pages': len(manifest['pages']), 'frozenAssets': len(asset_records), 'letteringRevision': ledger['letteringRevision'], 'liveRequests': 0}))


if __name__ == '__main__':
    main()
