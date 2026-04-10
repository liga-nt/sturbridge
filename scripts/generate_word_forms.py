#!/usr/bin/env python3
"""
Generate clean word_forms.json from nge_vocabulary.json.
One Claude call per vocabulary entry. Saves progress incrementally.

Usage:
  python3 scripts/generate_word_forms.py              # process all pending
  python3 scripts/generate_word_forms.py --retry      # retry only failures
  python3 scripts/generate_word_forms.py --finalize   # write output (even with failures)
  python3 scripts/generate_word_forms.py --preview ἀγαθός  # test one word

Requires: pip install anthropic
          ANTHROPIC_API_KEY in environment
"""

import json, os, re, sys, time
from pathlib import Path
import anthropic

# Load .env from project root if ANTHROPIC_API_KEY not already set
if not os.environ.get('ANTHROPIC_API_KEY'):
    env_file = Path(__file__).parent.parent / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

ROOT         = Path(__file__).parent.parent
VOCAB_FILE   = ROOT / 'data/Greek/nge_vocabulary.json'
PROGRESS_FILE = ROOT / 'data/Greek/word_forms_progress.json'
OUT1         = ROOT / 'static/data/Greek/word_forms.json'
OUT2         = ROOT / 'functions/data/Greek/word_forms.json'

# ── Valid morph field values ───────────────────────────────────────────────────
VALID_POS    = {'noun','verb','adj','art','pron','prep','conj','adv','particle','numeral','prefix','interj'}
VALID_GENDER = {'masc','fem','neut'}
VALID_NUMBER = {'sg','pl'}
VALID_CASE   = {'nom','gen','dat','acc','voc'}
VALID_TENSE  = {'pres','imperf','fut','aor','perf','plup'}
VALID_MOOD   = {'indic','subj','opt','imper','inf'}
VALID_VOICE  = {'act','mid','pass','mp'}
VALID_PERSON = {'1','2','3'}
VALID_SUBTYPE = {'personal','autos','relative','other'}

UNINFLECTED_POS = {'preposition','conjunction','adverb','particle','interjection','prefix','numeral'}

POS_MAP = {
    'noun': 'noun', 'verb': 'verb', 'adjective': 'adj', 'article': 'art',
    'pronoun': 'pron', 'preposition': 'prep', 'conjunction': 'conj',
    'adverb': 'adv', 'particle': 'particle', 'numeral': 'numeral',
    'prefix': 'prefix', 'interjection': 'interj',
}

GENDER_MAP = {'m': 'masc', 'f': 'fem', 'n': 'neut', 'm/f': 'masc'}


# ── Paradigm key assignment (from vocabulary metadata) ────────────────────────

def paradigm_key_for(entry):
    pos = entry['pos']
    greek = entry.get('greek', '')
    decl = entry.get('declension', '')
    gender = entry.get('gender', '')
    gen_ending = entry.get('genitive', '')
    subtype = entry.get('declension_subtype', '')
    pattern = entry.get('declension_pattern', '')

    if pos == 'article':
        return 'definite_article'

    if pos == 'adjective':
        if '2-1-2' in pattern or not pattern:
            return '2_1_2_adjective'
        return '2_1_2_adjective'  # default

    if pos == 'noun':
        if decl == '2nd':
            if gender in ('m',):   return '2nd_declension_masculine'
            if gender in ('n',):   return '2nd_declension_neuter'
            if gender in ('f',):   return '1st_declension_feminine_eta'  # 2nd decl feminine rare
        if decl == '1st':
            # genitive -ης → eta-type; -ας → alpha-type
            if gen_ending in ('-ης', '-ῆς'):  return '1st_declension_feminine_eta'
            if gen_ending in ('-ας', '-ᾶς'):  return '1st_declension_feminine_alpha'
            return '1st_declension_feminine_eta'  # default
        if decl == '3rd':
            st = subtype.lower()
            if 'εσ' in st or 'sigma' in st:          return '3rd_declension_sigma_stem'
            if 'ματ' in st or '-ματ' in st:          return '3rd_declension_mat_stem'
            if 'stem in -ν-' in st:                   return '3rd_declension_nu_stem'
            if 'stem in -ι-' in st:                   return '3rd_declension_iota_stem'
            if 'stem in -δ-' in st or 'stem in -τ-' in st or 'stem in -κτ-' in st:
                return '3rd_declension_dental_stem'
            if 'stem in -ρ-' in st:
                if gen_ending in ('πατρός', 'μητρός', 'ἀνδρός', '-τρός'):
                    return '3rd_declension_er_eros'
                return '3rd_declension_er_eros'
            if 'stem in -υ-' in st:
                if gen_ending in ('-έως', '-εως'):    return '3rd_declension_us_eos'
                return None  # βοῦς, ναῦς — irregular
            if 'stem in -ντ-' in st:                  return '3rd_declension_dental_stem'
        return None

    if pos == 'verb':
        conj = entry.get('conjugation', '')
        if greek == 'εἰμί':             return 'eimi_present_indicative_active'
        if greek.endswith('έω'):        return 'epsilon_contract_present_indicative_active'
        if greek.endswith('άω'):        return 'alpha_contract_present_indicative_active'
        if greek.endswith('εω'):        return 'epsilon_contract_present_indicative_active'
        if greek.endswith('αω'):        return 'alpha_contract_present_indicative_active'
        return 'omega_verb_present_indicative_active'

    if pos == 'pronoun':
        if 'ἐγώ' in greek:             return 'pronoun_personal_1st'
        if 'σύ' in greek:              return 'pronoun_personal_2nd'
        if 'αὐτός' in greek:           return 'pronoun_autos'
        if greek.startswith('ὅς'):     return 'pronoun_relative_hos'
        return None

    return None


# ── Expected form counts ──────────────────────────────────────────────────────

def expected_count(entry):
    pos = entry['pos']
    if pos in UNINFLECTED_POS: return 0
    if pos == 'noun':    return 10
    if pos == 'adjective': return 30
    if pos == 'verb':    return 7
    if pos == 'article': return 24
    return None  # pronouns: variable, don't enforce


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_prompt(entry):
    pos = entry['pos']
    greek = entry['greek']
    definition = entry.get('definition', '')

    header = [
        'Return ONLY a JSON array of form objects — no prose, no markdown fences.',
        f'Generate all inflected forms for the Ancient Greek {pos}: {greek}',
        f'Definition: {definition}',
    ]

    if pos == 'noun':
        gender_code = entry.get('gender', '')
        gender_word = {'m': 'masculine', 'f': 'feminine', 'n': 'neuter', 'm/f': 'masculine or feminine'}.get(gender_code, gender_code)
        decl = entry.get('declension', '')
        gen = entry.get('genitive', '')
        gen_form = f'{greek}{gen}' if gen.startswith('-') else (gen or '?')
        sub = entry.get('declension_subtype', '')
        detail = f'Declension: {decl}  Gender: {gender_word}  Genitive singular: {gen_form}'
        if sub: detail += f'  Stem type: {sub}'
        body = [
            detail,
            'Generate exactly 10 forms: all 5 cases (nom/gen/dat/acc/voc) for both singular and plural.',
            'Every form must carry correct Greek diacritics (accents and breathings).',
            'Schema: {"form":"<Greek>","morph":{"pos":"noun","gender":"<masc|fem|neut>","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}',
        ]

    elif pos == 'adjective':
        pattern = entry.get('declension_pattern', '2-1-2')
        endings = entry.get('endings', '')
        full_hw = f'{greek} {endings}' if endings else greek
        body = [
            f'Pattern: {pattern}  Full headword: {full_hw}',
            'Generate exactly 30 forms: nom/gen/dat/acc/voc × sg/pl × masc/fem/neut.',
            'Every form must carry correct Greek diacritics.',
            'Schema: {"form":"<Greek>","morph":{"pos":"adj","gender":"<masc|fem|neut>","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}',
        ]

    elif pos == 'verb':
        conj = entry.get('conjugation', 'omega')
        note = entry.get('middle_note', '')
        conj_line = f'Conjugation: {conj}-verb'
        if note: conj_line += f'  ({note})'
        body = [
            conj_line,
            'Generate exactly 7 forms: present indicative active (1sg 2sg 3sg 1pl 2pl 3pl) + present active infinitive.',
            'Use recessive accent on finite forms. Every form must carry correct diacritics.',
            'Finite:    {"form":"<Greek>","morph":{"pos":"verb","tense":"pres","mood":"indic","voice":"act","person":"<1|2|3>","number":"<sg|pl>"}}',
            'Infinitive: {"form":"<Greek>","morph":{"pos":"verb","tense":"pres","mood":"inf","voice":"act"}}',
        ]

    elif pos == 'pronoun':
        endings = entry.get('endings', '')
        hw = f'{greek} {endings}' if endings else greek
        body = [
            f'Full headword: {hw}',
            'Generate all standard inflected forms with correct diacritics.',
            'IMPORTANT: Only include singular and plural forms — skip all dual forms.',
            'For 1st/2nd person pronouns include person, number, case.',
            'For 3rd-person-style pronouns (αὐτός, ὅς, demonstratives) include gender, number, case.',
            'morph fields: pos="pron", subtype="<personal|autos|relative|other>", then gender or person, number, case.',
            'Schema: {"form":"<Greek>","morph":{"pos":"pron","subtype":"...","gender":"..." OR "person":"...","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}',
        ]

    elif pos == 'article':
        body = [
            'Generate all 24 forms: nom/gen/dat/acc × sg/pl × masc/fem/neut (no vocative).',
            'Include correct diacritics.',
            'Schema: {"form":"<Greek>","morph":{"pos":"art","gender":"<masc|fem|neut>","number":"<sg|pl>","case":"<nom|gen|dat|acc>"}}',
        ]

    else:
        return None  # uninflected — handled separately

    return '\n'.join(header + [''] + body)


# ── Validation ─────────────────────────────────────────────────────────────────

def filter_forms(forms):
    """Strip dual forms (number='du') — not used in our teaching app."""
    return [f for f in forms if f.get('morph', {}).get('number') != 'du']


def validate_forms(forms, entry):
    """Returns list of error strings (empty = valid)."""
    errors = []
    exp = expected_count(entry)
    if exp is not None and len(forms) != exp:
        errors.append(f'expected {exp} forms, got {len(forms)}')
        if len(forms) == 0:
            return errors  # nothing more to check

    pos_code = POS_MAP.get(entry['pos'], entry['pos'])

    for i, obj in enumerate(forms):
        if not isinstance(obj, dict):
            errors.append(f'form[{i}]: not a dict'); continue
        form = obj.get('form', '')
        morph = obj.get('morph', {})
        if not form:
            errors.append(f'form[{i}]: empty form string'); continue
        if not isinstance(morph, dict):
            errors.append(f'form[{i}]: morph not a dict'); continue
        m_pos = morph.get('pos')
        if m_pos not in VALID_POS:
            errors.append(f'form[{i}] {form!r}: invalid pos {m_pos!r}')
            continue

        if m_pos in ('noun', 'adj', 'art'):
            for field, valid in [('gender', VALID_GENDER), ('number', VALID_NUMBER), ('case', VALID_CASE)]:
                if field == 'case' and m_pos == 'art' and morph.get('case') == 'voc':
                    continue  # articles have no voc
                if morph.get(field) not in valid:
                    errors.append(f'form[{i}] {form!r}: invalid {field}={morph.get(field)!r}')

        elif m_pos == 'verb':
            if morph.get('mood') == 'inf':
                for field, valid in [('tense', VALID_TENSE), ('voice', VALID_VOICE)]:
                    if morph.get(field) not in valid:
                        errors.append(f'form[{i}] {form!r}: inf missing {field}')
            else:
                for field, valid in [('tense', VALID_TENSE), ('mood', VALID_MOOD), ('voice', VALID_VOICE),
                                      ('person', VALID_PERSON), ('number', VALID_NUMBER)]:
                    if morph.get(field) not in valid:
                        errors.append(f'form[{i}] {form!r}: invalid {field}={morph.get(field)!r}')

        elif m_pos == 'pron':
            if morph.get('subtype') not in VALID_SUBTYPE:
                errors.append(f'form[{i}] {form!r}: invalid subtype={morph.get("subtype")!r}')
            if morph.get('number') not in VALID_NUMBER:
                errors.append(f'form[{i}] {form!r}: missing/invalid number')
            if morph.get('case') not in VALID_CASE:
                errors.append(f'form[{i}] {form!r}: missing/invalid case')

    return errors[:5]  # cap at 5 errors to keep retry prompt concise


# ── Short definition helper ───────────────────────────────────────────────────

def short_def(definition):
    """First clause, max 4 words."""
    first = definition.split(';')[0].split(',')[0].strip()
    words = first.split()
    return ' '.join(words[:4])


# ── Output writer ─────────────────────────────────────────────────────────────

def write_output(vocab, done, force=False):
    result = {}

    for entry in vocab:
        greek = entry['greek']
        pos = entry['pos']
        sdef = short_def(entry.get('definition', ''))
        tier = entry.get('introduced', 'intro')
        pos_code = POS_MAP.get(pos, pos)
        pkey = paradigm_key_for(entry)

        if pos in UNINFLECTED_POS:
            # Single entry keyed by the headword itself
            result[greek] = {
                'dict_entry': greek,
                'morph': {'pos': pos_code},
                'paradigm_key': None,
                'short_def': sdef,
                'vocab_tier': tier,
            }
            continue

        if greek not in done:
            if not force:
                print(f'  skipping {greek} (not in progress)')
            continue

        for obj in done[greek]:
            form = obj['form']
            morph = obj['morph']
            # Normalise gender codes that Claude might return
            if morph.get('gender') in GENDER_MAP:
                morph['gender'] = GENDER_MAP[morph['gender']]
            result[form] = {
                'dict_entry': greek,
                'morph': morph,
                'paradigm_key': pkey,
                'short_def': sdef,
                'vocab_tier': tier,
            }

    OUT1.write_text(json.dumps(result, ensure_ascii=False, indent=None))
    OUT2.write_text(json.dumps(result, ensure_ascii=False, indent=None))
    print(f'Wrote {len(result)} entries → {OUT1.name}, {OUT2.name}')
    return result


# ── Claude helper ─────────────────────────────────────────────────────────────

def strip_fences(text):
    text = text.strip()
    text = re.sub(r'^```[a-z]*\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return text.strip()


def call_claude(client, prompt, retry_note=None):
    full_prompt = prompt
    if retry_note:
        full_prompt += f'\n\nPrevious attempt had errors — please fix:\n{retry_note}'
    msg = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=2048,
        messages=[{'role': 'user', 'content': full_prompt}]
    )
    text = strip_fences(msg.content[0].text)
    return json.loads(text)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    retry_mode    = '--retry' in args
    finalize_mode = '--finalize' in args
    preview_word  = None
    if '--preview' in args:
        idx = args.index('--preview')
        if idx + 1 < len(args):
            preview_word = args[idx + 1]

    vocab = json.loads(VOCAB_FILE.read_text())['entries']

    # Load progress
    if PROGRESS_FILE.exists():
        progress = json.loads(PROGRESS_FILE.read_text())
    else:
        progress = {'done': {}, 'failed': {}}

    done   = progress['done']    # greek → [form_obj, ...]
    failed = progress['failed']  # greek → error string

    # Preview mode: test prompt + response for one word
    if preview_word:
        entry = next((e for e in vocab if e['greek'] == preview_word), None)
        if not entry:
            print(f'Word {preview_word!r} not found in vocabulary.')
            return
        prompt = build_prompt(entry)
        print('=== PROMPT ===')
        print(prompt)
        print('\n=== CALLING CLAUDE ===')
        client = anthropic.Anthropic()
        try:
            forms = call_claude(client, prompt)
            forms = filter_forms(forms)
            errors = validate_forms(forms, entry)
            print(f'Forms returned: {len(forms)}')
            print(json.dumps(forms, ensure_ascii=False, indent=2))
            if errors:
                print(f'\nValidation errors: {errors}')
            else:
                print('\nValidation: OK')
        except Exception as e:
            print(f'Error: {e}')
        return

    # Finalize mode: just write output from existing progress
    if finalize_mode:
        write_output(vocab, done, force=True)
        if failed:
            print(f'Warning: {len(failed)} words failed and were skipped:')
            for w, err in failed.items():
                print(f'  {w}: {err}')
        return

    # Determine what to process
    to_process = []
    for entry in vocab:
        greek = entry['greek']
        pos = entry['pos']
        if pos in UNINFLECTED_POS:
            continue
        if retry_mode:
            if greek in failed:
                to_process.append(entry)
        else:
            if greek not in done:
                to_process.append(entry)

    if not to_process:
        print('Nothing to process.')
        if failed:
            print(f'{len(failed)} failures remain. Run --retry to attempt them again.')
        else:
            print(f'All {len(done)} words done. Run --finalize to write output.')
        return

    print(f'Processing {len(to_process)} entries (model: claude-sonnet-4-6)...')
    client = anthropic.Anthropic()

    for i, entry in enumerate(to_process):
        greek = entry['greek']
        pos = entry['pos']
        label = f'[{i+1}/{len(to_process)}] {greek} ({pos})'
        print(label, end=' ', flush=True)

        prompt = build_prompt(entry)
        if prompt is None:
            print('(skipped — no prompt)')
            continue

        last_errors = None
        success = False
        for attempt in range(2):
            try:
                forms = call_claude(client, prompt, retry_note=last_errors)
                if not isinstance(forms, list):
                    raise ValueError('response is not a JSON array')
                forms = filter_forms(forms)
                errors = validate_forms(forms, entry)
                if errors:
                    last_errors = '; '.join(errors)
                    if attempt == 0:
                        print(f'retrying ({last_errors}) ...', end=' ', flush=True)
                        time.sleep(0.5)
                        continue
                    # Second attempt still failed
                    failed[greek] = last_errors
                    print(f'FAILED: {last_errors}')
                    break
                # Success
                done[greek] = forms
                failed.pop(greek, None)
                print(f'✓ ({len(forms)} forms)')
                success = True
                break
            except json.JSONDecodeError as e:
                last_errors = f'JSON parse error: {e}'
                if attempt == 0:
                    print(f'retrying (bad JSON) ...', end=' ', flush=True)
                    time.sleep(1)
                    continue
                failed[greek] = last_errors
                print(f'FAILED: {last_errors}')
                break
            except Exception as e:
                last_errors = str(e)[:80]
                if attempt == 0:
                    print(f'retrying ({last_errors}) ...', end=' ', flush=True)
                    time.sleep(2)
                    continue
                failed[greek] = last_errors
                print(f'FAILED: {last_errors}')
                break

        # Save progress every 10 words
        if (i + 1) % 10 == 0:
            PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False))

    # Final progress save
    PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False))

    print(f'\n── Summary ──────────────────────────────────────')
    print(f'Done:   {len(done)}')
    print(f'Failed: {len(failed)}')
    if failed:
        print('Failed words:')
        for w, err in sorted(failed.items()):
            print(f'  {w}: {err}')
        print('\nRun --retry to attempt failures, or --finalize to write with skips.')
    else:
        print('\nAll words complete. Writing output...')
        write_output(vocab, done)


if __name__ == '__main__':
    main()
