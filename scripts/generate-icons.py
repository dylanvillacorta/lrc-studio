#!/usr/bin/env python3
"""Genera los activos de marca WebP/ICO/PNG en public/ desde assets/branding/logo-source.webp."""

from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BG_HEX = "#E6E2DC"
BG_RGB = (230, 226, 220)
TEXT_RGB = (33, 34, 39)

FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/seguisb.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
]


def clean_source_image(raw_path: Path, out_path: Path) -> Image.Image:
    """Limpia el canal alfa del PNG origen, recorta al contenido y guarda WebP lossless."""
    im = Image.open(raw_path).convert("RGBA")
    r, g, b, a = im.split()

    def remap_alpha(val: int) -> int:
        if val < 16:
            return 0
        if val >= 245:
            return 255
        return round((val - 16) * 255 / (245 - 16))

    cleaned_alpha = a.point(remap_alpha)
    cleaned = Image.merge("RGBA", (r, g, b, cleaned_alpha))
    bbox = cleaned.getbbox()
    if bbox is None:
        raise ValueError("La imagen origen no tiene pixeles visibles tras limpiar alfa.")

    cropped = cleaned.crop(bbox)
    w, h = cropped.size
    side = max(w, h)
    margin = max(8, round(side * 0.015))
    canvas_size = side + margin * 2
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    offset_x = (canvas_size - w) // 2
    offset_y = (canvas_size - h) // 2
    canvas.paste(cropped, (offset_x, offset_y), cropped)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, format="WEBP", lossless=True, quality=100, method=6)
    return canvas


def find_font(size: int) -> ImageFont.FreeTypeFont | None:
    """Busca una fuente del sistema disponible sin instalar dependencias."""
    for candidate in FONT_CANDIDATES:
        if candidate.is_file():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return None


def save_webp_optimized(
    im: Image.Image,
    path: Path,
    max_bytes: int | None = None,
    prefer_lossless: bool = False,
) -> None:
    """Guarda WebP en alta calidad/lossless respetando el limite de peso si existe."""
    if prefer_lossless:
        im.save(path, format="WEBP", lossless=True, quality=100, method=6)
        if max_bytes is None or path.stat().st_size <= max_bytes:
            return

    for quality in (94, 92, 90, 86, 82):
        im.save(path, format="WEBP", quality=quality, method=6)
        if max_bytes is None or path.stat().st_size <= max_bytes:
            return


def make_padded_opaque(source: Image.Image, size: int, logo_ratio: float) -> Image.Image:
    """Crea una imagen cuadrada opaca sobre BG_RGB con el logo escalado segun logo_ratio."""
    canvas = Image.new("RGB", (size, size), BG_RGB)
    logo_size = round(size * logo_ratio)
    resized = source.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    offset = (size - logo_size) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def make_og_image(source: Image.Image) -> Image.Image:
    """Genera la imagen social Open Graph 1200x630."""
    width, height = 1200, 630
    canvas = Image.new("RGB", (width, height), BG_RGB)
    logo_size = 420
    logo = source.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

    font = find_font(58)
    if font is None:
        x = (width - logo_size) // 2
        y = (height - logo_size) // 2
        canvas.paste(logo, (x, y), logo)
        return canvas

    draw = ImageDraw.Draw(canvas)
    title = "LRC Studio"
    text_bbox = draw.textbbox((0, 0), title, font=font)
    text_w = text_bbox[2] - text_bbox[0]
    text_h = text_bbox[3] - text_bbox[1]
    gap = 44

    total_w = logo_size + gap + text_w
    if total_w <= width - 120:
        start_x = (width - total_w) // 2
        logo_y = (height - logo_size) // 2
        canvas.paste(logo, (start_x, logo_y), logo)
        text_x = start_x + logo_size + gap - text_bbox[0]
        text_y = (height - text_h) // 2 - text_bbox[1]
        draw.text((text_x, text_y), title, fill=TEXT_RGB, font=font)
    else:
        x = (width - logo_size) // 2
        y = (height - logo_size) // 2
        canvas.paste(logo, (x, y), logo)
    return canvas


def generate_all(source_path: Path, public_dir: Path) -> None:
    """Genera todos los iconos y la imagen OG en public_dir."""
    source = Image.open(source_path).convert("RGBA")
    public_dir.mkdir(parents=True, exist_ok=True)

    # 1. favicon.ico (capas 16, 32 y 48)
    ico_48 = source.resize((48, 48), Image.Resampling.LANCZOS)
    ico_32 = source.resize((32, 32), Image.Resampling.LANCZOS)
    ico_16 = source.resize((16, 16), Image.Resampling.LANCZOS)
    ico_48.save(
        public_dir / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[ico_32, ico_16],
    )

    # 2. favicon-16x16.webp y favicon-32x32.webp
    save_webp_optimized(ico_16, public_dir / "favicon-16x16.webp", max_bytes=10 * 1024, prefer_lossless=True)
    save_webp_optimized(ico_32, public_dir / "favicon-32x32.webp", max_bytes=10 * 1024, prefer_lossless=True)

    # 3. apple-touch-icon.png (180x180 opaco, ~8% de margen por lado)
    apple_icon = make_padded_opaque(source, 180, logo_ratio=0.84)
    apple_icon.save(public_dir / "apple-touch-icon.png", format="PNG", optimize=True)

    # 4. icon-192.webp y icon-512.webp (transparentes, any)
    icon_192 = source.resize((192, 192), Image.Resampling.LANCZOS)
    icon_512 = source.resize((512, 512), Image.Resampling.LANCZOS)
    save_webp_optimized(icon_192, public_dir / "icon-192.webp", max_bytes=10 * 1024)
    save_webp_optimized(icon_512, public_dir / "icon-512.webp", max_bytes=60 * 1024)

    # 5. icon-maskable-512.webp (opaco #E6E2DC, zona segura ~62%)
    maskable = make_padded_opaque(source, 512, logo_ratio=0.62)
    save_webp_optimized(maskable, public_dir / "icon-maskable-512.webp", max_bytes=60 * 1024)

    # 6. og-image.webp (1200x630)
    og = make_og_image(source)
    save_webp_optimized(og, public_dir / "og-image.webp", max_bytes=80 * 1024)

    # 7. logo.webp (256x256 con alfa para UI)
    logo_256 = source.resize((256, 256), Image.Resampling.LANCZOS)
    save_webp_optimized(logo_256, public_dir / "logo.webp", max_bytes=30 * 1024)


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Genera los iconos WebP/ICO/PNG de LRC Studio.")
    parser.add_argument(
        "--from-raw",
        type=Path,
        default=None,
        help="PNG origen sin limpiar para regenerar assets/branding/logo-source.webp.",
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=repo_root / "assets" / "branding" / "logo-source.webp",
        help="Ruta a logo-source.webp.",
    )
    parser.add_argument(
        "--public-dir",
        type=Path,
        default=repo_root / "public",
        help="Directorio public/ de salida.",
    )
    args = parser.parse_args()

    if args.from_raw is not None:
        clean_source_image(args.from_raw, args.source)

    if not args.source.is_file():
        raise FileNotFoundError(f"No se encontro el logo origen: {args.source}")

    generate_all(args.source, args.public_dir)


if __name__ == "__main__":
    main()
