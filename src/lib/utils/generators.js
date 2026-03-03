// Algorithmic question generators for MCAS 4th grade math
// Each generator returns a question object matching the JSON schema.
// Add generators here as they're built; algo-check page picks them up automatically.

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Shared content ───────────────────────────────────────────────────────────
// Centralized because names+pronouns have no semantic coupling to any specific
// problem. Add a person here and they appear across all generators automatically.
// Activity/scenario arrays stay per-problem because verb forms are coupled to context.

const PEOPLE = [
  { name: 'Sofia',   pronoun: 'she',  poss: 'her'   },
  { name: 'Marcus',  pronoun: 'he',   poss: 'his'   },
  { name: 'Emma',    pronoun: 'she',  poss: 'her'   },
  { name: 'Diego',   pronoun: 'he',   poss: 'his'   },
  { name: 'Priya',   pronoun: 'she',  poss: 'her'   },
  { name: 'Jordan',  pronoun: 'they', poss: 'their' },
  { name: 'Aisha',   pronoun: 'she',  poss: 'her'   },
  { name: 'Carlos',  pronoun: 'he',   poss: 'his'   },
  { name: 'Lily',    pronoun: 'she',  poss: 'her'   },
  { name: 'Kai',     pronoun: 'they', poss: 'their' },
  { name: 'Noah',    pronoun: 'he',   poss: 'his'   },
  { name: 'Mia',     pronoun: 'she',  poss: 'her'   },
  { name: 'Sonya',   pronoun: 'she',  poss: 'her'   },
  { name: 'Carmen',  pronoun: 'she',  poss: 'her'   },
  { name: 'Anna',    pronoun: 'she',  poss: 'her'   },
];

// Q1: MultipleChoice + NumberBox — find the GCD/factor from a set of multiples
function generateQ1() {
  const possibleBases = [3, 4, 5, 6, 8];
  const base = possibleBases[Math.floor(Math.random() * possibleBases.length)];
  const person = pick(PEOPLE);

  // Generate 5 distinct multiples of base
  const multiples = [];
  const used = new Set();
  while (multiples.length < 5) {
    const m = base * randInt(2, 12);
    if (!used.has(m)) { used.add(m); multiples.push(m); }
  }

  // Arrange into rows: [2, 1, 2]
  const rows = [
    [multiples[0], multiples[1]],
    [multiples[2]],
    [multiples[3], multiples[4]]
  ];

  // Distractors: numbers that divide some but not all multiples, or look plausible
  const distractors = new Set();

  // Try factors of base*2 that aren't base itself
  for (let d = 2; d <= base * 4 && distractors.size < 5; d++) {
    if (d === base) continue;
    const dividesAll = multiples.every(m => m % d === 0);
    const dividesSome = multiples.some(m => m % d === 0);
    if (dividesSome && !dividesAll) distractors.add(d);
  }

  // Pad with base+1, base-1 if needed
  if (base > 2) distractors.add(base - 1);
  distractors.add(base + 1);
  distractors.add(base * 2);

  const dArr = [...distractors].filter(d => d !== base).slice(0, 3);
  const options = shuffle([base, ...dArr]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.indexOf(base)];

  return {
    question_number: '1',
    answer_type: 'multiple_choice',
    stimulus_intro: `${person.name} is thinking of a number. ${person.pronoun === 'they' ? 'They' : person.pronoun === 'she' ? 'She' : 'He'} wrote multiples of ${person.poss} number in a box, as shown.`,
    stimulus_type: 'number_box',
    stimulus_params: { rows },
    question_text: `Which of the following could be ${person.name}'s number?`,
    answer_options: options.map((v, i) => ({ letter: letters[i], text: String(v) })),
    correct_answer: correctLetter
  };
}

// Q2: MultipleChoice — fraction addition with denominators 10 and 100
function generateQ2() {
  // a/100 + b/10, where b/10 = b*10/100
  const a = randInt(1, 9);
  const b = randInt(1, 9);
  const correctVal = a + b * 10; // correct sum numerator over 100

  // Distractors
  const wrongNoConvert = a + b;          // forgot to convert b/10 → /100
  const wrongDenom = a + b * 10;         // same numerator but wrong denom below
  const wrongNumerOnly = a * b;          // multiply instead of add

  const options = shuffle([
    { text: `[${correctVal}/100]`, correct: true },
    { text: `[${wrongNoConvert}/110]`, correct: false },
    { text: `[${a * 10 + b}/110]`, correct: false },
    { text: `[${correctVal}/200]`, correct: false }
  ]);

  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.findIndex(o => o.correct)];

  return {
    question_number: '2',
    answer_type: 'multiple_choice',
    stimulus_intro: 'Find the sum.',
    stimulus_type: null,
    stimulus_params: null,
    question_text: null,
    math_expression: `[${a}/100] + [${b}/10]`,
    answer_options: options.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer: correctLetter
  };
}

// Q19: MultipleChoice — multi-digit subtraction with regrouping
function generateQ19() {
  const person = pick(PEOPLE);
  const minuends = [10000, 25000, 50000, 100000];
  const minuend = minuends[Math.floor(Math.random() * minuends.length)];

  // Subtrahend: no zeros, forces regrouping
  const sub = randInt(1111, minuend - 1000);
  const correct = minuend - sub;

  // Distractors: common errors
  const d1 = correct + randInt(10, 99);   // off by small amount
  const d2 = correct - randInt(10, 99);
  const d3 = correct + randInt(100, 999);

  const options = shuffle([correct, d1, d2, d3].map(v => ({ val: v })));
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.findIndex(o => o.val === correct)];

  return {
    question_number: '19',
    answer_type: 'multiple_choice',
    stimulus_intro: `${person.name} wrote this subtraction problem in ${person.poss} notebook.`,
    math_expression: `${minuend.toLocaleString()} − ${sub.toLocaleString()} = {?}`,
    question_text: `What number belongs in the {?} to make ${person.name}'s subtraction problem true?`,
    answer_options: options.map((o, i) => ({ letter: letters[i], text: o.val.toLocaleString() })),
    correct_answer: correctLetter
  };
}

// Q20: MultipleChoice + RectangleDiagram — area of a rectangle
function generateQ20() {
  const person = pick(PEOPLE);
  let w, h;
  do {
    w = randInt(6, 18);
    h = randInt(6, 18);
  } while (w === h);

  const area = w * h;
  const perimeter = 2 * (w + h);
  const d3 = w * w;
  const d4 = h * h;

  const options = shuffle([area, perimeter, d3, d4].map((v, i) => ({ val: v, isCorrect: i === 0 })));
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.findIndex(o => o.isCorrect)];

  return {
    question_number: '20',
    answer_type: 'multiple_choice',
    stimulus_intro: `${person.name} made a diagram of ${person.poss} room and labeled the length and width, as shown.`,
    stimulus_type: 'rectangle_diagram',
    stimulus_params: { width: w, height: h, width_label: `${w} feet`, height_label: `${h} feet` },
    question_text: `What is the area of ${person.name}'s room?`,
    answer_options: options.map((o, i) => ({ letter: letters[i], text: `${o.val} square feet` })),
    correct_answer: correctLetter
  };
}

// Q10: MultipleChoice — unit conversion
function generateQ10() {
  const conversions = [
    { unit: 'yards', toUnit: 'feet', factor: 3, scenario: 'rope' },
    { unit: 'yards', toUnit: 'feet', factor: 3, scenario: 'ribbon' },
    { unit: 'feet', toUnit: 'inches', factor: 12, scenario: 'board' },
  ];
  const conv = conversions[Math.floor(Math.random() * conversions.length)];
  const qty = randInt(2, 10);
  const correct = qty * conv.factor;

  const options = shuffle([
    { val: correct, correct: true },
    { val: qty, correct: false },                        // forgot to convert
    { val: qty * conv.factor * 3, correct: false },      // over-converted
    { val: qty + conv.factor, correct: false }           // added instead of multiplied
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.findIndex(o => o.correct)];

  const buyers = ['an artist', 'a designer', 'a crafter', 'a teacher'];
  const buyer = pick(buyers);
  return {
    question_number: '10',
    answer_type: 'multiple_choice',
    question_text: `${buyer.charAt(0).toUpperCase() + buyer.slice(1)} bought ${qty} ${conv.unit} of ${conv.scenario}. Which of the following is equivalent to ${qty} ${conv.unit}?`,
    answer_options: options.map((o, i) => ({ letter: letters[i], text: `${o.val} ${conv.toUnit}` })),
    correct_answer: correctLetter
  };
}

// Q11: ShortAnswer — place value (digit × 10 relationship)
function generateQ11() {
  // Pick a digit d (2–8) and embed it in two adjacent place positions
  const d = randInt(2, 8);
  // Random 5-digit number with digit d at thousands AND hundreds
  const ten_thousands = randInt(1, 9);
  const tens = randInt(0, 9);
  const ones = randInt(0, 9);
  const num = ten_thousands * 10000 + d * 1000 + d * 100 + tens * 10 + ones;

  return {
    question_number: '11',
    answer_type: 'short_answer',
    stimulus_intro: `${pick(['A teacher', 'A student', 'A parent'])} wrote this number on the board.`,
    math_expression: num.toLocaleString(),
    question_text: 'The value of the digit in the thousands place is how many times the value of the digit in the hundreds place?',
    correct_answer: '10'
  };
}

// Q12: ShortAnswer — word form to standard form
function generateQ12() {
  const ones_words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens_words = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function twoDigit(n) {
    if (n < 20) return ones_words[n];
    const t = Math.floor(n / 10), o = n % 10;
    return o === 0 ? tens_words[t] : `${tens_words[t]}-${ones_words[o]}`;
  }

  function toWords(n) {
    const th = Math.floor(n / 1000);
    const rem = n % 1000;
    const h = Math.floor(rem / 100);
    const rest = rem % 100;
    let parts = [];
    if (th) parts.push(`${twoDigit(th)} thousand`);
    if (h) parts.push(`${ones_words[h]} hundred`);
    if (rest) parts.push(twoDigit(rest));
    return parts.join(', ');
  }

  // Generate a 4–5 digit number; avoid numbers with zeros in middle (makes word form ugly)
  let n;
  do {
    n = randInt(10001, 99999);
  } while (n % 100 === 0 || Math.floor(n / 100) % 10 === 0);

  const words = toWords(n);

  return {
    question_number: '12',
    answer_type: 'short_answer',
    question_text: `What is <em>${words}</em> written in standard form? Enter your answer in the box.`,
    correct_answer: String(n)
  };
}

// Q14: MultipleChoice + AngleDiagram — unknown angle between rays
function generateQ14() {
  // Total angle HGL, two known arcs, one unknown
  const total = randInt(120, 170);
  const arc1 = randInt(30, 60);
  const arc2 = randInt(30, 60);
  if (arc1 + arc2 >= total - 10) return generateQ14(); // retry

  const unknown = total - arc1 - arc2;

  // Build ray angles (CCW from east)
  // H at some angle, then J = H - arc1, K = J - arc2, L = K - unknown
  const startAngle = randInt(140, 170);
  const rayH = startAngle;
  const rayJ = rayH - arc1;
  const rayK = rayJ - arc2;
  const rayL = rayK - unknown;

  // Distractors
  const d1 = total - arc1;
  const d2 = total - arc2;
  const d3 = unknown + randInt(5, 15);

  const options = shuffle([unknown, d1, d2, d3].map((v, i) => ({ val: v, isCorrect: i === 0 })));
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.findIndex(o => o.isCorrect)];

  return {
    question_number: '14',
    answer_type: 'multiple_choice',
    stimulus_intro: 'Some angles are shown in a diagram.',
    stimulus_type: 'angle_diagram',
    stimulus_params: {
      center: 'G',
      rays: [
        { label: 'H', angle: rayH },
        { label: 'J', angle: rayJ },
        { label: 'K', angle: rayK },
        { label: 'L', angle: rayL }
      ],
      arc_labels: [
        { between: ['H', 'J'], text: `${arc1}°`, radius: 45 },
        { between: ['J', 'K'], text: '?', radius: 52 },
        { between: ['K', 'L'], text: `${arc2}°`, radius: 62 }
      ]
    },
    question_text: `Angle HGL has a measure of ${total}°. What is the measure of angle JGK?`,
    answer_options: options.map((o, i) => ({ letter: letters[i], text: `${o.val}°` })),
    correct_answer: correctLetter
  };
}

// Q3: MultiPart + DataTable — decimal trail lengths, ordering and comparison
function generateQ3() {
  function fmt(v) {
    // Trim trailing zero from 2dp: 1.20 → "1.2", 1.58 → "1.58"
    const s = v.toFixed(2);
    return s.endsWith('0') ? v.toFixed(1) : s;
  }

  for (let attempt = 0; attempt < 200; attempt++) {
    // Blue: 1dp in range 1.2–1.8
    const blue = randInt(12, 18) / 10;

    // Two short trails: 1dp in 0.5–0.9 (always clearly shortest)
    const s1 = randInt(5, 9) / 10;
    const s2 = randInt(5, 9) / 10;
    if (s1 === s2) continue;

    // Two "close" trails: offset 0.02–0.09 from blue (always 2dp, requires decimal comparison)
    const o1 = randInt(2, 9) / 100;
    const o2 = randInt(2, 9) / 100;
    const sign1 = Math.random() < 0.5 ? 1 : -1;
    const sign2 = Math.random() < 0.5 ? 1 : -1;
    const c1 = Math.round((blue + sign1 * o1) * 100) / 100;
    const c2 = Math.round((blue + sign2 * o2) * 100) / 100;

    if (c1 === blue || c2 === blue) continue;
    if (Math.abs(c1 - blue) === Math.abs(c2 - blue)) continue; // tied → no unique answer

    // All 5 values must be distinct
    const vals = [blue, s1, s2, c1, c2];
    if (new Set(vals.map(v => Math.round(v * 100))).size < 5) continue;

    // Assign names: Blue fixed, others shuffled
    const otherNames = shuffle(['Red', 'White', 'Green', 'Purple']);
    const otherVals = shuffle([s1, s2, c1, c2]);

    const trailData = { Blue: blue };
    otherNames.forEach((name, i) => { trailData[name] = otherVals[i]; });

    // Compute answers
    const sorted = Object.entries(trailData).sort(([, a], [, b]) => a - b);
    const shortestTrail = sorted[0][0];
    const orderedList = sorted.map(([name]) => name).join(', ');
    const closestTrail = Object.entries(trailData)
      .filter(([name]) => name !== 'Blue')
      .sort(([, a], [, b]) => Math.abs(a - blue) - Math.abs(b - blue))[0][0];

    const rows = [
      ['Blue', fmt(blue)],
      ...otherNames.map((name, i) => [name, fmt(otherVals[i])])
    ];

    return {
      question_number: '3',
      answer_type: 'multi_part',
      question_text: 'This table shows the length, in kilometers, of each trail in a park.',
      stimulus_type: 'data_table',
      stimulus_params: {
        title: 'Park Trails',
        headers: ['Trail', 'Length\n(kilometers)'],
        rows
      },
      parts: [
        { label: 'A', text: 'Which trail has the shortest length?', answer_type: 'short_answer' },
        { label: 'B', text: 'List the trails in order of length from shortest to longest.', answer_type: 'short_answer' },
        { label: 'C', text: 'Which trail has a length closest to the length of the Blue Trail? Show or explain how you got your answer.', answer_type: 'constructed_response' }
      ],
      correct_answer: {
        A: shortestTrail,
        B: orderedList,
        C: closestTrail
      }
    };
  }

  return generateQ3(); // unreachable in practice
}

// Q4: MultipleChoice — "which is NOT equal" to a mixed-number expression
function generateQ4() {
  const wholeA = randInt(1, 3);
  const wholeB = randInt(1, 3);
  const person = pick(PEOPLE);
  const denom = [3, 4, 5, 6][randInt(0, 3)];
  const numA = randInt(1, denom - 1);
  const numB = randInt(1, denom - 1);
  // Target value = wholeA + wholeB + numA/denom + numB/denom
  const totalWhole = wholeA + wholeB;
  const totalNum = numA + numB; // may exceed denom → mixed

  // Express target as fraction over denom for comparison
  const targetNumer = totalWhole * denom + totalNum;

  function val(expr) {
    // expr is array of {w, n, d} terms; returns numerator over denom
    return expr.reduce((s, t) => s + t.w * denom + t.n, 0);
  }

  // Correct options (equal to target): commuted, rewritten, decomposed
  const correct1 = { text: `[${totalNum}/denom] + ${totalWhole}`.replace('denom', denom), numer: totalWhole * denom + totalNum };
  // swap fractions
  const correct2 = { text: `${wholeA} + ${wholeB} + [${numB}/${denom}] + [${numA}/${denom}]`, numer: targetNumer };
  // split one fraction unit: numA/denom = (numA-1)/denom + 1/denom
  const correct3 = { text: `${wholeA} + ${wholeB} + [${numA > 1 ? numA - 1 : numA + 1}/${denom}] + [${numB}/${denom}] + [1/${denom}]`, numer: numA > 1 ? targetNumer : targetNumer + 1 };

  // Wrong option: adds extra 1/denom (not equal)
  const wrongNumer = targetNumer + 1;
  const wrong = { text: `[${totalNum + 1}/${denom}] + ${totalWhole}`, numer: wrongNumer };

  // Build options: one wrong + three correct
  const pool = shuffle([
    { text: correct1.text, isCorrect: correct1.numer === targetNumer },
    { text: correct2.text, isCorrect: correct2.numer === targetNumer },
    { text: `${wholeA} + ${wholeB} + [${numA}/${denom}] + [${numA}/${denom}] + [${numB > numA ? numB - numA : 1}/${denom}]`, isCorrect: (wholeA + wholeB) * denom + numA + numA + (numB > numA ? numB - numA : 1) === targetNumer },
    { text: wrong.text, isCorrect: false }
  ]);

  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => !o.isCorrect)];

  return {
    question_number: '4',
    answer_type: 'multiple_choice',
    stimulus_intro: `${person.name} wrote this expression in a notebook.`,
    math_expression: `${wholeA} + ${wholeB} + [${numA}/${denom}] + [${numB}/${denom}]`,
    question_text: `Which of these is <strong>not</strong> equal to ${person.name}'s expression?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer: correctLetter
  };
}

// Q5: NumberLinePlot — plot a decimal on a number line
function generateQ5() {
  // Range 0–1, small_intervals=10 (tenths), zoom shows hundredths
  const tenths = randInt(1, 8);
  const hundredths = randInt(1, 9);
  const value = (tenths * 10 + hundredths) / 100;

  return {
    question_number: '5',
    answer_type: 'number_line_plot',
    question_text: `Plot the point that represents where ${value.toFixed(2)} is located on this number line.`,
    stimulus_params: { min: 0, max: 1, small_intervals: 10 },
    correct_answer: value.toFixed(2)
  };
}

// Q7: MultipleSelect + FractionComparison — which pairs correctly compare two fractions
function generateQ7() {
  // Pick two fractions a/b and c/d where they are not equal
  const pairs = [
    [2, 3, 3, 4], [1, 2, 2, 3], [3, 4, 4, 5], [2, 5, 1, 3],
    [3, 5, 2, 4], [1, 4, 2, 6], [3, 8, 1, 3], [2, 7, 1, 4]
  ];
  const [an, ad, bn, bd] = pairs[randInt(0, pairs.length - 1)];
  const aVal = an / ad;
  const bVal = bn / bd;
  const trueOp = aVal < bVal ? '<' : '>';
  const wrongOp = trueOp === '<' ? '>' : '<';

  const types = ['circle', 'rect'];
  const orientations = ['h', 'v'];

  // Build 6 options: 2 correct (right fractions, right operator, different model types)
  // 4 wrong: wrong operator, wrong fractions, or misleading sizes
  const options = shuffle([
    // Correct: rect h, true operator
    { model: { left: { type: 'rect', numerator: an, denominator: ad, orientation: 'h' }, operator: trueOp, right: { type: 'rect', numerator: bn, denominator: bd, orientation: 'h' } }, correct: true },
    // Correct: circle, true operator
    { model: { left: { type: 'circle', numerator: an, denominator: ad }, operator: trueOp, right: { type: 'circle', numerator: bn, denominator: bd } }, correct: true },
    // Wrong: rect v, wrong operator
    { model: { left: { type: 'rect', numerator: an, denominator: ad, orientation: 'v' }, operator: wrongOp, right: { type: 'rect', numerator: bn, denominator: bd, orientation: 'v' } }, correct: false },
    // Wrong: circle wrong operator
    { model: { left: { type: 'circle', numerator: an, denominator: ad }, operator: wrongOp, right: { type: 'circle', numerator: bn, denominator: bd } }, correct: false },
    // Wrong: different denominator (misleading model)
    { model: { left: { type: 'rect', numerator: an, denominator: ad + 1, orientation: 'h' }, operator: trueOp, right: { type: 'rect', numerator: bn, denominator: bd, orientation: 'h' } }, correct: false },
    // Wrong: mismatched sizes (bigger circle for smaller fraction)
    { model: { left: { type: 'circle', numerator: an, denominator: ad, size: aVal < bVal ? 1.4 : 0.65 }, operator: trueOp, right: { type: 'circle', numerator: bn, denominator: bd, size: aVal < bVal ? 0.65 : 1.4 } }, correct: false },
  ]);

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const correctLetters = options.map((o, i) => o.correct ? letters[i] : null).filter(Boolean).join(',');

  return {
    question_number: '7',
    answer_type: 'multiple_select',
    layout: 'split',
    select_count: 2,
    question_text: `Which pairs of models show a correct comparison of [${an}/${ad}] and [${bn}/${bd}]?`,
    answer_options: options.map((o, i) => ({ letter: letters[i], model: o.model })),
    correct_answer: correctLetters
  };
}

// Q8: MultipleChoice + LinePlot — sum of pieces at a specific length
function generateQ8() {
  const person = pick(PEOPLE);
  const { material, materialTitle } = pick([
    { material: 'pieces of wood',   materialTitle: 'Wood Pieces'   },
    { material: 'pieces of ribbon', materialTitle: 'Ribbon Pieces' },
    { material: 'strips of paper',  materialTitle: 'Paper Strips'  },
    { material: 'pieces of string', materialTitle: 'String Pieces' },
  ]);
  // Base whole number, 8ths fractions, 5 data points with varying counts
  const base = randInt(7, 12);
  const fracs = ['', '[1/8]', '[1/4]', '[3/8]', '[1/2]'];
  const fracVals = [0, 1/8, 1/4, 3/8, 1/2];

  // Assign counts: one label gets 3 pieces (the target), others get 1–3
  const targetIdx = randInt(2, 4); // pick from middle/end labels
  const counts = fracs.map((_, i) => i === targetIdx ? randInt(2, 4) : randInt(1, 3));

  const targetLabel = `${base}${fracs[targetIdx]}`;
  const targetCount = counts[targetIdx];
  const totalFracNum = targetCount * (targetIdx); // numerator in 8ths
  const totalWhole = base * targetCount + Math.floor(totalFracNum / 8);
  const remNum = totalFracNum % 8;

  // Format total as mixed number string
  function frac8(num) {
    if (num === 0) return '';
    const g = [1,2,4,8].find(f => num % f === 0 && (8/f) > 0);
    return `[${num/g}/${8/g}]`;
  }
  const totalStr = remNum === 0 ? `${totalWhole}` : `${totalWhole}${frac8(remNum)}`;

  // Distractors: off by one piece, wrong fraction, etc.
  const d1Whole = (base * (targetCount - 1)) + Math.floor(((targetCount-1) * targetIdx) / 8);
  const d1Rem = ((targetCount - 1) * targetIdx) % 8;
  const d1 = d1Rem === 0 ? `${d1Whole}` : `${d1Whole}${frac8(d1Rem)}`;

  const d2Whole = totalWhole - 1;
  const d2 = `${d2Whole}${frac8(remNum)}`;

  const d3Whole = totalWhole + 1;
  const d3 = `${d3Whole}${frac8(remNum)}`;

  const options = shuffle([totalStr, d1, d2, d3].map((v, i) => ({ text: `${v} inches`, isCorrect: i === 0 })));
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[options.findIndex(o => o.isCorrect)];

  return {
    question_number: '8',
    answer_type: 'multiple_choice',
    stimulus_intro: `${person.name} measured the lengths, in inches, of some ${material}. The lengths are shown in this line plot.`,
    stimulus_type: 'line_plot',
    stimulus_params: {
      title: `${materialTitle}`,
      axis_label: 'Length (inches)',
      data_points: fracs.map((f, i) => ({ label: `${base}${f}`, count: counts[i] }))
    },
    question_text: `${person.name} collected all the ${material} with a length of ${targetLabel} inches. Then ${person.pronoun} placed those ${material} end to end in a straight line. What is the total length of the ${material} ${person.name} placed in a straight line?`,
    answer_options: options.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer: correctLetter
  };
}

// Q6: MultiPart — basketball court / sandbox / playground word problem
function generateQ6() {
  const sandbox = randInt(10, 25);
  const multiplier = randInt(3, 8);
  const bball = sandbox * multiplier;
  const playground = 2 * (bball + sandbox);

  return {
    question_number: '6',
    answer_type: 'multi_part',
    question_text: `A playground has a basketball court and a sandbox. The length of the sandbox is ${sandbox} feet.`,
    parts: [
      {
        label: 'A',
        text: `The length of the basketball court is ${multiplier} times the length of the sandbox. Write an equation that can be used to find b, the length in feet of the basketball court.`,
        answer_type: 'short_answer'
      },
      {
        label: 'B',
        text: 'What is the length, in feet, of the basketball court? Show or explain how you got your answer.',
        answer_type: 'constructed_response'
      },
      {
        label: 'C',
        text: 'The length of the playground is twice the length of the basketball court and the sandbox added together. What is the total length, in feet, of the playground? Show or explain how you got your answer.',
        answer_type: 'constructed_response'
      }
    ],
    correct_answer: {
      A: `b=${multiplier}x${sandbox}`,
      B: String(bball),
      C: String(playground)
    }
  };
}

// Q13: InlineChoice + SymmetryFigure — is the dashed line a line of symmetry?
// Correct answer format: "X,Y" where X = RESPONSE_A1 option letter, Y = RESPONSE_A2 option letter
// RESPONSE_A1: A="is", B="is not"
// RESPONSE_A2: A="0 lines", B="1 line", C="2 lines", D="3 lines", E="4 lines", F="5 lines"
function generateQ13() {
  const variants = [
    // Square, vertical line (IS symmetry, 4 lines)
    {
      stimulus_params: { shape: { type: 'square', size: 120 }, line: { from: [0, -75], to: [0, 75] } },
      correct_answer: 'A,E'
    },
    // Square, horizontal line (IS symmetry, 4 lines)
    {
      stimulus_params: { shape: { type: 'square', size: 120 }, line: { from: [-75, 0], to: [75, 0] } },
      correct_answer: 'A,E'
    },
    // Square, diagonal line (IS symmetry, 4 lines)
    {
      stimulus_params: { shape: { type: 'square', size: 120 }, line: { from: [-75, -75], to: [75, 75] } },
      correct_answer: 'A,E'
    },
    // Rectangle, horizontal axis (IS symmetry, 2 lines)
    {
      stimulus_params: { shape: { type: 'rect', width: 150, height: 80 }, line: { from: [-85, 0], to: [85, 0] } },
      correct_answer: 'A,C'
    },
    // Rectangle, diagonal line (IS NOT symmetry, 2 lines)
    {
      stimulus_params: { shape: { type: 'rect', width: 150, height: 80 }, line: { from: [-70, -40], to: [70, 40] } },
      correct_answer: 'B,C'
    },
    // Equilateral triangle, vertical altitude (IS symmetry, 3 lines)
    {
      stimulus_params: { shape: { type: 'triangle', kind: 'equilateral', size: 120 }, line: { from: [0, -70], to: [0, 38] } },
      correct_answer: 'A,D'
    },
    // Isosceles triangle, vertical axis (IS symmetry, 1 line)
    {
      stimulus_params: { shape: { type: 'triangle', kind: 'isosceles', base: 120, height: 100 }, line: { from: [0, -68], to: [0, 36] } },
      correct_answer: 'A,B'
    },
    // Isosceles triangle, horizontal line through middle (IS NOT symmetry, 1 line)
    {
      stimulus_params: { shape: { type: 'triangle', kind: 'isosceles', base: 120, height: 100 }, line: { from: [-74, 0], to: [74, 0] } },
      correct_answer: 'B,B'
    },
    // Regular 4-point star, horizontal axis (IS symmetry, 4 lines)
    {
      stimulus_params: { shape: { type: 'star', points: 4, outer_r: 80, inner_r: 35 }, line: { from: [-91, 0], to: [91, 0] } },
      correct_answer: 'A,E'
    },
    // Regular 4-point star, diagonal (IS symmetry, 4 lines)
    {
      stimulus_params: { shape: { type: 'star', points: 4, outer_r: 80, inner_r: 35 }, line: { from: [-65, -65], to: [65, 65] } },
      correct_answer: 'A,E'
    },
  ];

  const chosen = variants[randInt(0, variants.length - 1)];

  return {
    question_number: '13',
    answer_type: 'inline_choice',
    stimulus_type: 'symmetry_figure',
    stimulus_params: chosen.stimulus_params,
    question_text: 'A dashed line is drawn on this figure.',
    instruction: 'Select from the drop-down menus to correctly complete each sentence.',
    sentences: [
      'The dashed line [RESPONSE_A1] a line of symmetry for the figure.',
      'The figure has a total of [RESPONSE_A2] of symmetry.'
    ],
    dropdowns: [
      { id: 'RESPONSE_A1', options: ['is', 'is not'] },
      { id: 'RESPONSE_A2', options: ['0 lines', '1 line', '2 lines', '3 lines', '4 lines', '5 lines'] }
    ],
    correct_answer: chosen.correct_answer
  };
}

// Q15: ShortAnswer — division word problem (two containers of items, items per product)
function generateQ15() {
  const scenarios = [
    {
      intro: (a, b, d) => `Abe has ${a} pins in one box and ${b} pins in another box. He is hanging posters with the pins. Abe uses ${d} pins to hang each poster.`,
      question: 'What is the total number of posters Abe can hang with the pins?',
      divisors: [4]
    },
    {
      intro: (a, b, d) => `Mia has ${a} stickers in one bag and ${b} stickers in another bag. She is decorating pages with the stickers. Mia uses ${d} stickers to decorate each page.`,
      question: 'What is the total number of pages Mia can decorate with the stickers?',
      divisors: [3, 5]
    },
    {
      intro: (a, b, d) => `Tom has ${a} buttons in one jar and ${b} buttons in another jar. He is sewing buttons onto jackets. Tom uses ${d} buttons on each jacket.`,
      question: 'What is the total number of jackets Tom can sew buttons onto?',
      divisors: [5]
    },
    {
      intro: (a, b, d) => `Lin has ${a} tiles in one box and ${b} tiles in another box. She is making rows on a board. Lin uses ${d} tiles in each row.`,
      question: 'What is the total number of rows Lin can make with the tiles?',
      divisors: [3, 4]
    }
  ];

  const sc = scenarios[randInt(0, scenarios.length - 1)];
  const divisor = sc.divisors[randInt(0, sc.divisors.length - 1)];

  let boxA, boxB;
  do {
    boxA = randInt(10, 20);
    boxB = randInt(10, 20);
  } while ((boxA + boxB) % divisor !== 0);

  const answer = (boxA + boxB) / divisor;

  return {
    question_number: '15',
    answer_type: 'short_answer',
    input_widget: 'text',
    stimulus_intro: sc.intro(boxA, boxB, divisor),
    question_text: sc.question,
    correct_answer: String(answer)
  };
}

// Q16: TrueFalseTable — rounding a 5-digit number to nearest ten/hundred/thousand
// Answer encoding: A=row1True, B=row1False, C=row2True, D=row2False, E=row3True, F=row3False
function generateQ16() {
  let n, T, row1True, row2True;

  for (let attempt = 0; attempt < 500; attempt++) {
    n = randInt(11000, 89999);
    T = Math.round(n / 1000) * 1000;
    row1True = Math.round(n / 10) * 10 === T;
    row2True = Math.round(n / 100) * 100 === T;
    // row3 always true (T = nearest thousand by definition)
    // Reject all-true (boring)
    if (!(row1True && row2True)) break;
  }

  const nStr = n.toLocaleString();
  const TStr = T.toLocaleString();

  const correct_answer = [
    row1True ? 'A' : 'B',
    row2True ? 'C' : 'D',
    'E'
  ].join(',');

  return {
    question_number: '16',
    answer_type: 'true_false_table',
    question_text: 'Select "True" or "False" in the table for each statement.',
    statements: [
      { text: `${nStr} rounded to the nearest ten is ${TStr}` },
      { text: `${nStr} rounded to the nearest hundred is ${TStr}` },
      { text: `${nStr} rounded to the nearest thousand is ${TStr}` }
    ],
    correct_answer
  };
}

// Q18: ShortAnswer — fraction × whole number, express result as mixed number
function generateQ18() {
  const denoms = [3, 4, 5, 6, 8];
  const denom = denoms[randInt(0, denoms.length - 1)];
  const numer = randInt(1, denom - 1);
  const N = randInt(3, 8);

  const totalNumer = N * numer;
  const whole = Math.floor(totalNumer / denom);
  const rem = totalNumer % denom;
  const correct = rem === 0 ? String(whole) : `${whole}[${rem}/${denom}]`;

  const scenarios = [
    {
      text: (n, num, den) => `Meghan is making ${n} loaves of banana bread. She needs [${num}/${den}] cup of sugar for each loaf. How many cups of sugar does Meghan need altogether to make the ${n} loaves?`
    },
    {
      text: (n, num, den) => `Carlos is making ${n} batches of cookies. He needs [${num}/${den}] cup of butter for each batch. How many cups of butter does Carlos need altogether to make the ${n} batches?`
    },
    {
      text: (n, num, den) => `Priya is making ${n} pots of soup. She needs [${num}/${den}] cup of cream for each pot. How many cups of cream does Priya need altogether to make the ${n} pots?`
    },
    {
      text: (n, num, den) => `Jordan is making ${n} trays of muffins. They need [${num}/${den}] cup of milk for each tray. How many cups of milk does Jordan need altogether to make the ${n} trays?`
    }
  ];

  const sc = scenarios[randInt(0, scenarios.length - 1)];

  return {
    question_number: '18',
    answer_type: 'short_answer',
    input_widget: 'equation_editor',
    question_text: sc.text(N, numer, denom),
    correct_answer: correct
  };
}

// Q9: MultiPart — sticker shape hotspot (Part A) + right triangle identification (Part B)
function generateQ9() {
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];

  // ── Shared helpers ──

  // Shoelace formula — polygon area
  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return Math.abs(a) / 2;
  }

  function geoArea(geo) {
    return geo.shape === 'rect' ? geo.w * geo.h : polyArea(geo.points);
  }

  // ── Part A: 5 sticker slots ──
  // viewBox "0 0 470 102", slot centers spaced ~94px apart, row center y=51
  const A_CX = [47, 141, 235, 329, 423];
  const CY   = 51;

  // Bigger shapes — all fit within 94px slot width and 102px height

  function pentagon(cx, cy) {
    const r = 42;
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      pts.push([+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]);
    }
    return { shape: 'polygon', points: pts };
  }

  function parallelogram(cx, cy) {
    const w = 68, h = 56, skew = randInt(10, 12);
    return {
      shape: 'polygon',
      points: [
        [cx - w/2,        cy + h/2],
        [cx + w/2,        cy + h/2],
        [cx + w/2 + skew, cy - h/2],
        [cx - w/2 + skew, cy - h/2]
      ]
    };
  }

  function obtuseTriSticker(cx, cy) {
    const base = 78, h = 52, shift = randInt(18, 26);
    return {
      shape: 'polygon',
      points: [
        [cx - base/2,         cy + h/2],
        [cx + base/2,         cy + h/2],
        [cx - base/2 + shift, cy - h/2]
      ]
    };
  }

  function stickerRect(cx, cy) {
    const w = randInt(72, 86), h = randInt(50, 62);
    return { shape: 'rect', x: +(cx - w/2).toFixed(1), y: +(cy - h/2).toFixed(1), w, h };
  }

  function equilateralTriSticker(cx, cy) {
    const r = 42;
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * 120 - 90) * Math.PI / 180;
      pts.push([+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]);
    }
    return { shape: 'polygon', points: pts };
  }

  function rightTriSticker(cx, cy) {
    const base = 70, h = 62;
    return {
      shape: 'polygon',
      points: [
        [+(cx - base/2).toFixed(1), +(cy + h/2).toFixed(1)],
        [+(cx + base/2).toFixed(1), +(cy + h/2).toFixed(1)],
        [+(cx - base/2).toFixed(1), +(cy - h/2).toFixed(1)]
      ]
    };
  }

  // Pick 2 obtuse builders and 3 non-obtuse builders
  const obtuseBuilders = shuffle([pentagon, parallelogram, obtuseTriSticker]).slice(0, 2);
  const plainBuilders  = shuffle([stickerRect, equilateralTriSticker, rightTriSticker]);

  const positions = shuffle([0, 1, 2, 3, 4]);
  const obtusePos  = positions.slice(0, 2).sort((a, b) => a - b);
  const plainPos   = positions.slice(2).sort((a, b) => a - b);

  // Build shapes, track area
  const shapeData = Array.from({ length: 5 }, (_, i) => {
    const cx = A_CX[i];
    const isObtuse = obtusePos.includes(i);
    const idx = isObtuse ? obtusePos.indexOf(i) : plainPos.indexOf(i);
    const geo = isObtuse ? obtuseBuilders[idx](cx, CY) : plainBuilders[idx](cx, CY);
    return { slotIdx: i, geo, area: geoArea(geo) };
  });

  // Assign labels: largest area → most text, smallest area → least text
  // Labels ordered by space needed (desc)
  const labelsBySize = [
    ...shuffle(['Congrats!', 'Great\nJob!', 'Way to\nGo!']), // medium — shuffled
    'Awesome\nTeamwork!',  // largest
    'A+'                   // smallest
  ];
  // Sort shapes desc by area, pair with labels desc by size
  const sortedByArea = [...shapeData].sort((a, b) => b.area - a.area);
  sortedByArea.forEach((entry, i) => { entry.label = labelsBySize[i]; });

  const stickers = shapeData
    .sort((a, b) => a.slotIdx - b.slotIdx)
    .map(e => ({ id: String(e.slotIdx + 1), ...e.geo, label: e.label }));

  const correctA = obtusePos.map(i => LETTERS[i]).join(',');

  // ── Part B: 3 triangle slots ──
  // viewBox "0 0 413 81" — triangles fill the height
  const B_SLOTS = [
    { x0: 5,   x1: 90,  y0: 3, y1: 76 },
    { x0: 135, x1: 255, y0: 5, y1: 76 },
    { x0: 280, x1: 410, y0: 5, y1: 76 }
  ];
  const TRI_LABELS = ['Yay!', 'Great!', 'Hooray!'];

  // Right triangle: clear right angle at bottom-left corner, no marker
  function makeRightTri({ x0, x1, y0, y1 }) {
    return { points: [[x0, y1], [x1, y1], [x0, y0]] };
  }

  // Isosceles pointing up
  function makeIsoscelesTri({ x0, x1, y0, y1 }) {
    const cx = Math.round((x0 + x1) / 2);
    return { points: [[cx, y0], [x0, y1], [x1, y1]] };
  }

  // Top-edge triangle pointing down (like base "Hooray!")
  function makeScaleneTri({ x0, x1, y0, y1 }) {
    const apex_x = Math.round(x0 + (x1 - x0) * 0.55);
    return { points: [[x0, y0], [x1, y0], [apex_x, y1]] };
  }

  const rightSlot    = randInt(0, 2);
  const otherStyles  = shuffle([makeIsoscelesTri, makeScaleneTri]);

  const triangles = B_SLOTS.map((slot, i) => {
    const maker = i === rightSlot ? makeRightTri : otherStyles[i < rightSlot ? i : i - 1];
    return { id: TRI_LABELS[i].replace('!', '').toLowerCase(), label: TRI_LABELS[i], ...maker(slot) };
  });

  const correctB = LETTERS[rightSlot];

  return {
    question_number: '9',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: 'A teacher has two sets of stickers in different shapes to give to students.',
    parts: [
      {
        label: 'A',
        text: 'The first set has five stickers, as shown.\n\nSelect <strong>two</strong> stickers in this set that appear to have at least one obtuse angle.',
        answer_type: 'hotspot',
        select_count: 2,
        stimulus_type: 'sticker_set',
        stimulus_params: { viewBox: '0 0 470 102', stickers }
      },
      {
        label: 'B',
        text: 'The second set has three triangle stickers, as shown.',
        instruction: 'Select from the drop-down menus to correctly complete the sentence.',
        answer_type: 'inline_choice',
        stimulus_type: 'triangle_set',
        stimulus_params: { viewBox: '0 0 413 81', triangles },
        sentence: 'The [RESPONSE_B1] sticker appears to be a right triangle because it has [RESPONSE_B2].',
        dropdowns: [
          { id: 'RESPONSE_B1', options: TRI_LABELS },
          { id: 'RESPONSE_B2', options: ['one right angle', 'two right angles', 'three right angles'] }
        ]
      }
    ],
    correct_answer: `${correctA};${correctB}`
  };
}

// Q17: ProtractorDragDrop — two angles, drag correct measure into each drop box
function generateQ17() {
  // One acute, one obtuse — students must choose the right scale for each
  const acuteOptions  = [30, 40, 50, 60, 70, 80];
  const obtuseOptions = [100, 110, 120, 130, 140, 150];

  let degA, degB, altA, altB;
  do {
    degA = acuteOptions[randInt(0, acuteOptions.length - 1)];
    degB = obtuseOptions[randInt(0, obtuseOptions.length - 1)];
    altA = 180 - degA;
    altB = 180 - degB;
  } while (new Set([degA, altA, degB, altB]).size < 4); // all four tiles distinct

  const choices = shuffle([degA, altA, degB, altB]);

  return {
    question_number: '17',
    answer_type: 'protractor_drag_drop',
    question_text: 'Two protractors are used to measure angle A and angle B, as shown. Drag and drop the correct measure into each box.',
    stimulus_params: {
      angles: [
        { label: 'A', degrees: degA },
        { label: 'B', degrees: degB }
      ],
      choices
    },
    correct_answer: `A=${degA}°, B=${degB}°`
  };
}

// ─── 2023 generators ─────────────────────────────────────────────────────────

// 2023 Q1: MultipleChoice + ItemArray — N×M grid, "X times as many" division
function generate2023Q1() {
  const multiplier = randInt(2, 3);

  // Pick rows/cols so total is divisible by multiplier and Tommy's count is at least 4
  let rows, cols, total;
  do {
    rows = randInt(2, 5);
    cols = randInt(3, 7);
    total = rows * cols;
  } while (total % multiplier !== 0 || total / multiplier < 4);

  const correct = total / multiplier;

  // Distractors — each targets a specific error:
  const d1 = total;               // reported Lily's total (counted all, answered wrong question)
  const d2 = total * multiplier;  // multiplied instead of divided (applied operator backwards)
  const d3 = correct + total;     // found correct answer but then added Lily's ("how many together?")

  const vals = shuffle([correct, d1, d2, d3].map((v, i) => ({ v, correct: i === 0 })));
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[vals.findIndex(o => o.correct)];

  return {
    question_number: '1',
    answer_type: 'multiple_choice',
    stimulus_intro: 'Lily made some cupcakes, as shown.',
    stimulus_type: 'item_array',
    stimulus_params: { rows, cols, item: 'cupcake' },
    question_text: `Lily made ${multiplier} times as many cupcakes as Tommy made. How many cupcakes did Tommy make?`,
    answer_options: vals.map((o, i) => ({ letter: letters[i], text: String(o.v) })),
    correct_answer: correctLetter
  };
}

// 2023 Q3: MultipleChoice — which shape has MORE THAN one line of symmetry?
// Shapes annotated with their symmetry line count so the generator self-documents.
function generate2023Q3() {
  // family tag prevents visually similar correct/wrong pairs (e.g. equilateral + isosceles)
  const correct = [
    { shape: { type: 'circle',   r: 55 },                                             lines: Infinity, family: 'round' },
    { shape: { type: 'square',   size: 100 },                                         lines: 4,        family: 'quad'  },
    { shape: { type: 'triangle', kind: 'equilateral', size: 100 },                    lines: 3,        family: 'tri'   },
    { shape: { type: 'rect',     width: 130, height: 78 },                            lines: 2,        family: 'quad'  },
    { shape: { type: 'star',     points: 4, outer_r: 60, inner_r: 25 },              lines: 4,        family: 'star'  },
  ];

  const wrong = [
    // Isosceles — 1 line; students guess more because it "looks symmetric"
    { shape: { type: 'triangle', kind: 'isosceles', base: 110, height: 85 },          lines: 1, family: 'tri'   },
    // Semicircle — 1 line (vertical only)
    { shape: { type: 'semicircle', r: 62 },                                            lines: 1, family: 'round' },
    // Right triangle — 0 lines; students may confuse the right angle for a symmetry axis
    { shape: { type: 'triangle', kind: 'right', legs: [110, 72] },                    lines: 0, family: 'tri'   },
    // Parallelogram — 0 lines; students think the diagonal is a symmetry line
    { shape: { type: 'polygon', vertices: [[-55, 38], [55, 38], [83, -38], [-27, -38]] }, lines: 0, family: 'quad' },
    // Right trapezoid — 0 lines; one right side, one slanted side breaks symmetry
    { shape: { type: 'polygon', vertices: [[-55, 35], [55, 35], [55, -35], [-20, -35]] }, lines: 0, family: 'quad' },
    // Scalene-ish right triangle — 0 lines
    { shape: { type: 'triangle', kind: 'right', legs: [100, 60], rotation: 12 },      lines: 0, family: 'tri'   },
  ];

  const chosen = pick(correct);
  const correctFamily = chosen.family;

  // Prefer distractors from different families; fall back to any remaining if needed
  const eligible = wrong.filter(w => w.family !== correctFamily);
  const fallback = wrong.filter(w => w.family === correctFamily);
  const pool = eligible.length >= 3
    ? eligible
    : [...eligible, ...shuffle(fallback)];
  const distractors = pool.slice(0, 3);
  const opts = shuffle([chosen, ...distractors]);

  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[opts.indexOf(chosen)];

  return {
    question_number: '3',
    answer_type: 'multiple_choice',
    question_text: 'Which of the following shapes has <strong>more than</strong> one line of symmetry?',
    answer_options: opts.map((o, i) => ({ letter: letters[i], shape: o.shape })),
    correct_answer: correctLetter
  };
}

// 2023 Q2: MultipleChoice — extend an arithmetic sequence to find which day hits the target
function generate2023Q2() {
  const scenarios = [
    { name: 'Diego',  pronoun: 'he',   activity: 'math problems',  past: 'solved', infin: 'solve' },
    { name: 'Emma',   pronoun: 'she',  activity: 'jumping jacks',  past: 'did',    infin: 'do'    },
    { name: 'Sofia',  pronoun: 'she',  activity: 'pages',          past: 'read',   infin: 'read'  },
    { name: 'Marcus', pronoun: 'he',   activity: 'push-ups',       past: 'did',    infin: 'do'    },
    { name: 'Lily',   pronoun: 'she',  activity: 'laps',           past: 'walked', infin: 'walk'  },
    { name: 'Jordan', pronoun: 'they', activity: 'problems',       past: 'solved', infin: 'solve' },
  ];

  const sc = scenarios[randInt(0, scenarios.length - 1)];
  const steps = [3, 4, 5, 6, 8, 10];
  const step = steps[randInt(0, steps.length - 1)];
  // start is a clean multiple of step so day values stay round
  const start = step * randInt(2, 4);

  // Target on a day the student must compute (days 4–7 not given in the list)
  const targetDay = randInt(4, 7);
  const target = start + (targetDay - 1) * step;

  const { name, pronoun, activity, past, infin } = sc;

  // Options always in natural order: 4th, 5th, 6th, 7th — not shuffled
  // Distractors: the other three days in the sequence; each represents a specific
  // arithmetic error — stopping one step too early, too late, or two steps off.
  const dayOrdinals = ['fourth', 'fifth', 'sixth', 'seventh'];
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[targetDay - 4];

  return {
    question_number: '2',
    answer_type: 'multiple_choice',
    stimulus_intro: `${name} ${past} ${activity} each day for one week.`,
    stimulus_list: [
      `On the first day, ${pronoun} ${past} ${start} ${activity}.`,
      `On the second day, ${pronoun} ${past} ${start + step} ${activity}.`,
      `On the third day, ${pronoun} ${past} ${start + 2 * step} ${activity}.`,
    ],
    question_text: `Each day, ${name} continued to ${infin} ${step} more ${activity} than the day before. On which day did ${pronoun} ${infin} ${target} ${activity}?`,
    answer_options: dayOrdinals.map((d, i) => ({ letter: letters[i], text: `the ${d} day` })),
    correct_answer: correctLetter
  };
}

// ─── 2025 generators ─────────────────────────────────────────────────────────

// 2025 Q1: MultipleChoice — which fraction fills {?} > n/d
function generate2025Q1() {
  // Improper reference fractions, value 1.5–3.5 — forces genuine comparison work
  const refs = [
    [5, 2], [7, 3], [9, 4], [7, 4], [11, 4],
    [8, 3], [5, 3], [11, 5], [7, 2], [13, 5]
  ];
  const [refN, refD] = refs[randInt(0, refs.length - 1)];
  const refVal = refN / refD;

  // Correct: different denominator, strictly > refVal (requires cross-multiplying or converting)
  const otherDenoms = [2, 3, 4, 5, 6, 8].filter(d => d !== refD);
  const correctD = otherDenoms[randInt(0, otherDenoms.length - 1)];
  const correctN = Math.floor(refVal * correctD) + 1 + randInt(0, 2);

  // Distractor: same denominator, lesser numerator
  // Error: student compares numerators only, ignoring that same-denom means bigger N = bigger value
  // (they see N < refN and think "this is bigger because the number looks familiar")
  const lessN = Math.max(1, refN - randInt(1, 2));

  // Distractor: equivalent fraction (= refVal, not > refVal)
  // Error: student finds a fraction equal to the reference and accepts = as satisfying >
  const k = randInt(2, 3);
  const eqN = refN * k, eqD = refD * k;

  // Distractor: small proper fraction (value < 1, clearly less than any improper fraction > 1)
  // Error: student doesn't convert to a common basis; sees unfamiliar denominator, guesses
  const smallD = randInt(4, 8);
  const smallN = randInt(1, smallD - 2);

  const opts = shuffle([
    { text: `[${correctN}/${correctD}]`, correct: true },
    { text: `[${lessN}/${refD}]`,        correct: false },
    { text: `[${eqN}/${eqD}]`,           correct: false },
    { text: `[${smallN}/${smallD}]`,     correct: false },
  ]);

  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[opts.findIndex(o => o.correct)];

  return {
    question_number: '1',
    answer_type: 'multiple_choice',
    stimulus_intro: 'A student wrote this comparison.',
    math_expression: `{?} > [${refN}/${refD}]`,
    question_text: "Which of these fractions belongs in the {?} to make the student's comparison true?",
    answer_options: opts.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer: correctLetter
  };
}

// ─── Registry (keyed by item_id — stable across years and exam positions) ────

export const generators = {
  // 2019
  'MA227383':    generateQ1,
  'MA311551':    generateQ2,
  'MA311583':    generateQ3,
  'MA303319':    generateQ4,
  'MA714225971': generateQ5,
  'MA713939739': generateQ6,
  'MA704647848': generateQ7,
  'MA303329':    generateQ8,
  'MA714233266': generateQ9,
  'MA222213':    generateQ10,
  'MA307033':    generateQ11,
  'MA307037':    generateQ12,
  'MA714111699': generateQ13,
  'MA306994':    generateQ14,
  'MA279791':    generateQ15,
  'MA713680384': generateQ16,
  'MA704650539': generateQ17,
  'MA304988':    generateQ18,
  'MA286777':    generateQ19,
  'MA247745':    generateQ20,
  // 2023
  'MA301798':    generate2023Q1,
  'MA297614':    generate2023Q2,
  'MA247705':    generate2023Q3,
  // 2025
  'MA900754381': generate2025Q1,
};

export function generate(itemId) {
  const fn = generators[itemId];
  if (!fn) return null;
  return fn();
}
