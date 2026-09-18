"""Regenerate Chrome icons from the shipping Desktop logo. Requires Pillow."""
from hashlib import sha256
from json import dumps
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root.parents[1] / "desktop" / "resources" / "icon.png"
manifest = {"source": "desktop/resources/icon.png", "sha256": sha256(source.read_bytes()).hexdigest(), "icons": {}}
with Image.open(source) as original:
    for size in (16, 32, 48, 128):
        name = f"icon{size}.png"
        target = root / "assets" / name
        original.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
        manifest["icons"][name] = sha256(target.read_bytes()).hexdigest()
(root / "scripts" / "icon-source.json").write_text(dumps(manifest, indent=2) + "\n", encoding="utf-8")
