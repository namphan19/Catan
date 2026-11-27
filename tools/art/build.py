"""Turn the raw Tripo images (data/raw/tripo/out/*.png, .jpg or .webp) into 2D game assets.

    python -I tools/art/build.py            # writes packages/client/public/assets/art2d/...

terrain  t-<id>.png  -> art2d/terrain/<id>.webp   pointy-top hex cut-out (alpha), bevelled rim
sea      t-sea.png   -> art2d/terrain/sea.webp    made seamless (offset blend) for the SVG pattern
pieces   p-<id>.png  -> art2d/piece/<id>.webp     trimmed; "white" pieces become neutral grey
                                                  so the board can tint them with a multiply filter
cards    c-/d-.png   -> art2d/card/<id>.webp      card ratio 5:7 (resources c-, development d-)
icons    i-<id>.png  -> art2d/icon/<id>.webp      goods icons, 128px with an ink outline
harbor   t-harbor    -> art2d/terrain/harbor.webp shallow water for the 2D harbor tiles
ui       ui-<id>.png -> art2d/ui/<id>.webp        button badges (Tripo website art)
chrome   x-<id>.png  -> art2d/ui/<id>.webp        dialog paper: paper tile, sheet (9-slice), flourish, seal
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'data', 'raw', 'tripo', 'out')
DST = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'art2d')
TINTED = {'settlement', 'city', 'warden', 'caravan', 'cog', 'warship', 'cog-top', 'warship-top', 'landing'}  # player-coloured at runtime
# Mirrored so every building is seen from the same side as the settlement (long face left,
# end face right) - PO: pieces looked rotated in two directions.
MIRROR = {'city'}

HEX_H = 512
HEX_W = round(HEX_H * 3 ** 0.5 / 2)  # 443


def save(img, kind, name, **kw):
    os.makedirs(os.path.join(DST, kind), exist_ok=True)
    path = os.path.join(DST, kind, name + '.webp')
    img.save(path, 'WEBP', method=6, **kw)
    print(f'{kind}/{name}.webp {img.size[0]}x{img.size[1]} {os.path.getsize(path) // 1024} KB')


def hex_mask(w, h, inset=0.0, ss=4):
    """Anti-aliased pointy-top hex mask; inset in pixels."""
    W, H, i = w * ss, h * ss, inset * ss
    pts = [(W / 2, i), (W - i, H / 4 + i / 2), (W - i, 3 * H / 4 - i / 2), (W / 2, H - i), (i, 3 * H / 4 - i / 2), (i, H / 4 + i / 2)]
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def terrain(src, name):
    img = Image.open(src).convert('RGB')
    s = img.size[1]
    cw = round(s * 3 ** 0.5 / 2)
    left = (img.size[0] - cw) // 2
    img = img.crop((left, 0, left + cw, s)).resize((HEX_W, HEX_H), Image.LANCZOS)
    outer = hex_mask(HEX_W, HEX_H)
    # Bevel: light from the upper left. A rim band lit on top-left edges, shaded bottom-right.
    rim = ImageChops.subtract(outer, hex_mask(HEX_W, HEX_H, inset=9))
    grad = Image.linear_gradient('L').resize((HEX_W, HEX_H)).rotate(45, expand=False, fillcolor=128)  # 0 top-left .. 255 bottom-right
    light = Image.new('RGB', img.size, (255, 246, 222))
    dark = Image.new('RGB', img.size, (40, 28, 18))
    lit = ImageChops.multiply(rim, ImageOps.invert(grad)).point(lambda v: int(v * 0.55))
    shade = ImageChops.multiply(rim, grad).point(lambda v: int(v * 0.6))
    img = Image.composite(light, img, lit)
    img = Image.composite(dark, img, shade)
    # Thin ink edge.
    edge = ImageChops.subtract(outer, hex_mask(HEX_W, HEX_H, inset=2)).point(lambda v: int(v * 0.7))
    img = Image.composite(Image.new('RGB', img.size, (59, 47, 47)), img, edge)
    img.putalpha(outer)
    save(img, 'terrain', name, quality=84)


def sea(src):
    img = Image.open(src).convert('RGB').resize((512, 512), Image.LANCZOS)
    w, h = img.size
    shifted = ImageChops.offset(img, w // 2, h // 2)
    # Weight 1 in the middle, 0 on the borders: borders come from the shifted copy, whose
    # wrap-around seam sits in the middle where the original takes over -> tileable.
    mask = Image.new('L', (w, h))
    px = mask.load()
    for y in range(h):
        for x in range(w):
            a = 1 - abs(2 * x / (w - 1) - 1)
            b = 1 - abs(2 * y / (h - 1) - 1)
            m = min(a, b)
            px[x, y] = int(255 * m * m * (3 - 2 * m))
    mask = mask.filter(ImageFilter.GaussianBlur(6))
    save(Image.composite(img, shifted, mask), 'terrain', 'sea', quality=82)


def piece(src, name):
    img = clear_plain_background(Image.open(src))
    alpha = img.getchannel('A').point(lambda v: 0 if v < 12 else v)
    img.putalpha(alpha)
    img = img.crop(alpha.getbbox())
    if name in MIRROR:
        img = ImageOps.mirror(img)
    if name in TINTED:
        lum = img.convert('L')
        hist = sorted(v for v, a in zip(lum.getdata(), img.getchannel('A').getdata()) if a > 200)
        hi = hist[int(len(hist) * 0.97)] if hist else 255
        lo = hist[int(len(hist) * 0.03)] if hist else 0
        # Stretch the shading: lit faces -> 255 (exact player colour), shaded faces -> ~45%,
        # so the plain block shapes keep readable faces after the multiply tint.
        span = max(hi - lo, 1)
        lum = lum.point(lambda v: max(0, min(255, int(115 + (v - lo) * 140 / span))))
        img = Image.merge('RGBA', (lum, lum, lum, img.getchannel('A')))
    img.thumbnail((300, 300), Image.LANCZOS)
    # Thin ink outline (like the vector art) so plain pieces stand out on busy terrain.
    pad = 8
    canvas = Image.new('RGBA', (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    edge = canvas.getchannel('A').point(lambda v: 255 if v > 90 else 0).filter(ImageFilter.MaxFilter(7))
    edge = edge.filter(ImageFilter.GaussianBlur(0.8))
    ink = Image.new('RGBA', canvas.size, INK + (0,))
    ink.putalpha(edge)
    img = Image.alpha_composite(ink, canvas)
    save(img, 'piece', name, quality=90)


INK = (59, 47, 47)
PARCH = (243, 233, 210)
GOLD = (201, 162, 39)


def card(src, name, plate=True):
    """Painted illustration in a parchment frame with a blank nameplate at the foot (the UI
    prints the localised name on it: .res-card-name sits 7px from the bottom of an 84px card)."""
    W, H, ss = 250, 350, 3
    img = Image.open(src).convert('RGB')
    w, h = img.size
    ch = min(h, round(w * 7 / 5))
    top = (h - ch) // 2
    # Wider than 5:7 (e.g. 3:4 from the Tripo website, which has no 2:3): cut the sides instead of squeezing.
    cw = min(w, round(ch * 5 / 7))
    left = (w - cw) // 2
    art = img.crop((left, top, left + cw, top + ch)).resize((W - 24, H - 24), Image.LANCZOS)
    base = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((0, 0, W * ss - 1, H * ss - 1), radius=18 * ss, fill=INK)
    d.rounded_rectangle((4 * ss, 4 * ss, (W - 4) * ss, (H - 4) * ss), radius=15 * ss, fill=PARCH)
    base = base.resize((W, H), Image.LANCZOS)
    m = Image.new('L', (art.size[0] * ss, art.size[1] * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, m.size[0] - 1, m.size[1] - 1), radius=9 * ss, fill=255)
    base.paste(art, (12, 12), m.resize(art.size, Image.LANCZOS))
    if plate:
        over = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
        o = ImageDraw.Draw(over)
        pw, ph, pb = 0.8 * W, 44, 27
        box = ((W - pw) / 2 * ss, (H - pb - ph) * ss, (W + pw) / 2 * ss, (H - pb) * ss)
        o.rounded_rectangle(box, radius=10 * ss, fill=PARCH + (240,), outline=GOLD, width=3 * ss)
        base.alpha_composite(over.resize((W, H), Image.LANCZOS))
    save(base, 'card', name, quality=86)


def clear_plain_background(img, min_lum=170, max_sat=24):
    """Images saved from the Tripo website may come without transparency: a white / flat background, or a
    "transparent" checkerboard (white and light grey squares) baked into the pixels. Every light, nearly
    colourless pixel connected to the image border becomes transparent; light parts inside the object stay
    (they are not connected to the border). Images with real alpha stay as they are."""
    img = img.convert('RGBA')
    if img.getchannel('A').getextrema()[0] < 250:
        return img
    r, g, b, _ = img.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    mn = ImageChops.darker(ImageChops.darker(r, g), b)
    sat_ok = ImageChops.subtract(mx, mn).point(lambda v: 255 if v <= max_sat else 0)
    lum_ok = img.convert('L').point(lambda v: 255 if v >= min_lum else 0)
    mask = ImageChops.multiply(sat_ok, lum_ok)  # 255 = background-like
    w, h = mask.size
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for xy in border:
        if mask.getpixel(xy) == 255:
            ImageDraw.floodfill(mask, xy, 128)
    # 128 = background reached from the border; grow it by a pixel to drop the light anti-aliased fringe.
    bg = mask.point(lambda v: 255 if v == 128 else 0).filter(ImageFilter.MaxFilter(3))
    img.putalpha(ImageChops.subtract(img.getchannel('A'), bg))
    return img


def icon(src, name):
    """Goods icon: trimmed, thin ink outline, 128px (UI shows it at 14-28px, the harbor tile larger)."""
    img = clear_plain_background(Image.open(src))
    alpha = img.getchannel('A').point(lambda v: 0 if v < 12 else v)
    img.putalpha(alpha)
    img = img.crop(alpha.getbbox())
    img.thumbnail((116, 116), Image.LANCZOS)
    pad = 6
    canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    canvas.paste(img, ((128 - img.width) // 2, (128 - img.height) // 2), img)
    edge = canvas.getchannel('A').point(lambda v: 255 if v > 90 else 0).filter(ImageFilter.MaxFilter(5))
    ink = Image.new('RGBA', canvas.size, INK + (0,))
    ink.putalpha(edge.filter(ImageFilter.GaussianBlur(0.6)))
    save(Image.alpha_composite(ink, canvas), 'icon', name, quality=92)


def clear_grey_checker(img, max_sat=14, min_lum=70):
    """For art whose baked-in checkerboard also shows through holes the border cannot reach (a ring of arrows,
    gaps between cards): every nearly colourless pixel becomes transparent, wherever it is. Only for icons made of
    saturated colours and cream, never of grey (steel, stone)."""
    img = img.convert('RGBA')
    r, g, b, a = img.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    mn = ImageChops.darker(ImageChops.darker(r, g), b)
    grey = ImageChops.subtract(mx, mn).point(lambda v: 255 if v <= max_sat else 0)
    lum = img.convert('L').point(lambda v: 255 if v >= min_lum else 0)
    bg = ImageChops.multiply(grey, lum).filter(ImageFilter.MaxFilter(3))
    img.putalpha(ImageChops.subtract(a, bg))
    return img


GREY_CHECKER = ('trade', 'buy-card')


def ui(src, name):
    """Button badge / HUD art (ui-<name>.png -> art2d/ui/<name>.webp): background cleared, trimmed, no extra outline.
    Round badges (end-turn, roll) are 192px (shown at 58px, 3x for sharp screens); the rest 128px."""
    img = clear_plain_background(Image.open(src))
    if name in GREY_CHECKER:
        img = clear_grey_checker(img)
    alpha = img.getchannel('A').point(lambda v: 0 if v < 12 else v)
    img.putalpha(alpha)
    img = img.crop(alpha.getbbox())
    box = 192 if name in ('end-turn', 'roll') else 128
    img.thumbnail((box - 4, box - 4), Image.LANCZOS)
    canvas = Image.new('RGBA', (box, box), (0, 0, 0, 0))
    canvas.paste(img, ((box - img.width) // 2, (box - img.height) // 2), img)
    save(canvas, 'ui', name, quality=92)


def tileable(img, blur=6):
    """Offset blend: the wrap-around seam goes to the middle, where the original takes over."""
    w, h = img.size
    shifted = ImageChops.offset(img, w // 2, h // 2)
    mask = Image.new('L', (w, h))
    px = mask.load()
    for y in range(h):
        for x in range(w):
            a = 1 - abs(2 * x / (w - 1) - 1)
            b = 1 - abs(2 * y / (h - 1) - 1)
            m = min(a, b)
            px[x, y] = int(255 * m * m * (3 - 2 * m))
    return Image.composite(img, shifted, mask.filter(ImageFilter.GaussianBlur(blur)))


def deckle_mask(w, h, depth=5, seed=7):
    """Rectangle whose four edges wander by up to `depth` px (torn handmade paper), anti-aliased."""
    import random
    rnd = random.Random(seed)
    ss = 3

    def wander(n):
        # sum of a few random sine waves + fine jitter, 0..depth
        import math
        waves = [(rnd.uniform(0.5, 1.0), rnd.uniform(3, 60), rnd.uniform(0, 6.3)) for _ in range(7)]
        out = []
        for i in range(n):
            v = sum(a * (0.5 + 0.5 * math.sin(i / n * f * 6.283 + p)) for a, f, p in waves) / sum(a for a, _, _ in waves)
            out.append(depth * ss * min(1.0, max(0.0, v + rnd.uniform(-0.04, 0.04))))
        return out

    W, H = w * ss, h * ss
    top, bottom, left, right = wander(W), wander(W), wander(H), wander(H)
    m = Image.new('L', (W, H), 0)
    pts = [(x, top[x]) for x in range(0, W, 2)] + [(W - 1 - right[y], y) for y in range(0, H, 2)]
    pts += [(x, H - 1 - bottom[x]) for x in range(W - 1, -1, -2)] + [(left[y], y) for y in range(H - 1, -1, -2)]
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def chrome(src, name):
    """Dialog paper (x-<name>.png -> art2d/ui/<name>.webp), PO 2026-11-28:
    paper    seamless parchment tile (dialog bodies, big sheets)
    sheet    one parchment sheet with toasted rim and torn edges, for CSS border-image (9-slice)
    flourish gold divider on black -> alpha from brightness, trimmed
    seal     red wax seal on a dark vignette -> round cut-out"""
    img = Image.open(src).convert('RGB')
    if name == 'paper':
        img = tileable(img.resize((512, 512), Image.LANCZOS))
        save(img, 'ui', 'paper', quality=82)
    elif name == 'sheet':
        # The sheet lies on a tan card (x 37..986, y 33..990 in the 1024px render): keep only the sheet.
        img = img.crop((40, 36, 984, 988)).resize((512, 512), Image.LANCZOS).convert('RGBA')
        img.putalpha(deckle_mask(512, 512, depth=5))
        save(img, 'ui', 'sheet', quality=88)
    elif name == 'flourish':
        lum = img.convert('L')
        # Gold strokes are bright; the soft glow around them is dim -> cut it.
        alpha = lum.point(lambda v: 0 if v < 105 else min(255, (v - 105) * 5))
        rgba = img.convert('RGBA')
        rgba.putalpha(alpha)
        rgba = rgba.crop(alpha.point(lambda v: 255 if v > 40 else 0).getbbox())
        rgba.thumbnail((600, 600), Image.LANCZOS)
        save(rgba, 'ui', 'flourish', quality=90)
    elif name == 'seal':
        s = img.size[0]
        cx, cy, r = s // 2, s // 2 - 6, int(s * 0.44)
        ss = 4
        m = Image.new('L', (s * ss, s * ss), 0)
        ImageDraw.Draw(m).ellipse(((cx - r) * ss, (cy - r) * ss, (cx + r) * ss, (cy + r) * ss), fill=255)
        rgba = img.convert('RGBA')
        rgba.putalpha(m.resize((s, s), Image.LANCZOS))
        rgba = rgba.crop((cx - r, cy - r, cx + r, cy + r)).resize((128, 128), Image.LANCZOS)
        save(rgba, 'ui', 'seal', quality=90)


def main(only):
    for f in sorted(os.listdir(SRC)):
        stem, ext = os.path.splitext(f)
        # .png from the CLI; images saved from the Tripo website may be .jpg or .webp as well.
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp') or (only and stem not in only):
            continue
        kind, _, name = stem.partition('-')
        src = os.path.join(SRC, f)
        if stem == 't-sea':
            sea(src)
        elif kind == 't':
            terrain(src, name)
        elif kind == 'p':
            piece(src, name)
        elif kind == 'i':
            icon(src, name)
        elif kind == 'ui':
            ui(src, name)
        elif kind == 'x':
            chrome(src, name)
        elif kind in ('c', 'd'):
            card(src, name, plate=(kind == "c"))


if __name__ == '__main__':
    main(set(sys.argv[1:]))
