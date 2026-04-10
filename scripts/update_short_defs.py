"""
Update short_def fields in word_forms.json from nge_vocabulary.json.
Only updates entries whose dict_entry matches a Greek word in the NGE list.
Writes both static/data/Greek/word_forms.json and functions/data/Greek/word_forms.json.
"""

import json
from pathlib import Path

ROOT = Path(__file__).parent.parent

nge_path = ROOT / 'data/Greek/nge_vocabulary.json'
wf_path  = ROOT / 'static/data/Greek/word_forms.json'
fn_path  = ROOT / 'functions/data/Greek/word_forms.json'

# Build dict_entry → definition from NGE
nge = json.loads(nge_path.read_text())
nge_defs = {e['greek']: e['definition'] for e in nge['entries']}

# Load word_forms
wf = json.loads(wf_path.read_text())

updated = 0
for key, entry in wf.items():
    dict_entry = entry.get('dict_entry')
    if dict_entry and dict_entry in nge_defs:
        new_def = nge_defs[dict_entry]
        if entry.get('short_def') != new_def:
            entry['short_def'] = new_def
            updated += 1

print(f"Updated {updated} entries")

wf_path.write_text(json.dumps(wf))
fn_path.write_text(json.dumps(wf))
print("Wrote static/data/Greek/word_forms.json and functions/data/Greek/word_forms.json")
