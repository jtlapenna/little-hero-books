#!/usr/bin/env zsh
emulate -L zsh
set -euo pipefail

SRC_DIR="${1:-exports/prodigi-book-print/source/Lulu Book Print}"
OUT_DIR="${2:-exports/gelato-book-print/output}"

# Gelato 8x8 softcover photo book, 30 inner pages.
# Gelato templates for photo books use:
#   page 1: full cover spread
#   page 2: blank/non-printable front endpaper
#   pages 3-32: 30 inner printable pages
#   page 33: blank/non-printable back endpaper
#
# The selected product is 200x200 mm. Gelato's perfect-bound brochure guidance
# uses 4 mm bleed. For 30 inner pages, applying the brochure example's spine
# ratio gives about 1.714 mm; at 300 dpi this rounds to 20 px.
INTERIOR_PX=2457       # 208 mm at 300 dpi: 200 mm trim + 4 mm bleed each edge
COVER_PANEL_PX=2409    # 204 mm at 300 dpi: one cover panel + one outer bleed
COVER_HEIGHT_PX=2457   # 208 mm at 300 dpi
SPINE_PX=20            # about 1.7 mm at 300 dpi
SPINE_COLOR="#4F5956"

mkdir -p "$OUT_DIR"

cover="$SRC_DIR/32-book-mvp-simple-adventure_orders_847ade56-323c-453c-9982-fcbb006f919c_preview-images_cover-spread.png"

if [[ ! -f "$cover" ]]; then
  echo "Cover spread not found: $cover" >&2
  exit 1
fi

page_file() {
  local page="$1"
  local found
  found="$(find "$SRC_DIR" -maxdepth 1 -type f -name "*_p${page}.png" | sort -n | head -n 1)"
  if [[ -z "$found" ]]; then
    echo "Missing page p${page}" >&2
    exit 1
  fi
  echo "$found"
}

make_inner_page() {
  local input="$1"
  local output="$2"
  magick "$input" \
    -strip \
    -colorspace sRGB \
    -gravity center \
    -resize "${INTERIOR_PX}x${INTERIOR_PX}^" \
    -extent "${INTERIOR_PX}x${INTERIOR_PX}" \
    -units PixelsPerInch \
    -density 300 \
    "$output"
}

make_cover_half() {
  local crop="$1"
  local output="$2"
  magick "$cover" \
    -strip \
    -colorspace sRGB \
    -crop "$crop" +repage \
    -gravity center \
    -resize "${COVER_PANEL_PX}x${COVER_HEIGHT_PX}^" \
    -extent "${COVER_PANEL_PX}x${COVER_HEIGHT_PX}" \
    -units PixelsPerInch \
    -density 300 \
    "$output"
}

tmp="$OUT_DIR/gelato-8x8-30-inner-pages"
rm -rf "$tmp"
mkdir -p "$tmp"

# Page 1: cover spread. Existing source spread is back cover on left, front on right.
make_cover_half "2602x2625+0+0" "$tmp/back-cover.png"
make_cover_half "2601x2625+2602+0" "$tmp/front-cover.png"
magick -size "${SPINE_PX}x${COVER_HEIGHT_PX}" "xc:${SPINE_COLOR}" "$tmp/spine.png"
magick "$tmp/back-cover.png" "$tmp/spine.png" "$tmp/front-cover.png" +append \
  +repage \
  -units PixelsPerInch \
  -density 300 \
  "$tmp/001-cover-spread.png"

# Page 2 and page 33: blank/non-printable endpapers.
magick -size "${INTERIOR_PX}x${INTERIOR_PX}" xc:white \
  -units PixelsPerInch \
  -density 300 \
  "$tmp/002-front-endpaper-blank.png"
magick -size "${INTERIOR_PX}x${INTERIOR_PX}" xc:white \
  -units PixelsPerInch \
  -density 300 \
  "$tmp/033-back-endpaper-blank.png"

# Pages 3-32: 30 inner printable pages.
pages=(00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 00 01 02 03 04 05 06 07 08 09 10 11 12)
idx=3
for page in "${pages[@]}"; do
  formatted="$(printf "%03d" "$idx")"
  make_inner_page "$(page_file "$page")" "$tmp/${formatted}-inner-p${page}.png"
  idx=$((idx + 1))
done

# Normalize density metadata across every assembled page before converting to PDF.
# Some ImageMagick operations drop units/resolution metadata, which can produce
# correct-looking images but wrong PDF media boxes during upload preflight.
magick mogrify -units PixelsPerInch -density 300 "$tmp"/[0-9][0-9][0-9]-*.png

magick "$tmp"/[0-9][0-9][0-9]-*.png -compress JPEG -quality 95 \
  "$OUT_DIR/gelato-8x8-softcover-30-inner-pages-upload.pdf"

{
  echo -e "pdf_page\trole\tsource"
  echo -e "1\tcover-spread\tback cover + #4F5956 spine + front cover"
  echo -e "2\tblank-front-endpaper\tblank"
  idx=3
  for page in "${pages[@]}"; do
    echo -e "${idx}\tinner\tp${page}"
    idx=$((idx + 1))
  done
  echo -e "33\tblank-back-endpaper\tblank"
} > "$OUT_DIR/gelato-8x8-softcover-30-inner-pages-page-order.tsv"

magick montage "$tmp"/[0-9][0-9][0-9]-*.png \
  -thumbnail 260x260 -tile 5x -geometry +12+12 \
  "$OUT_DIR/gelato-8x8-softcover-30-inner-pages-contact-sheet.jpg"

echo "Created:"
echo "$OUT_DIR/gelato-8x8-softcover-30-inner-pages-upload.pdf"
echo "$OUT_DIR/gelato-8x8-softcover-30-inner-pages-contact-sheet.jpg"
echo "$OUT_DIR/gelato-8x8-softcover-30-inner-pages-page-order.tsv"
