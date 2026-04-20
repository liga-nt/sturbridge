"""
build_poem_deck.py

Builds a vocabulary card deck JSON for a Persian poem.

Tokenizes every line, deduplicates surface forms, looks up each token
in the Steingass dictionary, and outputs a draft JSON file for manual
annotation of morphology/prompt_en fields.

Usage:
  python3 scripts/build_poem_deck.py                    # builds rudaki-001
  python3 scripts/build_poem_deck.py --id rudaki-002    # different id

Output:
  static/data/Persian/poems/{id}.json
"""

import json
import sqlite3
import argparse
from pathlib import Path

import hazm

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT         = Path(__file__).parent.parent
STEINGASS_DB = ROOT / "steingass" / "entries_slim.sqlite"
OUT_DIR      = ROOT / "static" / "data" / "Persian" / "poems"

# ── Poem source ───────────────────────────────────────────────────────────────
# بوی جوی مولیان — Rudaki's most famous short poem.
# Persian text as it appears in classical sources.
POEMS = {
    "rudaki-001": {
        "poet":  "Rudaki",
        "title": "بوی جوی مولیان",
        "lines": [
            {"num": 1,  "fa": "بوی جوی مولیان آید همی",        "en": "The scent of the Mūliyān river comes to me"},
            {"num": 2,  "fa": "یاد یار مهربان آید همی",         "en": "The memory of my kind beloved comes to me"},
            {"num": 3,  "fa": "ریگ آموی و درشتی راه او",        "en": "The sands of the Āmū and the roughness of its road"},
            {"num": 4,  "fa": "زیر پایم پرنیان آید همی",        "en": "Beneath my feet feel like silk"},
            {"num": 5,  "fa": "آب جیحون از نشاط ملک شاه",      "en": "The water of the Oxus, from the joy of the king"},
            {"num": 6,  "fa": "بر سر ما همچو باران آید همی",    "en": "Over our heads like rain comes"},
            {"num": 7,  "fa": "شاد باش ای عشق شرکت سوز ما",    "en": "Be joyful, O love that burns our partnerships"},
            {"num": 8,  "fa": "کآب روی ما به خان آید همی",      "en": "For our honor to our dwelling comes"},
            {"num": 9,  "fa": "ای بخارا شاد باش و دیر زی",      "en": "O Bukhara, rejoice and live long"},
            {"num": 10, "fa": "میر زی تو شادمان آید همی",       "en": "The prince comes to you in joy"},
            {"num": 11, "fa": "میر سرو است و بخارا بوستان",      "en": "The prince is a cypress, Bukhara the garden"},
            {"num": 12, "fa": "سرو سوی بوستان آید همی",         "en": "The cypress toward the garden comes"},
            {"num": 13, "fa": "میر ماه است و بخارا آسمان",       "en": "The prince is the moon, Bukhara the sky"},
            {"num": 14, "fa": "ماه سوی آسمان آید همی",          "en": "The moon toward the sky comes"},
        ],
    }
}

# ── Hazm setup ────────────────────────────────────────────────────────────────
normalizer = hazm.Normalizer()
tokenizer  = hazm.WordTokenizer()
lemmatizer = hazm.Lemmatizer()

# ── Steingass lookup ──────────────────────────────────────────────────────────
conn = sqlite3.connect(STEINGASS_DB)
conn.row_factory = sqlite3.Row

def steingass_lookup(surface: str, lemma: str):
    """
    Try to find a Steingass entry for this word.
    1. Exact match on headword_persian
    2. Match on infinitive (past_stem + ن) for verbs (lemma is past#present)
    3. Match on lemma directly
    Returns dict with root_latin, definition, gloss or None.
    """
    def query(word):
        return conn.execute(
            "SELECT headword_latin, definitions FROM entries WHERE headword_persian = ? LIMIT 1",
            (word,)
        ).fetchone()

    row = query(surface)

    if not row and "#" in lemma:
        past_stem = lemma.split("#")[0]
        row = query(past_stem + "ن")   # infinitive: past stem + ن
        if not row:
            row = query(past_stem)

    if not row:
        row = query(lemma)

    if not row:
        return None

    definition = row["definitions"]
    # Extract gloss: first clause before ; or — or newline
    gloss = definition.split(";")[0].split("—")[0].split("\n")[0].strip()
    # Strip leading asterisks and italic markers from headword_latin
    import re
    root_latin = re.sub(r'\*', '', row["headword_latin"]).strip()

    return {
        "root_latin":  root_latin,
        "definition":  definition,
        "gloss":       gloss,
    }

# ── Card builder ──────────────────────────────────────────────────────────────
def build_deck(poem_id: str) -> dict:
    poem = POEMS[poem_id]

    # Collect all (surface, line_num) pairs, preserving first occurrence order
    seen_surfaces = {}   # surface → first line_num it appears on
    for line in poem["lines"]:
        normalized = normalizer.normalize(line["fa"])
        for token in tokenizer.tokenize(normalized):
            token = token.strip()
            if not token:
                continue
            if token not in seen_surfaces:
                seen_surfaces[token] = line["num"]

    # Build cards
    cards = []
    card_num = 1
    for surface, line_num in seen_surfaces.items():
        lemma = lemmatizer.lemmatize(surface)
        entry = steingass_lookup(surface, lemma)

        pos = "verb" if "#" in lemma else "noun"  # rough heuristic

        card = {
            "id":          f"c{card_num:03d}",
            "surface":     surface,
            "lemma":       lemma,
            "root_latin":  entry["root_latin"]  if entry else "",
            "pos":         pos,
            "morphology":  "TODO",
            "prompt_en":   entry["gloss"]       if entry else "TODO",
            "definition":  entry["definition"]  if entry else "",
            "gloss":       entry["gloss"]       if entry else "",
            "line_num":    line_num,
            "audio_url":   "",
        }
        cards.append(card)
        card_num += 1

    return {
        "id":     poem_id,
        "poet":   poem["poet"],
        "title":  poem["title"],
        "lines":  poem["lines"],
        "cards":  cards,
    }

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", default="rudaki-001", help="Poem ID to build")
    args = parser.parse_args()

    if args.id not in POEMS:
        print(f"Unknown poem id '{args.id}'. Available: {list(POEMS.keys())}")
        return

    print(f"Building deck for {args.id}…")
    deck = build_deck(args.id)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{args.id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(deck, f, ensure_ascii=False, indent=2)

    print(f"Wrote {out_path}")
    print(f"\n{len(deck['cards'])} unique surface forms:")
    todo = 0
    for c in deck["cards"]:
        morph_flag = " ← TODO" if not c["root_latin"] else ""
        print(f"  {c['id']}  {c['surface']:15s}  lemma={c['lemma']:20s}  gloss={c['gloss'][:40]}{morph_flag}")
        if not c["root_latin"]:
            todo += 1

    if todo:
        print(f"\n⚠  {todo} cards have no Steingass match — fill in manually.")

if __name__ == "__main__":
    main()
