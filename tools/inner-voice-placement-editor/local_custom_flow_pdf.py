#!/usr/bin/env python3
"""Render a frozen local proof to PNGs for a separate local review PDF fixture.

This does not run order intake, W2, hosted W3, or a production W4 job. It does
not approve the draft or produce a print-ready document. Its output is local.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.parse import unquote, urlparse


def sha(data):
    return hashlib.sha256(data).hexdigest()


def owned(root, name):
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError(f'Invalid relative path: {name!r}')
    path = (root / name).resolve(strict=True)
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f'Path outside proof: {name}')
    return path


def checked(root, name, digest):
    path = owned(root, name)
    data = path.read_bytes()
    if sha(data) != digest:
        raise ValueError(f'Hash mismatch: {name}')
    return path


def validate(root):
    root = Path(root).resolve(strict=True)
    manifest_bytes = (root / 'proof-manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get('schema') != 'lhb.custom-flow-local-proof@v1' or manifest.get('approved') is not False or manifest.get('printReady') is not False:
        raise ValueError('Expected unapproved local proof')
    for name, key in [('flow-config.json','configSha256'), ('flow-export-manifest.json','flowManifestSha256'), ('source-asset-map.json','assetMapSha256'), ('source-pose-ledger.json','poseLedgerSha256')]:
        checked(root, name, manifest[key])
    config = json.loads((root / 'flow-config.json').read_bytes())
    assets = {key: checked(root, value['file'], value['sha256']) for key, value in manifest['assets'].items()}
    all_pose_paths = set()
    poses_by_role = {}
    pose_keys = set()
    for case in manifest['cases']:
        role = case['role']
        if not isinstance(role, str) or not re.fullmatch(r'[A-Za-z0-9-]+', role) or role in poses_by_role:
            raise ValueError('Duplicate or invalid child identity')
        two_b = json.loads(checked(root, f'{role}/retained-2b.json', case['twoBSha256']).read_bytes())
        if two_b['characterHash'] != case['characterHash'] or two_b['order']['orderId'] != case['orderId']:
            raise ValueError(f'Pose ownership mismatch: {role}')
        owned_poses = set()
        for entry in two_b['entries']:
            key = entry['bgRemovedKey']
            if key in pose_keys or key not in assets:
                raise ValueError(f'Unowned or duplicate pose key: {role}')
            pose_keys.add(key)
            asset = assets[key]
            if asset in all_pose_paths:
                raise ValueError(f'Pose file shared between children or poses: {role}')
            all_pose_paths.add(asset); owned_poses.add(asset)
        poses_by_role[role] = owned_poses
    for key in assets:
        if '/order-generated-assets/characters/' in key and key not in pose_keys:
            raise ValueError(f'Unbound character asset: {key}')
    static_assets = set(assets.values()) - all_pose_paths
    allowed_by_role = {role: static_assets | poses for role, poses in poses_by_role.items()}
    roles = set()
    orders = set()
    for case in manifest['cases']:
        role = case['role']
        if not isinstance(role, str) or not re.fullmatch(r'[A-Za-z0-9-]+', role) or role in roles or case['orderId'] in orders:
            raise ValueError('Duplicate or empty child identity')
        roles.add(role); orders.add(case['orderId'])
        checked(root, f'{role}/prepared-record.json', manifest['recordSha256'][role])
        checked(root, f'{role}/w0.json', case['w0Sha256'])
        checked(root, f'{role}/retained-2b.json', case['twoBSha256'])
        fmt = config['formats'][case['selection']['formatId']]
        labels = ['cover'] + [item['label'] for item in fmt['interior']['pageSequence']]
        if [item['label'] for item in case['files']] != labels:
            raise ValueError(f'Wrong page order: {role}')
        for item in case['files']:
            if item['file'] != f"{role}/{item['label']}.html":
                raise ValueError(f'Wrong page ownership: {role}')
            expected = config['rendering']['preview']['coverPx' if item['label'] == 'cover' else 'interiorPx']
            if item['width'] != expected['w'] or item['height'] != expected['h']:
                raise ValueError(f'Wrong page dimensions: {role}/{item["label"]}')
            html = checked(root, item['file'], item['sha256']).read_text()
            for url in re.findall(r'''file://[^\s"'<>)]+''', html):
                parsed = urlparse(url)
                if parsed.netloc or Path(unquote(parsed.path)).resolve() not in allowed_by_role[role]:
                    raise ValueError(f'Unowned HTML asset: {role}/{item["label"]}')
    if not roles:
        raise ValueError('No cases')
    return manifest, sha(manifest_bytes), allowed_by_role


def render(proof, output):
    from PIL import Image
    from playwright.sync_api import sync_playwright
    proof = Path(proof).resolve(strict=True)
    manifest, manifest_hash, allowed_by_role = validate(proof)
    output = Path(output).absolute()
    output.mkdir(mode=0o700)  # Refuses any existing output.
    failures = []
    pages = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True, args=['--allow-file-access-from-files', '--disable-background-networking'])
            context = browser.new_context(device_scale_factor=1, service_workers='block')
            current = [None, set()]
            def route_request(route):
                url = route.request.url
                parsed = urlparse(url)
                if parsed.scheme == 'data':
                    route.continue_(); return
                if parsed.scheme == 'file' and not parsed.netloc:
                    path = Path(unquote(parsed.path)).resolve()
                    if path == current[0] or path in current[1]:
                        route.continue_(); return
                failures.append(url)
                route.abort()
            context.route('**/*', route_request)
            page = context.new_page()
            page.set_default_timeout(60000)
            for case in manifest['cases']:
                role = case['role']
                current[1] = allowed_by_role[role]
                (output / role).mkdir(mode=0o700)
                for item in case['files']:
                    html = checked(proof, item['file'], item['sha256'])
                    current[0] = html
                    page.set_viewport_size({'width':item['width'], 'height':item['height']})
                    page.goto(html.as_uri(), wait_until='load')
                    page.evaluate("document.fonts.load('16px LhbConfiguredBook')")
                    page.evaluate('document.fonts.ready')
                    page.evaluate('Promise.all(Array.from(document.images).map(image => image.decode()))')
                    if not page.evaluate("Array.from(document.fonts).some(f => f.family === 'LhbConfiguredBook' && f.status === 'loaded')") or not page.evaluate('Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)'):
                        raise ValueError(f'Missing font or image: {role}/{item["label"]}')
                    if failures:
                        raise ValueError(f'Forbidden resource request: {failures[0]}')
                    target = output / role / (item['label'] + '.png')
                    page.screenshot(path=str(target))
                    with Image.open(target) as image:
                        rgb = image.convert('RGB')
                        if rgb.size != (item['width'], item['height']):
                            raise ValueError('Unexpected raster dimensions')
                        rgb.save(target, optimize=False)
                    checked(proof, item['file'], item['sha256'])
                    pages.append({'role':role, 'label':item['label'], 'file':str(target.relative_to(output)), 'sha256':sha(target.read_bytes()), 'width':item['width'], 'height':item['height']})
            browser.close()
        # Detect assets changed while rendering, including ones served from cache.
        if validate(proof)[1] != manifest_hash:
            raise ValueError('Proof manifest changed during rendering')
        result = {'schema':'lhb.custom-flow-local-rasters@v1', 'proofManifestSha256':manifest_hash, 'approved':False, 'printReady':False, 'networkAttempts':failures, 'pages':pages}
        (output / 'render-results.json').write_text(json.dumps(result, indent=2) + '\n')
    except BaseException:
        shutil.rmtree(output)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proof', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    render(args.proof, args.output)


if __name__ == '__main__':
    main()
