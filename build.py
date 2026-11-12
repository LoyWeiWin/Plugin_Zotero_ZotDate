#!/usr/bin/env python3
"""Build an XPI with the manifest at the archive root; no external dependencies."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
VERSION = json.loads((ROOT / "src/manifest.json").read_text())["version"]
OUTPUT = ROOT / "dist" / f"ZotDate_v{VERSION}.xpi"
OUTPUT.parent.mkdir(exist_ok=True)
with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
    for path in sorted((ROOT / "src").rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(ROOT / "src").as_posix())
print(OUTPUT)
