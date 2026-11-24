#!/usr/bin/env bash
# Converts the README screenshots written by portfolio.spec.ts (docs/images/*.png) to WebP and
# removes the PNGs. dashboard-light is cropped to its top 620 px (the rest is empty page).
# Needs ImageMagick 7 (`magick`).
dir="${1:-docs/images}"
for png in "$dir"/*.png; do
  [[ -e "$png" ]] || continue
  webp="${png%.png}.webp"
  crop=()
  [[ "$(basename "$png")" == "dashboard-light.png" ]] && crop=(-crop 1440x620+0+0 +repage)
  magick "$png" "${crop[@]}" -quality 82 -define webp:method=6 "$webp" || { echo "failed: $png" >&2; exit 1; }
  rm -- "$png"
  echo "$webp $(( $(stat -c %s "$webp") / 1024 )) KB"
done
