from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / 'resources'
ICONS = RESOURCES / 'branding' / 'icons'
EXPECTED_ICO_SIZES = {(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}
EXPECTED_LINUX_ICON_SIZES = (16, 32, 48, 64, 128, 256, 512, 1024)


def open_rgba(path: Path) -> Image.Image:
    assert path.exists(), f'Missing branding asset: {path.relative_to(ROOT)}'
    return Image.open(path).convert('RGBA')


def assert_distinct(left: Path, right: Path) -> None:
    difference = ImageChops.difference(open_rgba(left).convert('RGB'), open_rgba(right).convert('RGB'))
    assert difference.getbbox() is not None, f'Expected distinct icon variants: {left.name}, {right.name}'


def mean_rgb(path: Path) -> tuple[float, float, float]:
    image = open_rgba(path).convert('RGB').resize((64, 64), Image.Resampling.BILINEAR)
    return tuple(ImageStat.Stat(image).mean[:3])


def selected_source_crop(source: Image.Image) -> Image.Image:
    alpha = source.getchannel('A').point(lambda value: 255 if value >= 128 else 0)
    bounds = alpha.getbbox()
    assert bounds is not None, 'selected source must contain an alpha-defined mark'
    left, top, right, bottom = bounds
    padding = round((bottom - top) * 0.08)
    left -= padding
    top -= padding
    right += padding
    bottom += padding
    side = max(right - left, bottom - top)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    square = (
        round(center_x - side / 2),
        round(center_y - side / 2),
        round(center_x + side / 2),
        round(center_y + side / 2)
    )
    return source.crop(square)


def assert_source_mark_readability(image: Image.Image, source: Image.Image, label: str) -> None:
    rgba = image.convert('RGBA')
    mark_alpha = selected_source_crop(source).getchannel('A').resize(rgba.size, Image.Resampling.LANCZOS)
    threshold = 72 if rgba.width <= 32 else 128
    mark_mask = mark_alpha.point(lambda value: 255 if value >= threshold else 0)
    background_mask = mark_mask.point(lambda value: 255 - value)
    luminance = rgba.convert('RGB').convert('L')
    mark_mean = ImageStat.Stat(luminance, mark_mask).mean[0]
    background_mean = ImageStat.Stat(luminance, background_mask).mean[0]
    assert mark_mean - background_mean >= 8, f'{label} must keep the selected source mark distinct at {rgba.width}px'


def assert_cropped_source_icon(path: Path, source: Image.Image) -> None:
    image = open_rgba(path)
    alpha = image.getchannel('A')
    bounds = alpha.getbbox()
    assert bounds is not None, f'{path.name} must have an opaque icon tile'
    assert image.getpixel((0, 0))[3] == 0, f'{path.name} must not paint glow into its corners'
    assert image.getpixel((image.width // 2, image.height // 2))[3] == 255, f'{path.name} tile center must be solid'
    expected_inset = image.width * 0.022
    assert abs(bounds[0] - expected_inset) <= max(2, image.width * 0.01), f'{path.name} tile boundary must remain tightly inset'
    assert abs((image.width - bounds[2]) - expected_inset) <= max(2, image.width * 0.01), f'{path.name} tile must retain a balanced right boundary'

    small = image.resize((32, 32), Image.Resampling.LANCZOS)
    background = Image.new('RGBA', small.size, '#808080ff')
    background.alpha_composite(small)
    minimum, maximum = background.convert('L').getextrema()
    assert maximum - minimum >= 60, f'{path.name} must retain source contrast when a PNG master is scaled to 32px'
    assert_source_mark_readability(small, source, path.name)
    color_count = len(image.convert('RGB').resize((64, 64), Image.Resampling.BILINEAR).getcolors(maxcolors=64 * 64) or [])
    assert color_count >= 128, f'{path.name} must retain the selected source tonal field instead of a flat reconstructed tile'


def main() -> None:
    sources = {
        family: open_rgba(ICONS / f'zyra-{family}-source.png')
        for family in ('dev', 'prod')
    }
    for family, source in sources.items():
        assert source.size == (1536, 1024), f'{family} source must retain its downloaded master dimensions'
        for suffix in ('', '-light', '-dark'):
            icon_path = ICONS / f'zyra-{family}{suffix}.png'
            image = open_rgba(icon_path)
            assert image.size == (1024, 1024), f'{family}{suffix} runtime icon must retain a 1024px source-derived master'
            assert_cropped_source_icon(icon_path, source)
        assert_distinct(ICONS / f'zyra-{family}-light.png', ICONS / f'zyra-{family}-dark.png')
        for suffix in ('', '-light', '-dark'):
            variant_ico = Image.open(ICONS / f'zyra-{family}{suffix}.ico')
            assert EXPECTED_ICO_SIZES.issubset(set(variant_ico.ico.sizes())), f'{family}{suffix} runtime ICO is incomplete'

    dev_red, dev_green, dev_blue = mean_rgb(ICONS / 'zyra-dev.png')
    assert dev_green > dev_red + 10 and dev_blue > dev_red + 10, 'development icon must retain its cyan-blue identity'
    prod_channels = mean_rgb(ICONS / 'zyra-prod.png')
    assert max(prod_channels) - min(prod_channels) < 4, 'production icon must retain its neutral white identity'

    for file_name in ('icon.png', 'icon-dev.png'):
        image = open_rgba(RESOURCES / file_name)
        assert image.size == (512, 512), f'{file_name} must be 512px square'

    for file_name, family in (('icon.ico', 'prod'), ('icon-dev.ico', 'dev')):
        path = RESOURCES / file_name
        assert path.exists(), f'Missing {file_name}'
        image = Image.open(path)
        sizes = set(image.ico.sizes()) if hasattr(image, 'ico') else {image.size}
        assert EXPECTED_ICO_SIZES.issubset(sizes), f'{file_name} is missing Windows icon sizes: {EXPECTED_ICO_SIZES - sizes}'
        for size in sorted(EXPECTED_ICO_SIZES):
            frame = image.ico.getimage(size).convert('RGBA')
            assert frame.size == size
            assert_source_mark_readability(frame, sources[family], f'{file_name} {size[0]}px')

    icns_path = RESOURCES / 'icon.icns'
    icns = Image.open(icns_path)
    icns_sizes = set(icns.info.get('sizes', []))
    assert {(16, 16, 2), (256, 256, 1), (512, 512, 2)}.issubset(icns_sizes), 'icon.icns is missing required macOS representations'
    for representation in ((16, 16, 2), (256, 256, 1), (512, 512, 2)):
        frame = icns.icns.getimage(representation).convert('RGBA')
        assert_source_mark_readability(frame, sources['prod'], f'icon.icns {frame.width}px')

    for size in EXPECTED_LINUX_ICON_SIZES:
        icon_path = RESOURCES / 'icons' / f'{size}x{size}.png'
        image = open_rgba(icon_path)
        assert image.size == (size, size), f'{icon_path.name} must match its Linux icon size'
        assert image.getpixel((0, 0))[3] <= 2, f'{icon_path.name} must retain visually transparent corners'
        assert image.getpixel((size // 2, size // 2))[3] == 255, f'{icon_path.name} center must remain opaque'
        assert_source_mark_readability(image, sources['prod'], icon_path.name)

    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    build = package['build']
    assert build['icon'] == 'resources/icon.png', 'production packaging must use the white PNG master'
    assert build['win']['icon'] == 'resources/icon.ico', 'Windows production packaging must use the white ICO master'
    assert build['mac']['icon'] == 'resources/icon.icns', 'macOS production packaging must use the ICNS family'
    assert build['linux']['icon'] == 'resources/icons', 'Linux production packaging must use the PNG family'
    assert build['fileAssociations'][0]['icon'] == 'resources/icon', 'file associations must resolve the platform-correct icon extension'
    assert '!resources/branding/icons/*-source.png' in build['files'], 'downloaded source artwork must stay out of packaged apps'

    main_source = (ROOT / 'src' / 'main' / 'index.ts').read_text(encoding='utf-8')
    assert "runtimeIdentity.isDevRuntime ? 'dev' : 'prod'" in main_source, 'runtime icon family must distinguish dev and production'
    assert "nativeTheme.shouldUseDarkColors ? 'dark' : 'light'" in main_source, 'runtime window icons must follow the OS theme'
    assert "process.platform === 'win32' ? 'ico' : 'png'" in main_source, 'Windows runtime icons must use real size-specific ICO mip levels'
    assert "nativeTheme.on('updated', syncOpenWindowIcons)" in main_source, 'open windows must refresh after an OS theme change'

    print('Zyra branding asset contract: ok')


if __name__ == '__main__':
    main()
