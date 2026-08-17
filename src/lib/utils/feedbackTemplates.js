/**
 * Single source of truth for teaching-prompt template filling + per-item param
 * extraction. Pure functions only (no Firestore/browser-only imports) so this
 * module is importable both by Node scripts (scripts/pregenerate-*.mjs, via a
 * plain relative import) and by the Vite-bundled client (src/lib/utils/feedback.js
 * re-exports from here).
 *
 * When adding a new item, add its extractor here ONCE — this used to be
 * duplicated between the generation script and the runtime and drifted.
 */

import { instructionTextForQuestion, instructionSegmentsForPart } from './staticInstructions.js';

// ── Template substitution ─────────────────────────────────────────────────────

export function fillTemplate(template, params) {
  if (!template) return null;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? `{{${key}}}`);
}

// Strips [n/d] fraction notation, {?} blanks, and other math/HTML markup down
// to plain English. Needed for two reasons: (1) the LLM prompt shows question
// text as plain prose, and (2) any text-derived placeholder VALUE that ends up
// in a tip/reveal string is rendered as plain text at runtime (not through
// renderMath()), so raw "[3/4]" bracket notation would show up literally to a
// student if left unstripped.
// A handful of generators build a fraction's HTML directly (e.g. when the
// denominator is an unknown variable like <em>c</em>, which [n/d] bracket
// notation can't represent since it requires digits on both sides) instead
// of going through [n/d]. Converted to a plain slash BEFORE the generic tag
// strip below, or the LLM sees the numerator and denominator smashed
// together with no separator at all (this produced a real bug: a fraction
// equation "1/2 = 3/c" was misread as the linear equation "1 2 = 3 c").
function fracSpansToSlash(text) {
  return text.replace(
    /<span class="frac-num">([\s\S]*?)<\/span>\s*<span class="frac-den">([\s\S]*?)<\/span>/g,
    '$1/$2'
  );
}

export function renderForPrompt(text) {
  if (!text) return '';
  return fracSpansToSlash(String(text))
    .replace(/\[(\d+)\/(\d+)\]/g, '$1/$2')
    .replace(/\{?\?\}/g, '[blank]')
    .replace(/<[^>]+>/g, '')
    .replace(/&times;/g, '×')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Speech-safe text rendering ────────────────────────────────────────────────
// renderForPrompt's "3/4" slash notation reads fine as text but ElevenLabs
// mispronounces it (heard live as "3 forters" instead of "three fourths") —
// TTS needs fractions fully spelled out as words, not left for the model's own
// numeral normalization. This is the ONLY place spoken text is prepared, used
// by both renderSpokenFields (audio generation) and every client-side spot
// that re-derives the same text to compute a lookup hash — they must all stay
// byte-identical or audio lookups silently miss.

const FRACTION_WORDS = {
  2: ['half', 'halves'], 3: ['third', 'thirds'], 4: ['quarter', 'quarters'],
  5: ['fifth', 'fifths'], 6: ['sixth', 'sixths'], 7: ['seventh', 'sevenths'],
  8: ['eighth', 'eighths'], 9: ['ninth', 'ninths'], 10: ['tenth', 'tenths'],
  12: ['twelfth', 'twelfths'], 100: ['hundredth', 'hundredths'],
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty'];

function spokenNumber(n) {
  return (n >= 0 && n <= 20) ? NUMBER_WORDS[n] : String(n);
}

export function spokenFraction(numerator, denominator) {
  const num = parseInt(numerator, 10);
  const den = parseInt(denominator, 10);
  const words = FRACTION_WORDS[den];
  // den fails to parse when it's a variable (e.g. "c") rather than a plain
  // digit — speak the original token, not the NaN parseInt produced.
  if (!words) return `${spokenNumber(num)} over ${spokenNumber(Number.isNaN(den) ? denominator : den)}`;
  const [singular, plural] = words;
  return `${spokenNumber(num)} ${num === 1 ? singular : plural}`;
}

export function renderForSpeech(text) {
  if (!text) return '';
  return fracSpansToSlash(String(text))
    .replace(/\[(\d+)\/(\d+)\]/g, (_, n, d) => spokenFraction(n, d))
    .replace(/\{?\?\}/g, 'blank')
    .replace(/<[^>]+>/g, '')
    .replace(/&times;/g, ' times ')
    .replace(/(\d+)\/(\d+)/g, (_, n, d) => spokenFraction(n, d))
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Per-item param extractors ─────────────────────────────────────────────────
// Each fn takes a generated variant and returns a flat { key: value } map.
// Keys become the allowed {{placeholder}} names in the templates.
//
// For multi_part items, MultiPart.svelte calls extractParams(question) ONCE
// (not per part) and reuses the same flat params object to fill every part's
// template — so a multi-part extractor must return one flat object with
// part-prefixed keys (e.g. A_equation, B_length) rather than a nested shape.

const EXTRACTORS = {

  'MA227383': (v) => ({
    personName:    v.stimulus_intro?.split(' ')[0] ?? '',
    numbers:       v.stimulus_params?.rows?.flat().join(', ') ?? '',
    correctLetter: v.correct_answer ?? '',
    correctValue:  v.answer_options?.find(o => o.letter === v.correct_answer)?.text ?? '',
    optionValues:  v.answer_options?.map(o => o.text).join(', ') ?? '',
    wrongValues:   v.answer_options?.filter(o => o.letter !== v.correct_answer).map(o => o.text).join(', ') ?? '',
  }),

  'MA247745': (v) => ({
    personName:    v.stimulus_intro?.split(' ')[0] ?? '',
    width:         String(v.stimulus_params?.width ?? ''),
    height:        String(v.stimulus_params?.height ?? ''),
    correctLetter: v.correct_answer ?? '',
    correctValue:  v.answer_options?.find(o => o.letter === v.correct_answer)?.text ?? '',
    optionValues:  v.answer_options?.map(o => o.text).join(', ') ?? '',
    wrongValues:   v.answer_options?.filter(o => o.letter !== v.correct_answer).map(o => o.text).join(', ') ?? '',
  }),

  // MA713939739 previously lived here as a regex that reverse-engineered
  // multiplier/smallLength out of the composed correct_answer.A equation
  // string. Replaced by generateQ6 (generators.js) exposing variant._params
  // directly — the values were already sitting right there as local
  // variables when the generator picked them; no need to parse them back out
  // of rendered text after the fact.

};

// ── Generic structural param derivation ───────────────────────────────────────
// Covers only what's MECHANICALLY guaranteed correct from a question's shape —
// no semantic guessing (e.g. this never tries to detect "is this word a
// person's name" from free text; that class of value must come from a
// generator's own variant._params, deliberately, not be inferred here).
//
// - multiple_choice / multiple_select: correctLetter/correctValue/optionValues/
//   wrongValues, derived from answer_options + correct_answer.
// - stimulus_params: any scalar field is exposed under its own key name; any
//   array of scalars (or array of arrays of scalars, e.g. number_box's
//   `rows`) is flattened and joined under its own key name. Arrays of objects
//   (rays, arc_labels, stickers, etc.) are left out — too structured to
//   flatten safely/generically; expose via variant._params instead if needed.
export function deriveGenericParams(variant) {
  const params = {};
  if (!variant) return params;

  if ((variant.answer_type === 'multiple_choice' || variant.answer_type === 'multiple_select')
      && Array.isArray(variant.answer_options)
      && variant.answer_options.every(o => typeof o.text === 'string')) {
    const options = variant.answer_options;
    params.optionValues = options.map(o => renderForPrompt(o.text)).join(', ');
    if (typeof variant.correct_answer === 'string') {
      const correctLetter = variant.correct_answer;
      const correctOpt = options.find(o => o.letter === correctLetter);
      params.correctLetter = correctLetter;
      if (correctOpt) params.correctValue = renderForPrompt(correctOpt.text);
      params.wrongValues = options
        .filter(o => o.letter !== correctLetter)
        .map(o => renderForPrompt(o.text))
        .join(', ');
    }
  }

  // Fraction-model options (rectangle grids, no .text) — the shaded amount
  // is still a plain numerator/denominator pair, so it's just as safely
  // derivable as text options are. Without this, a reveal referencing the
  // correct option has no real value to point to and either fabricates one
  // or paraphrases so vaguely it's wrong (caught live on MA803742735, whose
  // reveal invented "4/8" as an equivalent that isn't actually equivalent).
  if ((variant.answer_type === 'multiple_choice' || variant.answer_type === 'multiple_select')
      && Array.isArray(variant.answer_options)
      && variant.answer_options.every(o => o.model && o.model.right && typeof o.model.right.numerator !== 'undefined')
      && typeof variant.correct_answer === 'string') {
    const fmtModel = (o) => `${o.model.right.numerator}/${o.model.right.denominator}`;
    const options = variant.answer_options;
    const correctLetter = variant.correct_answer;
    const correctOpt = options.find(o => o.letter === correctLetter);
    params.correctLetter = correctLetter;
    if (correctOpt) params.correctValue = fmtModel(correctOpt);
    params.optionValues = options.map(fmtModel).join(', ');
    params.wrongValues = options.filter(o => o.letter !== correctLetter).map(fmtModel).join(', ');
  }

  // short_answer / constructed_response: correct_answer is typically already
  // a plain, directly-usable value (a number or short string) rather than
  // something composed/derived — safe to expose generically.
  if ((variant.answer_type === 'short_answer' || variant.answer_type === 'constructed_response')
      && typeof variant.correct_answer === 'string') {
    params.correctValue = renderForPrompt(variant.correct_answer);
  }

  // multi_part: when correct_answer is the standard { A: "...", B: "...", ... }
  // shape with plain string values, expose each part's answer generically as
  // {label}_correctValue — this is the common case (see MA800780932). Items
  // whose per-part answers are themselves composed from values not present
  // in correct_answer (e.g. MA713939739's multiplier/smallLength) still need
  // variant._params for those specific extra values; this generic layer just
  // covers the baseline "what's the answer to this part" case for free.
  if (variant.answer_type === 'multi_part' && Array.isArray(variant.parts)
      && variant.correct_answer && typeof variant.correct_answer === 'object') {
    for (const part of variant.parts) {
      const ca = variant.correct_answer[part.label];
      if (typeof ca === 'string') {
        params[`${part.label}_correctValue`] = renderForPrompt(ca);
      } else if (typeof ca === 'number') {
        params[`${part.label}_correctValue`] = String(ca);
      }
    }
  }

  // true_false_table: statements[].text zipped against the comma-joined
  // True/False correct_answer string — exposed as statement1/answer1,
  // statement2/answer2, etc. so a tip can reference which specific row is
  // true/false and why, not just the number of rows. The raw correct_answer
  // string is always literal "True"/"False", but the student only ever sees
  // the column headers (true_label/false_label, e.g. "Yes"/"No" or "Rounds
  // to 30,000"/"Rounds to 40,000") — so answerN must be mapped through those
  // labels, not left as raw True/False, or the reveal names an option the
  // student never saw.
  if (variant.answer_type === 'true_false_table' && Array.isArray(variant.statements)
      && typeof variant.correct_answer === 'string') {
    const answers = variant.correct_answer.split(',');
    const trueLabel = variant.true_label ?? 'True';
    const falseLabel = variant.false_label ?? 'False';
    variant.statements.forEach((stmt, i) => {
      if (stmt?.text) params[`statement${i + 1}`] = renderForPrompt(stmt.text);
      if (answers[i]) {
        const raw = answers[i].trim();
        params[`answer${i + 1}`] = raw === 'True' ? trueLabel : raw === 'False' ? falseLabel : raw;
      }
    });
  }

  // stimulus_params (most items) and model_params (fraction_model items use
  // this name instead) get the same scalar/array-of-scalar auto-exposure.
  for (const paramsField of [variant.stimulus_params, variant.model_params]) {
    if (!paramsField || typeof paramsField !== 'object') continue;
    for (const [key, value] of Object.entries(paramsField)) {
      if (typeof value === 'string') {
        params[key] = renderForPrompt(value);
      } else if (typeof value === 'number') {
        params[key] = String(value);
      } else if (Array.isArray(value) && value.every(v => typeof v === 'number' || typeof v === 'string')) {
        params[key] = value.join(', ');
      } else if (Array.isArray(value) && value.every(v => Array.isArray(v))) {
        params[key] = value.flat().join(', ');
      }
    }
  }

  return params;
}

/**
 * Returns filled params for a variant. Layers, lowest to highest precedence:
 *   1. Generic structural derivation (deriveGenericParams) — safe for any item.
 *   2. variant._params — raw values a generator deliberately exposes (the fix
 *      for composed/derived values, e.g. multi-part equations), added to its
 *      return object once, by hand, per generator.
 *   3. A hand-written EXTRACTORS[item_id] override, if one exists — for
 *      genuinely irregular items where neither of the above fits.
 * Later layers overwrite earlier ones on key collision.
 */
export function extractParams(variant) {
  if (!variant) return {};
  const generic = deriveGenericParams(variant);
  const fromGenerator = (variant._params && typeof variant._params === 'object') ? variant._params : {};
  const override = EXTRACTORS[variant.item_id];
  const fromOverride = override ? override(variant) : {};
  return { ...generic, ...fromGenerator, ...fromOverride };
}

export { EXTRACTORS };

// ── Spoken-field enumeration (for audio generation) ───────────────────────────
// Single definition of "what gets narrated" — reused by the audio pregeneration
// script and any runtime narration UI, so audio scope can never drift from what
// extractParams/fillTemplate actually produce. Deliberately excludes
// answer_options / part.answer_options text everywhere.

/**
 * Returns an array of { fieldKey, text } pairs to synthesize audio for.
 * `variant` is a generated question instance; `template` is the matching
 * questionTemplates/{item_id} doc (flat {tip1,tip2,reveal} or {parts:{...}}).
 */
export function renderSpokenFields(variant, template) {
  if (!variant) return [];
  const fields = [];
  const push = (fieldKey, text) => {
    const spoken = renderForSpeech(text);
    if (spoken) fields.push({ fieldKey, text: spoken });
  };

  if (variant.answer_type === 'multi_part' && Array.isArray(variant.parts)) {
    push('question_text', variant.question_text);
    const params = extractParams(variant);
    for (const part of variant.parts) {
      const label = part.label;
      push(`${label}_text`, part.question_text ?? part.text);
      push(`${label}_math_expression`, part.math_expression);
      for (const [kind, text] of instructionSegmentsForPart(part)) {
        push(`${label}_${kind}`, text);
      }
      const partTemplate = template?.parts?.[label];
      push(`${label}_tip1`, fillTemplate(partTemplate?.tip1, params));
      push(`${label}_tip2`, fillTemplate(partTemplate?.tip2, params));
      push(`${label}_reveal`, fillTemplate(partTemplate?.reveal, params));
    }
    return fields;
  }

  push('stimulus_intro', variant.stimulus_intro);
  if (Array.isArray(variant.stimulus_list)) {
    variant.stimulus_list.forEach((item, i) => push(`stimulus_list_${i}`, item));
  }
  push('math_expression', variant.math_expression);
  push('question_text', variant.question_text);
  push('instruction', variant.instruction);
  push('instruction2', variant.instruction2);
  push('answer_instruction', instructionTextForQuestion(variant));
  const params = extractParams(variant);
  push('tip1', fillTemplate(template?.tip1, params));
  push('tip2', fillTemplate(template?.tip2, params));
  push('reveal', fillTemplate(template?.reveal, params));
  return fields;
}
