#!/usr/bin/env zsh
emulate -L zsh
set -euo pipefail

SRC_DIR="${1:-exports/prodigi-book-print/source/Lulu Book Print}"
OUT_DIR="${2:-exports/prodigi-book-print/output}"
TARGET_PX=2480

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

make_page() {
  local input="$1"
  local output="$2"
  magick "$input" \
    -strip \
    -colorspace sRGB \
    -gravity center \
    -crop 2550x2550+0+0 +repage \
    -resize "${TARGET_PX}x${TARGET_PX}" \
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
    -resize "${TARGET_PX}x${TARGET_PX}^" \
    -extent "${TARGET_PX}x${TARGET_PX}" \
    -units PixelsPerInch \
    -density 300 \
    "$output"
}

build_pdf() {
  local name="$1"
  shift
  local -a pages
  pages=("$@")
  local dir="$OUT_DIR/$name-pages"
  rm -rf "$dir"
  mkdir -p "$dir"

  make_cover_half "2601x2625+2602+0" "$dir/001-front-cover.png"

  local idx=2
  local page
  for page in "${pages[@]}"; do
    local formatted
    formatted="$(printf "%03d" "$idx")"
    make_page "$(page_file "$page")" "$dir/${formatted}-content-p${page}.png"
    idx=$((idx + 1))
  done

  local back_index
  back_index="$(printf "%03d" "$idx")"
  make_cover_half "2602x2625+0+0" "$dir/${back_index}-back-cover.png"

  magick -density 300 "$dir"/*.png -compress JPEG -quality 95 "$OUT_DIR/$name.pdf"

  {
    echo -e "pdf_page\trole\tsource"
    echo -e "1\tfront-cover\tcover-spread right half"
    idx=2
    for page in "${pages[@]}"; do
      echo -e "${idx}\tcontent\tp${page}"
      idx=$((idx + 1))
    done
    echo -e "${idx}\tback-cover\tcover-spread left half"
  } > "$OUT_DIR/$name-page-order.tsv"
}

# Prodigi's technical guide says a 26-page PDF creates 24 content pages:
# page 1 front cover, pages 2-25 content, page 26 back cover.
# This variant therefore represents a 20-content-page book.
build_pdf "prodigi-square-20-content-pages-22-page-pdf" \
  00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 00 01 02

# Fallback for the manual upload UI if it treats "20 pages" as the total
# PDF page count instead of content pages.
build_pdf "prodigi-square-20-total-pages-fallback" \
  00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 14

echo "Created:"
echo "$OUT_DIR/prodigi-square-20-content-pages-22-page-pdf.pdf"
echo "$OUT_DIR/prodigi-square-20-total-pages-fallback.pdf"
