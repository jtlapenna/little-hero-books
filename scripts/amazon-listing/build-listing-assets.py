"""
Build Amazon listing assets from IG launch source files.

Outputs to docs/marketing/amazon-listing-assets/
- listing-images/ (7 main product images, 2000x2000 each)
- aplus-modules/ (A+ Content modules, wide and square variants)

Re-runnable; outputs are deterministic.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = Path(__file__).resolve().parents[2]
IG = REPO / "docs" / "marketing" / "instagram-launch" / "posts"
PREVIEW = REPO / "frontend" / "public" / "preview"
LIFESTYLE = REPO / "docs" / "branding" / "photography"
OUT_BASE = REPO / "docs" / "marketing" / "amazon-listing-assets"
LISTING_OUT = OUT_BASE / "listing-images"
APLUS_OUT = OUT_BASE / "aplus-modules"
LISTING_OUT.mkdir(parents=True, exist_ok=True)
APLUS_OUT.mkdir(parents=True, exist_ok=True)

SERIF = "/System/Library/Fonts/Supplemental/Baskerville.ttc"
SANS = "/System/Library/Fonts/Avenir.ttc"

CREAM = (252, 248, 242)
BROWN_DARK = (52, 36, 22)
BROWN_MID = (110, 80, 50)


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()


def upscale(img, target):
    """Upscale to target square size with LANCZOS."""
    return img.resize((target, target), Image.LANCZOS)


def cover_crop(img, w, h):
    """Crop image to exactly w x h, scaled to cover the area (may crop)."""
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    tgt_ratio = w / h
    if src_ratio > tgt_ratio:
        new_w = int(src_h * tgt_ratio)
        x0 = (src_w - new_w) // 2
        img = img.crop((x0, 0, x0 + new_w, src_h))
    elif src_ratio < tgt_ratio:
        new_h = int(src_w / tgt_ratio)
        y0 = (src_h - new_h) // 2
        img = img.crop((0, y0, src_w, y0 + new_h))
    return img.resize((w, h), Image.LANCZOS)


# =============================================================
# LISTING IMAGES (2000x2000 each)
# =============================================================

def listing_1_primary_white_bg():
    """Image 1: Primary product image. Pure white bg, cover fills ~85%."""
    cover = Image.open(PREVIEW / "cover-laney-front.png").convert("RGB")
    SIZE = 2000
    canvas = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    target_size = int(SIZE * 0.85)
    cover.thumbnail((target_size, target_size), Image.LANCZOS)
    cw, ch = cover.size
    cx = (SIZE - cw) // 2
    cy = (SIZE - ch) // 2
    # Subtle shadow for product depth (allowed; not a watermark)
    shadow = Image.new("RGBA", (cw + 80, ch + 80), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([40, 40, cw + 40, ch + 40], radius=4, fill=(60, 50, 40, 50))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas.paste(shadow.convert("RGB"), (cx - 40, cy - 30), shadow)
    canvas.paste(cover, (cx, cy))
    out = LISTING_OUT / "amazon-image-1-primary-white-bg.jpg"
    canvas.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def listing_2_personalization():
    """Image 2: Personalization showcase. Upscale post-2."""
    img = Image.open(IG / "post-2-personalization-showcase.png").convert("RGB")
    img = upscale(img, 2000)
    out = LISTING_OUT / "amazon-image-2-personalization-showcase.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def listing_3_inside_pages_collage():
    """Image 3: Inside pages collage. 2x2 grid of 4 spreads with cream gutter."""
    SIZE = 2000
    canvas = Image.new("RGB", (SIZE, SIZE), CREAM)
    # Use 4 sources: post-3 (rendered glowing-doorway), post-7 (with quote, real spread),
    # post-8 (bedtime+forest spread photographed), and a rendered preview spread
    sources = [
        IG / "post-3-spread-teaser.png",
        IG / "post-7-theme-quote.png",
        IG / "post-8-spread-detail.jpg",
        PREVIEW / "spread-3-forest-run.png",
    ]
    cell = (SIZE - 60) // 2  # ~970 with 20px gutters
    gutter = 20
    positions = [
        (gutter, gutter),
        (gutter + cell + gutter, gutter),
        (gutter, gutter + cell + gutter),
        (gutter + cell + gutter, gutter + cell + gutter),
    ]
    for src, pos in zip(sources, positions):
        try:
            tile = Image.open(src).convert("RGB")
        except Exception as e:
            print(f"  skip {src.name}: {e}")
            continue
        tile = cover_crop(tile, cell, cell)
        canvas.paste(tile, pos)
    out = LISTING_OUT / "amazon-image-3-inside-pages-collage.jpg"
    canvas.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def listing_4_customization_range():
    """Image 4: Customization range. Upscale post-6a."""
    img = Image.open(IG / "post-6a-hair-styles.png").convert("RGB")
    img = upscale(img, 2000)
    out = LISTING_OUT / "amazon-image-4-customization-range.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def listing_5_gift_lifestyle():
    """Image 5: Gift / lifestyle. Crop original 1500x1125 to 2000x2000."""
    img = Image.open(LIFESTYLE / "lifestyle-parent-child-reading-tiger.jpg").convert("RGB")
    img = cover_crop(img, 2000, 2000)
    out = LISTING_OUT / "amazon-image-5-gift-lifestyle.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def listing_6_quality():
    """Image 6: Quality/Specs. Upscale post-1 (book on linen)."""
    img = Image.open(IG / "post-1-cover.jpg").convert("RGB")
    img = upscale(img, 2000)
    out = LISTING_OUT / "amazon-image-6-quality-specs.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def listing_7_founder():
    """Image 7: Founder. Upscale post-4 + add text overlay at bottom."""
    img = Image.open(IG / "post-4-founder.jpg").convert("RGB")
    img = upscale(img, 2000)
    canvas = img.copy()
    overlay = Image.new("RGBA", (2000, 2000), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # Cream wash bar at bottom for legibility
    bar_top = 1750
    for i in range(bar_top, 2000):
        alpha = int(180 * (i - bar_top) / (2000 - bar_top))
        od.line([(0, i), (2000, i)], fill=(252, 248, 230, alpha))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    f1 = font(SERIF, 64, index=1)  # italic
    f2 = font(SANS, 32, index=0)
    line1 = "Made by two dads in California"
    line2 = "Little Hero Labs"
    bbox = draw.textbbox((0, 0), line1, font=f1)
    tw = bbox[2] - bbox[0]
    draw.text(((2000 - tw) // 2, 1830), line1, font=f1, fill=BROWN_DARK)
    bbox = draw.textbbox((0, 0), line2, font=f2)
    tw = bbox[2] - bbox[0]
    draw.text(((2000 - tw) // 2, 1920), line2, font=f2, fill=BROWN_MID)
    out = LISTING_OUT / "amazon-image-7-founder.jpg"
    canvas.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# =============================================================
# A+ CONTENT MODULES (wide format, 1500x750)
# =============================================================

W = 1500
H = 750  # 2:1 ratio close to Amazon's 970x600 hero banner spec


def aplus_module_1_hero_banner():
    """Module 1 hero: post-2 cropped wide (personalization showcase)."""
    img = Image.open(IG / "post-2-personalization-showcase.png").convert("RGB")
    img = cover_crop(img, W, H)
    out = APLUS_OUT / "aplus-module-1-hero-banner.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def aplus_module_2_differentiator():
    """Module 2 differentiator: post-6a hair styles cropped wide."""
    img = Image.open(IG / "post-6a-hair-styles.png").convert("RGB")
    img = cover_crop(img, W, H)
    out = APLUS_OUT / "aplus-module-2-differentiator.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def aplus_module_3_how_it_works():
    """Module 3 how-it-works: 3-step graphic (text-only, brand colors)."""
    canvas = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(canvas)
    title_f = font(SANS, 36, index=2)
    num_f = font(SERIF, 110, index=1)  # italic numerals
    step_f = font(SANS, 28, index=0)
    # Title
    title = "How it works"
    bbox = draw.textbbox((0, 0), title, font=title_f)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 80), title, font=title_f, fill=BROWN_DARK)
    # 3 columns
    cols = [
        ("1", "Personalize", "Fill in your child's name,\nlook, and animal companion."),
        ("2", "We create", "Your customizations show\nup across every page."),
        ("3", "Printed and shipped", "Made to order. Final delivery\nestimate at checkout."),
    ]
    col_w = W // 3
    for i, (num, head, body) in enumerate(cols):
        cx = i * col_w + col_w // 2
        # Number circle
        circle_r = 60
        cy_circle = 280
        draw.ellipse([cx - circle_r, cy_circle - circle_r, cx + circle_r, cy_circle + circle_r],
                     outline=BROWN_DARK, width=3)
        nbbox = draw.textbbox((0, 0), num, font=num_f)
        nw = nbbox[2] - nbbox[0]
        nh = nbbox[3] - nbbox[1]
        draw.text((cx - nw // 2, cy_circle - nh // 2 - 18), num, font=num_f, fill=BROWN_DARK)
        # Heading
        hbbox = draw.textbbox((0, 0), head, font=title_f)
        hw = hbbox[2] - hbbox[0]
        draw.text((cx - hw // 2, 400), head, font=title_f, fill=BROWN_DARK)
        # Body (multi-line, centered per-line)
        for j, line in enumerate(body.split("\n")):
            lb = draw.textbbox((0, 0), line, font=step_f)
            lw = lb[2] - lb[0]
            draw.text((cx - lw // 2, 470 + j * 38), line, font=step_f, fill=BROWN_MID)
    out = APLUS_OUT / "aplus-module-3-how-it-works.jpg"
    canvas.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def aplus_module_4_theme():
    """Module 4 theme: post-7 cropped wide (already has quote + character)."""
    img = Image.open(IG / "post-7-theme-quote.png").convert("RGB")
    img = cover_crop(img, W, H)
    out = APLUS_OUT / "aplus-module-4-theme.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def aplus_module_5_quality():
    """Module 5 quality: post-1 cropped wide (book on linen)."""
    img = Image.open(IG / "post-1-cover.jpg").convert("RGB")
    img = cover_crop(img, W, H)
    out = APLUS_OUT / "aplus-module-5-quality.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def aplus_module_6_gift():
    """Module 6 gift: post-5 cropped wide (parent + kid reading)."""
    img = Image.open(IG / "post-5-reading-moment.jpg").convert("RGB")
    img = cover_crop(img, W, H)
    out = APLUS_OUT / "aplus-module-6-gift.jpg"
    img.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


def aplus_module_7_founder():
    """Module 7 founder: post-4 cropped wide with text overlay."""
    img = Image.open(IG / "post-4-founder.jpg").convert("RGB")
    img = cover_crop(img, W, H)
    canvas = img.copy()
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    bar_top = int(H * 0.78)
    for i in range(bar_top, H):
        alpha = int(180 * (i - bar_top) / (H - bar_top))
        od.line([(0, i), (W, i)], fill=(252, 248, 230, alpha))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    f1 = font(SERIF, 48, index=1)
    line1 = "Made by two dads in California"
    bbox = draw.textbbox((0, 0), line1, font=f1)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, H - 80), line1, font=f1, fill=BROWN_DARK)
    out = APLUS_OUT / "aplus-module-7-founder.jpg"
    canvas.save(out, "JPEG", quality=92, optimize=True)
    print(f"  wrote {out.relative_to(REPO)}")


# =============================================================
# RUN
# =============================================================

print("Building listing images (2000x2000)...")
listing_1_primary_white_bg()
listing_2_personalization()
listing_3_inside_pages_collage()
listing_4_customization_range()
listing_5_gift_lifestyle()
listing_6_quality()
listing_7_founder()

print("\nBuilding A+ Content modules (1500x750)...")
aplus_module_1_hero_banner()
aplus_module_2_differentiator()
aplus_module_3_how_it_works()
aplus_module_4_theme()
aplus_module_5_quality()
aplus_module_6_gift()
aplus_module_7_founder()

print("\nDone.")
