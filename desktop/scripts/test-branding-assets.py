from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / 'resources'
ICONS = RESOURCES / 'branding' / 'icons'
EXPECTED_ICO_SIZES = {(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}


def open_rgba(path: Path) -> Image.Image:
    assert path.exists(), f'Missing branding asset: {path.relative_to(ROOT)}'
    return Image.open(path).convert('RGBA')


def assert_distinct(left: Path, right: Path) -> None:
    difference = ImageChops.difference(open_rgba(left).convert('RGB'), open_rgba(right).convert('RGB'))
    assert difference.getbbox() is not None, f'Expected distinct icon variants: {left.name}, {right.name}'


def mean_rgb(path: Path) -> tuple[float, float, float]:
    image = open_rgba(path).convert('RGB').resize((64, 64), Image.Resampling.BILINEAR)
    return tuple(ImageStat.Stat(image).mean[:3])


def assert_crisp_bounded_icon(path: Path) -> None:
    image = open_rgba(path)
    alpha = image.getchannel('A')
    bounds = alpha.getbbox()
    assert bounds is not None, f'{path.name} must have an opaque icon tile'
    assert image.getpixel((0, 0))[3] == 0, f'{path.name} must not paint glow into its corners'
    assert image.getpixel((image.width // 2, image.height // 2))[3] == 255, f'{path.name} tile center must be solid'
    assert 16 <= bounds[0] <= 32 and 16 <= bounds[1] <= 32, f'{path.name} tile boundary must remain clearly inset'
    assert image.width - 32 <= bounds[2] <= image.width - 16, f'{path.name} tile must retain a crisp right boundary'
    assert image.height - 32 <= bounds[3] <= image.height - 16, f'{path.name} tile must retain a crisp bottom boundary'

    small = image.resize((32, 32), Image.Resampling.LANCZOS)
    background = Image.new('RGBA', small.size, '#808080ff')
    background.alpha_composite(small)
    luminance = background.convert('L')
    minimum, maximum = luminance.getextrema()
    assert maximum - minimum >= 90, f'{path.name} must retain strong foreground/background contrast at 32px'


def main() -> None:
    for family in ('dev', 'prod'):
        source = open_rgba(ICONS / f'zyra-{family}-source.png')
        assert source.size == (1536, 1024), f'{family} source must retain its downloaded master dimensions'
        for suffix in ('', '-light', '-dark'):
            icon_path = ICONS / f'zyra-{family}{suffix}.png'
            image = open_rgba(icon_path)
            assert image.size == (512, 512), f'{family}{suffix} runtime icon must be 512px square'
            assert_crisp_bounded_icon(icon_path)
        assert_distinct(ICONS / f'zyra-{family}-light.png', ICONS / f'zyra-{family}-dark.png')

    dev_red, dev_green, dev_blue = mean_rgb(ICONS / 'zyra-dev.png')
    assert dev_green > dev_red + 10 and dev_blue > dev_red + 10, 'development icon must retain its cyan-blue identity'
    prod_channels = mean_rgb(ICONS / 'zyra-prod.png')
    assert max(prod_channels) - min(prod_channels) < 4, 'production icon must retain its neutral white identity'

    for file_name in ('icon.png', 'icon-dev.png'):
        image = open_rgba(RESOURCES / file_name)
        assert image.size == (512, 512), f'{file_name} must be 512px square'

    for file_name in ('icon.ico', 'icon-dev.ico'):
        path = RESOURCES / file_name
        assert path.exists(), f'Missing {file_name}'
        image = Image.open(path)
        sizes = set(image.ico.sizes()) if hasattr(image, 'ico') else {image.size}
        assert EXPECTED_ICO_SIZES.issubset(sizes), f'{file_name} is missing Windows icon sizes: {EXPECTED_ICO_SIZES - sizes}'

    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    build = package['build']
    assert build['icon'] == 'resources/icon.png', 'production packaging must use the white PNG master'
    assert build['win']['icon'] == 'resources/icon.ico', 'Windows production packaging must use the white ICO master'
    assert '!resources/branding/icons/*-source.png' in build['files'], 'downloaded source artwork must stay out of packaged apps'

    main_source = (ROOT / 'src' / 'main' / 'index.ts').read_text(encoding='utf-8')
    assert "runtimeIdentity.isDevRuntime ? 'dev' : 'prod'" in main_source, 'runtime icon family must distinguish dev and production'
    assert "nativeTheme.shouldUseDarkColors ? 'dark' : 'light'" in main_source, 'runtime window icons must follow the OS theme'
    assert "nativeTheme.on('updated', syncOpenWindowIcons)" in main_source, 'open windows must refresh after an OS theme change'

    print('Zyra branding asset contract: ok')


if __name__ == '__main__':
    main()
