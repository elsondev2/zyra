from __future__ import annotations

from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
BRANDING_DIR = ROOT / 'resources' / 'branding'
RENDERER_BRANDING_DIR = ROOT / 'src' / 'renderer' / 'src' / 'assets' / 'branding'
LANDING_PUBLIC_DIR = ROOT / 'apps' / 'landing' / 'zyra-web' / 'public'
BLUEPRINT_SOURCE_PATH = BRANDING_DIR / 'zyra-blueprint-source.png'

MASTER_SIZE = 1024


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


def save_png(image: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    output = image.resize((size, size), Image.Resampling.LANCZOS)
    output.save(path, format='PNG', optimize=True)


def main() -> None:
    clean_master = draw_clean_mark(MASTER_SIZE)
    blueprint_master = load_blueprint_master(MASTER_SIZE)

    BRANDING_DIR.mkdir(parents=True, exist_ok=True)
    RENDERER_BRANDING_DIR.mkdir(parents=True, exist_ok=True)
    LANDING_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    clean_brand_path = BRANDING_DIR / 'zyra-mark.png'
    blueprint_path = BRANDING_DIR / 'zyra-blueprint.png'
    save_png(clean_master, clean_brand_path, 1024)
    save_png(blueprint_master, blueprint_path, 1024)

    icon_png = ROOT / 'resources' / 'icon.png'
    clean_master.resize((512, 512), Image.Resampling.LANCZOS).save(icon_png, format='PNG', optimize=True)
    clean_master.save(
        ROOT / 'resources' / 'icon.ico',
        format='ICO',
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )

    shutil.copyfile(clean_brand_path, LANDING_PUBLIC_DIR / 'logo.png')
    shutil.copyfile(clean_brand_path, RENDERER_BRANDING_DIR / 'zyra-mark.png')
    shutil.copyfile(blueprint_path, RENDERER_BRANDING_DIR / 'zyra-blueprint.png')

    print('Generated branding assets:')
    if BLUEPRINT_SOURCE_PATH.exists():
        print(f'  {BLUEPRINT_SOURCE_PATH.relative_to(ROOT)}')
    print(f'  {clean_brand_path.relative_to(ROOT)}')
    print(f'  {blueprint_path.relative_to(ROOT)}')
    print(f'  {icon_png.relative_to(ROOT)}')
    print(f"  {(ROOT / 'resources' / 'icon.ico').relative_to(ROOT)}")
    print(f"  {(LANDING_PUBLIC_DIR / 'logo.png').relative_to(ROOT)}")
    print(f"  {(RENDERER_BRANDING_DIR / 'zyra-mark.png').relative_to(ROOT)}")
    print(f"  {(RENDERER_BRANDING_DIR / 'zyra-blueprint.png').relative_to(ROOT)}")


if __name__ == '__main__':
    main()
