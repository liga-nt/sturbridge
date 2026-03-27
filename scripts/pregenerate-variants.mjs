/**
 * Generates feedback templates (tip1, tip2, reveal) with {{placeholder}} syntax.
 * One LLM call per item. Stores to questionTemplates/{item_id} in Firestore.
 *
 * At runtime the student page fills placeholders from the live generated variant.
 *
 * Usage:
 *   node --env-file=.env scripts/pregenerate-variants.mjs --items=MA227383
 *   node --env-file=.env scripts/pregenerate-variants.mjs               # all items with extractors
 *   node --env-file=.env scripts/pregenerate-variants.mjs --skip-existing
 *
 * Requires: ANTHROPIC_API_KEY env var
 */

import admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';
import { generate } from '../src/lib/utils/generators.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const anthropic = new Anthropic();

// ── Standard descriptions ─────────────────────────────────────────────────────
const ITEM_STANDARD = {
  'MA227383': '4.OA.B.4',
  'MA311551': '4.NF.C.5',
  'MA311583': '4.NF.C.7',
  'MA303319': '4.NF.B.3',
  'MA714225971': '4.NF.C.6',
  'MA713939739': '4.OA.A.2',
  'MA704647848': '4.NF.A.2',
  'MA303329': '4.MD.B.4',
  'MA714233266': '4.G.A.2',
  'MA222213': '4.MD.A.1',
  'MA307033': '4.NBT.A.1',
  'MA307037': '4.NBT.A.2',
  'MA714111699': '4.G.A.3',
  'MA306994': '4.MD.C.7',
  'MA279791': '4.OA.A.3',
  'MA713680384': '4.NBT.A.3',
  'MA704650539': '4.MD.C.6',
  'MA247745': '4.MD.A.3',
};

const ITEM_YEAR = {
  'MA227383': 2019, 'MA311551': 2019, 'MA311583': 2019, 'MA303319': 2019,
  'MA714225971': 2019, 'MA713939739': 2019, 'MA704647848': 2019, 'MA303329': 2019,
  'MA714233266': 2019, 'MA222213': 2019, 'MA307033': 2019, 'MA307037': 2019,
  'MA714111699': 2019, 'MA306994': 2019, 'MA279791': 2019, 'MA713680384': 2019,
  'MA704650539': 2019, 'MA247745': 2019,
};

const STANDARD_DESCRIPTIONS = {
  '4.OA.A.1': 'Interpret a multiplication equation as a comparison (e.g., 35 = 5 × 7).',
  '4.OA.A.2': 'Multiply or divide to solve word problems involving multiplicative comparison.',
  '4.OA.A.3': 'Solve multistep word problems with whole numbers using all four operations.',
  '4.OA.B.4': 'Find factor pairs, recognize multiples, determine if a number is prime or composite.',
  '4.OA.C.5': 'Generate a number or shape pattern that follows a given rule.',
  '4.NBT.A.1': 'Recognize that a digit in one place represents 10× what it represents in the place to its right.',
  '4.NBT.A.2': 'Read and write multi-digit whole numbers; compare using >, =, <.',
  '4.NBT.A.3': 'Use place value understanding to round multi-digit whole numbers.',
  '4.NBT.B.4': 'Fluently add and subtract multi-digit whole numbers using the standard algorithm.',
  '4.NBT.B.5': 'Multiply a four-digit number by a one-digit number; multiply two two-digit numbers.',
  '4.NBT.B.6': 'Find whole-number quotients and remainders with up to four-digit dividends and one-digit divisors.',
  '4.NF.A.1': 'Explain why a fraction a/b is equivalent to (n×a)/(n×b) using fraction models.',
  '4.NF.A.2': 'Compare two fractions with different numerators and denominators.',
  '4.NF.B.3': 'Understand addition and subtraction of fractions as joining and separating parts.',
  '4.NF.B.4': 'Apply and extend previous understandings of multiplication to multiply a fraction by a whole number.',
  '4.NF.C.5': 'Express a fraction with denominator 10 as an equivalent fraction with denominator 100.',
  '4.NF.C.6': 'Use decimal notation for fractions with denominators 10 or 100.',
  '4.NF.C.7': 'Compare two decimals to hundredths by reasoning about their size.',
  '4.MD.A.1': 'Know relative sizes of measurement units; convert from a larger unit to a smaller unit.',
  '4.MD.A.2': 'Use the four operations to solve word problems involving distances, time, and money.',
  '4.MD.A.3': 'Apply area and perimeter formulas for rectangles.',
  '4.MD.B.4': 'Make a line plot to display a data set of measurements in fractions of a unit.',
  '4.MD.C.5': 'Recognize angles as geometric shapes; understand concepts of angle measurement.',
  '4.MD.C.6': 'Measure angles in whole-number degrees using a protractor.',
  '4.MD.C.7': 'Recognize angle measure as additive; solve addition and subtraction problems to find unknown angles.',
  '4.G.A.1': 'Draw points, lines, line segments, rays, angles, and perpendicular and parallel lines.',
  '4.G.A.2': 'Classify two-dimensional figures based on parallel/perpendicular lines and angle types.',
  '4.G.A.3': 'Recognize a line of symmetry; identify line-symmetric figures.',
};

// ── Param extractors ──────────────────────────────────────────────────────────
// Each function takes a generated variant and returns a flat { key: value } map.
// Keys become the allowed {{placeholder}} names in the templates.
// Add one entry per item_id as you expand beyond 2019 Q1.

const EXTRACTORS = {

  'MA227383': (v) => ({
    personName:    v.stimulus_intro.split(' ')[0],
    numbers:       v.stimulus_params.rows.flat().join(', '),
    correctLetter: v.correct_answer,
    correctValue:  v.answer_options.find(o => o.letter === v.correct_answer)?.text ?? '',
    optionValues:  v.answer_options.map(o => o.text).join(', '),
    wrongValues:   v.answer_options.filter(o => o.letter !== v.correct_answer).map(o => o.text).join(', '),
  }),

};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderForPrompt(text) {
  if (!text) return '';
  return text
    .replace(/\[(\d+)\/(\d+)\]/g, '$1/$2')
    .replace(/\{?\?\}/g, '[blank]')
    .replace(/<[^>]+>/g, '')
    .replace(/&times;/g, '×')
    .replace(/\s+/g, ' ')
    .trim();
}

function describeQuestion(q) {
  const lines = [];
  if (q.stimulus_intro) lines.push(`Context: ${renderForPrompt(q.stimulus_intro)}`);
  if (q.math_expression) lines.push(`Expression: ${renderForPrompt(q.math_expression)}`);
  if (q.question_text)   lines.push(`Question: ${renderForPrompt(q.question_text)}`);

  if (q.answer_type === 'multiple_choice' && q.answer_options) {
    lines.push('Options:');
    for (const o of q.answer_options) {
      const marker = o.letter === q.correct_answer ? '✓' : ' ';
      lines.push(`  [${marker}] ${o.letter}: ${renderForPrompt(o.text)}`);
    }
  }
  if (q.stimulus_type === 'number_box' && q.stimulus_params?.rows) {
    lines.push(`Number box: ${q.stimulus_params.rows.flat().join(', ')}`);
  }
  return lines.join('\n');
}

function buildPrompt(sample, params, standardId) {
  const stdDesc = STANDARD_DESCRIPTIONS[standardId] || standardId;
  const qDesc = describeQuestion(sample);

  const paramLines = Object.entries(params)
    .map(([k, v]) => `  {{${k}}} = "${v}"`)
    .join('\n');

  return `You are writing educational feedback templates for a 4th-grade math test prep app.

Standard ${standardId}: ${stdDesc}

Here is a sample question (numbers change each time a student plays):
---
${qDesc}
---

These placeholders are available — use ONLY these names, wrapped in {{ }}:
${paramLines}

Write three feedback templates in JSON. Use the placeholders wherever a value changes between variants. Write everything else as plain text.

CRITICAL: Never hardcode any number, name, or value that is not in the placeholder list above. Every specific number you reference must come from a placeholder.

{
  "tip1": "...",
  "tip2": "...",
  "reveal": "..."
}

When shown:
- tip1: shown when the student clicks "Learn" before attempting, OR after their 1st wrong answer if they never clicked Learn. Give the most practical strategy a student can use to find the right answer — prefer strategies like elimination (rule out wrong answers first), skip counting, or testing each answer choice one at a time. Use the specific values from the placeholders. 2–3 sentences. No answer given.
- tip2: shown after the 1st wrong answer if the student already clicked Learn. Show exactly how to apply that strategy to the numbers in this specific problem, step by step. If elimination helps, show which answer choices can be ruled out and why, using the placeholder values. 2–3 sentences. No answer given.
- reveal: shown after the 2nd wrong answer. Give the correct answer, then explain why using the placeholder values. Start with "The answer is {{correctLetter}} —".

Tone: warm, clear, never condescending. Write for a 9–10 year old.
Respond with ONLY the JSON object — no markdown, no explanation.`;
}

// ── LLM call ──────────────────────────────────────────────────────────────────

async function generateTemplate(sample, params, standardId) {
  const prompt = buildPrompt(sample, params, standardId);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(stripped);
  }
}

// ── Per-item ──────────────────────────────────────────────────────────────────

async function generateForItem(item_id) {
  const standardId = ITEM_STANDARD[item_id];
  const year = ITEM_YEAR[item_id];
  const extractor = EXTRACTORS[item_id];

  if (!standardId) { console.warn(`  ⚠ no standard mapping — skipping`); return; }
  if (!extractor)  { console.warn(`  ⚠ no extractor defined — skipping`); return; }

  const sample = generate(item_id);
  if (!sample) { console.warn(`  ⚠ no generator — skipping`); return; }

  const params = extractor(sample);

  console.log(`  Sample: ${describeQuestion(sample).split('\n')[0]}`);
  console.log(`  Params: ${JSON.stringify(params)}`);

  const template = await generateTemplate(sample, params, standardId);

  if (!template.tip1 || !template.tip2 || !template.reveal) {
    console.error(`  ✗ incomplete template:`, template);
    return;
  }

  await db.collection('questionTemplates').doc(item_id).set({
    item_id,
    standardId,
    year,
    tip1:   template.tip1,
    tip2:   template.tip2,
    reveal: template.reveal,
    createdAt: admin.firestore.Timestamp.now(),
  });

  console.log(`  ✓ stored questionTemplates/${item_id}`);
  console.log(`    tip1:   ${template.tip1}`);
  console.log(`    tip2:   ${template.tip2}`);
  console.log(`    reveal: ${template.reveal}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const targetItems = args.find(a => a.startsWith('--items='))?.split('=')[1].split(',') ?? null;
const skipExisting = args.includes('--skip-existing');

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set.');
    process.exit(1);
  }

  const items = targetItems ?? Object.keys(EXTRACTORS);
  console.log(`Generating templates for ${items.length} item(s)...\n`);

  for (const item_id of items) {
    if (skipExisting) {
      const existing = await db.collection('questionTemplates').doc(item_id).get();
      if (existing.exists) { console.log(`${item_id} — skip (exists)\n`); continue; }
    }
    console.log(`${item_id}  [${ITEM_YEAR[item_id]} / ${ITEM_STANDARD[item_id]}]`);
    await generateForItem(item_id);
    console.log();
  }

  console.log('✓ Done.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
