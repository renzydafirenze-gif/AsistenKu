"""Generates the AsistenKu (AKU) icon set from code, no binary sources.

Run: python3 scripts/make-icon.py
Outputs: assets/icon.png, adaptive-icon.png, splash.png, favicon.png
"""

from PIL import Image, ImageDraw, ImageFont

BLUE = (46, 134, 193, 255)
BLUE_DEEP = (27, 95, 143, 255)
WHITE = (255, 255, 255, 255)
GOLD = (243, 156, 18, 255)
FONT = "/usr/share/fonts/ttf-gabarito-git/Gabarito-ExtraBold.ttf"
SIZE = 1024


def monogram(size, bg=BLUE, card=True):
    """Squared app icon: white rounded card, deep blue AKU, gold accent."""
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    s = size / 1024

    if card:
        pad = int(150 * s)
        draw.rounded_rectangle(
            (pad, pad, size - pad, size - pad),
            radius=int(150 * s),
            fill=WHITE,
        )
        # Gold underline anchors the mark without crowding the label.
        bar_w, bar_h = int(210 * s), int(26 * s)
        bx, by = (size - bar_w) / 2, size - pad - int(110 * s)
        draw.rounded_rectangle((bx, by, bx + bar_w, by + bar_h), radius=bar_h // 2, fill=GOLD)

    # Text is measured, then centred pixel-perfectly inside the card.
    text = "AKU"
    font = ImageFont.truetype(FONT, int(250 * s))
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    x = (size - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top - int(14 * s)
    draw.text((x, y), text, font=font, fill=BLUE_DEEP)
    return img


def main():
    # Full-bleed icon for iOS/legacy Android (already square, safe corners).
    monogram(SIZE).convert("RGB").save("assets/icon.png", optimize=True)

    # Adaptive foreground: transparent, content inside the 66% safe zone.
    fg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    inner = monogram(int(SIZE * 0.62), bg=(0, 0, 0, 0), card=True)
    fg.paste(inner, ((SIZE - inner.width) // 2, (SIZE - inner.height) // 2), inner)
    fg.save("assets/adaptive-icon.png", optimize=True)

    # Splash: logo only on the themed background configured in app.json.
    splash = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    logo = monogram(int(SIZE * 0.5), bg=(0, 0, 0, 0), card=True)
    splash.paste(logo, ((SIZE - logo.width) // 2, (SIZE - logo.height) // 2), logo)
    splash.save("assets/splash.png", optimize=True)

    monogram(48).convert("RGB").save("assets/favicon.png", optimize=True)


if __name__ == "__main__":
    main()
