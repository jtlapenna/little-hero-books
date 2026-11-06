"""Resolve and check fresh external destinations without creating parents."""
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import subprocess

RESOLVER = '/Users/jeff/.local/bin/agent-artifact-root'


def resolve_root():
    result = subprocess.run([RESOLVER, '--project', 'little-hero-books'],
                            capture_output=True, text=True, check=True, timeout=30)
    value = result.stdout.strip()
    root = Path(value)
    if not value or '\n' in value or '\r' in value or not root.is_absolute():
        raise ValueError('Invalid external artifact root')
    if not root.is_dir() or root.resolve(strict=True) != root:
        raise ValueError('External artifact root must be canonical')
    return root


@dataclass(frozen=True)
class OutputBinding:
    root: Path
    output: Path
    device: int
    inode: int

    def receipt(self):
        return {'project': 'little-hero-books', 'artifactRoot': str(self.root),
                'output': str(self.output), 'device': self.device, 'inode': self.inode,
                'resolver': RESOLVER}


def fresh_output(requested):
    root = resolve_root()
    requested = Path(requested)
    if not requested.is_absolute():
        raise ValueError('Supply an explicit absolute external output')
    output = Path(os.path.abspath(requested))
    if output == root or not output.is_relative_to(root):
        raise ValueError('Output must be below approved external project root')
    parent = output.parent
    if not parent.is_dir() or parent.resolve(strict=True) != parent:
        raise ValueError('Output parent must exist without symlinks')
    identity = root.stat()
    if parent.stat().st_dev != identity.st_dev:
        raise ValueError('Output parent is on another filesystem')
    if os.path.lexists(output):
        raise FileExistsError(output)
    return OutputBinding(root, output, identity.st_dev, identity.st_ino)


def check_binding(binding, require_output=False):
    if resolve_root() != binding.root:
        raise ValueError('External artifact root changed')
    identity = binding.root.stat()
    if (identity.st_dev, identity.st_ino) != (binding.device, binding.inode):
        raise ValueError('External artifact root identity changed')
    parent = binding.output.parent
    if parent.resolve(strict=True) != parent or parent.stat().st_dev != binding.device:
        raise ValueError('Output parent changed')
    if os.path.lexists(binding.output):
        if binding.output.resolve(strict=True) != binding.output or binding.output.stat().st_dev != binding.device:
            raise ValueError('Output path identity changed')
    elif require_output:
        raise ValueError('Expected output is missing')


def source_hashes(paths):
    return {str(path): hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in paths}


def check_sources(expected):
    if source_hashes(expected) != expected:
        raise ValueError('Proof tool source changed during execution')
