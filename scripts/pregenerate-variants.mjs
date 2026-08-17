/**
 * Generates feedback templates (tip1, tip2, reveal) with {{placeholder}} syntax.
 * One LLM call pair (setup analysis + JSON) per item. Stores to
 * questionTemplates/{item_id} in Firestore — flat {tip1,tip2,reveal} for
 * single-part items, {parts:{A:{...},B:{...}}} for multi_part items.
 *
 * At runtime the student page fills placeholders from the live/pooled variant.
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
import { extractParams, renderForPrompt, fillTemplate } from '../src/lib/utils/feedbackTemplates.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const anthropic = new Anthropic();

const MODEL = 'claude-opus-5';

// ── Standard descriptions ─────────────────────────────────────────────────────
// Built from the full 100-item generator corpus, cross-referenced against
// data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv
// (item_id -> Standard Code / Year). All 100 generator-backed items matched.
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
  'MA304988': '4.NF.B.4',
  'MA286777': '4.NBT.B.4',
  'MA247745': '4.MD.A.3',
  'MA704649496': '4.NF.B.3',
  'MA307079': '4.OA.A.1',
  'MA229063': '4.NF.C.6',
  'MA297973': '4.NF.B.4',
  'MA800628900': '4.OA.B.4',
  'MA800780932': '4.NBT.A.2',
  'MA306940': '4.MD.A.3',
  'MA800629956': '4.G.A.3',
  'MA800763292': '4.MD.B.4',
  'MA270627': '4.NBT.B.4',
  'MA803730594': '4.OA.C.5',
  'MA736379417': '4.NF.C.5',
  'MA311574': '4.G.A.1',
  'MA287484': '4.MD.A.2',
  'MA713629341': '4.OA.A.3',
  'MA714226701': '4.NF.C.6',
  'MA803742735': '4.NF.A.1',
  'MA803846674': '4.NBT.A.3',
  'MA306993': '4.MD.C.7',
  'MA803746135': '4.NF.A.2',
  'MA301798': '4.OA.A.2',
  'MA297614': '4.OA.C.5',
  'MA247705': '4.G.A.3',
  'MA801035466': '4.NF.A.2',
  'MA002128911': '4.G.A.1',
  'MA002334462': '4.NF.C.6',
  'MA307060': '4.G.A.2',
  'MA002140372': '4.MD.C.7',
  'MA002145158': '4.NF.C.7',
  'MA002139080': '4.MD.B.4',
  'MA307317': '4.NBT.B.5',
  'MA704653374': '4.OA.A.1',
  'MA900846441': '4.NF.B.3',
  'MA002034926': '4.NBT.B.4',
  'MA903776098': '4.MD.C.5',
  'MA002135528': '4.MD.A.1',
  'MA903571693': '4.MD.A.3',
  'MA001851276': '4.NBT.A.3',
  'MA001750121': '4.OA.B.4',
  'MA303324': '4.NF.B.4',
  'MA900754381': '4.NF.A.2',
  'MA136448521': '4.OA.B.4',
  'MA800780887': '4.NF.B.3',
  'MA010534486': '4.MD.A.3',
  'MA232254177': '4.G.A.1',
  'MA202029218': '4.NBT.A.3',
  'MA713677363': '4.NBT.A.2',
  'MA900741771': '4.OA.A.2',
  'MA311554': '4.MD.C.5',
  'MA232261850': '4.G.A.3',
  'MA233051799': '4.NF.B.4',
  'MA307314': '4.NBT.B.4',
  'MA900776517': '4.NF.C.7',
  'MA231875780': '4.MD.A.1',
  'MA000732007': '4.MD.C.6',
  'MA900750085': '4.OA.B.4',
  'MA231836735': '4.NF.C.6',
  'MA311543': '4.NBT.B.6',
  'MA250533': '4.OA.C.5',
  'MA002162929': '4.NBT.B.5',
  'MA900845776': '4.NF.B.3',
  'MA307692': '4.NBT.B.4',
  'MA704652242': '4.G.A.1',
  'MA307310': '4.NBT.A.1',
  'MA900775955': '4.NF.C.7',
  'MA307066': '4.G.A.3',
  'MA623833763': '4.NBT.B.6',
  'MA903574399': '4.MD.A.3',
  'MA800633803': '4.NF.B.4',
  'MA900751683': '4.OA.A.3',
  'MA803738583': '4.MD.A.1',
  'MA279790': '4.NBT.B.5',
  'MA903537924': '4.MD.C.6',
  'MA800767155': '4.NF.A.1',
  'MA311579A': '4.OA.C.5',
  'MA900842465': '4.NBT.A.3',
  'MA903134963': '4.NF.C.5',
  'MA903757124': '4.G.A.2',
  'MA286765': '4.NF.C.6',
  'MA704650142': '4.NF.B.4',
};

const ITEM_YEAR = {
  'MA227383': 2019, 'MA311551': 2019, 'MA311583': 2019, 'MA303319': 2019,
  'MA714225971': 2019, 'MA713939739': 2019, 'MA704647848': 2019, 'MA303329': 2019,
  'MA714233266': 2019, 'MA222213': 2019, 'MA307033': 2019, 'MA307037': 2019,
  'MA714111699': 2019, 'MA306994': 2019, 'MA279791': 2019, 'MA713680384': 2019,
  'MA704650539': 2019, 'MA304988': 2019, 'MA286777': 2019, 'MA247745': 2019,
  'MA704649496': 2021, 'MA307079': 2021, 'MA229063': 2021, 'MA297973': 2021,
  'MA800628900': 2021, 'MA800780932': 2021, 'MA306940': 2021, 'MA800629956': 2021,
  'MA800763292': 2021, 'MA270627': 2021, 'MA803730594': 2021, 'MA736379417': 2021,
  'MA311574': 2021, 'MA287484': 2021, 'MA713629341': 2021, 'MA714226701': 2021,
  'MA803742735': 2021, 'MA803846674': 2021, 'MA306993': 2021, 'MA803746135': 2021,
  'MA301798': 2023, 'MA297614': 2023, 'MA247705': 2023, 'MA801035466': 2023,
  'MA002128911': 2023, 'MA002334462': 2023, 'MA307060': 2023, 'MA002140372': 2023,
  'MA002145158': 2023, 'MA002139080': 2023, 'MA307317': 2023, 'MA704653374': 2023,
  'MA900846441': 2023, 'MA002034926': 2023, 'MA903776098': 2023, 'MA002135528': 2023,
  'MA903571693': 2023, 'MA001851276': 2023, 'MA001750121': 2023, 'MA303324': 2023,
  'MA900754381': 2025, 'MA136448521': 2025, 'MA800780887': 2025, 'MA010534486': 2025,
  'MA232254177': 2025, 'MA202029218': 2025, 'MA713677363': 2025, 'MA900741771': 2025,
  'MA311554': 2025, 'MA232261850': 2025, 'MA233051799': 2025, 'MA307314': 2025,
  'MA900776517': 2025, 'MA231875780': 2025, 'MA000732007': 2025, 'MA900750085': 2025,
  'MA231836735': 2025, 'MA311543': 2025, 'MA250533': 2025, 'MA002162929': 2025,
  'MA900845776': 2022, 'MA307692': 2022, 'MA704652242': 2022, 'MA307310': 2022,
  'MA900775955': 2022, 'MA307066': 2022, 'MA623833763': 2022, 'MA903574399': 2022,
  'MA800633803': 2022, 'MA900751683': 2022, 'MA803738583': 2022, 'MA279790': 2022,
  'MA903537924': 2022, 'MA800767155': 2022, 'MA311579A': 2022, 'MA900842465': 2022,
  'MA903134963': 2022, 'MA903757124': 2022, 'MA286765': 2022, 'MA704650142': 2022,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Describes a visual stimulus in plain English so the LLM can actually "see"
// diagrams instead of writing tips blind to anything but number_box. Add a
// case per stimulus_type as more items get piloted.
function describeStimulus(stimulus_type, stimulus_params) {
  if (!stimulus_type || !stimulus_params) return null;
  switch (stimulus_type) {
    case 'number_box':
      return stimulus_params.rows ? `Number box: ${stimulus_params.rows.flat().join(', ')}` : null;
    case 'rectangle_diagram': {
      const { width, height, width_label, height_label } = stimulus_params;
      return `Rectangle diagram: width = ${width_label ?? width}, height = ${height_label ?? height}`;
    }
    case 'angle_diagram': {
      const rays = (stimulus_params.rays ?? [])
        .map(r => `ray ${r.label} at ${r.angle}°`).join(', ');
      const arcs = (stimulus_params.arc_labels ?? [])
        .map(a => `arc between ${(a.between ?? []).join('-')} labeled "${a.text}"`).join(', ');
      let desc = `Angle diagram: rays from a common vertex — ${rays}.`;
      if (arcs) desc += ` Labeled arcs: ${arcs}.`;
      return desc;
    }
    case 'protractor_image': {
      const rays = (stimulus_params.rays ?? [])
        .map(r => `ray ${r.label} at ${r.angle}° on the protractor scale`).join(', ');
      return `Protractor reading: vertex ${stimulus_params.center_label ?? '?'}, base ray toward ${stimulus_params.base_label ?? '?'} — ${rays}.`;
    }
    default:
      return null;
  }
}

// Some answer types ARE the visual — the widget the student answers through,
// not a separate read-only diagram — so they never set stimulus_type at all
// (e.g. number_line_plot items carry stimulus_params directly: {min, max,
// small_intervals}). describeStimulus() alone leaves these prompt-blind to
// both the widget's layout and the fact that the answer is a plotted point,
// not a multiple-choice pick. Keyed off answer_type instead of stimulus_type
// for that reason. Add a case per interactive-answer-widget type as more get
// piloted (e.g. protractor input, clock input).
function describeAnswerWidget(answer_type, stimulus_params) {
  if (!stimulus_params) return null;
  switch (answer_type) {
    case 'number_line_plot': {
      const { min, max, small_intervals } = stimulus_params;
      return `Number line from ${min} to ${max}, with labeled marks at each whole-number/tenths interval and ${small_intervals} small tick marks between each pair of labels (each small tick = 1/${small_intervals} of the labeled interval). The student answers by plotting a POINT at the correct location on the line — there are no multiple-choice options to pick from.`;
    }
    default:
      return null;
  }
}

function describeQuestion(q) {
  const lines = [];
  if (q.stimulus_intro) lines.push(`Context: ${renderForPrompt(q.stimulus_intro)}`);
  if (Array.isArray(q.stimulus_list) && q.stimulus_list.length > 0) {
    lines.push('Context details:');
    for (const item of q.stimulus_list) lines.push(`  - ${renderForPrompt(item)}`);
  }
  if (q.math_expression) lines.push(`Expression: ${renderForPrompt(q.math_expression)}`);
  if (q.question_text)   lines.push(`Question: ${renderForPrompt(q.question_text)}`);

  // inline_choice items (top-level and per-part) put the actual question
  // INSIDE sentences/dropdowns, not question_text — without this the model
  // sees no question stem at all for this answer_type.
  if (q.instruction) lines.push(`Instruction: ${renderForPrompt(q.instruction)}`);
  if (Array.isArray(q.sentences) && q.sentences.length > 0) {
    lines.push('Fill-in-the-blank sentence(s) — each [TOKEN] is a dropdown, shown with its available options:');
    for (const sentence of q.sentences) {
      let annotated = sentence;
      for (const dd of (q.dropdowns ?? [])) {
        annotated = annotated.split(`[${dd.id}]`).join(`[choose one: ${dd.options.join(', ')}]`);
      }
      lines.push(`  ${renderForPrompt(annotated)}`);
    }
  }

  if (q.answer_type === 'multiple_choice' && q.answer_options) {
    lines.push('Options:');
    for (const o of q.answer_options) {
      const marker = o.letter === q.correct_answer ? '✓' : ' ';
      if (typeof o.text === 'string') {
        lines.push(`  [${marker}] ${o.letter}: ${renderForPrompt(o.text)}`);
      } else if (o.model) {
        // Fraction-model options (rectangle grids) — no .text, shading amount lives in .model.
        const describeRect = (r) => r ? `${r.numerator}/${r.denominator} shaded` : '(none)';
        const op = o.model.operator ? ` ${o.model.operator} ` : ' and ';
        lines.push(`  [${marker}] ${o.letter}: model — ${describeRect(o.model.left)}${op}${describeRect(o.model.right)}`);
      } else {
        // Visual-only option (shape figure, etc.) with no structured summary
        // available here — explicitly flagged so the model doesn't invent
        // specifics about what it can't actually see.
        lines.push(`  [${marker}] ${o.letter}: (visual figure — not rendered in this description; if the placeholder list below gives you an explicit name/value for this option, that IS trustworthy and may be used — but never state or imply anything about it beyond what an actual placeholder says)`);
      }
    }
  }

  const stimDesc = describeStimulus(q.stimulus_type, q.stimulus_params)
    ?? describeAnswerWidget(q.answer_type, q.stimulus_params);
  if (stimDesc) lines.push(stimDesc);

  if (q.answer_type === 'multi_part' && Array.isArray(q.parts)) {
    lines.push('This is a multi-part question:');
    for (const part of q.parts) {
      lines.push(`Part ${part.label} (${part.answer_type}): ${renderForPrompt(part.question_text ?? part.text)}`);
      const partStim = describeStimulus(part.stimulus_type, part.stimulus_params)
        ?? describeAnswerWidget(part.answer_type, part.stimulus_params);
      if (partStim) lines.push(`  ${partStim}`);
      if (part.answer_type === 'multiple_choice' && part.answer_options) {
        for (const o of part.answer_options) {
          lines.push(`    ${o.letter}: ${renderForPrompt(o.text)}`);
        }
      }
      const caMap = (q.correct_answer && typeof q.correct_answer === 'object') ? q.correct_answer : null;
      if (caMap && caMap[part.label] !== undefined) {
        lines.push(`  Correct answer for Part ${part.label}: ${renderForPrompt(String(caMap[part.label]))}`);
      } else {
        console.warn(`  ⚠ Part ${part.label}: correct_answer not object-shaped — omitting from prompt`);
      }
    }
  }

  return lines.join('\n');
}

const FEW_SHOT_EXAMPLES = `
Here are two examples of the quality bar for tip1/tip2/reveal. These use their
OWN illustrative placeholder names for their OWN setups — for the actual item
below, use ONLY the placeholders listed for that item, not these names.

Example A (numeric setup — a number box of multiples, "which could be the number?"):
{
  "tip1": "Pick any two of the numbers in the box and think about what number divides evenly into both of them — that's a faster way in than testing all four answer choices one at a time against every box number.",
  "tip2": "Divide the first number in the box, {{numbers}}, by each answer choice. Throw out any choice that doesn't divide evenly. Then check whichever choice is left against a second number in the box to confirm.",
  "reveal": "The answer is {{correctLetter}} — every number in the box is a multiple of {{correctLetter}}, so {{correctLetter}} divides evenly into all of them."
}
This is good because the technique (find what evenly divides every number shown) comes directly from how a number box of multiples is structured — it would be wrong advice for a differently-structured problem.

Example B (diagram-reading setup — a labeled rectangle, "what is the area?"):
{
  "tip1": "The diagram already gives you both measurements you need — you don't have to find or calculate anything else. Just figure out which operation area asks for.",
  "tip2": "Area of a rectangle is length times width. Multiply the {{width}} by the {{height}} shown in the diagram, and match your result to the answer choice labeled in square units — not the one labeled in plain units, which would be the perimeter.",
  "reveal": "The answer is {{correctLetter}} — {{width}} times {{height}} gives the area, {{correctValue}}."
}
This is good because it reads the specific numbers straight off the diagram and names the exact distractor trap (area vs. perimeter units) this setup creates — it's not generic "eliminate the wrong answers" advice.
`.trim();

function buildAnalysisPrompt(sample, standardId) {
  const stdDesc = STANDARD_DESCRIPTIONS[standardId] || standardId;
  const qDesc = describeQuestion(sample);

  return `You are preparing to write educational feedback for a 4th-grade math test prep app.

Standard ${standardId}: ${stdDesc}

Here is the question:
---
${qDesc}
---

Solve this problem yourself. Then identify the single fastest, most reliable technique a 4th grader could use to solve THIS EXACT problem, given its specific setup — the particular diagram, numbers, and answer choices shown. Do not fall back on generic multiple-choice test-taking advice (like "eliminate the wrong answers" or "guess and check each option") unless that genuinely is the fastest method for this exact configuration.

Explain your reasoning in 3-5 sentences. Do not write final student-facing copy yet — this is just your own analysis.`;
}

function buildPrompt(sample, params, standardId, analysis, priorIssues = []) {
  const stdDesc = STANDARD_DESCRIPTIONS[standardId] || standardId;
  const qDesc = describeQuestion(sample);
  const isMultiPart = sample.answer_type === 'multi_part' && Array.isArray(sample.parts);

  const paramLines = Object.entries(params)
    .map(([k, v]) => `  {{${k}}} = "${v}"`)
    .join('\n');

  // "Start with the answer is {{correctLetter}}" only makes sense when the
  // item actually has a lettered answer (multiple_choice/select) — for other
  // answer types (short_answer, number_line_plot, true_false_table, etc.)
  // there's no such placeholder, and hardcoding it produced an undefined
  // {{correctLetter}} reference that the completeness check correctly caught.
  const hasCorrectLetter = 'correctLetter' in params;
  const revealOpeningInstruction = isMultiPart
    ? ''
    : hasCorrectLetter
      ? ' Start with "The answer is {{correctLetter}} —".'
      : ' Start with "The answer is" followed by the correct value from the placeholders.';

  const shapeInstructions = isMultiPart
    ? `Write feedback templates for EACH part in JSON:

{
  "parts": {
${sample.parts.map(p => `    "${p.label}": { "tip1": "...", "tip2": "...", "reveal": "..." }`).join(',\n')}
  }
}`
    : `Write three feedback templates in JSON:

{
  "tip1": "...",
  "tip2": "...",
  "reveal": "..."
}`;

  return `You are writing educational feedback templates for a 4th-grade math test prep app.

Standard ${standardId}: ${stdDesc}

Here is a sample question (numbers change each time a student plays):
---
${qDesc}
---

Your own analysis of the fastest technique for this exact setup:
---
${analysis}
---

These placeholders are available — use ONLY these names, wrapped in {{ }}:
${paramLines}

${shapeInstructions}

Use the placeholders wherever a value changes between variants. Write everything else as plain text.

CRITICAL: Never hardcode any number, name, or value that is not in the placeholder list above. Every specific number, name, or scenario detail you reference must come from a placeholder — if a detail (like a character name or scenario noun) isn't in the placeholder list, phrase around it generically instead of stating it.

CRITICAL: Never build an ordinal word (third, fourth, fifth...) by appending "th" directly to a numeric placeholder — {{denominator}}th renders as the literal, grammatically wrong "3th" instead of "third" (and breaks entirely for numbers like 1 or 2). If you need to refer to a fraction's denominator conversationally, say "the bottom number" / "how many equal parts" instead of trying to say the ordinal word from a placeholder.

CRITICAL: Never illustrate a sentence's structure using bracketed placeholder-style words, e.g. "[total] is [multiplier] times as many as [group size]" — square brackets are not a formatting device here, and text like that is shipped completely literally to the student ("[total]" as literal characters, not a real number). If you want to describe a sentence pattern generically, do it in plain prose with no brackets at all (e.g. "the number right after 'is' is the total, and it comes from multiplying the other two numbers together") or use the item's REAL {{placeholders}}, never invented bracket names.

CRITICAL: When an option is marked "(visual figure — not rendered...)" in the Options list above, you have NOT seen it — full stop. You may state a fact about it ONLY if an actual placeholder in the list below gives you that exact fact (e.g. {{correctShapeType}}, {{distractor1Reason}}) — use those placeholders verbatim, don't paraphrase them into a different (possibly wrong) claim, and don't add any additional detail beyond what the placeholder says (no invented shape names, side counts, colors, or fold results that aren't backed by a placeholder). If no placeholder covers a given option, describe the TEST a student should apply (e.g. "try folding it along a line through the middle and see if both halves match exactly") rather than the result of applying that test to that option. An invented or paraphrased-into-wrongness detail actively misleads a student who can see the real figure and yours doesn't match.

CRITICAL: Never perform arithmetic on a placeholder's value and write the RESULT as a literal number — even though the inputs came from the placeholder list, a computed result (a place-value split like "20 and 4" for a number that changes every time, a partial product, an intermediate sum) is specific to THIS one sample and will be flat-out wrong for every other random variant a student sees. If a technique requires an intermediate step, describe it in words only ("break it into its tens and ones parts," "multiply each part separately," "add the two lengths together") and let the student (or tip2/reveal's own placeholders) supply the actual numbers — never compute and state that intermediate value yourself unless it is itself one of the placeholders listed above.

CRITICAL: Never describe a shortcut that only happens to work because of a coincidence in THIS sample's specific numbers (e.g. "these two happen to add to a round number, so start there" — a different random variant's numbers won't do that, and the same shortcut can even point at a wrong intermediate value that matches a distractor). Every technique you describe must be GUARANTEED correct for any values this item's structure could produce, not just the one sample shown. When in doubt, prefer the plain, always-correct approach (e.g. "add all three given measures together") over a clever-sounding one you haven't verified holds in general.
${isMultiPart ? `
CRITICAL (multi-part): tip1/tip2 for ANY part must never reference another part's {{X_correctValue}}-style placeholder (or its own), even if that part's answer is a natural input to this part's solution — a student may not have solved that earlier part correctly yet, so stating it hands them an answer they haven't earned. If a later part's technique genuinely depends on an earlier part's value, reference the original GIVEN placeholder that value came from instead (e.g. the starting time/measurement provided in the question), not the derived answer placeholder. Only reveal may ever reference a {{X_correctValue}} placeholder, and only for its OWN part.` : ''}

When shown${isMultiPart ? ' (applies to each part)' : ''}:
- tip1: shown when the student clicks "Learn" before attempting, OR after their 1st wrong answer if they never clicked Learn. Give the fastest, most concrete technique specific to this exact setup — grounded in your analysis above, using the actual placeholder values. 2-3 sentences. No answer given — and this includes never naming or listing which specific answer choice(s) are wrong, even to illustrate a distractor trap: with only a handful of options, ruling three out by name is just as much a leak as stating the answer directly. Describe the TRAP generically instead (e.g. "one common mistake is forgetting to double the sum" rather than "rule out 71, 79, and 58").
- tip2: shown after the 1st wrong answer if the student already clicked Learn. Show exactly how to apply that technique to the numbers/diagram in this specific problem, step by step, using the placeholder values. 2-3 sentences. No answer given — same restriction as tip1 (never name which option(s) are wrong), PLUS: never state the specific value/count/fraction you'd get by actually reading the diagram or model (e.g. "this model shows 80 shaded parts" or "the two fractions are 5/12 and 1/12") — that IS the work the student is supposed to do. Teach HOW to read it (what to count, what to look for) without doing the reading for them.
- reveal: shown after the 2nd wrong answer. Give the correct answer, then explain why using the placeholder values.${revealOpeningInstruction}

${FEW_SHOT_EXAMPLES}

Tone: warm, clear, never condescending. Write for a 9-10 year old.
${priorIssues.length > 0 ? `\nYour previous attempt at this exact item had these problems — fix ALL of them this time:\n${priorIssues.map(i => `- ${i}`).join('\n')}\n` : ''}
Respond with ONLY the JSON object — no markdown, no explanation.`;
}

// ── LLM calls ─────────────────────────────────────────────────────────────────

// claude-opus-5 emits a `thinking` content block before the `text` block —
// pull the text block out explicitly rather than assuming content[0].
function extractText(response) {
  const block = response.content.find(b => b.type === 'text');
  if (!block) throw new Error(`No text block in response (stop_reason: ${response.stop_reason}): ${JSON.stringify(response.content)}`);
  if (response.stop_reason === 'max_tokens') {
    console.warn('  ⚠ response hit max_tokens — likely truncated, consider raising the budget');
  }
  return block.text.trim();
}

async function analyzeSetup(sample, standardId) {
  const prompt = buildAnalysisPrompt(sample, standardId);
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractText(response);
}

async function generateTemplate(sample, params, standardId, priorIssues = []) {
  const analysis = await analyzeSetup(sample, standardId);
  console.log(`  Analysis: ${analysis.split('\n')[0]}...`);

  const prompt = buildPrompt(sample, params, standardId, analysis, priorIssues);
  // Multi-part items write tip1/tip2/reveal PER PART in one response — a
  // 4-part item needs much more budget than a flat item, and hitting the
  // ceiling mid-string produces truncated, unparseable JSON (this crashed a
  // whole batch run once already: MA287484, a 4-part clock item).
  const isMultiPart = sample.answer_type === 'multi_part' && Array.isArray(sample.parts);
  const maxTokens = isMultiPart ? 4096 + sample.parts.length * 1536 : 4096;
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractText(response);
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(stripped);
  }
}

// ── LLM QA judge pass ────────────────────────────────────────────────────────
// A second, independent LLM call — catches what the mechanical checks can't:
// wrong arithmetic in the reveal, an invalid/generic technique, semantic
// answer-leakage (regardless of placeholder naming), or off tone. Judges the
// FILLED text (exactly what a student would see), not the raw template.
// correct_answer isn't always a primitive even for FLAT (non-multi-part)
// items — e.g. drag_drop_inequality's correct_answer is itself an object
// ({slot1, slot2, slot3}), which a bare String(sample.correct_answer) turns
// into the useless literal "[object Object]" in the judge's prompt.
function describeCorrectAnswer(sample, isMultiPart) {
  if (isMultiPart) {
    return sample.parts.map(p => {
      const ca = (sample.correct_answer && typeof sample.correct_answer === 'object')
        ? sample.correct_answer[p.label] : undefined;
      return `Part ${p.label}: ${renderForPrompt(String(ca ?? p.correct_answer ?? '(unknown)'))}`;
    }).join('; ');
  }
  const ca = sample.correct_answer;
  if (ca && typeof ca === 'object') {
    return Object.entries(ca).map(([k, v]) => `${k}: ${renderForPrompt(String(v))}`).join(', ');
  }
  return renderForPrompt(String(ca ?? '(unknown)'));
}

function buildJudgePrompt(sample, standardId, template, isMultiPart) {
  const stdDesc = STANDARD_DESCRIPTIONS[standardId] || standardId;
  const qDesc = describeQuestion(sample);
  const params = extractParams(sample);

  const filledText = isMultiPart
    ? sample.parts.map(p => {
        const pt = template.parts[p.label];
        return `Part ${p.label}:\n  tip1: ${fillTemplate(pt.tip1, params)}\n  tip2: ${fillTemplate(pt.tip2, params)}\n  reveal: ${fillTemplate(pt.reveal, params)}`;
      }).join('\n\n')
    : `tip1: ${fillTemplate(template.tip1, params)}\ntip2: ${fillTemplate(template.tip2, params)}\nreveal: ${fillTemplate(template.reveal, params)}`;

  const correctAnswerDesc = describeCorrectAnswer(sample, isMultiPart);
  const paramLines = Object.entries(params).map(([k, v]) => `  {{${k}}} = "${v}"`).join('\n');

  return `You are QA-reviewing generated feedback for a 4th-grade math test prep app. Be strict — a wrong or leaked answer reaching a student is much worse than a false alarm here.

Standard ${standardId}: ${stdDesc}

Question:
---
${qDesc}
---

Correct answer: ${correctAnswerDesc}

These are the REAL, ground-truth placeholder values available to the generator (some questions include visual-only elements — figures, diagrams — not rendered above in text; if a value below describes one of those, it is trustworthy GROUND TRUTH, not a guess):
${paramLines}

Generated feedback (shown with real numbers filled in, exactly as a student would see it):
---
${filledText}
---

Check ALL of the following:
1. CORRECTNESS: Does the reveal's stated reasoning actually arrive at the correct answer given above? Redo the arithmetic/logic yourself — don't just trust the text.
2. VALID TECHNIQUE: Is the technique described in tip1/tip2 actually a valid, efficient way to solve THIS exact setup (not generic test-taking advice, not a technique that would give a wrong answer)?
3. NO LEAKAGE: Do tip1 or tip2 give away the correct answer — directly, by naming/listing which specific option(s) are wrong (elimination leakage, especially damaging with only 3-4 choices), by stating the specific value/count/fraction a student would get by actually reading a diagram or model (that's the student's own work to do), or by being so specific that no work is left? They should teach technique only, never the answer, which choices to rule out, or the result of reading the stimulus.
4. TONE: Is the language clear, warm, and appropriate for a 9-10 year old — not condescending, not overly complex?
5. NO FABRICATION: For any visual-only element (figure/diagram not rendered above), does the feedback state anything about it that does NOT match one of the ground-truth placeholder values listed above? A claim that exactly matches (or is a faithful paraphrase of) a placeholder value is fine, even for a visual element — that's real data, not a guess. Only flag a claim that goes beyond, or contradicts, what the placeholders actually say.
6. NO FAKE SLOTS: Does the text contain bracketed placeholder-style words that are NOT real placeholder values — e.g. literal text like "[total]" or "[multiplier]" used to illustrate a sentence pattern generically? These are shipped to the student completely literally (the actual characters "[total]", not a number) and must be flagged as a failure every time they appear.

Respond with ONLY a JSON object:
{"pass": true|false, "issues": ["specific problem 1", "specific problem 2", ...]}
"issues" must be empty if pass is true. Each issue must be specific enough to fix (e.g. "reveal says the answer is 42 but the correct answer is 24" not "math is wrong").`;
}

export async function judgeTemplate(sample, standardId, template, isMultiPart) {
  const prompt = buildJudgePrompt(sample, standardId, template, isMultiPart);
  // Same truncation risk as generateTemplate — a multi-part judgment reviews
  // every part's tip1/tip2/reveal against a 6-item checklist and can produce
  // a long issues list; 2048 was hit often enough (~11% of judge calls
  // across the full run) to silently fall back to "treat as pass," which
  // means the content that fix depends on may never have been reviewed.
  const maxTokens = isMultiPart ? 3072 + sample.parts.length * 1024 : 3072;
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(response);
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(stripped);
  }
}

// ── Per-item ──────────────────────────────────────────────────────────────────

// Scans a template's text for every {{token}} used and confirms it exists in
// params — the safety net against silently shipping unfilled placeholders to
// a student, regardless of whether params came from generic derivation,
// variant._params, or a hand-written EXTRACTORS override.
function findMissingPlaceholders(text, params) {
  if (!text) return [];
  const used = [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
  return used.filter(key => !(key in params));
}

// Catches malformed placeholder syntax that findMissingPlaceholders can't —
// e.g. {{parallelogram, pentagon, kite}} (a hand-typed comma list wrapped in
// braces instead of a real {{token}}) doesn't match \{\{\w+\}\} at all, so it
// silently passed the completeness check and leaked raw "{{...}}" markup
// straight to a student. Any {{ or }} left over after removing every
// well-formed token is broken template syntax.
function findMalformedPlaceholders(text) {
  if (!text) return [];
  const stripped = text.replace(/\{\{\w+\}\}/g, '');
  return stripped.match(/\{\{[^{}]*\}\}|\{\{|\}\}/g) ?? [];
}

// Catches "meta-templating": the model illustrating a sentence's STRUCTURE
// with bracketed placeholder-style words instead of either real {{tokens}}
// or plain prose — e.g. "[total] is [multiplier] times as many as [size of
// one group]" shipped completely literally to a student (real bug, caught
// live — MA704653374). The only legitimate bracket use anywhere in this
// system is [n/d] fraction notation (digits only) — anything else inside
// square brackets is this failure mode.
function findFakeBracketSlots(text) {
  if (!text) return [];
  return [...text.matchAll(/\[([^\]]+)\]/g)]
    .map(m => m[1])
    .filter(inner => !/^\d+\/\d+$/.test(inner));
}

// Safety net for the "hardcoded intermediate arithmetic" failure mode (e.g.
// tip2 for a placeholder-value like smallLength=24 baking in "Split 24 into
// 20 and 4" as literal digits, or a reveal hardcoding a partial product like
// 140 instead of using placeholders) — the prompt instruction alone can't be
// trusted to hold every time. Derives every number reachable by one
// elementary step (place-value split, pairwise sum, pairwise product) from
// this specific sample's numeric params, then flags any of those numbers
// appearing as a bare literal in the RAW (unfilled) template text — a clean,
// reusable template should never contain them; they can only get there by
// the model doing sample-specific math and writing down the answer.
function deriveLeakCandidates(params) {
  const base = Object.values(params)
    .filter(v => typeof v === 'string' && /^\d+$/.test(v))
    .map(v => parseInt(v, 10));

  const derived = new Set();
  for (const v of base) {
    if (v >= 10 && v < 1000) {
      const tens = Math.floor(v / 10) * 10;
      const ones = v % 10;
      if (tens > 0) derived.add(tens);
      if (ones > 0) {
        for (const other of base) {
          const prod = other * ones;
          if (prod >= 10 && prod < 100000) derived.add(prod);
        }
      }
    }
  }
  for (let i = 0; i < base.length; i++) {
    for (let j = 0; j < base.length; j++) {
      if (i === j) continue;
      const sum = base[i] + base[j];
      const prod = base[i] * base[j];
      if (sum >= 10 && sum < 100000) derived.add(sum);
      if (prod >= 10 && prod < 100000) derived.add(prod);
    }
  }
  for (const v of base) if (v >= 10) derived.add(v);
  return [...derived];
}

export function findLeakedSampleNumbers(text, params) {
  if (!text) return [];
  const stripped = text.replace(/\{\{\w+\}\}/g, '');
  const candidates = deriveLeakCandidates(params);
  return candidates.filter(n => new RegExp(`\\b${n}\\b`).test(stripped));
}

// tip1/tip2 are shown BEFORE the student has answered correctly — they must
// never reference the answer itself, only the technique. Checked by
// placeholder NAME against the common/generic answer-value names
// (correctLetter, correctValue, {label}_correctValue for multi_part). This
// deliberately does NOT catch a custom-named answer placeholder from a
// hand-written generator _params (e.g. MA713939739's A_equation/B_length) —
// those are covered instead by the LLM judge pass (judgeTemplate), which
// checks for semantic answer-leakage regardless of placeholder naming.
const ANSWER_PLACEHOLDER_RE = /^(correctLetter|correctValue|\w+_correctValue)$/;

export function findAnswerLeakage(tipText) {
  if (!tipText) return [];
  const used = [...tipText.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
  return used.filter(key => ANSWER_PLACEHOLDER_RE.test(key));
}

// Runs every mechanical check against a candidate template and returns a
// flat list of human-readable problems (empty = clean). Shared by both
// shapes so flat and multi-part items go through identical scrutiny.
function validateMechanically(sample, template, params, isMultiPart) {
  const errors = [];

  if (isMultiPart) {
    const missing = sample.parts.filter(p => {
      const pt = template.parts?.[p.label];
      return !pt?.tip1 || !pt?.tip2 || !pt?.reveal;
    });
    if (missing.length > 0) {
      errors.push(`incomplete multi-part template, missing parts: ${missing.map(p => p.label).join(', ')}`);
      return errors; // shape is broken — nothing else to check yet
    }
    for (const p of sample.parts) {
      const pt = template.parts[p.label];
      const badPlaceholders = [
        ...findMissingPlaceholders(pt.tip1, params),
        ...findMissingPlaceholders(pt.tip2, params),
        ...findMissingPlaceholders(pt.reveal, params),
      ];
      if (badPlaceholders.length > 0) {
        errors.push(`Part ${p.label}: undefined placeholder(s) {{${[...new Set(badPlaceholders)].join('}}, {{')}}}`);
      }
      const malformed = [
        ...findMalformedPlaceholders(pt.tip1),
        ...findMalformedPlaceholders(pt.tip2),
        ...findMalformedPlaceholders(pt.reveal),
      ];
      if (malformed.length > 0) {
        errors.push(`Part ${p.label}: malformed placeholder syntax leaked into student-facing text: ${[...new Set(malformed)].join(', ')} — use ONLY well-formed {{singleWordName}} tokens from the placeholder list, never a hand-typed list or description wrapped in braces`);
      }
      const fakeSlots = [
        ...findFakeBracketSlots(pt.tip1),
        ...findFakeBracketSlots(pt.tip2),
        ...findFakeBracketSlots(pt.reveal),
      ];
      if (fakeSlots.length > 0) {
        errors.push(`Part ${p.label}: literal bracket "slot" notation leaked into student-facing text: [${[...new Set(fakeSlots)].join('], [')}] — never illustrate a sentence's structure with bracketed placeholder-style words; use real {{placeholders}} or describe it in plain prose with no brackets at all`);
      }
      const leaked = [
        ...findLeakedSampleNumbers(pt.tip1, params),
        ...findLeakedSampleNumbers(pt.tip2, params),
        ...findLeakedSampleNumbers(pt.reveal, params),
      ];
      if (leaked.length > 0) {
        errors.push(`Part ${p.label}: hardcodes sample-specific computed number(s) ${[...new Set(leaked)].join(', ')} instead of using placeholders`);
      }
      const answerLeak = [...findAnswerLeakage(pt.tip1), ...findAnswerLeakage(pt.tip2)];
      if (answerLeak.length > 0) {
        errors.push(`Part ${p.label}: tip1/tip2 leaks the answer via {{${[...new Set(answerLeak)].join('}}, {{')}}}`);
      }
    }
    return errors;
  }

  if (!template.tip1 || !template.tip2 || !template.reveal) {
    errors.push('incomplete template (missing tip1/tip2/reveal)');
    return errors;
  }
  const badPlaceholders = [
    ...findMissingPlaceholders(template.tip1, params),
    ...findMissingPlaceholders(template.tip2, params),
    ...findMissingPlaceholders(template.reveal, params),
  ];
  if (badPlaceholders.length > 0) {
    errors.push(`undefined placeholder(s) {{${[...new Set(badPlaceholders)].join('}}, {{')}}}`);
  }
  const malformed = [
    ...findMalformedPlaceholders(template.tip1),
    ...findMalformedPlaceholders(template.tip2),
    ...findMalformedPlaceholders(template.reveal),
  ];
  if (malformed.length > 0) {
    errors.push(`malformed placeholder syntax leaked into student-facing text: ${[...new Set(malformed)].join(', ')} — use ONLY well-formed {{singleWordName}} tokens from the placeholder list, never a hand-typed list or description wrapped in braces`);
  }
  const fakeSlots = [
    ...findFakeBracketSlots(template.tip1),
    ...findFakeBracketSlots(template.tip2),
    ...findFakeBracketSlots(template.reveal),
  ];
  if (fakeSlots.length > 0) {
    errors.push(`literal bracket "slot" notation leaked into student-facing text: [${[...new Set(fakeSlots)].join('], [')}] — never illustrate a sentence's structure with bracketed placeholder-style words; use real {{placeholders}} or describe it in plain prose with no brackets at all`);
  }
  const leaked = [
    ...findLeakedSampleNumbers(template.tip1, params),
    ...findLeakedSampleNumbers(template.tip2, params),
    ...findLeakedSampleNumbers(template.reveal, params),
  ];
  if (leaked.length > 0) {
    errors.push(`hardcodes sample-specific computed number(s) ${[...new Set(leaked)].join(', ')} instead of using placeholders`);
  }
  const answerLeak = [...findAnswerLeakage(template.tip1), ...findAnswerLeakage(template.tip2)];
  if (answerLeak.length > 0) {
    errors.push(`tip1/tip2 leaks the answer via {{${[...new Set(answerLeak)].join('}}, {{')}}}`);
  }
  return errors;
}

const MAX_ATTEMPTS = 3; // 1 initial + 2 revision retries

async function generateForItem(item_id) {
  const standardId = ITEM_STANDARD[item_id];
  const year = ITEM_YEAR[item_id];

  if (!standardId) { console.warn(`  ⚠ no standard mapping — skipping`); return; }

  const sample = generate(item_id);
  if (!sample) { console.warn(`  ⚠ no generator — skipping`); return; }

  const params = extractParams(sample);
  const isMultiPart = sample.answer_type === 'multi_part' && Array.isArray(sample.parts);

  console.log(`  Sample: ${describeQuestion(sample).split('\n')[0]}`);
  console.log(`  Params: ${JSON.stringify(params)}`);

  let priorIssues = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) console.log(`  ↻ revision attempt ${attempt}/${MAX_ATTEMPTS}`);

    let template;
    try {
      template = await generateTemplate(sample, params, standardId, priorIssues);
    } catch (e) {
      // Most commonly an unparseable/truncated JSON response (e.g. a
      // multi-part item hitting max_tokens mid-string) — treat it as a
      // failed attempt and retry rather than letting it escape uncaught and
      // kill the entire batch (this took down a 66-item run once already).
      console.error(`  ✗ generation call failed: ${e.message}`);
      priorIssues = [`Your previous response could not be parsed (${e.message}). Respond with ONLY the JSON object — no markdown, no commentary — and keep every field concise enough to finish within the response budget.`];
      continue;
    }

    const mechErrors = validateMechanically(sample, template, params, isMultiPart);
    if (mechErrors.length > 0) {
      console.error(`  ✗ mechanical QA failed: ${mechErrors.join(' | ')}`);
      priorIssues = mechErrors;
      continue;
    }

    let judgment = { pass: true, issues: [] };
    try {
      judgment = await judgeTemplate(sample, standardId, template, isMultiPart);
    } catch (e) {
      console.error(`  ⚠ LLM judge call failed (${e.message}) — proceeding without it for this attempt`);
    }
    if (!judgment.pass) {
      console.error(`  ✗ LLM QA failed: ${judgment.issues.join(' | ')}`);
      priorIssues = judgment.issues;
      continue;
    }

    if (isMultiPart) {
      await db.collection('questionTemplates').doc(item_id).set({
        item_id, standardId, year, parts: template.parts, createdAt: admin.firestore.Timestamp.now(),
      });
      console.log(`  ✓ stored questionTemplates/${item_id} (multi-part, ${sample.parts.length} parts)${attempt > 1 ? ` [attempt ${attempt}]` : ''}`);
      for (const p of sample.parts) {
        console.log(`    Part ${p.label} tip1:   ${template.parts[p.label].tip1}`);
        console.log(`    Part ${p.label} tip2:   ${template.parts[p.label].tip2}`);
        console.log(`    Part ${p.label} reveal: ${template.parts[p.label].reveal}`);
      }
    } else {
      await db.collection('questionTemplates').doc(item_id).set({
        item_id, standardId, year,
        tip1: template.tip1, tip2: template.tip2, reveal: template.reveal,
        createdAt: admin.firestore.Timestamp.now(),
      });
      console.log(`  ✓ stored questionTemplates/${item_id}${attempt > 1 ? ` [attempt ${attempt}]` : ''}`);
      console.log(`    tip1:   ${template.tip1}`);
      console.log(`    tip2:   ${template.tip2}`);
      console.log(`    reveal: ${template.reveal}`);
    }
    return;
  }

  console.error(`  ✗✗ ${item_id}: exhausted ${MAX_ATTEMPTS} attempts — SKIPPED, needs manual review. Last issues: ${priorIssues.join(' | ')}`);
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

  const items = targetItems ?? Object.keys(ITEM_STANDARD);
  console.log(`Generating templates for ${items.length} item(s)...\n`);

  for (const item_id of items) {
    if (skipExisting) {
      const existing = await db.collection('questionTemplates').doc(item_id).get();
      if (existing.exists) { console.log(`${item_id} — skip (exists)\n`); continue; }
    }
    console.log(`${item_id}  [${ITEM_YEAR[item_id]} / ${ITEM_STANDARD[item_id]}]`);
    try {
      await generateForItem(item_id);
    } catch (e) {
      // Defense in depth: generateForItem already catches the common failure
      // (unparseable JSON) internally, but ANY uncaught error here must not
      // take down the rest of a long unattended batch.
      console.error(`  ✗✗ ${item_id}: unexpected error, skipping — ${e.stack ?? e.message}`);
    }
    console.log();
  }

  console.log('✓ Done.');
  process.exit(0);
}

// Guarded so importing this module (e.g. to reuse a helper, or a stray
// `import()` sanity-check) can never trigger a live run against production —
// only running the file directly (`node scripts/pregenerate-variants.mjs`) does.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
