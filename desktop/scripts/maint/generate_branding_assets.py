from __future__ import annotations

from pathlib import Path
import shutil
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
BRANDING_DIR = ROOT / 'resources' / 'branding'
RENDERER_BRANDING_DIR = ROOT / 'src' / 'renderer' / 'src' / 'assets' / 'branding'
LANDING_PUBLIC_DIR = ROOT / 'apps' / 'landing' / 'zyra-web' / 'public'
BLUEPRINT_SOURCE_PATH = BRANDING_DIR / 'zyra-blueprint-source.png'
APP_ICON_DIR = BRANDING_DIR / 'icons'
DEV_ICON_SOURCE_PATH = APP_ICON_DIR / 'zyra-dev-source.png'
PROD_ICON_SOURCE_PATH = APP_ICON_DIR / 'zyra-prod-source.png'

MASTER_SIZE = 1024
ICON_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
LINUX_ICON_SIZES = (16, 32, 48, 64, 128, 256, 512, 1024)
APP_ICON_SOURCE_PADDING_RATIO = 0.08
APP_ICON_TILE_INSET_RATIO = 0.022
APP_ICON_TILE_RADIUS_RATIO = 0.18
APP_ICON_VARIANTS = {
    'zyra-dev.png': ('dev', 'balanced'),
    'zyra-dev-light.png': ('dev', 'light-shell'),
    'zyra-dev-dark.png': ('dev', 'dark-shell'),
    'zyra-prod.png': ('prod', 'balanced'),
    'zyra-prod-light.png': ('prod', 'light-shell'),
    'zyra-prod-dark.png': ('prod', 'dark-shell')
}
APP_ICON_TONES = {
    'balanced': (1.0, 1.0, 1.0),
    'light-shell': (0.92, 1.08, 0.98),
    'dark-shell': (1.06, 1.02, 1.08)
}
APP_ICON_SIZE_TUNING = {
    16: (1.35, 0.78, 1.30, 1.12),
    24: (1.30, 0.82, 1.30, 1.12),
    32: (1.25, 0.85, 1.30, 1.12),
    48: (1.20, 0.88, 1.24, 1.10),
    64: (1.18, 0.90, 1.20, 1.08),
    128: (1.14, 0.93, 1.18, 1.08),
    256: (1.10, 0.95, 1.18, 1.06),
    512: (1.07, 0.97, 1.18, 1.05),
    1024: (1.04, 0.98, 1.18, 1.04)
}


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    windows_fonts = Path('C:/Windows/Fonts')
    if bold:
        candidates.extend([
            windows_fonts / 'arialbd.ttf',
            windows_fonts / 'Arialbd.ttf',
            windows_fonts / 'segoeuib.ttf',
            windows_fonts / 'bahnschrift.ttf'
        ])
    else:
        candidates.extend([
            windows_fonts / 'arial.ttf',
            windows_fonts / 'segoeui.ttf',
            windows_fonts / 'bahnschrift.ttf'
        ])

    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)

    return ImageFont.load_default()


def draw_clean_mark(size: int) -> Image.Image:
    background = '#2d2d2f'
    cream = '#ddd1c3'
    ink = '#111015'

    image = Image.new('RGBA', (size, size), background)
    draw = ImageDraw.Draw(image)

    top_box = (
        int(size * 0.24),
        int(size * 0.27),
        int(size * 0.86),
        int(size * 0.44)
    )
    draw.rectangle(top_box, fill=cream)

    folder_points = [
        (int(size * 0.16), int(size * 0.59)),
        (int(size * 0.51), int(size * 0.59)),
        (int(size * 0.53), int(size * 0.525)),
        (int(size * 0.76), int(size * 0.525)),
        (int(size * 0.68), int(size * 0.755)),
        (int(size * 0.16), int(size * 0.755))
    ]
    draw.polygon(folder_points, fill=cream)

    font = load_font(int(size * 0.20), bold=True)
    draw.text((int(size * 0.58), int(size * 0.235)), '.air', font=font, fill=ink)
    return image


def draw_grid(draw: ImageDraw.ImageDraw, size: int) -> None:
    minor = max(20, size // 28)
    major = minor * 4

    for offset in range(0, size + 1, minor):
        color = (255, 255, 255, 34 if offset % major else 62)
        width = 1 if offset % major else 2
        draw.line((offset, 0, offset, size), fill=color, width=width)
        draw.line((0, offset, size, offset), fill=color, width=width)


def draw_hatched_region(
    base: Image.Image,
    points: list[tuple[int, int]],
    *,
    outline: tuple[int, int, int, int],
    hatch_alpha: int = 110
) -> None:
    mask = Image.new('L', base.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.polygon(points, fill=255)

    hatch = Image.new('RGBA', base.size, (0, 0, 0, 0))
    hatch_draw = ImageDraw.Draw(hatch)
    spacing = 28
    for offset in range(-base.height, base.width * 2, spacing):
        hatch_draw.line(
            (offset, 0, offset - base.height, base.height),
            fill=(255, 255, 255, hatch_alpha),
            width=3
        )

    base.alpha_composite(Image.composite(hatch, Image.new('RGBA', base.size, (0, 0, 0, 0)), mask))
    outline_draw = ImageDraw.Draw(base)
    outline_draw.polygon(points, outline=outline, width=6)


def draw_dimension(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], cross: int = 18) -> None:
    color = (255, 255, 255, 190)
    draw.line((start, end), fill=color, width=3)

    if start[0] == end[0]:
        for point in (start, end):
            draw.line((point[0] - cross, point[1], point[0] + cross, point[1]), fill=color, width=3)
    else:
        for point in (start, end):
            draw.line((point[0], point[1] - cross, point[0], point[1] + cross), fill=color, width=3)

    def draw_arrow(point: tuple[int, int], direction: tuple[int, int]) -> None:
        x, y = point
        dx, dy = direction
        scale = 14
        if dx != 0:
            arrow = [(x, y), (x - dx * scale, y - 8), (x - dx * scale, y + 8)]
        else:
            arrow = [(x, y), (x - 8, y - dy * scale), (x + 8, y - dy * scale)]
        draw.polygon(arrow, fill=color)

    if start[0] == end[0]:
        draw_arrow(start, (0, -1 if end[1] > start[1] else 1))
        draw_arrow(end, (0, 1 if end[1] > start[1] else -1))
    else:
        draw_arrow(start, (-1 if end[0] > start[0] else 1, 0))
        draw_arrow(end, (1 if end[0] > start[0] else -1, 0))


def draw_blueprint_mark(size: int) -> Image.Image:
    image = Image.new('RGBA', (size, size), '#0a5ba4')
    draw = ImageDraw.Draw(image)

    for y in range(size):
        depth = y / max(1, size - 1)
        row_color = (
            int(8 + depth * 22),
            int(78 + depth * 32),
            int(138 + depth * 28),
            255
        )
        draw.line((0, y, size, y), fill=row_color)

    draw_grid(draw, size)

    top_points = [
        (int(size * 0.17), int(size * 0.22)),
        (int(size * 0.89), int(size * 0.22)),
        (int(size * 0.89), int(size * 0.45)),
        (int(size * 0.17), int(size * 0.45))
    ]
    folder_points = [
        (int(size * 0.07), int(size * 0.60)),
        (int(size * 0.52), int(size * 0.60)),
        (int(size * 0.54), int(size * 0.53)),
        (int(size * 0.84), int(size * 0.53)),
        (int(size * 0.74), int(size * 0.82)),
        (int(size * 0.07), int(size * 0.82))
    ]

    outline = (255, 255, 255, 218)
    draw_hatched_region(image, top_points, outline=outline)
    draw_hatched_region(image, folder_points, outline=outline)

    font = load_font(int(size * 0.23), bold=True)
    text_position = (int(size * 0.62), int(size * 0.20))
    bg_fill = (11, 92, 164, 255)
    draw.text(
        text_position,
        '.air',
        font=font,
        fill=bg_fill,
        stroke_width=6,
        stroke_fill=outline
    )

    draw_dimension(draw, (int(size * 0.17), int(size * 0.14)), (int(size * 0.89), int(size * 0.14)))
    draw_dimension(draw, (int(size * 0.17), int(size * 0.18)), (int(size * 0.79), int(size * 0.18)))
    draw_dimension(draw, (int(size * 0.63), int(size * 0.48)), (int(size * 0.82), int(size * 0.48)))
    draw_dimension(draw, (int(size * 0.07), int(size * 0.87)), (int(size * 0.74), int(size * 0.87)))
    draw_dimension(draw, (int(size * 0.84), int(size * 0.57)), (int(size * 0.84), int(size * 0.82)))
    draw_dimension(draw, (int(size * 0.03), int(size * 0.61)), (int(size * 0.03), int(size * 0.82)))

    draw.arc(
        (int(size * 0.38), int(size * 0.50), int(size * 0.57), int(size * 0.68)),
        start=248,
        end=360,
        fill=(255, 255, 255, 170),
        width=4
    )
    draw.line(
        (int(size * 0.57), int(size * 0.60), int(size * 0.48), int(size * 0.60)),
        fill=(255, 255, 255, 170),
        width=4
    )
    draw.line(
        (int(size * 0.57), int(size * 0.60), int(size * 0.55), int(size * 0.58)),
        fill=(255, 255, 255, 170),
        width=4
    )
    draw.line(
        (int(size * 0.57), int(size * 0.60), int(size * 0.55), int(size * 0.62)),
        fill=(255, 255, 255, 170),
        width=4
    )

    return image


def load_blueprint_master(size: int) -> Image.Image:
    if BLUEPRINT_SOURCE_PATH.exists():
        source = Image.open(BLUEPRINT_SOURCE_PATH).convert('RGBA')
        return source.resize((size, size), Image.Resampling.LANCZOS)
    return draw_blueprint_mark(size)


def detect_app_icon_crop_box() -> tuple[int, int, int, int]:
    if not DEV_ICON_SOURCE_PATH.exists():
        raise FileNotFoundError(f'Missing app icon source: {DEV_ICON_SOURCE_PATH}')

    source = Image.open(DEV_ICON_SOURCE_PATH).convert('RGBA')
    mark_mask = source.getchannel('A').point(lambda value: 255 if value >= 128 else 0)
    mark_bounds = mark_mask.getbbox()
    if not mark_bounds:
        raise ValueError('Could not detect the Zyra mark in the selected development icon source.')

    left, top, right, bottom = mark_bounds
    padding = round((bottom - top) * APP_ICON_SOURCE_PADDING_RATIO)
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
    if square[0] < 0 or square[1] < 0 or square[2] > source.width or square[3] > source.height:
        raise ValueError('The selected app icon crop falls outside its source canvas.')
    return square


def load_app_icon_layers(source_path: Path, crop_box: tuple[int, int, int, int]) -> tuple[Image.Image, Image.Image]:
    if not source_path.exists():
        raise FileNotFoundError(f'Missing app icon source: {source_path}')

    # Convert the hidden RGB artwork before resizing so the source's soft glow
    # and gray/cyan field remain available behind its clean alpha mark.
    background = Image.open(source_path).convert('RGB').crop(crop_box)
    mark = Image.open(source_path).convert('RGBA').crop(crop_box)
    return background, mark


def nearest_app_icon_tuning(size: int) -> tuple[float, float, float, float]:
    nearest = min(APP_ICON_SIZE_TUNING, key=lambda candidate: abs(candidate - size))
    return APP_ICON_SIZE_TUNING[nearest]


def render_app_icon(
    layers: tuple[Image.Image, Image.Image],
    *,
    family: str,
    tone: str,
    size: int
) -> Image.Image:
    background_source, mark_source = layers
    background_contrast, background_brightness, mark_brightness, mark_contrast = nearest_app_icon_tuning(size)
    tone_brightness, tone_contrast, tone_mark_brightness = APP_ICON_TONES[tone]

    background = background_source.resize((size, size), Image.Resampling.LANCZOS)
    background = ImageEnhance.Contrast(background).enhance(background_contrast * tone_contrast)
    background = ImageEnhance.Brightness(background).enhance(background_brightness * tone_brightness)
    background = ImageEnhance.Color(background).enhance(0.95 if family == 'dev' else 0.0)
    image = background.convert('RGBA')

    mark_alpha = mark_source.getchannel('A').resize((size, size), Image.Resampling.LANCZOS)
    if size <= 32:
        mark_alpha = mark_alpha.point(lambda value: 255 if value >= 72 else 0)
    mark = mark_source.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)
    mark = ImageEnhance.Brightness(mark).enhance(mark_brightness * tone_mark_brightness)
    mark = ImageEnhance.Contrast(mark).enhance(mark_contrast)

    outline = mark_alpha.filter(ImageFilter.MaxFilter(3)) if size >= 24 else mark_alpha
    outline_color = (36, 92, 102, 255) if family == 'dev' else (52, 52, 52, 255)
    image.paste(outline_color, (0, 0, size, size), outline)
    image.paste(mark.convert('RGBA'), (0, 0), mark_alpha)

    tile_mask = Image.new('L', (size, size), 0)
    tile_draw = ImageDraw.Draw(tile_mask)
    inset = max(1, round(size * APP_ICON_TILE_INSET_RATIO))
    radius = max(2, round(size * APP_ICON_TILE_RADIUS_RATIO))
    tile_draw.rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=radius,
        fill=255
    )
    image.putalpha(tile_mask)

    border_color = (34, 210, 235, 210) if family == 'dev' else (242, 242, 242, 220)
    ImageDraw.Draw(image).rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=radius,
        outline=border_color,
        width=max(1, round(size * 0.01))
    )
    return image


def save_app_icon_png(
    layers: tuple[Image.Image, Image.Image],
    *,
    family: str,
    tone: str,
    path: Path,
    size: int
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    render_app_icon(layers, family=family, tone=tone, size=size).save(path, format='PNG', optimize=True)


def save_app_icon_ico(
    layers: tuple[Image.Image, Image.Image],
    *,
    family: str,
    tone: str,
    path: Path
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = [render_app_icon(layers, family=family, tone=tone, size=size[0]) for size in ICON_SIZES]
    frames[-1].save(path, format='ICO', sizes=ICON_SIZES, append_images=frames[:-1])


def save_app_icon_icns(
    layers: tuple[Image.Image, Image.Image],
    *,
    family: str,
    tone: str,
    path: Path
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sizes = (32, 64, 128, 256, 512, 1024)
    frames = [render_app_icon(layers, family=family, tone=tone, size=size) for size in sizes]
    frames[-1].save(path, format='ICNS', append_images=frames[:-1])


def save_png(image: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    output = image.resize((size, size), Image.Resampling.LANCZOS)
    output.save(path, format='PNG', optimize=True)


def main() -> None:
    icons_only = '--icons-only' in sys.argv[1:]
    clean_brand_path = BRANDING_DIR / 'zyra-mark.png'
    blueprint_path = BRANDING_DIR / 'zyra-blueprint.png'

    BRANDING_DIR.mkdir(parents=True, exist_ok=True)
    if not icons_only:
        clean_master = draw_clean_mark(MASTER_SIZE)
        blueprint_master = load_blueprint_master(MASTER_SIZE)
        RENDERER_BRANDING_DIR.mkdir(parents=True, exist_ok=True)
        save_png(clean_master, clean_brand_path, 1024)
        save_png(blueprint_master, blueprint_path, 1024)

    crop_box = detect_app_icon_crop_box()
    app_icon_layers = {
        'dev': load_app_icon_layers(DEV_ICON_SOURCE_PATH, crop_box),
        'prod': load_app_icon_layers(PROD_ICON_SOURCE_PATH, crop_box)
    }
    for file_name, (family, tone) in APP_ICON_VARIANTS.items():
        variant_path = APP_ICON_DIR / file_name
        save_app_icon_png(
            app_icon_layers[family],
            family=family,
            tone=tone,
            path=variant_path,
            size=1024
        )
        save_app_icon_ico(
            app_icon_layers[family],
            family=family,
            tone=tone,
            path=variant_path.with_suffix('.ico')
        )

    icon_png = ROOT / 'resources' / 'icon.png'
    dev_icon_png = ROOT / 'resources' / 'icon-dev.png'
    save_app_icon_png(app_icon_layers['prod'], family='prod', tone='balanced', path=icon_png, size=512)
    save_app_icon_png(app_icon_layers['dev'], family='dev', tone='balanced', path=dev_icon_png, size=512)
    save_app_icon_ico(app_icon_layers['prod'], family='prod', tone='balanced', path=ROOT / 'resources' / 'icon.ico')
    save_app_icon_ico(app_icon_layers['dev'], family='dev', tone='balanced', path=ROOT / 'resources' / 'icon-dev.ico')
    save_app_icon_icns(app_icon_layers['prod'], family='prod', tone='balanced', path=ROOT / 'resources' / 'icon.icns')
    linux_icon_dir = ROOT / 'resources' / 'icons'
    for size in LINUX_ICON_SIZES:
        save_app_icon_png(
            app_icon_layers['prod'],
            family='prod',
            tone='balanced',
            path=linux_icon_dir / f'{size}x{size}.png',
            size=size
        )

    if not icons_only:
        if LANDING_PUBLIC_DIR.exists():
            shutil.copyfile(clean_brand_path, LANDING_PUBLIC_DIR / 'logo.png')
        shutil.copyfile(clean_brand_path, RENDERER_BRANDING_DIR / 'zyra-mark.png')
        shutil.copyfile(blueprint_path, RENDERER_BRANDING_DIR / 'zyra-blueprint.png')

    print('Generated branding assets:')
    if not icons_only:
        if BLUEPRINT_SOURCE_PATH.exists():
            print(f'  {BLUEPRINT_SOURCE_PATH.relative_to(ROOT)}')
        print(f'  {clean_brand_path.relative_to(ROOT)}')
        print(f'  {blueprint_path.relative_to(ROOT)}')
    for source_path in (DEV_ICON_SOURCE_PATH, PROD_ICON_SOURCE_PATH):
        print(f'  {source_path.relative_to(ROOT)}')
    for file_name in APP_ICON_VARIANTS:
        variant_path = APP_ICON_DIR / file_name
        print(f'  {variant_path.relative_to(ROOT)}')
        print(f"  {variant_path.with_suffix('.ico').relative_to(ROOT)}")
    print(f'  {icon_png.relative_to(ROOT)}')
    print(f'  {dev_icon_png.relative_to(ROOT)}')
    print(f"  {(ROOT / 'resources' / 'icon.ico').relative_to(ROOT)}")
    print(f"  {(ROOT / 'resources' / 'icon-dev.ico').relative_to(ROOT)}")
    print(f"  {(ROOT / 'resources' / 'icon.icns').relative_to(ROOT)}")
    for size in LINUX_ICON_SIZES:
        print(f"  {(ROOT / 'resources' / 'icons' / f'{size}x{size}.png').relative_to(ROOT)}")
    if not icons_only:
        if LANDING_PUBLIC_DIR.exists():
            print(f"  {(LANDING_PUBLIC_DIR / 'logo.png').relative_to(ROOT)}")
        print(f"  {(RENDERER_BRANDING_DIR / 'zyra-mark.png').relative_to(ROOT)}")
        print(f"  {(RENDERER_BRANDING_DIR / 'zyra-blueprint.png').relative_to(ROOT)}")


if __name__ == '__main__':
    main()
