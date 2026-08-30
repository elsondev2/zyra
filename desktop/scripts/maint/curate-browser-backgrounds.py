"""Explicit maintainer task for Zyra's bundled New Tab background pack.

Requires Python 3, requests, and Pillow. This is intentionally not part of normal
builds: every selected Commons file and its rights metadata must be reviewed
before changing the catalog below.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "src" / "renderer" / "src" / "assets" / "browser-backgrounds"
OUTPUT = TARGET.parent / ".browser-backgrounds-staging"
BACKUP = TARGET.parent / ".browser-backgrounds-backup"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "Zyra-background-curation/0.6 (https://github.com/justelson/zyra)"

CATEGORIES = {
    "forest-paths": "Forest Trails",
    "mountain-highs": "Peak Season",
    "ocean-moods": "Ocean Mood",
    "desert-dreams": "Desert Glow",
    "water-in-motion": "Water in Motion",
    "wildflower-party": "Flower Power",
    "animal-cameos": "Wild Encounters",
    "ice-aurora": "Polar Light",
    "earth-above": "Orbital Views",
}

SELECTIONS = {
    "forest-paths": [
        "File:Woodland path through a conifer forest - geograph.org.uk - 5928776.jpg",
        "File:Forest track in Leanachan Forest - geograph.org.uk - 5823312.jpg",
        "File:Woodland Path in Dunwich Forest - geograph.org.uk - 3744288.jpg",
        "File:Forest track on northern edge of Broxa Forest - geograph.org.uk - 4377779.jpg",
        "File:Forest track in Coire Ardrain - geograph.org.uk - 6082898.jpg",
    ],
    "mountain-highs": [
        "File:Landscape Arnisee-region.JPG",
        "File:Frosty Raftsundet landscape with Trolltindan in morning, 2012 October.JPG",
        "File:Mountain and tundra landscape in Ivvavik National Park, YT.jpg",
        "File:Castle Mountain.jpg",
        "File:Mountains in snow, Mountain lake, Chola Valley, Nepal, Himalayas.jpg",
    ],
    "ocean-moods": [
        "File:Dyrhólaey, Suðurland, Islandia, 2014-08-17, DD 140.jpg",
        "File:Komos site baie Crète.jpg",
        "File:Peterborough (AU), Port Campbell National Park, Worm Bay -- 2019 -- 0863.jpg",
        "File:Princetown (AU), Port Campbell National Park, Twelve Apostles -- 2019 -- 0930.jpg",
        "File:Waves at La Corniche.jpg",
    ],
    "desert-dreams": [
        "File:Utah Dunes Landscape - West Desert District.jpg",
        "File:Milky Way over dunes in Great Sand Dunes National Park, Colorado, United States.jpg",
        "File:Sossusvlei Dune Rippled cropped.jpg",
        "File:Vietnam, Mui Ne sand dunes, trees on the sand.jpg",
        "File:006 Dune 45 in Sossusvlei at sunrise Photo by Giles Laurent.jpg",
    ],
    "water-in-motion": [
        "File:Elakala Waterfalls Swirling Pool Mossy Rocks.jpg",
        "File:Klonglan waterfall 03.jpg",
        "File:Waterfall in Russian Gulch State Park.jpg",
        "File:Bhorley waterfall of Dolakha and Tamakoshi river as seen from above.jpg",
        "File:Skógafoss Waterfall, Iceland, 20240720 1318 2975.jpg",
    ],
    "wildflower-party": [
        "File:California Gold Field At Antelope Valley (8439055).jpg",
        "File:Haltern am See, Westruper Heide -- 2015 -- 7965-9.jpg",
        "File:Field of yellow flowers in Laurensberg (DSCF5908).jpg",
        "File:Custer-Gallatin National Forest, Emigrant Peak Trail, alpine wildflowers - Flickr - YellowstoneNPS.jpg",
        "File:2013-07-14 13 26 56 Alpine wildflowers near the summit of Wheeler Peak in Great Basin National Park.jpg",
    ],
    "animal-cameos": [
        "File:Red fox (Vulpes vulpes crucigera) Skalnate Pleso 2.jpg",
        "File:African bush elephants (Loxodonta africana) female with six-week-old baby.jpg",
        "File:European bee-eaters (Merops apiaster) with dragonflies.jpg",
        "File:Humpback Whale amidst icebergs (6296029124).jpg",
        "File:Whale Shark AdF.jpg",
    ],
    "ice-aurora": [
        "File:Aurora borealis over Eielson Air Force Base, Alaska.jpg",
        "File:The aurora borealis blankets the Earth (iss072e159516).jpg",
        "File:Aerial photography mountain glacier landscape with snow.jpg",
        "File:View of the glacier of Öræfajökull volcano in Hornafjörður municipality, Iceland, 20240719 1738 2793.jpg",
        "File:Towering Rows of Crevasses - Knik Glacier in Alaska.jpg",
    ],
    "earth-above": [
        "File:Earth's City Lights by DMSP, 1994-1995 (large).jpg",
        "File:Top of Atmosphere.jpg",
        "File:International Space Station star trails - JSC2012E039800.jpg",
        "File:Good Morning From the International Space Station.jpg",
        "File:Earth From the Perspective of Artemis II.jpg",
    ],
}

ALLOWED_LICENSE_PREFIXES = ("cc0", "cc by ", "cc by-sa ", "public domain")


def plain(value: object, limit: int = 500) -> str:
    if isinstance(value, dict):
        value = value.get("value", "")
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def first_link(value: object) -> str | None:
    raw = value.get("value", "") if isinstance(value, dict) else str(value or "")
    match = re.search(r'href=["\']([^"\']+)', raw, re.I)
    if not match:
        return None
    href = html.unescape(match.group(1))
    if href.startswith("//"):
        return "https:" + href
    if href.startswith("/"):
        return "https://commons.wikimedia.org" + href
    return href if href.startswith("https://") else None


def get_with_retry(session: requests.Session, url: str, **kwargs) -> requests.Response:
    for attempt in range(7):
        response = session.get(url, timeout=60, **kwargs)
        if response.status_code not in (429, 502, 503, 504):
            response.raise_for_status()
            return response
        time.sleep(2 ** attempt)
    response.raise_for_status()
    return response


def catalog_complete(directory: Path) -> bool:
    try:
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        assets = manifest.get("assets", [])
        return len(assets) == 45 and all(
            (directory / asset["file"]).is_file()
            and (directory / asset["thumbnail"]["file"]).is_file()
            for asset in assets
        )
    except Exception:
        return False


def main() -> None:
    if BACKUP.exists():
        if catalog_complete(TARGET):
            shutil.rmtree(BACKUP, ignore_errors=True)
        elif catalog_complete(BACKUP):
            shutil.rmtree(TARGET, ignore_errors=True)
            BACKUP.rename(TARGET)
        else:
            raise RuntimeError("Background catalog recovery found no complete live or backup pack; preserve both directories for manual review.")
    titles = [title for selected in SELECTIONS.values() for title in selected]
    if len(titles) != 45 or len(set(titles)) != 45:
        raise RuntimeError("The built-in catalog must contain 45 unique source files.")

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    response = get_with_retry(session, API, params={
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "titles": "|".join(titles),
        "prop": "imageinfo|revisions",
        "iiprop": "url|size|mime|sha1|extmetadata",
        "iiurlwidth": "1920",
        "rvprop": "ids",
    })
    pages = {page["title"]: page for page in response.json()["query"]["pages"]}
    missing = sorted(set(titles) - set(pages))
    if missing:
        raise RuntimeError(f"Missing Commons files: {missing}")

    shutil.rmtree(OUTPUT, ignore_errors=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "thumbs").mkdir(parents=True, exist_ok=True)

    retrieved_at = datetime.now(timezone.utc).isoformat()
    assets: list[dict] = []
    for category, selected in SELECTIONS.items():
        for slot, title in enumerate(selected, 1):
            page = pages[title]
            info = page["imageinfo"][0]
            metadata = info.get("extmetadata", {})
            license_name = plain(metadata.get("LicenseShortName"), 100)
            usage_terms = plain(metadata.get("UsageTerms"), 100)
            normalized_license = (license_name or usage_terms).lower()
            if not normalized_license.startswith(ALLOWED_LICENSE_PREFIXES):
                raise RuntimeError(f"Unapproved license for {title}: {license_name or usage_terms}")
            restrictions = plain(metadata.get("Restrictions"), 300)
            if restrictions:
                raise RuntimeError(f"Rights restrictions require manual review for {title}: {restrictions}")

            image_response = get_with_retry(session, info.get("thumburl") or info["url"])
            source_image = Image.open(BytesIO(image_response.content))
            image = ImageOps.exif_transpose(source_image).convert("RGB")
            if max(image.size) > 1600:
                scale = 1600 / max(image.size)
                image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
            output_name = f"{category}-{slot:02}.webp"
            output_path = OUTPUT / output_name
            image.save(output_path, "WEBP", quality=74, method=6)
            output_bytes = output_path.read_bytes()
            thumbnail = image.copy()
            if max(thumbnail.size) > 480:
                thumbnail_scale = 480 / max(thumbnail.size)
                thumbnail = thumbnail.resize((round(thumbnail.width * thumbnail_scale), round(thumbnail.height * thumbnail_scale)), Image.Resampling.LANCZOS)
            thumbnail_path = OUTPUT / "thumbs" / output_name
            thumbnail.save(thumbnail_path, "WEBP", quality=65, method=6)
            thumbnail_bytes = thumbnail_path.read_bytes()
            average = image.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
            dominant = "#%02x%02x%02x" % average
            luminance = (0.2126 * average[0] + 0.7152 * average[1] + 0.0722 * average[2]) / 255
            creator = plain(metadata.get("Artist"), 220) or "Unknown creator"
            work_title = title.removeprefix("File:").rsplit(".", 1)[0]
            license_url = plain(metadata.get("LicenseUrl"), 500)
            source_page = "https://commons.wikimedia.org/wiki/" + quote(title.replace(" ", "_"), safe=":()/,_-'~")
            public_domain = normalized_license.startswith("public domain")
            attribution = (
                f'“{work_title}” by {creator}, public domain; resized and converted to WebP by Zyra.'
                if public_domain
                else f'“{work_title}” by {creator}, {license_name or usage_terms}; resized and converted to WebP by Zyra.'
            )
            assets.append({
                "id": f"{category}-{slot:02}",
                "category": category,
                "categoryLabel": CATEGORIES[category],
                "file": output_name,
                "title": work_title,
                "alt": plain(metadata.get("ImageDescription"), 300) or work_title,
                "focalPoint": {"x": 0.5, "y": 0.5},
                "presentation": {"textTone": "dark" if luminance > 0.62 else "light", "dominantColor": dominant},
                "output": {
                    "width": image.width,
                    "height": image.height,
                    "bytes": len(output_bytes),
                    "sha256": hashlib.sha256(output_bytes).hexdigest(),
                },
                "thumbnail": {
                    "file": f"thumbs/{output_name}",
                    "width": thumbnail.width,
                    "height": thumbnail.height,
                    "bytes": len(thumbnail_bytes),
                    "sha256": hashlib.sha256(thumbnail_bytes).hexdigest(),
                },
                "source": {
                    "provider": "wikimedia-commons",
                    "assetId": title,
                    "pageUrl": source_page,
                    "originalUrl": info["url"],
                    "pageRevisionId": (page.get("revisions") or [{}])[0].get("revid"),
                    "sourceChecksum": info.get("sha1"),
                    "retrievedAt": retrieved_at,
                    "creator": {"name": creator, "url": first_link(metadata.get("Artist"))},
                    "credit": plain(metadata.get("Credit"), 500),
                },
                "rights": {
                    "kind": "public-domain" if public_domain else "license",
                    "id": license_name or usage_terms,
                    "name": license_name or usage_terms,
                    "url": license_url or source_page,
                    "attributionRequired": plain(metadata.get("AttributionRequired"), 20).lower() == "true" or not public_domain,
                    "copyrightNotice": plain(metadata.get("Copyrighted"), 120) or None,
                    "disclaimerNotice": None,
                    "restrictions": [],
                },
                "modifications": [f"Resized to {image.width}×{image.height}", "Converted to WebP", "Metadata removed"],
                "attributionText": attribution,
            })
            print(f"[{len(assets):02}/45] {output_name}")
            time.sleep(0.4)

    manifest = {"schemaVersion": 1, "generatedAt": retrieved_at, "categories": CATEGORIES, "assets": assets}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    shutil.rmtree(BACKUP, ignore_errors=True)
    if TARGET.exists():
        TARGET.rename(BACKUP)
    try:
        shutil.copytree(OUTPUT, TARGET)
    except BaseException:
        shutil.rmtree(TARGET, ignore_errors=True)
        if BACKUP.exists():
            BACKUP.rename(TARGET)
        raise
    shutil.rmtree(OUTPUT, ignore_errors=True)
    shutil.rmtree(BACKUP, ignore_errors=True)
    total_bytes = sum(asset["output"]["bytes"] + asset["thumbnail"]["bytes"] for asset in assets)
    print(f"Wrote 45 backgrounds and thumbnails ({total_bytes / 1024 / 1024:.1f} MiB)")


if __name__ == "__main__":
    main()
