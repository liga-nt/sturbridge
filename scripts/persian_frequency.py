"""
persian_frequency.py

Counts inflected-form (token) and lemma frequencies across the full
PersianPoetry_2/original corpus (48 poets).

Outputs:
  data/Persian/freq_tokens.json  — [ { "form": "...", "count": N }, ... ]
  data/Persian/freq_lemmas.json  — [ { "lemma": "...", "count": N }, ... ]

Both lists are sorted descending by count.

Usage:
  python3 scripts/persian_frequency.py
  python3 scripts/persian_frequency.py --poet moulavi   # single poet only
"""

import os
import re
import json
import argparse
from collections import Counter
from pathlib import Path

import hazm

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT           = Path(__file__).parent.parent
CORPUS_DIR     = ROOT / "PersianPoetry_2" / "original"
STOP_WORDS_FILE = ROOT / "PersianPoetry_2" / "stop_words.txt"
OUT_DIR        = ROOT / "data" / "Persian"
OUT_TOKENS     = OUT_DIR / "freq_tokens.json"
OUT_LEMMAS     = OUT_DIR / "freq_lemmas.json"

# ── Hazm setup ────────────────────────────────────────────────────────────────
normalizer  = hazm.Normalizer()
tokenizer   = hazm.WordTokenizer()
lemmatizer  = hazm.Lemmatizer()

# ── Stop words ────────────────────────────────────────────────────────────────
def load_stop_words(path):
    stop = set()
    with open(path, encoding="utf-8-sig") as f:  # utf-8-sig strips BOM
        for line in f:
            word = line.strip()
            if word:
                stop.add(word)
                # also add hazm-normalized variant
                stop.add(normalizer.normalize(word).strip())
    return stop

STOP_WORDS = load_stop_words(STOP_WORDS_FILE)

# ── Helpers ───────────────────────────────────────────────────────────────────
# Lines that are metadata, not poetry
METADATA_RE = re.compile(r'^number of beyts:', re.IGNORECASE)

# Keep only tokens that are purely Persian/Arabic letters (no digits, punctuation,
# underscores, or mixed compound tokens that hazm joined with _)
PERSIAN_ONLY_RE = re.compile(r'^[\u0600-\u06FF\u200c\u200d]+$')

def is_persian_word(token):
    return bool(PERSIAN_ONLY_RE.match(token))

def is_stop(token):
    return token in STOP_WORDS

def iter_tokens(text):
    """Normalize text and yield individual Persian word tokens."""
    normalized = normalizer.normalize(text)
    for token in tokenizer.tokenize(normalized):
        token = token.strip()
        if token and is_persian_word(token):
            yield token

def lemma_of(token):
    """Return the lemma string for a token. hazm returns 'past#present' for
    verbs; we keep the full string as the lemma key so verb lemmas remain
    distinguishable from bare noun forms."""
    return lemmatizer.lemmatize(token)

def read_corpus(poet_filter=None):
    """Yield (filename, line) pairs from all original corpus files."""
    files = sorted(CORPUS_DIR.glob("*.txt"))
    if poet_filter:
        files = [f for f in files if poet_filter in f.stem]
    if not files:
        raise FileNotFoundError(
            f"No files found in {CORPUS_DIR}"
            + (f" matching '{poet_filter}'" if poet_filter else "")
        )
    for path in files:
        print(f"  Reading {path.name}…")
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or METADATA_RE.match(line):
                    continue
                yield line

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--poet", help="Filter to a single poet filename stem (e.g. moulavi)")
    args = parser.parse_args()

    token_counts = Counter()
    lemma_counts = Counter()
    line_count   = 0

    print(f"\nScanning corpus in {CORPUS_DIR}…")
    for line in read_corpus(poet_filter=args.poet):
        line_count += 1
        for token in iter_tokens(line):
            if is_stop(token):
                continue
            token_counts[token] += 1
            lemma = lemma_of(token)
            if not is_stop(lemma):
                lemma_counts[lemma] += 1

    print(f"\nProcessed {line_count:,} lines.")
    print(f"Unique inflected forms : {len(token_counts):,}")
    print(f"Unique lemmas          : {len(lemma_counts):,}")

    # ── Write output ──────────────────────────────────────────────────────────
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    tokens_out = [{"form": form, "count": n}
                  for form, n in token_counts.most_common()]
    lemmas_out = [{"lemma": lemma, "count": n}
                  for lemma, n in lemma_counts.most_common()]

    with open(OUT_TOKENS, "w", encoding="utf-8") as f:
        json.dump(tokens_out, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {OUT_TOKENS}")

    with open(OUT_LEMMAS, "w", encoding="utf-8") as f:
        json.dump(lemmas_out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT_LEMMAS}")

    # ── Quick preview ─────────────────────────────────────────────────────────
    print("\nTop 20 inflected forms:")
    for item in tokens_out[:20]:
        print(f"  {item['form']:20s}  {item['count']:>6,}")

    print("\nTop 20 lemmas:")
    for item in lemmas_out[:20]:
        print(f"  {item['lemma']:20s}  {item['count']:>6,}")

if __name__ == "__main__":
    main()
