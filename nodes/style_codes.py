"""--sref style codes: a code picks a few entries of a style list with random weights, always the same for the same code.

From the Style Code nodes of ComfyUI-MiniMax-H3-Concept-Sliders, ComfyUI-MOSS-Concept-Sliders and ComfyUI-Anima-Tag-Sliders
(MIT, quinteroac). The style lists come from comfyui-stylebook and the Anima artists from Anima-Style-Explorer;
see THIRD_PARTY_NOTICES.md.
"""
import json
import os
import random

DATA = os.path.join(os.path.dirname(__file__), "data")


def load_styles(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def load_artists(name):
    """Danbooru artist tags, most trained first, as style entries."""
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return [{"id": line.strip(), "label": line.strip(), "category": "artist", "text": line.strip()} for line in f if line.strip()]


def parse_codes(text):
    """'123 456::0.5, 789' -> [(123, 1.0), (456, 0.5), (789, 1.0)], like --sref 123 456::0.5 789."""
    codes = []
    for part in text.replace(",", " ").split():
        number, _, weight = part.partition("::")
        if not number.isdigit():
            raise ValueError("Style codes are numbers with an optional ::weight, like 123 456::0.5, got '%s'." % part)
        codes.append((int(number), float(weight) if weight else 1.0))
    return codes


def code_styles(code, styles, count, artists=(), artist_count=0):
    """The entries a code stands for and their weights, which average 1 (a flat Dirichlet)."""
    rng = random.Random(code)
    picked = rng.sample(styles, min(count, len(styles)))
    if artists:
        picked += rng.sample(artists, min(artist_count, len(artists)))
    if not picked:
        return []
    draws = [rng.expovariate(1.0) for _ in picked]
    return [(style, len(picked) * d / sum(draws)) for style, d in zip(picked, draws)]


def mix_styles(codes, styles, count, artists=(), artist_count=0):
    weights = {}
    for code, code_weight in codes:
        for style, w in code_styles(code, styles, count, artists, artist_count):
            weights[style["id"]] = (style, weights.get(style["id"], (style, 0.0))[1] + w * code_weight)
    return [entry for entry in weights.values() if entry[1] > 0]


def listing(styles):
    return "\n".join("%s (%s) %.2f" % (style["label"], style["category"], w) for style, w in styles)
