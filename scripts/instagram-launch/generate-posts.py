#!/usr/bin/env python3
"""
Generates the 5 auto-generatable IG launch posts for Little Hero Labs.
Outputs 1080x1080 PNGs to docs/marketing/instagram-launch/posts/.

Posts produced:
  post-2-personalization-showcase.png
  post-3-spread-teaser.png
  post-6a-hair-styles.png
  post-6b-skin-and-hair-colors.png
  post-6c-animal-companions.png
  post-7-theme-quote.png
  post-9-preview-cta.png

Usage: python3 scripts/instagram-launch/generate-posts.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = Path(__file__).resolve().parents[2]
PREVIEW = REPO / "frontend" / "public" / "preview"
ANIMALS = REPO / "frontend" / "public" / "animals"
HAIR = REPO / "assets" / "hair-references"
PAGES = REPO / "assets" / "background-images-new-texture"
OUT = REPO / "docs" / "marketing" / "instagram-launch" / "posts"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1080
CANVAS_BG = (252, 248, 242)  # warm off-white, matches brand palette feel

# Brand colors from frontend/src/lib/createFlow/traitOptions.ts
SKIN_TONES = [
    ("Light", "#EFC28E"),
    ("Medium", "#E7AB62"),
    ("Tan", "#CF924E"),
    ("Medium-dark", "#95623D"),
    ("Deep", "#7C5130"),
]
HAIR_COLORS = [
    ("Blonde", "#E7D08A"),
    ("Strawberry", "#E0A070"),
    ("Light brown", "#B8875A"),
    ("Medium brown", "#7B4D2A"),
    ("Dark brown", "#4A2B1A"),
    ("Auburn", "#8B3A2B"),
    ("Red", "#C84B3A"),
    ("Black", "#1C1C1C"),
]

SERIF = "/System/Library/Fonts/Supplemental/Baskerville.ttc"
SERIF_ITALIC = "/System/Library/Fonts/Supplemental/Baskerville.ttc"
SANS = "/System/Library/Fonts/Avenir.ttc"
SANS_BOLD = "/System/Library/Fonts/Avenir.ttc"


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def fit_into(img, w, h, pad=0, bg=CANVAS_BG):
    """Resize img to fit within (w-pad*2, h-pad*2), centered on a (w,h) bg canvas."""
    canvas = Image.new("RGB", (w, h), bg)
    avail_w, avail_h = w - pad * 2, h - pad * 2
    img = img.copy()
    img.thumbnail((avail_w, avail_h), Image.LANCZOS)
    x = (w - img.width) // 2
    y = (h - img.height) // 2
    if img.mode == "RGBA":
        canvas.paste(img, (x, y), img)
    else:
        canvas.paste(img, (x, y))
    return canvas


def cover_crop(img, w, h):
    """Resize img to cover (w,h) from center."""
    src_w, src_h = img.size
    target_ratio = w / h
    src_ratio = src_w / src_h
    if src_ratio > target_ratio:
        new_w = int(src_h * target_ratio)
        x = (src_w - new_w) // 2
        img = img.crop((x, 0, x + new_w, src_h))
    else:
        new_h = int(src_w / target_ratio)
        y = (src_h - new_h) // 2
        img = img.crop((0, y, src_w, y + new_h))
    return img.resize((w, h), Image.LANCZOS)


def draw_text_centered(draw, text, font_, y, w, fill=(40, 35, 30)):
    bbox = draw.textbbox((0, 0), text, font=font_)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, y), text, font=font_, fill=fill)
    return bbox[3] - bbox[1]


# ----------------------------------------------------------------------
# POST 2: 4-up personalization showcase
# ----------------------------------------------------------------------
def post_2():
    canvas = Image.new("RGB", (SIZE, SIZE), CANVAS_BG)
    char_files = [
        "char-same-1-brown-bun-tan.png",
        "char-same-2-blonde-light.png",
        "char-same-5-curly-dark.png",
        "char-same-6-redbuns-light.png",
    ]
    cell = SIZE // 2
    pad = 12
    for i, fname in enumerate(char_files):
        img = Image.open(PREVIEW / fname).convert("RGB")
        cell_img = fit_into(img, cell - pad * 2, cell - pad * 2, pad=20, bg=CANVAS_BG)
        x = (i % 2) * cell + pad
        y = (i // 2) * cell + pad
        canvas.paste(cell_img, (x, y))

    # subtle dividers
    draw = ImageDraw.Draw(canvas)
    line_color = (235, 226, 213)
    draw.line([(SIZE // 2, 30), (SIZE // 2, SIZE - 30)], fill=line_color, width=2)
    draw.line([(30, SIZE // 2), (SIZE - 30, SIZE // 2)], fill=line_color, width=2)

    out = OUT / "post-2-personalization-showcase.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# POST 3: spread teaser
# ----------------------------------------------------------------------
def post_3():
    # Use a clean watercolor background page (no story text)
    # page03-magic-doorway has the most "step into the journey" energy
    bg = Image.open(PAGES / "page03-magic-doorway.jpeg").convert("RGB")
    img = cover_crop(bg, SIZE, SIZE)
    out = OUT / "post-3-spread-teaser.png"
    img.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# POST 6a: Hair styles
# ----------------------------------------------------------------------
def post_6a():
    canvas = Image.new("RGB", (SIZE, SIZE), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)

    title_font = font(SANS, 44, index=2)  # Avenir medium
    bbox = draw.textbbox((0, 0), "12 hair styles", font=title_font)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2, 50), "12 hair styles", font=title_font, fill=(50, 40, 30))

    # Pick 12 representative styles. Prefer color-diverse using `generated/` if available.
    styles = [
        "side-part",
        "straight-short",
        "straight-medium",
        "straight-long",
        "curly-short",
        "curly-medium",
        "curly-long",
        "afro",
        "bun",
        "pigtails",
        "ponytail",
        "buzz",
    ]
    # Use generated color variants for variety
    color_cycle = [
        "blonde",
        "dark-brown",
        "red",
        "black",
        "auburn",
        "medium-brown",
        "blonde",
        "dark-brown",
        "red",
        "black",
        "auburn",
        "medium-brown",
    ]

    cols, rows = 4, 3
    grid_top = 140
    grid_bottom = SIZE - 60
    cell_w = SIZE // cols
    cell_h = (grid_bottom - grid_top) // rows
    for i, (style, color) in enumerate(zip(styles, color_cycle)):
        col = i % cols
        row = i // cols
        cx = col * cell_w
        cy = grid_top + row * cell_h
        # Try color variant first
        candidate = HAIR / "generated" / f"{style}-{color}.jpg"
        if not candidate.exists():
            candidate = HAIR / f"{style}.png"
        try:
            ref = Image.open(candidate).convert("RGB")
        except Exception:
            continue
        thumb = fit_into(ref, cell_w - 16, cell_h - 28, pad=8, bg=CANVAS_BG)
        canvas.paste(thumb, (cx + 8, cy))

    out = OUT / "post-6a-hair-styles.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# POST 6b: Skin tones + hair colors as swatches
# ----------------------------------------------------------------------
def post_6b():
    canvas = Image.new("RGB", (SIZE, SIZE), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)

    section_title = font(SANS, 38, index=2)
    body_label = font(SANS, 22, index=0)

    # Header
    h1 = font(SANS, 44, index=2)
    bbox = draw.textbbox((0, 0), "5 skin tones, 8 hair colors", font=h1)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2, 60), "5 skin tones, 8 hair colors", font=h1, fill=(50, 40, 30))

    # Skin tones row
    label_y = 200
    draw.text((100, label_y), "Skin tones", font=section_title, fill=(80, 60, 40))
    swatch_d = 130
    skin_y = label_y + 70
    skin_count = len(SKIN_TONES)
    skin_total = swatch_d * skin_count + 30 * (skin_count - 1)
    skin_x_start = (SIZE - skin_total) // 2
    for i, (name, hex_) in enumerate(SKIN_TONES):
        x = skin_x_start + i * (swatch_d + 30)
        draw.ellipse([x, skin_y, x + swatch_d, skin_y + swatch_d], fill=hex_to_rgb(hex_), outline=(225, 215, 200), width=2)

    # Hair colors row
    label2_y = skin_y + swatch_d + 90
    draw.text((100, label2_y), "Hair colors", font=section_title, fill=(80, 60, 40))
    hair_d = 90
    hair_y = label2_y + 60
    hair_count = len(HAIR_COLORS)
    hair_total = hair_d * hair_count + 18 * (hair_count - 1)
    hair_x_start = (SIZE - hair_total) // 2
    for i, (name, hex_) in enumerate(HAIR_COLORS):
        x = hair_x_start + i * (hair_d + 18)
        draw.ellipse([x, hair_y, x + hair_d, hair_y + hair_d], fill=hex_to_rgb(hex_), outline=(225, 215, 200), width=2)

    out = OUT / "post-6b-skin-and-hair-colors.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# POST 6c: Animal companions
# ----------------------------------------------------------------------
def post_6c():
    canvas = Image.new("RGB", (SIZE, SIZE), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)

    h1 = font(SANS, 44, index=2)
    bbox = draw.textbbox((0, 0), "8 animal companions", font=h1)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2, 50), "8 animal companions", font=h1, fill=(50, 40, 30))

    animals = ["dog", "cat", "owl", "lion", "tiger", "penguin", "t-rex", "unicorn"]
    cols, rows = 4, 2
    grid_top = 160
    grid_bottom = SIZE - 60
    cell_w = SIZE // cols
    cell_h = (grid_bottom - grid_top) // rows

    label_font = font(SANS, 22, index=0)

    for i, name in enumerate(animals):
        col = i % cols
        row = i // cols
        cx = col * cell_w
        cy = grid_top + row * cell_h
        candidate = ANIMALS / f"{name}.png"
        try:
            img = Image.open(candidate).convert("RGBA")
        except Exception:
            continue
        # Composite onto white panel for clean look
        panel = Image.new("RGB", (cell_w - 20, cell_h - 50), (255, 252, 246))
        thumb = img.copy()
        thumb.thumbnail((panel.width - 20, panel.height - 20), Image.LANCZOS)
        px = (panel.width - thumb.width) // 2
        py = (panel.height - thumb.height) // 2
        panel.paste(thumb, (px, py), thumb)
        canvas.paste(panel, (cx + 10, cy))

        # label
        bbox = draw.textbbox((0, 0), name.upper().replace("-", "-"), font=label_font)
        lw = bbox[2] - bbox[0]
        lx = cx + (cell_w - lw) // 2
        ly = cy + cell_h - 40
        draw.text((lx, ly), name.upper().replace("-", "-"), font=label_font, fill=(80, 60, 40))

    out = OUT / "post-6c-animal-companions.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# POST 7: theme quote on watercolor
# ----------------------------------------------------------------------
def post_7():
    bg = Image.open(PAGES / "page01-twilight-walk.jpg").convert("RGB")
    img = cover_crop(bg, SIZE, SIZE)

    # Soft dark gradient at bottom for legibility
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    grad_top = int(SIZE * 0.55)
    for i in range(grad_top, SIZE):
        alpha = int(120 * (i - grad_top) / (SIZE - grad_top))
        od.line([(0, i), (SIZE, i)], fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(img)
    quote_font = font(SERIF, 56, index=1)  # italic
    attr_font = font(SERIF, 28, index=0)

    quote_lines = [
        "Sometimes the bravest voice",
        "is the one only you can hear.",
    ]
    text_color = (252, 248, 242)
    line_h = 70
    total_h = line_h * len(quote_lines)
    start_y = SIZE - 230 - total_h // 2
    for line in quote_lines:
        bbox = draw.textbbox((0, 0), line, font=quote_font)
        tw = bbox[2] - bbox[0]
        # subtle drop shadow
        draw.text(((SIZE - tw) // 2 + 2, start_y + 2), line, font=quote_font, fill=(0, 0, 0))
        draw.text(((SIZE - tw) // 2, start_y), line, font=quote_font, fill=text_color)
        start_y += line_h

    attr = "— Finding Our Inner Voice"
    bbox = draw.textbbox((0, 0), attr, font=attr_font)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2 + 1, SIZE - 110 + 1), attr, font=attr_font, fill=(0, 0, 0))
    draw.text(((SIZE - tw) // 2, SIZE - 110), attr, font=attr_font, fill=text_color)

    out = OUT / "post-7-theme-quote.png"
    img.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# POST 9: preview / CTA mockup
# ----------------------------------------------------------------------
def post_9():
    canvas = Image.new("RGB", (SIZE, SIZE), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)

    # Top: cover image, scaled and centered
    cover = Image.open(PREVIEW / "cover-laney-front.png").convert("RGB")
    cover_size = 540
    cover.thumbnail((cover_size, cover_size), Image.LANCZOS)
    # subtle drop shadow rectangle behind cover
    cw, ch = cover.size
    cx = (SIZE - cw) // 2
    cy = 100
    # shadow
    shadow = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rectangle([20, 20, cw + 20, ch + 20], fill=(60, 40, 30, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(15))
    canvas.paste(shadow.convert("RGB"), (cx - 20, cy - 20), shadow)
    canvas.paste(cover, (cx, cy))

    # CTA block below
    title_font = font(SERIF, 52, index=1)  # italic
    sub_font = font(SANS, 28, index=0)
    cta_font = font(SANS, 32, index=2)  # medium

    line1 = "See what your kid's"
    line2 = "book would look like."
    sub = "Pick the hair, skin tone, animal companion."
    cta = "littleherolabs.com/preview"

    y = cy + ch + 60
    bbox = draw.textbbox((0, 0), line1, font=title_font)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2, y), line1, font=title_font, fill=(50, 40, 30))
    y += 64
    bbox = draw.textbbox((0, 0), line2, font=title_font)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2, y), line2, font=title_font, fill=(50, 40, 30))
    y += 80
    bbox = draw.textbbox((0, 0), sub, font=sub_font)
    tw = bbox[2] - bbox[0]
    draw.text(((SIZE - tw) // 2, y), sub, font=sub_font, fill=(110, 90, 70))
    y += 50
    bbox = draw.textbbox((0, 0), cta, font=cta_font)
    tw = bbox[2] - bbox[0]
    # draw a soft pill background behind CTA
    pill_pad_x = 28
    pill_pad_y = 14
    pill_x0 = (SIZE - tw) // 2 - pill_pad_x
    pill_y0 = y - pill_pad_y // 2
    pill_x1 = (SIZE + tw) // 2 + pill_pad_x
    pill_y1 = y + (bbox[3] - bbox[1]) + pill_pad_y
    draw.rounded_rectangle(
        [pill_x0, pill_y0, pill_x1, pill_y1],
        radius=24,
        fill=(232, 196, 142),
    )
    draw.text(((SIZE - tw) // 2, y), cta, font=cta_font, fill=(50, 40, 30))

    out = OUT / "post-9-preview-cta.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# ----------------------------------------------------------------------
# HIGHLIGHTS COVERS
# 1080x1920 (Story format). Icon centered in a ~700px circle.
# ----------------------------------------------------------------------
def highlight_cover(name, draw_icon, bg_color=(247, 232, 210)):
    """name: file slug. draw_icon: callable(draw, cx, cy, size) that draws onto canvas."""
    canvas = Image.new("RGB", (1080, 1920), bg_color)
    cx, cy = 540, 960
    icon_size = 360
    draw = ImageDraw.Draw(canvas)
    # subtle inner ring for visual structure
    ring_d = 540
    draw.ellipse(
        [cx - ring_d // 2, cy - ring_d // 2, cx + ring_d // 2, cy + ring_d // 2],
        outline=(220, 198, 168),
        width=4,
    )
    draw_icon(draw, canvas, cx, cy, icon_size)
    out = OUT.parent / "highlights" / f"highlight-cover-{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def icon_about(draw, canvas, cx, cy, size):
    """A simple book icon: open book silhouette in deep brown."""
    # book base
    color = (90, 60, 40)
    half = size // 2
    book_w = int(size * 0.95)
    book_h = int(size * 0.7)
    x0 = cx - book_w // 2
    y0 = cy - book_h // 2
    x1 = cx + book_w // 2
    y1 = cy + book_h // 2
    # spine line (vertical down center)
    draw.line([(cx, y0 + 20), (cx, y1 - 20)], fill=color, width=6)
    # left page
    draw.rounded_rectangle([x0, y0, cx - 4, y1], radius=18, outline=color, width=8)
    # right page
    draw.rounded_rectangle([cx + 4, y0, x1, y1], radius=18, outline=color, width=8)
    # text lines (suggestion of pages)
    line_color = (160, 130, 100)
    for i in range(3):
        y = y0 + 70 + i * 40
        draw.line([(x0 + 40, y), (cx - 30, y)], fill=line_color, width=5)
        draw.line([(cx + 30, y), (x1 - 40, y)], fill=line_color, width=5)


def icon_sample(draw, canvas, cx, cy, size):
    """A magnifying glass icon, suggesting 'preview / try'."""
    color = (90, 60, 40)
    glass_d = int(size * 0.7)
    glass_x = cx - 30
    glass_y = cy - 20
    # circle (lens)
    draw.ellipse(
        [glass_x - glass_d // 2, glass_y - glass_d // 2, glass_x + glass_d // 2, glass_y + glass_d // 2],
        outline=color,
        width=14,
    )
    # handle (line at 45deg lower-right)
    handle_start = (glass_x + int(glass_d * 0.35), glass_y + int(glass_d * 0.35))
    handle_end = (glass_x + int(glass_d * 0.75), glass_y + int(glass_d * 0.75))
    draw.line([handle_start, handle_end], fill=color, width=18)
    # tiny sparkle inside the lens (suggesting 'magic preview')
    sparkle_color = (180, 130, 70)
    sx, sy = glass_x - 30, glass_y - 30
    draw.line([(sx - 10, sy), (sx + 10, sy)], fill=sparkle_color, width=4)
    draw.line([(sx, sy - 10), (sx, sy + 10)], fill=sparkle_color, width=4)


def highlights():
    highlight_cover("about", icon_about)
    highlight_cover("sample", icon_sample)


def main():
    print("Generating IG launch posts...")
    post_2()
    post_3()
    post_6a()
    post_6b()
    post_6c()
    post_7()
    post_9()
    print("Generating Highlights covers...")
    highlights()
    print("Done.")


if __name__ == "__main__":
    main()
