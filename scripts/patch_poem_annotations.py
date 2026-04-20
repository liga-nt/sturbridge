"""
patch_poem_annotations.py

Applies morphology and prompt_en annotations to rudaki-001.json.
Run once; safe to re-run (idempotent).
"""

import json
from pathlib import Path

ROOT    = Path(__file__).parent.parent
TARGET  = ROOT / "static" / "data" / "Persian" / "poems" / "rudaki-001.json"

# ── Annotations ───────────────────────────────────────────────────────────────
# Each entry: card_id → { morphology, prompt_en }
PATCHES = {
    "c001": {"morphology": "noun",                                    "prompt_en": "scent, fragrance"},
    "c002": {"morphology": "noun",                                    "prompt_en": "stream, rivulet; canal"},
    "c003": {"morphology": "proper noun",                             "prompt_en": "the Mūliyān river district near Bukhara"},
    "c004": {"morphology": "3rd sg. present indicative",              "prompt_en": "to come, to arrive"},
    "c005": {"morphology": "archaic continuative particle",           "prompt_en": "ever, continuously (classical emphatic particle)"},
    "c006": {"morphology": "noun",                                    "prompt_en": "memory, remembrance"},
    "c007": {"morphology": "noun",                                    "prompt_en": "friend, beloved, companion"},
    "c008": {"morphology": "adjective",                               "prompt_en": "kind, affectionate, loving"},
    "c009": {"morphology": "noun",                                    "prompt_en": "sand, gravel"},
    "c010": {"morphology": "proper noun",                             "prompt_en": "the Āmū (Oxus) river and region"},
    "c011": {"morphology": "conjunction",                             "prompt_en": "and"},
    "c012": {"morphology": "noun; abstract (-ī suffix)",              "prompt_en": "roughness, harshness"},
    "c013": {"morphology": "noun",                                    "prompt_en": "road, way, path"},
    "c014": {"morphology": "3rd sg. pronoun",                         "prompt_en": "he, she, it (3rd person)"},
    "c015": {"morphology": "preposition / adverb",                    "prompt_en": "under, below, beneath"},
    "c016": {"morphology": "noun + 1st sg. possessive (پای + ـم)",   "prompt_en": "my foot"},
    "c017": {"morphology": "noun",                                    "prompt_en": "fine painted silk, brocade"},
    "c018": {"morphology": "noun",                                    "prompt_en": "water"},
    "c019": {"morphology": "proper noun",                             "prompt_en": "the Oxus / Jihūn river (modern Amu Darya)"},
    "c020": {"morphology": "preposition",                             "prompt_en": "from, of, by"},
    "c021": {"morphology": "noun",                                    "prompt_en": "joy, cheerfulness, delight"},
    "c022": {"morphology": "noun",                                    "prompt_en": "king, sovereign; realm"},
    "c023": {"morphology": "noun",                                    "prompt_en": "king, sovereign, monarch"},
    "c024": {"morphology": "preposition / adverb",                    "prompt_en": "on, upon, over"},
    "c025": {"morphology": "noun",                                    "prompt_en": "head; top, summit"},
    "c026": {"morphology": "1st pl. pronoun",                         "prompt_en": "we, us, our"},
    "c027": {"morphology": "comparative particle",                    "prompt_en": "like, as, just as"},
    "c028": {"morphology": "noun",                                    "prompt_en": "rain"},
    "c029": {"morphology": "adjective",                               "prompt_en": "joyful, glad, happy"},
    "c030": {"morphology": "2nd sg. imperative of بودن + vocative ای", "prompt_en": "be! (imperative) · O! (vocative)"},
    "c031": {"morphology": "noun",                                    "prompt_en": "love"},
    "c032": {"morphology": "noun (Arabic loanword)",                  "prompt_en": "partnership, fellowship, association"},
    "c033": {"morphology": "noun / verbal noun",                      "prompt_en": "burning, ardor; grief"},
    "c034": {"morphology": "poetic contraction: که + آب",             "prompt_en": "that our water/honor (که + آب contracted)"},
    "c035": {"morphology": "noun",                                    "prompt_en": "face; honor, dignity (metaphorical)"},
    "c036": {"morphology": "preposition",                             "prompt_en": "to, toward, into"},
    "c037": {"morphology": "noun",                                    "prompt_en": "home, dwelling; lord (title)"},
    "c038": {"morphology": "vocative particle",                       "prompt_en": "O! (vocative particle)"},
    "c039": {"morphology": "proper noun",                             "prompt_en": "Bukhara, the Samanid capital (modern Uzbekistan)"},
    "c040": {"morphology": "2nd sg. imperative of بودن",              "prompt_en": "be! remain! (imperative of 'to be')"},
    "c041": {"morphology": "adverb",                                  "prompt_en": "long, for a long time; late"},
    "c042": {"morphology": "2nd sg. imperative of زیستن",             "prompt_en": "live! (imperative of 'to live')"},
    "c043": {"morphology": "noun (title)",                            "prompt_en": "prince, commander, lord"},
    "c044": {"morphology": "2nd sg. pronoun",                         "prompt_en": "you, thou (2nd person singular)"},
    "c045": {"morphology": "adjective",                               "prompt_en": "joyful, happy, pleased"},
    "c046": {"morphology": "noun",                                    "prompt_en": "cypress tree (symbol of grace and upright beauty)"},
    "c047": {"morphology": "3rd sg. present of بودن",                 "prompt_en": "is (3rd sg. of 'to be')"},
    "c048": {"morphology": "noun",                                    "prompt_en": "garden, orchard"},
    "c049": {"morphology": "directional particle",                    "prompt_en": "toward, in the direction of"},
    "c050": {"morphology": "noun",                                    "prompt_en": "moon; month"},
    "c051": {"morphology": "noun",                                    "prompt_en": "sky, heaven"},
}

# ── Apply ─────────────────────────────────────────────────────────────────────
with open(TARGET, encoding="utf-8") as f:
    data = json.load(f)

patched = 0
for card in data["cards"]:
    if card["id"] in PATCHES:
        p = PATCHES[card["id"]]
        card["morphology"] = p["morphology"]
        card["prompt_en"]  = p["prompt_en"]
        patched += 1

with open(TARGET, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Patched {patched} / {len(data['cards'])} cards → {TARGET}")
