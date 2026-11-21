"""Turn the raw Tripo images (data/raw/tripo/out/*.png) into 2D game assets.

    python -I tools/art/build.py            # writes packages/client/public/assets/art2d/...

terrain  t-<id>.png  -> art2d/terrain/<id>.webp   pointy-top hex cut-out (alpha), bevelled rim
sea      t-sea.png   -> art2d/terrain/sea.webp    made seamless (offset blend) for the SVG pattern
pieces   p-<id>.png  -> art2d/piece/<id>.webp     trimmed; "white" pieces become neutral grey
                                                  so the board can tint them with a multiply filter
cards    c-/d-.png   -> art2d/card/<id>.webp      card ratio 5:7 (resources c-, development d-)
icons    i-<id>.png  -> art2d/icon/<id>.webp      goods icons, 128px with an ink outline
harbor   t-harbor    -> art2d/terrain/harbor.webp shallow water for the 2D harbor tiles
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'data', 'raw', 'tripo', 'out')
DST = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'art2d')
TINTED = {'settlement', 'city', 'warden', 'caravan', 'cog', 'warship', 'landing'}  # player-coloured at runtime
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
    img = Image.open(src).convert('RGBA')
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
    art = img.crop((0, top, w, top + ch)).resize((W - 24, H - 24), Image.LANCZOS)
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


def icon(src, name):
    """Goods icon: trimmed, thin ink outline, 128px (UI shows it at 14-28px, the harbor tile larger)."""
    img = Image.open(src).convert('RGBA')
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


def main(only):
    for f in sorted(os.listdir(SRC)):
        stem, ext = os.path.splitext(f)
        if ext != '.png' or (only and stem not in only):
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
        elif kind in ('c', 'd'):
            card(src, name, plate=(kind == "c"))


if __name__ == '__main__':
    main(set(sys.argv[1:]))
