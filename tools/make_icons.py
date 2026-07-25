#!/usr/bin/env python3
"""Generate the PWA icons and favicon.

    python tools/make_icons.py

Drawn rather than committed as binaries so the mark can be changed in one
place. Deliberately generic: a level badge, no examination body's branding.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"
RULE = (47, 62, 78)
PAPER = (255, 255, 255)

FONT_KANDIDATEN = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for pfad in FONT_KANDIDATEN:
        if Path(pfad).exists():
            return ImageFont.truetype(pfad, size)
    return ImageFont.load_default(size)


def icon(px: int, rand: bool = True) -> Image.Image:
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Maskable icons are cropped to a circle on some launchers, so keep the
    # artwork inside the safe zone and let the background bleed to the edge.
    pad = round(px * 0.06) if rand else 0
    d.rounded_rectangle([pad, pad, px - pad - 1, px - pad - 1],
                        radius=round(px * 0.2), fill=RULE)

    f = font(round(px * 0.42))
    text = "B1"
    box = d.textbbox((0, 0), text, font=f)
    d.text(
        ((px - (box[2] - box[0])) / 2 - box[0], (px - (box[3] - box[1])) / 2 - box[1] - px * 0.04),
        text, font=f, fill=PAPER,
    )

    # A rule under the wordmark, echoing the printed papers.
    y = round(px * 0.70)
    d.rounded_rectangle([px * 0.28, y, px * 0.72, y + max(2, px * 0.035)],
                        radius=px * 0.02, fill=PAPER)
    return img


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for px in (192, 512):
        icon(px).save(OUT / f"icon-{px}.png")
        print(f"  icon-{px}.png")

    icon(180).save(OUT / "apple-touch-icon.png")
    print("  apple-touch-icon.png")

    (OUT / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="13" fill="#2f3e4e"/>'
        '<text x="32" y="40" font-family="system-ui,sans-serif" font-size="27" '
        'font-weight="700" fill="#fff" text-anchor="middle">B1</text>'
        '<rect x="18" y="45" width="28" height="3" rx="1.5" fill="#fff"/>'
        "</svg>\n",
        encoding="utf-8",
    )
    print("  favicon.svg")
    return 0


if __name__ == "__main__":
    sys.exit(main())
