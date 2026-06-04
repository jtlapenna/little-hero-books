from pathlib import Path
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BG_DIR = ROOT / "assets" / "background-images-gelato-30"
OUT_DIR = ROOT / "proofs" / "gelato-30-story-proof-jeff-2026-06-02"
PAGES_DIR = OUT_DIR / "pages"

CHARACTER_PATH = ROOT / "renderer-mock" / "assets" / "overlays" / "characters" / "pose01.png"
TEXT_BOX_PATH = ROOT / "assets" / "overlays" / "standard-box.png"
FONT_PATH = ROOT / "renderer-mock" / "assets" / "fonts" / "custom-font.ttf"

SIZE = 2048
TEXT_BOX_WIDTH = 1780
TEXT_BOX_BOTTOM = 70
TEXT_BOX_PAD_X = 160
TEXT_BOX_PAD_Y = 58
FONT_SIZE = 43
PAGE_NUM_FONT_SIZE = 30
CHAR_HEIGHT = 610
CHAR_CENTER = (1024, 910)


def load_font(size):
    try:
        return ImageFont.truetype(str(FONT_PATH), size)
    except Exception:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size)


FONT = load_font(FONT_SIZE)
SMALL_FONT = load_font(PAGE_NUM_FONT_SIZE)


def cover_square(path):
    img = Image.open(path).convert("RGBA")
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    scale = max(SIZE / w, SIZE / h)
    nw, nh = round(w * scale), round(h * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - SIZE) // 2
    top = (nh - SIZE) // 2
    return img.crop((left, top, left + SIZE, top + SIZE))


def make_character():
    img = Image.open(CHARACTER_PATH).convert("RGBA")
    # The sample pose has an opaque white matte. Knock it out for proof compositing.
    data = img.getdata()
    cleaned = []
    for r, g, b, a in data:
        if r > 245 and g > 245 and b > 245:
            cleaned.append((255, 255, 255, 0))
        else:
            cleaned.append((r, g, b, a))
    img.putdata(cleaned)
    ratio = CHAR_HEIGHT / img.height
    return img.resize((round(img.width * ratio), CHAR_HEIGHT), Image.LANCZOS)


CHARACTER = make_character()


def wrap_lines(text, draw, font, max_width):
    lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            test = f"{current} {word}"
            if draw.textbbox((0, 0), test, font=font)[2] <= max_width:
                current = test
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def draw_story_text(page, text):
    text_box = Image.open(TEXT_BOX_PATH).convert("RGBA")
    ratio = TEXT_BOX_WIDTH / text_box.width
    box_h = round(text_box.height * ratio)
    text_box = text_box.resize((TEXT_BOX_WIDTH, box_h), Image.LANCZOS)
    box_x = (SIZE - TEXT_BOX_WIDTH) // 2
    box_y = SIZE - TEXT_BOX_BOTTOM - box_h
    page.alpha_composite(text_box, (box_x, box_y))

    draw = ImageDraw.Draw(page)
    max_width = TEXT_BOX_WIDTH - TEXT_BOX_PAD_X * 2
    lines = wrap_lines(text, draw, FONT, max_width)
    line_height = round(FONT_SIZE * 1.32)
    total_h = line_height * len(lines)
    y = box_y + (box_h - total_h) // 2 - 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=FONT)
        x = box_x + (TEXT_BOX_WIDTH - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=FONT, fill=(49, 33, 22, 255))
        y += line_height


def draw_page_num(page, page_num):
    draw = ImageDraw.Draw(page)
    label = f"Page {page_num:02d}"
    pad_x, pad_y = 26, 18
    bbox = draw.textbbox((0, 0), label, font=SMALL_FONT)
    w = bbox[2] - bbox[0] + pad_x * 2
    h = bbox[3] - bbox[1] + pad_y * 2
    draw.rounded_rectangle((28, 28, 28 + w, 28 + h), radius=16, fill=(255, 247, 226, 190))
    draw.text((28 + pad_x, 28 + pad_y - 3), label, font=SMALL_FONT, fill=(49, 33, 22, 230))


def add_character(page):
    x = CHAR_CENTER[0] - CHARACTER.width // 2
    y = CHAR_CENTER[1] - CHARACTER.height // 2
    page.alpha_composite(CHARACTER, (x, y))


PAGES = [
    (1, "gelato-p01-dedication.jpeg", None, "Made especially for Avery."),
    (2, "gelato-p02-twilight-walk.jpg", "child", "It was bedtime in Maplewood. Avery closed their eyes and took a soft breath.\n\"Let's take a dream-walk,\" a quiet voice whispered."),
    (3, "gelato-p03-star-windowsill.jpg", None, "On the windowsill, a single star shimmered in the moonlight. Avery leaned closer.\n\"Some journeys only begin when we pay attention,\" the voice said. \"Your heart will know the way.\""),
    (4, "gelato-p04-night-forest.jpeg", "child", "Outside, the night sparkled with stars.\n\"Look up,\" the voice said. \"Pause. Breathe. Listen.\""),
    (5, "gelato-p05-listening-stones.jpg", None, "Beside the path, three smooth stones glowed. The first invited patience, the second breath, the third listening.\nAvery touched them, and the night became still."),
    (6, "gelato-p06-magic-doorway.jpeg", "child", "A glowing door opened.\n\"When we listen to our own quiet, new worlds begin to whisper back.\""),
    (7, "gelato-p07-brave-threshold.jpg", None, "The door waited, bright and open. Avery took one brave step closer.\n\"Trust that quiet feeling inside you,\" the voice said. \"It already knows how to begin.\""),
    (8, "gelato-p08-courage-leap.jpeg", "child", "Avery floated among the stars.\n\"This is a place your quiet made,\" the voice whispered.\n\"Whenever the day feels too much, breathe and visit again.\""),
    (9, "gelato-p09-constellation-steps.jpg", None, "The stars arranged themselves into tiny steps. Each one blinked when Avery took a breath.\n\"See?\" said the voice. \"With each breath, you light the next step.\""),
    (10, "gelato-p10-morning-meadow.jpeg", "child", "Avery noticed a trail of paw prints and felt a tiny yes inside.\n\"You can follow me anytime,\" the voice said. Listening helps you find the way."),
    (11, "gelato-p11-dew-trail-trees.jpg", None, "Ahead, the trail changed shape. It curved through the dewy grass, then slipped between the tall trees.\nAvery smiled - the trail seemed to know exactly where to go."),
    (12, "gelato-p12-tall-forest.jpg", "child", "Wind whooshed as Avery ran, light and quick.\n\"Listening brings courage,\" the voice said. \"It can feel like joy.\""),
    (13, "gelato-p13-mountain-vista.jpg", "child", "A wide view appeared.\n\"Sometimes it helps to stop and see how far you've come,\" the voice said."),
    (14, "gelato-p14-quiet-lookout.jpg", None, "At the lookout, the whole world opened up.\nAvery listened to the wind and felt a brave little calm settle inside."),
    (15, "gelato-p15-picnic-surprise.jpg", "child", "Lunch was waiting. \"Hungry? Let's eat,\" the voice said.\n\"Being kind to your body is listening, too.\""),
    (16, "gelato-p16-beach-discovery.jpg", "child", "\"When you look closely, you can find beautiful things,\" the voice said.\nAvery paused and found a shining shell."),
    (17, "gelato-p17-shell-hum-sand.jpg", None, "The shell glowed softly in the sand. A tiny hum moved through the waves beside it.\n\"When something feels true,\" the voice said, \"your heart remembers the sound.\""),
    (18, "gelato-p18-crystal-cave.jpg", "child", "A crystal cave glimmered.\n\"Small steps. Watch where your feet go,\" the voice said. \"Careful can be brave.\""),
    (19, "gelato-p19-silver-cave-echo.jpg", None, "Inside the cave, every step made a silver echo. Avery whispered, \"I can do this.\"\nAnd the cave echoed back, \"You can do this.\""),
    (20, "gelato-p20-giant-flowers.jpg", "child", "Giant flowers stretched overhead. Avery gasped in surprise.\n\"You'll be amazed by what you can grow,\" the voice said."),
    (21, "gelato-p21-flower-trail-clear.jpg", None, "Past the flowers, the trail grew thin and twinkly. For a moment, Avery could not see where it went.\nThen the quiet within grew stronger, and the trail grew clear again."),
    (22, "gelato-p22-almost-there.jpg", "child", "The voice felt very close now, and a trail led deeper between the trees.\n\"To hear me clearly, go quiet inside,\" it said. \"That quiet is your heart.\""),
    (23, "gelato-p23-circle-warm-light.jpg", None, "The trail led into a circle of warm light, then stopped.\nAvery took a soft breath, and something bright began to stir."),
    (24, "gelato-p24-animal-reveal.jpg", None, "Fox stepped from the light, warm and bright.\n\"I've been with you the whole time,\" said Fox. \"I am your quiet inside voice.\""),
    (25, "gelato-p25-realization-light.jpg", None, "Then Avery understood. The voice had not been hiding in the trees or stars.\nIt had been tucked safely inside, helping all along."),
    (26, "gelato-p26-flying-home.jpg", "child", "\"Ready to fly home?\" asked Fox. They whooshed through the stars toward Maplewood.\n\"Wherever you go, pause, breathe, listen. I'm always with you.\""),
    (27, "gelato-p27-homecoming-glow.jpg", None, "Back home, the room was quiet and kind. The whole dream-walk still glimmered in the air.\nAvery settled in, warm and safe - the journey was over, but the quiet stayed close."),
    (28, "gelato-p28-spiral-activity-left.jpg", None, "Trace the path slowly with your finger.\nPause. Breathe. Listen."),
    (29, "gelato-p29-spiral-activity-right.jpg", None, "Pause. Breathe. Listen.\nMy quiet voice is always with me."),
    (30, "gelato-p30-credits.jpg", None, "Made for Avery in Maplewood.\nLittle Hero Labs"),
]


def render():
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    rendered = []
    for page_num, bg_name, character, text in PAGES:
        bg_path = BG_DIR / bg_name
        if not bg_path.exists():
            raise FileNotFoundError(bg_path)
        page = cover_square(bg_path)
        if character == "child":
            add_character(page)
        draw_story_text(page, text)
        draw_page_num(page, page_num)
        out_path = PAGES_DIR / f"page-{page_num:02d}.jpg"
        page.convert("RGB").save(out_path, "JPEG", quality=92, optimize=True)
        rendered.append(out_path)

    pdf_path = OUT_DIR / "finding-our-inner-voice-gelato-30-story-proof-jeff.pdf"
    pdf_images = [Image.open(path).convert("RGB") for path in rendered]
    pdf_images[0].save(pdf_path, save_all=True, append_images=pdf_images[1:], resolution=150)

    readme = OUT_DIR / "README.txt"
    readme.write_text(
        "Finding Our Inner Voice - Gelato 30 story proof for Jeff\n"
        "Generated as a fast pacing/story proof, not production artwork.\n\n"
        "Sample placeholders:\n"
        "- Child name: Avery\n"
        "- Hometown: Maplewood\n"
        "- Pronouns: they/their\n"
        "- Animal: Fox\n\n"
        "Notes:\n"
        "- Uses current assets/background-images-gelato-30 backgrounds.\n"
        "- Uses one local sample child pose on all child-character pages.\n"
        "- Does not include final animal overlay sprites.\n"
        "- Page numbers are added only for review convenience.\n",
        encoding="utf-8",
    )

    print(f"Rendered {len(rendered)} pages")
    print(pdf_path)
    print(PAGES_DIR)


if __name__ == "__main__":
    render()
