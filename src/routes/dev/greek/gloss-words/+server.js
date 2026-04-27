import { env } from '$env/dynamic/private';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const WORD_FORMS_PATH = join(process.cwd(), 'static/data/Greek/word_forms.json');

const PARADIGM_KEYS = [
  '1st_declension_feminine_alpha',
  '1st_declension_feminine_eta',
  '2_1_2_adjective',
  '2nd_declension_masculine',
  '2nd_declension_neuter',
  '3rd_declension_dental_stem',
  '3rd_declension_is_stem',
  'alpha_contract_present_indicative_active',
  'definite_article',
  'eimi_present_indicative_active',
  'epsilon_contract_present_indicative_active',
  'omega_verb_present_indicative_active',
  'pronoun_autos',
  'pronoun_personal_1st',
  'pronoun_personal_2nd',
  'pronoun_relative_hos',
];

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export async function POST({ request }) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { tokens } = body;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return Response.json({ error: 'tokens array required' }, { status: 400 });
    }

    const prompt = `You are a Greek lexicographer building a word-form dictionary for a learner app.

For each Greek surface form below, provide a complete entry with ALL inflected forms of that word.

Return a JSON object with this structure:
{
  "<surface_form>": {
    "dictEntry": "<lexical form with full diacritics>",
    "shortDef": "<concise English definition, 3–6 words>",
    "paradigmKey": "<one of the keys listed below, or null>",
    "standard_refs": [],
    "forms": [
      { "form": "<inflected form with full diacritics>", "morph": "<dot-notation morphology>" }
    ]
  }
}

Morphology dot-notation examples:
- noun.fem.sg.gen  noun.masc.pl.nom  noun.neut.sg.dat
- verb.pres.indic.act.3sg  verb.pres.indic.act.3pl  verb.pres.inf.act
- adj.masc.sg.nom  adj.fem.pl.acc  adj.neut.sg.gen
- art.masc.sg.nom  prep  conj  adv  numeral  part

Valid paradigmKey values (use null if none fits):
${PARADIGM_KEYS.join(', ')}

For the "forms" array, include EVERY distinct inflected form in the word's paradigm — all cases/numbers for nouns/adjectives, all persons/numbers/moods for verbs. Use correct polytonic diacritics throughout.

Surface forms to gloss:
${tokens.join(', ')}

Return only valid JSON, no explanation.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: `Anthropic API error: ${err}` }, { status: 500 });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text ?? '';

    let glossed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      glossed = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'Failed to parse Claude response', raw }, { status: 500 });
    }

    // Build flat word_forms entries from the structured response
    const wordForms = JSON.parse(readFileSync(WORD_FORMS_PATH, 'utf-8'));
    const added = {};

    for (const entry of Object.values(glossed)) {
      const { dictEntry, shortDef, paradigmKey, standard_refs, forms } = entry;
      if (!dictEntry || !forms?.length) continue;

      const base = { dictEntry, shortDef, paradigmKey: paradigmKey ?? null, standard_refs: standard_refs ?? [], vocabTier: null };

      for (const { form, morph } of forms) {
        if (!form) continue;
        const wfEntry = { ...base, morph };
        wordForms[form] = wfEntry;
        const stripped = stripDiacritics(form);
        if (stripped !== form) wordForms[stripped] = wfEntry;
      }

      added[dictEntry] = { dictEntry, shortDef, vocabTier: null };
    }

    writeFileSync(WORD_FORMS_PATH, JSON.stringify(wordForms), 'utf-8');

    return Response.json({ glossed: added });

  } catch (e) {
    return Response.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
