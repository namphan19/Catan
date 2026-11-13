# Task: original medieval SVG asset set for Boschtan

Only write in: packages/client/public/assets/ (create it). Do not touch anything else.
Read docs/UI.md first: the art direction, design tokens (colours) and the ASSET CONTRACT (file names,
viewBoxes, currentColor rule). Follow the contract exactly - the frontend is coded against it in parallel.

Style: hand-drawn medieval map - parchment and ink, woodcut feel, flat shapes, 2 px ink (#3B2F2F) outline,
light hatching, terrain colours from docs/UI.md. Everything ORIGINAL: do not copy, trace or imitate the
art, tile frames, card layouts, icons or logos of any commercial board game. No brand logos at all.
Terrain motifs: forest = conifers, claypit = clay pits with brick stacks, meadow = sheep on grass,
field = grain sheaves, quarry = rocks with a pick, waste = dunes/scrub. Cards: guard = shield + spear,
freeRoads = road with milestones, harvest = cornucopia, claim = crown over coins, relic = chalice.

Fonts: download Cinzel and EB Garamond (OFL) woff2 files + their OFL licence text through the proxy
(export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128; curl -sL -m 60 -o <file> <url>)
from the Google Fonts GitHub repo (https://github.com/google/fonts, folders ofl/cinzel and ofl/ebgaramond;
take the .ttf if no woff2 exists) into assets/fonts/. If a download fails, say so in the report and continue.

Rules: hand-write compact SVG (no embedded raster, no external refs, no scripts), each file < 15 KB,
readable at 48 px. Player-coloured parts use fill="currentColor". Write files one by one (small increments).
Also write assets/README.md (every file, viewBox, licence: "original, made for Boschtan" / OFL for fonts)
and assets/preview.html that shows every asset in a grid at 1x and at 48 px (for review; open nothing).

Acceptance: every file listed in the docs/UI.md asset contract exists; a quick check script you run
(e.g. node -e that parses each .svg as XML-ish: starts with <svg, has the required viewBox, no "<image",
no "http" except the xmlns) passes - paste its output. Final report < 40 lines.
