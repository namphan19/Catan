"""Full Tripo prompts for the Tripo WEBSITE (no CLI): the prompt from prompts.tsv plus the style text that
tripo-gen.sh adds for its kind, ready to paste. Also says which size / background to pick and the file name
to save the image under (data/raw/tripo/out/<name>.png, then: python -I tools/art/build.py <name>).

    python -I tools/art/web-prompts.py t-jungle i-fish        # these lines
    python -I tools/art/web-prompts.py --section Highlands    # every line of a section of prompts.tsv
    python -I tools/art/web-prompts.py --missing              # every line without a raw image yet
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.join(ROOT, 'tools', 'art')
OUT = os.path.join(ROOT, 'data', 'raw', 'tripo', 'out')
TRANSPARENT = {'piece', 'piecetop', 'piecec', 'icon'}
RAW_EXT = ('.png', '.jpg', '.jpeg', '.webp')


def styles():
    """The style texts are defined once, in tripo-gen.sh (style() case branches)."""
    text = open(os.path.join(HERE, 'tripo-gen.sh'), encoding='utf-8').read()
    return dict(re.findall(r'^\s*(\w+)\) echo "(.*)" ;;$', text, re.M))


def rows():
    """(section, name, kind, size, prompt) for every line of prompts.tsv; sections are the # comment lines."""
    section = ''
    for line in open(os.path.join(HERE, 'prompts.tsv'), encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('#'):
            section = line.lstrip('# ').split(' ')[0]
            continue
        parts = line.split('\t')
        if len(parts) == 4:
            yield (section, *parts)


def has_raw(name):
    return any(os.path.exists(os.path.join(OUT, name + e)) for e in RAW_EXT)


def main(args):
    st = styles()
    pick = []
    seen = set()
    all_rows = list(rows())
    if args[:1] == ['--section']:
        pick = [r for r in all_rows if r[0].lower() == args[1].lower()]
    elif args[:1] == ['--missing']:
        pick = [r for r in all_rows if not has_raw(r[1])]
    else:
        pick = [r for r in all_rows if r[1] in args]
    for section, name, kind, size, prompt in pick:
        if name in seen:
            continue  # prompts.tsv lists a few lines twice
        seen.add(name)
        w, h = size.split('x')
        ratio = "1:1 (square)" if w == h else "3:4 portrait (Tripo website has no 2:3; build.py cuts the sides)"
        bg = 'TRANSPARENT background, PNG' if kind in TRANSPARENT else 'normal background'
        print(f'=== {name}  ->  save as data/raw/tripo/out/{name}.png')
        print(f'    size {ratio}, {bg}')
        print(f'{prompt} {st.get(kind, "")}'.strip())
        print()
    if not pick:
        print('no matching lines (names are the first column of tools/art/prompts.tsv)')


if __name__ == '__main__':
    main(sys.argv[1:])
