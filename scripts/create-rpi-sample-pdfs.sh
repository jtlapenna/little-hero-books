#!/usr/bin/env zsh
emulate -L zsh
set -euo pipefail

SRC_DIR="${1:-exports/prodigi-book-print/source/Lulu Book Print}"
OUT_DIR="${2:-exports/rpi-book-print/output}"

GUTS_PX=2475          # 8.25 in at 300 dpi
COVER_SIDE_PX=2475    # 8.25 in at 300 dpi
COVER_HEIGHT_PX=2550  # 8.5 in at 300 dpi
SPINE_PX=19           # 0.0625 in at 300 dpi, rounded
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

make_guts_page() {
  local input="$1"
  local output="$2"
  magick "$input" \
    -strip \
    -colorspace sRGB \
    -resize "${GUTS_PX}x${GUTS_PX}" \
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
    -resize "${COVER_SIDE_PX}x${COVER_HEIGHT_PX}^" \
    -extent "${COVER_SIDE_PX}x${COVER_HEIGHT_PX}" \
    -units PixelsPerInch \
    -density 300 \
    "$output"
}

tmp="$OUT_DIR/rpi-8x8-20p-pages"
rm -rf "$tmp"
mkdir -p "$tmp"

# RPI guts PDF: 20 interior pages, 8.25 x 8.25 in media, trims to 8 x 8 in.
pages=(00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 00 01 02)
idx=1
for page in "${pages[@]}"; do
  formatted="$(printf "%03d" "$idx")"
  make_guts_page "$(page_file "$page")" "$tmp/${formatted}-guts-p${page}.png"
  idx=$((idx + 1))
done

magick -density 300 "$tmp"/*-guts-*.png -compress JPEG -quality 95 "$OUT_DIR/rpi-8x8-20p-guts.pdf"

# RPI cover PDF: one spread, back + 0.0625 in spine + front.
make_cover_half "2602x2625+0+0" "$tmp/back-cover.png"
make_cover_half "2601x2625+2602+0" "$tmp/front-cover.png"
magick -size "${SPINE_PX}x${COVER_HEIGHT_PX}" "xc:${SPINE_COLOR}" "$tmp/spine.png"
magick "$tmp/back-cover.png" "$tmp/spine.png" "$tmp/front-cover.png" +append \
  -units PixelsPerInch \
  -density 300 \
  "$tmp/rpi-cover-spread.png"
magick "$tmp/rpi-cover-spread.png" +repage -units PixelsPerInch -density 300 \
  -compress JPEG -quality 95 "$OUT_DIR/rpi-8x8-20p-cover.pdf"

{
  echo -e "pdf_page\trole\tsource"
  idx=1
  for page in "${pages[@]}"; do
    echo -e "${idx}\tguts\tp${page}"
    idx=$((idx + 1))
  done
} > "$OUT_DIR/rpi-8x8-20p-page-order.tsv"

magick montage "$tmp"/*-guts-*.png "$tmp/rpi-cover-spread.png" \
  -thumbnail 300x300 -tile 6x -geometry +12+12 "$OUT_DIR/rpi-8x8-20p-contact-sheet.jpg"

echo "Created:"
echo "$OUT_DIR/rpi-8x8-20p-cover.pdf"
echo "$OUT_DIR/rpi-8x8-20p-guts.pdf"
echo "$OUT_DIR/rpi-8x8-20p-contact-sheet.jpg"
