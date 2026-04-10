"""
Migrate word_forms.json morph strings to structured JSON objects.
Writes both static/data/Greek/word_forms.json and functions/data/Greek/word_forms.json.

Dot-notation patterns handled:
  noun.{gender}.{number}.{case}
  adj.{gender}.{number}.{case}
  art.{gender}.{number}.{case}
  verb.{tense}.{mood}.{voice}.{person}{number}   e.g. verb.pres.indic.act.3sg
  verb.{tense}.inf.{voice}                        e.g. verb.pres.inf.act
  pron.personal.{person}.{number}.{case}
  pron.autos.{gender}.{number}.{case}
  pron.relative.{gender}.{number}.{case}
  prep | conj | adv | interj                      uninflected
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC  = ROOT / 'static/data/Greek/word_forms.json'
DST1 = ROOT / 'static/data/Greek/word_forms.json'
DST2 = ROOT / 'functions/data/Greek/word_forms.json'

PERSONS = {'1', '2', '3'}
NUMBERS = {'sg', 'pl'}
GENDERS = {'masc', 'fem', 'neut'}
CASES   = {'nom', 'gen', 'dat', 'acc', 'voc'}
TENSES  = {'pres', 'imperf', 'fut', 'aor', 'perf', 'plup'}
MOODS   = {'indic', 'subj', 'opt', 'imper', 'inf'}
VOICES  = {'act', 'mid', 'pass', 'mp'}
UNINFLECTED = {'prep', 'conj', 'adv', 'interj', 'particle', 'numeral', 'prefix'}

PERSON_NUMBER_RE = re.compile(r'^([123])(sg|pl)$')


def parse_morph(s):
    """Convert dot-notation morph string to structured dict. Returns None on failure."""
    if not s:
        return None

    parts = s.split('.')
    pos = parts[0]

    # ── Uninflected ───────────────────────────────────────────────────────────
    if pos in UNINFLECTED:
        return {'pos': pos}

    # ── Noun / Adjective / Article ────────────────────────────────────────────
    if pos in ('noun', 'adj', 'art'):
        if len(parts) != 4:
            return None
        _, gender, number, case = parts
        if gender not in GENDERS or number not in NUMBERS or case not in CASES:
            return None
        return {'pos': pos, 'gender': gender, 'number': number, 'case': case}

    # ── Verb ──────────────────────────────────────────────────────────────────
    if pos == 'verb':
        if len(parts) < 4:
            return None
        tense = parts[1]
        mood  = parts[2]
        voice = parts[3]

        if tense not in TENSES or voice not in VOICES:
            return None

        if mood == 'inf':
            return {'pos': 'verb', 'tense': tense, 'mood': 'inf', 'voice': voice}

        if mood not in MOODS:
            return None

        if len(parts) != 5:
            return None

        m = PERSON_NUMBER_RE.match(parts[4])
        if not m:
            return None
        person, number = m.group(1), m.group(2)
        return {'pos': 'verb', 'tense': tense, 'mood': mood,
                'voice': voice, 'person': person, 'number': number}

    # ── Pronoun ───────────────────────────────────────────────────────────────
    if pos == 'pron':
        if len(parts) < 2:
            return None
        subtype = parts[1]

        if subtype == 'personal':
            # pron.personal.{person}.{number}.{case}
            if len(parts) != 5:
                return None
            _, _, person, number, case = parts
            if person not in PERSONS or number not in NUMBERS or case not in CASES:
                return None
            return {'pos': 'pron', 'subtype': 'personal',
                    'person': person, 'number': number, 'case': case}

        if subtype in ('autos', 'relative'):
            # pron.autos.{gender}.{number}.{case}
            if len(parts) != 5:
                return None
            _, _, gender, number, case = parts
            if gender not in GENDERS or number not in NUMBERS or case not in CASES:
                return None
            return {'pos': 'pron', 'subtype': subtype,
                    'gender': gender, 'number': number, 'case': case}

        # bare pron.{gender}.{number}.{case} — demonstratives, reflexives, indefinites
        if subtype in GENDERS and len(parts) == 4:
            _, gender, number, case = parts
            if number not in NUMBERS or case not in CASES:
                return None
            return {'pos': 'pron', 'subtype': 'other',
                    'gender': gender, 'number': number, 'case': case}

    return None


def morph_to_dot(m):
    """Reconstruct dot string from structured morph (for display only)."""
    if not m:
        return ''
    pos = m.get('pos', '')
    if pos in UNINFLECTED:
        return pos
    if pos in ('noun', 'adj', 'art'):
        return f"{pos}.{m['gender']}.{m['number']}.{m['case']}"
    if pos == 'verb':
        if m.get('mood') == 'inf':
            return f"verb.{m['tense']}.inf.{m['voice']}"
        return f"verb.{m['tense']}.{m['mood']}.{m['voice']}.{m['person']}{m['number']}"
    if pos == 'pron':
        sub = m.get('subtype', '')
        if sub == 'personal':
            return f"pron.personal.{m['person']}.{m['number']}.{m['case']}"
        return f"pron.{sub}.{m['gender']}.{m['number']}.{m['case']}"
    return ''


def migrate(path):
    wf = json.loads(path.read_text())
    ok = fail = 0
    failed_morphs = set()

    for key, entry in wf.items():
        raw = entry.get('morph')
        if raw is None:
            continue
        if isinstance(raw, dict):
            ok += 1  # already migrated
            continue
        parsed = parse_morph(raw)
        if parsed:
            entry['morph'] = parsed
            ok += 1
        else:
            failed_morphs.add(raw)
            fail += 1

    return wf, ok, fail, failed_morphs


if __name__ == '__main__':
    wf, ok, fail, failed = migrate(SRC)

    print(f"Parsed:  {ok}")
    print(f"Failed:  {fail}")
    if failed:
        print("Unrecognized morph strings:")
        for f in sorted(failed):
            print(f"  {f!r}")

    if fail == 0:
        DST1.write_text(json.dumps(wf, ensure_ascii=False))
        DST2.write_text(json.dumps(wf, ensure_ascii=False))
        print(f"\nWrote {DST1}")
        print(f"Wrote {DST2}")
    else:
        print("\nNot writing — fix unrecognized patterns first.")
