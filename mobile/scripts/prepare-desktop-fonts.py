"""Build offline Android weights from the official Google Fonts variable files.

Inputs: mobile/.tools/fonts/{bricolage,hanken}.ttf and their *-OFL.txt files.
Requires fontTools; no network or package installation occurs in this script.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import hashlib
import json
import shutil

mobile = Path(__file__).resolve().parents[1]
resources = mobile / "android/app/src/main/res/font"
licenses = mobile / "android/app/src/main/assets/licenses"
resources.mkdir(parents=True, exist_ok=True)
sources = []
for family, directory, filename in [
    ("bricolage", "bricolagegrotesque", "BricolageGrotesque[opsz,wdth,wght].ttf"),
    ("hanken", "hankengrotesk", "HankenGrotesk[wght].ttf"),
]:
    source = mobile / f".tools/fonts/{family}.ttf"
    for weight in [400, 500, 600, 700]:
        font = TTFont(source)
        axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        axes["wght"] = weight
        if "opsz" in axes:
            axes["opsz"] = 14
        instance = instantiateVariableFont(font, axes, inplace=True)
        instance.save(resources / f"{family}_{weight}.ttf")
        instance.close()
    shutil.copyfile(mobile / f".tools/fonts/{family}-OFL.txt", licenses / f"{family}-OFL.txt")
    sources.append({"family": family, "url": f"https://github.com/google/fonts/tree/main/ofl/{directory}",
                    "file": filename, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                    "weights": [400, 500, 600, 700], "opticalSize": 14 if family == "bricolage" else None})
(licenses / "font-sources.json").write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
print("Eight offline font weights prepared.")
