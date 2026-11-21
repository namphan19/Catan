#!/usr/bin/env bash
# Generate 2D art with Tripo text-to-image from tools/art/prompts.tsv.
# Usage: bash tools/art/tripo-gen.sh [name ...]      (no names = every line not yet generated)
# Output: data/raw/tripo/out/<name>.png (git-ignored raw art; tools/art/build.py turns it into game assets).
# Cost: ~10 credits per image (chat_image_2.5_flare, quality=medium). Prompts are text only:
# no reference image is ever uploaded (the rulebook art in docs/art-reference stays local).
set -u
cd "$(dirname "$0")/../.."
export TRIPO_CLIENT_APP=claude
OUT=data/raw/tripo/out
mkdir -p "$OUT" data/raw/tripo/runs
MANIFEST=tools/art/prompts.tsv
PAR=${PAR:-2}  # Tripo returns 429 (concurrency limit) for some jobs at 4 parallel

style() {
  case "$1" in
    terrain) echo "Seamless top-down orthographic view of a hand-painted tabletop miniature diorama. Soft warm afternoon light from the upper left, gentle ambient occlusion, gouache and watercolor texture, rich but slightly muted storybook palette. Bold, readable large shapes and one clearly dominant colour so it still reads when shown small. The scene fills the entire square frame edge to edge: no border, no frame, no hexagon outline, no text, no people, no UI." ;;
    piece) echo "Single minimalist wooden board game piece made of smooth plain geometric shapes with gently rounded edges: no surface details, no windows, no doors, no bricks, no tiles, no texture, no ornaments. Painted entirely in plain matte off-white, seen from a three-quarter view from above (about 40 degrees), centered, filling about 80 percent of the frame, isolated on a fully transparent background, soft studio light from the upper left, no ground, no cast shadow, no base plate, no text." ;;
    piecec) echo "Single minimalist board game piece made of smooth plain geometric shapes with gently rounded edges: no small details, no texture, no ornaments, seen from a three-quarter view from above (about 40 degrees), centered, filling about 80 percent of the frame, isolated on a fully transparent background, soft studio light from the upper left, no ground, no cast shadow, no base plate, no text." ;;
    icon) echo "Single game icon object made of a few smooth plain chunky shapes with gently rounded edges, bold simple silhouette that stays readable at 20 pixels, strong clear colour, seen from a three-quarter view from above, centered, filling 90 percent of the frame, isolated on a fully transparent background, soft studio light from the upper left, no ground, no cast shadow, no text, no small details." ;;
    card) echo "Storybook gouache illustration for a board game card, warm soft light, rich but slightly muted palette, one clear central subject with bold readable silhouette that still reads when shown very small, simple soft background. Full bleed: no border, no frame, no card outline, no text, no letters, no numbers." ;;
  esac
}

gen() {
  local name="$1" kind="$2" size="$3" prompt="$4"
  local bg=() full
  [ "$kind" = piece ] || [ "$kind" = piecec ] || [ "$kind" = icon ] && bg=(-p background=transparent -p output_format=png)
  full="$prompt $(style "$kind")"
  local run="data/raw/tripo/runs/$name"
  rm -rf "$run"; mkdir -p "$run"
  if tripo generate text-to-image "$full" --model chat_image_2.5_flare -p size="$size" -p quality=medium "${bg[@]}" \
      -o "$run" --json --yes >"$run/result.json" 2>"$run/stderr.log"; then
    local img
    img=$(find "$run" -name generated_image.png | head -1)
    cp "$img" "$OUT/$name.png" && echo "OK   $name $(grep -o '"credits_consumed":[0-9]*' "$run/result.json")"
  else
    echo "FAIL $name exit=$? $(tail -2 "$run/stderr.log" | tr '\n' ' ')"
  fi
}
export -f gen style
export OUT

want=" $* "
while IFS=$'\t' read -r name kind size prompt; do
  [ -z "$name" ] || [ "${name:0:1}" = "#" ] && continue
  if [ $# -gt 0 ]; then [[ "$want" == *" $name "* ]] || continue
  else [ -f "$OUT/$name.png" ] && continue; fi
  printf '%s\0%s\0%s\0%s\0' "$name" "$kind" "$size" "$prompt"
done <"$MANIFEST" | xargs -0 -n 4 -P "$PAR" bash -c 'gen "$@"' _
tripo balance --json
