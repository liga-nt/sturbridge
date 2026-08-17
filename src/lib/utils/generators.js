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
    { unit: 'yards', unitSingular: 'yard', toUnit: 'feet', toUnitSingular: 'foot', factor: 3, scenario: 'rope' },
    { unit: 'yards', unitSingular: 'yard', toUnit: 'feet', toUnitSingular: 'foot', factor: 3, scenario: 'ribbon' },
    { unit: 'feet', unitSingular: 'foot', toUnit: 'inches', toUnitSingular: 'inch', factor: 12, scenario: 'board' },
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
    correct_answer: correctLetter,
    _params: {
      unit: conv.unit,
      unitSingular: conv.unitSingular,
      toUnit: conv.toUnit,
      toUnitSingular: conv.toUnitSingular,
      factor: String(conv.factor),
      qty: String(qty)
    }
  };
}

// Q11: ShortAnswer — place value (digit × 10/100/1000 relationship)
function generateQ11() {
  // Pick a digit d (2–8) and embed it in two place positions 1, 2, or 3 apart
  const d = randInt(2, 8);

  const configs = [
    {
      higher: 'thousands', lower: 'hundreds', factor: 10,
      build(d) {
        const tt = randInt(1, 9), tens = randInt(0, 9), ones = randInt(0, 9);
        return tt * 10000 + d * 1000 + d * 100 + tens * 10 + ones;
      }
    },
    {
      higher: 'thousands', lower: 'tens', factor: 100,
      build(d) {
        const tt = randInt(1, 9), hundreds = randInt(0, 9), ones = randInt(0, 9);
        return tt * 10000 + d * 1000 + hundreds * 100 + d * 10 + ones;
      }
    },
    {
      higher: 'thousands', lower: 'ones', factor: 1000,
      build(d) {
        const tt = randInt(1, 9), hundreds = randInt(0, 9), tens = randInt(0, 9);
        return tt * 10000 + d * 1000 + hundreds * 100 + tens * 10 + d;
      }
    },
  ];

  const config = pick(configs);
  const num = config.build(d);

  return {
    question_number: '11',
    answer_type: 'short_answer',
    stimulus_intro: `${pick(['A teacher', 'A student', 'A parent'])} wrote this number on the board.`,
    math_expression: num.toLocaleString(),
    question_text: `The value of the digit in the ${config.higher} place is how many times the value of the digit in the ${config.lower} place?`,
    correct_answer: String(config.factor)
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
    question_text: `What is <em>${words}</em> written in standard form?`,
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
    const s = v.toFixed(2);
    return s.endsWith('0') ? v.toFixed(1) : s;
  }

  const SCENARIOS = [
    {
      tableTitle: 'Park Trails',
      colHeader: 'Trail',
      unitLabel: 'kilometers',
      names: ['Blue', 'Red', 'White', 'Green', 'Purple'],
      questionText: (u) => `This table shows the length, in ${u}, of each trail in a park.`,
      partA: () => 'Which trail has the shortest length?',
      partB: () => 'List the trails in order of length from shortest to longest.',
      partC: (ref) => `Which trail has a length closest to the length of the ${ref} Trail? Show or explain how you got your answer.`,
    },
    {
      tableTitle: 'Garden Paths',
      colHeader: 'Path',
      unitLabel: 'meters',
      names: ['Birch', 'Cedar', 'Maple', 'Willow', 'Oak'],
      questionText: (u) => `This table shows the length, in ${u}, of each path in a botanical garden.`,
      partA: () => 'Which path has the shortest length?',
      partB: () => 'List the paths in order of length from shortest to longest.',
      partC: (ref) => `Which path has a length closest to the length of the ${ref} Path? Show or explain how you got your answer.`,
    },
    {
      tableTitle: 'Bike Routes',
      colHeader: 'Route',
      unitLabel: 'miles',
      names: ['Harbor', 'Forest', 'River', 'Valley', 'Hilltop'],
      questionText: (u) => `This table shows the length, in ${u}, of each bike route in a county park.`,
      partA: () => 'Which route has the shortest length?',
      partB: () => 'List the routes in order of length from shortest to longest.',
      partC: (ref) => `Which route has a length closest to the length of the ${ref} Route? Show or explain how you got your answer.`,
    },
    {
      tableTitle: 'Race Courses',
      colHeader: 'Course',
      unitLabel: 'kilometers',
      names: ['Sprint', 'Dash', 'Relay', 'Stride', 'Pace'],
      questionText: (u) => `This table shows the length, in ${u}, of each race course at a running event.`,
      partA: () => 'Which course has the shortest length?',
      partB: () => 'List the courses in order of length from shortest to longest.',
      partC: (ref) => `Which course has a length closest to the length of the ${ref} Course? Show or explain how you got your answer.`,
    },
  ];

  const sc = pick(SCENARIOS);
  const shuffledNames = shuffle([...sc.names]);
  const refName = shuffledNames[0]; // reference item varies each generation

  for (let attempt = 0; attempt < 200; attempt++) {
    // Reference item: 1dp in range 1.2–1.8
    const ref = randInt(12, 18) / 10;

    // Two short items: 1dp in 0.5–0.9 (clearly shortest)
    const s1 = randInt(5, 9) / 10;
    const s2 = randInt(5, 9) / 10;
    if (s1 === s2) continue;

    // Two "close" items: offset 0.02–0.09 from ref (requires decimal comparison)
    const o1 = randInt(2, 9) / 100;
    const o2 = randInt(2, 9) / 100;
    const sign1 = Math.random() < 0.5 ? 1 : -1;
    const sign2 = Math.random() < 0.5 ? 1 : -1;
    const c1 = Math.round((ref + sign1 * o1) * 100) / 100;
    const c2 = Math.round((ref + sign2 * o2) * 100) / 100;

    if (c1 === ref || c2 === ref) continue;
    if (Math.abs(c1 - ref) === Math.abs(c2 - ref)) continue;

    const vals = [ref, s1, s2, c1, c2];
    if (new Set(vals.map(v => Math.round(v * 100))).size < 5) continue;

    // refName gets ref value; other 4 names get shuffled values
    const otherNames = shuffledNames.slice(1);
    const otherVals = shuffle([s1, s2, c1, c2]);

    const itemData = { [refName]: ref };
    otherNames.forEach((name, i) => { itemData[name] = otherVals[i]; });

    const sorted = Object.entries(itemData).sort(([, a], [, b]) => a - b);
    const shortestItem = sorted[0][0];
    const orderedList = sorted.map(([name]) => name).join(', ');
    const closestItem = Object.entries(itemData)
      .filter(([name]) => name !== refName)
      .sort(([, a], [, b]) => Math.abs(a - ref) - Math.abs(b - ref))[0][0];

    const rows = shuffledNames.map(name => [name, fmt(itemData[name])]);

    return {
      question_number: '3',
      answer_type: 'multi_part',
      question_text: sc.questionText(sc.unitLabel),
      stimulus_type: 'data_table',
      stimulus_params: {
        title: sc.tableTitle,
        headers: [sc.colHeader, `Length\n(${sc.unitLabel})`],
        rows,
      },
      parts: [
        { label: 'A', text: sc.partA(), answer_type: 'short_answer' },
        { label: 'B', text: sc.partB(), answer_type: 'short_answer' },
        { label: 'C', text: sc.partC(refName), answer_type: 'constructed_response' },
      ],
      correct_answer: {
        A: shortestItem,
        B: orderedList,
        C: closestItem,
      },
      _params: {
        itemNoun: sc.colHeader.toLowerCase(),
      },
    };
  }

  return generateQ3();
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

  // Correct options (equal to target): commuted, rewritten, decomposed
  const correct1 = { text: `[${totalNum}/denom] + ${totalWhole}`.replace('denom', denom), numer: totalWhole * denom + totalNum };
  // swap fractions
  const correct2 = { text: `${wholeA} + ${wholeB} + [${numB}/${denom}] + [${numA}/${denom}]`, numer: targetNumer };
  // convert one whole unit from wholeA into denom/denom, fold into numA's fraction — always
  // valid regardless of numA/numB ordering (unlike a numA-vs-numB split, which only works
  // one direction and silently produces a second "not equal" option the other direction)
  const correct3text = `${wholeA - 1} + ${wholeB} + [${denom + numA}/${denom}] + [${numB}/${denom}]`;

  // Wrong option: adds extra 1/denom (not equal)
  const wrongNumer = targetNumer + 1;
  const wrong = { text: `[${totalNum + 1}/${denom}] + ${totalWhole}`, numer: wrongNumer };

  // Build options: one wrong + three correct
  const pool = shuffle([
    { text: correct1.text, isCorrect: correct1.numer === targetNumer },
    { text: correct2.text, isCorrect: correct2.numer === targetNumer },
    { text: correct3text, isCorrect: true },
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
    // Wrong: rect h, wrong operator
    { model: { left: { type: 'rect', numerator: an, denominator: ad, orientation: 'h' }, operator: wrongOp, right: { type: 'rect', numerator: bn, denominator: bd, orientation: 'h' } }, correct: false },
    // Wrong: circle, wrong operator
    { model: { left: { type: 'circle', numerator: an, denominator: ad }, operator: wrongOp, right: { type: 'circle', numerator: bn, denominator: bd } }, correct: false },
    // Wrong: rect v, correct operator but fractions swapped (bn/ad vs an/bd) — wrong models
    { model: { left: { type: 'rect', numerator: bn, denominator: ad, orientation: 'v' }, operator: trueOp, right: { type: 'rect', numerator: an, denominator: bd, orientation: 'v' } }, correct: false },
    // Wrong: circle, correct operator but left denominator off by 1 — wrong fraction
    { model: { left: { type: 'circle', numerator: an, denominator: ad + 1 }, operator: trueOp, right: { type: 'circle', numerator: bn, denominator: bd } }, correct: false },
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
    correct_answer: correctLetters,
    _params: {
      fractionA: `${an}/${ad}`,
      fractionB: `${bn}/${bd}`,
      correctOperator: trueOp,
      correctLetters,
    },
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
  const SCENARIOS = [
    {
      v: 'b',
      smallThing: 'sandbox',   bigThing: 'basketball court', totalThing: 'playground',
      intro:  (small) => `A playground has a basketball court and a sandbox. The length of the sandbox is ${small} feet.`,
      partA:  (n)     => `The length of the basketball court is ${n} times the length of the sandbox. Write an equation that can be used to find b, the length in feet of the basketball court.`,
      partB:  ()      => 'What is the length, in feet, of the basketball court? Show or explain how you got your answer.',
      partC:  ()      => 'The length of the playground is twice the length of the basketball court and the sandbox added together. What is the total length, in feet, of the playground? Show or explain how you got your answer.',
    },
    {
      v: 'g',
      smallThing: 'flower bed', bigThing: 'vegetable garden', totalThing: 'yard',
      intro:  (small) => `A yard has a vegetable garden and a flower bed. The length of the flower bed is ${small} feet.`,
      partA:  (n)     => `The length of the vegetable garden is ${n} times the length of the flower bed. Write an equation that can be used to find g, the length in feet of the vegetable garden.`,
      partB:  ()      => 'What is the length, in feet, of the vegetable garden? Show or explain how you got your answer.',
      partC:  ()      => 'The length of the yard is twice the length of the vegetable garden and the flower bed added together. What is the total length, in feet, of the yard? Show or explain how you got your answer.',
    },
    {
      v: 'c',
      smallThing: 'office', bigThing: 'classroom', totalThing: 'school hallway',
      intro:  (small) => `A school building has a classroom and an office. The length of the office is ${small} feet.`,
      partA:  (n)     => `The length of the classroom is ${n} times the length of the office. Write an equation that can be used to find c, the length in feet of the classroom.`,
      partB:  ()      => 'What is the length, in feet, of the classroom? Show or explain how you got your answer.',
      partC:  ()      => 'The length of the school hallway is twice the length of the classroom and the office added together. What is the total length, in feet, of the school hallway? Show or explain how you got your answer.',
    },
    {
      v: 'p',
      smallThing: 'wading pool', bigThing: 'lap pool', totalThing: 'pool deck',
      intro:  (small) => `A recreation center has a lap pool and a wading pool. The length of the wading pool is ${small} feet.`,
      partA:  (n)     => `The length of the lap pool is ${n} times the length of the wading pool. Write an equation that can be used to find p, the length in feet of the lap pool.`,
      partB:  ()      => 'What is the length, in feet, of the lap pool? Show or explain how you got your answer.',
      partC:  ()      => 'The length of the pool deck is twice the length of the lap pool and the wading pool added together. What is the total length, in feet, of the pool deck? Show or explain how you got your answer.',
    },
  ];

  const sc = pick(SCENARIOS);
  const small = randInt(10, 25);
  const multiplier = randInt(3, 8);
  const big = small * multiplier;
  const total = 2 * (big + small);

  return {
    question_number: '6',
    answer_type: 'multi_part',
    question_text: sc.intro(small),
    parts: [
      { label: 'A', text: sc.partA(multiplier), answer_type: 'short_answer' },
      { label: 'B', text: sc.partB(), answer_type: 'constructed_response' },
      { label: 'C', text: sc.partC(), answer_type: 'constructed_response' },
    ],
    correct_answer: {
      A: `${sc.v}=${multiplier}x${small}`,
      B: String(big),
      C: String(total),
    },
    // Raw values exposed for teaching-prompt placeholders (see
    // src/lib/utils/feedbackTemplates.js extractParams) — otherwise they'd
    // have to be reverse-engineered out of the composed correct_answer.A
    // equation string, which is fragile.
    _params: {
      multiplier:    String(multiplier),
      smallLength:   String(small),
      A_equation:    `${sc.v}=${multiplier}x${small}`,
      B_length:      String(big),
      C_totalLength: String(total),
    },
  };
}

// Q13: InlineChoice + SymmetryFigure — is the dashed line a line of symmetry?
// Correct answer format: "X,Y" where X = RESPONSE_A1 option letter, Y = RESPONSE_A2 option letter
// RESPONSE_A1: A="is", B="is not"
// RESPONSE_A2: A="0 lines", B="1 line", C="2 lines", D="3 lines", E="4 lines", F="5 lines"
function generateQ13() {
  const variants = [
    { shape_name: 'square',             stimulus_params: { shape: { type: 'square', size: 120 }, line: { from: [0, -75], to: [0, 75] } },          correct_answer: 'is,4 lines'     },
    { shape_name: 'square',             stimulus_params: { shape: { type: 'square', size: 120 }, line: { from: [-75, 0], to: [75, 0] } },           correct_answer: 'is,4 lines'     },
    { shape_name: 'square',             stimulus_params: { shape: { type: 'square', size: 120 }, line: { from: [-75, -75], to: [75, 75] } },        correct_answer: 'is,4 lines'     },
    { shape_name: 'rectangle',          stimulus_params: { shape: { type: 'rect', width: 150, height: 80 }, line: { from: [-85, 0], to: [85, 0] } }, correct_answer: 'is,2 lines'    },
    { shape_name: 'rectangle',          stimulus_params: { shape: { type: 'rect', width: 150, height: 80 }, line: { from: [-75, -40], to: [75, 40] } }, correct_answer: 'is not,2 lines' },
    { shape_name: 'equilateral triangle', stimulus_params: { shape: { type: 'triangle', kind: 'equilateral', size: 120 }, line: { from: [0, -70], to: [0, 38] } }, correct_answer: 'is,3 lines' },
    { shape_name: 'isosceles triangle', stimulus_params: { shape: { type: 'triangle', kind: 'isosceles', base: 120, height: 100 }, line: { from: [0, -68], to: [0, 36] } }, correct_answer: 'is,1 line' },
    { shape_name: 'isosceles triangle', stimulus_params: { shape: { type: 'triangle', kind: 'isosceles', base: 120, height: 100 }, line: { from: [-74, 0], to: [74, 0] } }, correct_answer: 'is not,1 line' },
    { shape_name: '4-pointed star',     stimulus_params: { shape: { type: 'star', points: 4, outer_r: 80, inner_r: 35 }, line: { from: [-91, 0], to: [91, 0] } }, correct_answer: 'is,4 lines' },
    { shape_name: '4-pointed star',     stimulus_params: { shape: { type: 'star', points: 4, outer_r: 80, inner_r: 35 }, line: { from: [-65, -65], to: [65, 65] } }, correct_answer: 'is,4 lines' },
  ];

  const chosen = variants[randInt(0, variants.length - 1)];

  return {
    question_number: '13',
    answer_type: 'inline_choice',
    stimulus_type: 'symmetry_figure',
    stimulus_params: chosen.stimulus_params,
    question_text: `A dashed line is drawn on this ${chosen.shape_name}.`,
    instruction: 'Select from the drop-down menus to correctly complete each sentence.',
    sentences: [
      'The dashed line [RESPONSE_A1] a line of symmetry for the figure.',
      'The figure has a total of [RESPONSE_A2] of symmetry.'
    ],
    dropdowns: [
      { id: 'RESPONSE_A1', options: ['is', 'is not'] },
      { id: 'RESPONSE_A2', options: ['0 lines', '1 line', '2 lines', '3 lines', '4 lines', '5 lines'] }
    ],
    correct_answer: chosen.correct_answer,
    _params: {
      shapeName: chosen.shape_name,
      isSymmetric: chosen.correct_answer.split(',')[0],
      lineCount: chosen.correct_answer.split(',')[1],
    },
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
    },
    {
      intro: (a, b, d) => `Jaylen has ${a} crayons in one bin and ${b} crayons in another bin. He is making art kits. Jaylen puts ${d} crayons in each kit.`,
      question: 'What is the total number of art kits Jaylen can make with the crayons?',
      divisors: [4, 6]
    },
    {
      intro: (a, b, d) => `Nadia has ${a} marbles in one jar and ${b} marbles in another jar. She is filling small bags with the marbles. Nadia puts ${d} marbles in each bag.`,
      question: 'What is the total number of bags Nadia can fill with the marbles?',
      divisors: [5, 6]
    }
  ];

  const sc = scenarios[randInt(0, scenarios.length - 1)];
  const divisor = sc.divisors[randInt(0, sc.divisors.length - 1)];

  const boxA = randInt(10, 20);
  const boxB = randInt(10, 20);
  const answer = Math.floor((boxA + boxB) / divisor);

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
    row1True ? 'True' : 'False',
    row2True ? 'True' : 'False',
    'True'
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
    correct_answer,
    _params: {
      originalNumber: nStr,
      roundedTarget: TStr,
      row1Answer: row1True ? 'True' : 'False',
      row2Answer: row2True ? 'True' : 'False',
    },
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
  const correct = rem === 0 ? String(whole) : `${whole} ${rem}/${denom}`;

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
    question_text: sc.text(N, numer, denom) + '\n\nEnter your answer as a whole number, fraction, or mixed number.',
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
  // viewBox "0 0 564 122" (470×102 scaled 1.2×), slot centers spaced ~113px apart
  // All shapes share a common baseline at y=103 so they appear to sit on a table.
  const A_CX     = [56, 169, 282, 395, 508];
  const BASELINE = 103;

  function pentagon(cx) {
    const r = 46;
    const cy = BASELINE - r * Math.sin(54 * Math.PI / 180);
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      pts.push([+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]);
    }
    return { shape: 'polygon', points: pts };
  }

  function parallelogram(cx) {
    const w = 64, h = 60, skew = randInt(18, 22);
    return {
      shape: 'polygon',
      points: [
        [cx - w/2,        BASELINE],
        [cx + w/2,        BASELINE],
        [cx + w/2 + skew, BASELINE - h],
        [cx - w/2 + skew, BASELINE - h]
      ]
    };
  }

  function obtuseTriSticker(cx) {
    const base = 72, h = 62, overshift = randInt(12, 17);
    return {
      shape: 'polygon',
      points: [
        [cx - base/2,             BASELINE],
        [cx + base/2,             BASELINE],
        [cx - base/2 - overshift, BASELINE - h]
      ]
    };
  }

  function stickerRect(cx) {
    const w = randInt(86, 100), h = randInt(60, 72);
    return { shape: 'rect', x: +(cx - w/2).toFixed(1), y: BASELINE - h, w, h };
  }

  function equilateralTriSticker(cx) {
    const r = 46;
    const cy = BASELINE - r * 0.5;
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * 120 - 90) * Math.PI / 180;
      pts.push([+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]);
    }
    return { shape: 'polygon', points: pts };
  }

  function rightTriSticker(cx) {
    const base = 84, h = 70;
    return {
      shape: 'polygon',
      points: [
        [+(cx - base/2).toFixed(1), BASELINE],
        [+(cx + base/2).toFixed(1), BASELINE],
        [+(cx - base/2).toFixed(1), +(BASELINE - h).toFixed(1)]
      ]
    };
  }

  // Regular hexagon — flat top/bottom, all interior angles 120° (no acute angles)
  function hexagon(cx) {
    const r = 40;
    const cy = BASELINE - r * Math.sqrt(3) / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 60 * Math.PI / 180;
      pts.push([+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]);
    }
    return { shape: 'polygon', points: pts };
  }

  // Variant: 'obtuse' → identify shapes with obtuse angles; 'acute' → identify shapes with acute angles
  const partAVariant = Math.random() < 0.5 ? 'obtuse' : 'acute';

  let correctBuilders, distractorBuilders, partAText;
  if (partAVariant === 'obtuse') {
    correctBuilders   = shuffle([pentagon, parallelogram, obtuseTriSticker]).slice(0, 2);
    distractorBuilders = shuffle([stickerRect, equilateralTriSticker, rightTriSticker]);
    partAText = 'The first set has five stickers, as shown.\n\nSelect <strong>two</strong> stickers in this set that appear to have at least one obtuse angle.';
  } else {
    // acute: equilateral (all 60°), right tri (two acute), parallelogram (two acute)
    // distractors: rect (all right), pentagon (all 108°), hexagon (all 120°)
    correctBuilders   = shuffle([equilateralTriSticker, rightTriSticker, parallelogram]).slice(0, 2);
    distractorBuilders = shuffle([stickerRect, pentagon, hexagon]);
    partAText = 'The first set has five stickers, as shown.\n\nSelect <strong>two</strong> stickers in this set that appear to have at least one acute angle.';
  }

  const positions   = shuffle([0, 1, 2, 3, 4]);
  const correctPos   = positions.slice(0, 2).sort((a, b) => a - b);
  const distractorPos = positions.slice(2).sort((a, b) => a - b);

  // Build shapes
  const shapeData = Array.from({ length: 5 }, (_, i) => {
    const cx = A_CX[i];
    const isCorrect = correctPos.includes(i);
    const idx = isCorrect ? correctPos.indexOf(i) : distractorPos.indexOf(i);
    const geo = isCorrect ? correctBuilders[idx](cx) : distractorBuilders[idx](cx);
    return { slotIdx: i, geo, area: geoArea(geo) };
  });

  // Assign labels by shape type so wide labels never land on narrow triangles:
  //   rect            → "Awesome\nTeamwork!" (widest label, wide interior)
  //   pentagon/quad   → medium 2-line labels (~38px per line, fit in ≥50px interior)
  //   triangles       → short labels (fit in ~48px equilateral interior)
  const medPool   = shuffle(['Great\nJob!', 'Way to\nGo!', 'Keep\nIt Up!', 'Congrats!']);
  const shortPool = shuffle(['A+', 'Yay!', 'Go!']);
  let mi = 0, si = 0;
  shapeData.forEach(entry => {
    const g = entry.geo;
    if (g.shape === 'rect') {
      entry.label = 'Awesome\nTeamwork!';
    } else if (g.points.length === 3) {
      entry.label = shortPool[si++] ?? 'OK!';
    } else {
      entry.label = medPool[mi++] ?? 'Nice!';
    }
  });

  const stickers = shapeData
    .sort((a, b) => a.slotIdx - b.slotIdx)
    .map(e => ({ id: String(e.slotIdx + 1), ...e.geo, label: e.label }));

  // Correct answer = sorted 1-indexed sticker IDs (matches StickerSet value export)
  const correctA = correctPos.map(i => String(i + 1)).sort().join(',');

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

  const correctB = `${TRI_LABELS[rightSlot]},one right angle`;

  return {
    question_number: '9',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: 'A teacher has two sets of stickers in different shapes to give to students.',
    parts: [
      {
        label: 'A',
        text: partAText,
        answer_type: 'hotspot',
        select_count: 2,
        stimulus_type: 'sticker_set',
        stimulus_params: { viewBox: '0 0 564 122', stickers }
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
    correct_answer: { A: correctA, B: correctB },
    _params: {
      A_correctStickers: correctA,
      A_targetAngle: partAVariant,
      B_correctTriangle: correctB.split(',')[0],
      B_angleReason: correctB.split(',')[1],
    },
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
//
// GOODS: each entry needs a matching icon registered in ItemArray.svelte's
// svgMap (key = `item`, value = path under static/). cookie/donut are
// Twemoji (CC-BY 4.0); cupcake is the original svgrepo asset. Add more
// entries here once new SVGs land in static/, keeping the `item` key in
// sync with the svgMap key.
const Q1_GOODS = [
  { item: 'cupcake', word: 'cupcakes' },
  { item: 'cookie', word: 'cookies' },
  { item: 'donut', word: 'donuts' },
];

function generate2023Q1() {
  const [maker, comparator] = shuffle(PEOPLE).slice(0, 2);
  const good = pick(Q1_GOODS);
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
    stimulus_intro: `${maker.name} made some ${good.word}, as shown.`,
    stimulus_type: 'item_array',
    stimulus_params: { rows, cols, item: good.item },
    question_text: `${maker.name} made ${multiplier} times as many ${good.word} as ${comparator.name} made. How many ${good.word} did ${comparator.name} make?`,
    answer_options: vals.map((o, i) => ({ letter: letters[i], text: String(o.v) })),
    correct_answer: correctLetter
  };
}

// 2023 Q3: MultipleChoice — which shape has {more than one / exactly one / zero} lines of symmetry?
// Shapes annotated with their symmetry line count so the generator self-documents.
// Question wording varies the target line count; the shape pool is filtered per-variant.
function generate2023Q3() {
  // family tag prevents visually similar correct/wrong pairs (e.g. equilateral + isosceles)
  const ALL_SHAPES = [
    { shape: { type: 'circle',   r: 55 },                                             lines: Infinity, family: 'round' },
    { shape: { type: 'square',   size: 100 },                                         lines: 4,        family: 'quad'  },
    { shape: { type: 'triangle', kind: 'equilateral', size: 100 },                    lines: 3,        family: 'tri'   },
    { shape: { type: 'rect',     width: 130, height: 78 },                            lines: 2,        family: 'quad'  },
    { shape: { type: 'star',     points: 4, outer_r: 60, inner_r: 25 },              lines: 4,        family: 'star'  },
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

  const QUESTION_TYPES = [
    {
      text: 'Which of the following shapes has <strong>more than</strong> one line of symmetry?',
      correctFilter: s => s.lines > 1,
      wrongFilter: s => s.lines <= 1,
    },
    {
      text: 'Which of the following shapes has <strong>exactly one</strong> line of symmetry?',
      correctFilter: s => s.lines === 1,
      wrongFilter: s => s.lines !== 1,
    },
    {
      text: 'Which of the following shapes has <strong>no</strong> lines of symmetry?',
      correctFilter: s => s.lines === 0,
      wrongFilter: s => s.lines !== 0,
    },
  ];

  const qType = pick(QUESTION_TYPES);
  const correctPool = ALL_SHAPES.filter(qType.correctFilter);
  const wrongPool = ALL_SHAPES.filter(qType.wrongFilter);

  const chosen = pick(correctPool);
  const correctFamily = chosen.family;

  // "{{symmetryLineCount}} line(s)" leaked the literal "(s)" to students since
  // flat templates can't branch on count — describe the count as one
  // pre-pluralized phrase instead so the template just drops it in whole.
  const describeLineCount = (n) => {
    if (!Number.isFinite(n)) return 'infinitely many lines';
    if (n === 0) return 'no lines';
    if (n === 1) return '1 line';
    return `${n} lines`;
  };

  // Prefer distractors from different families; fall back to any remaining if needed
  const eligible = wrongPool.filter(w => w.family !== correctFamily);
  const fallback = wrongPool.filter(w => w.family === correctFamily);
  const pool = eligible.length >= 3
    ? eligible
    : [...eligible, ...shuffle(fallback)];
  const distractors = shuffle(pool).slice(0, 3);
  const opts = shuffle([chosen, ...distractors]);

  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[opts.indexOf(chosen)];

  return {
    question_number: '3',
    answer_type: 'multiple_choice',
    question_text: qType.text,
    answer_options: opts.map((o, i) => ({ letter: letters[i], shape: o.shape })),
    correct_answer: correctLetter,
    _params: {
      correctLetter,
      correctShapeType: chosen.shape.type,
      symmetryLineCount: Number.isFinite(chosen.lines) ? String(chosen.lines) : 'infinite',
      symmetryLineDesc: describeLineCount(chosen.lines),
    },
  };
}

// 2023 Q5: ShortAnswer + SymmetryFigure stimulus — count acute/obtuse/right angles in a
// scalene triangle.
//
// Pedagogy: A scalene triangle always has exactly 3 angles; the generator varies WHICH
// angle (if any) is obtuse or right, and also varies WHICH angle type the question asks
// about. This keeps the question non-trivial — students must visually inspect the
// triangle rather than recalling a rule.
//
// Triangle families:
//   "obtuse-left"   → obtuse angle at lower-left:  1 obtuse, 2 acute, 0 right
//   "obtuse-right"  → obtuse angle at lower-right: 1 obtuse, 2 acute, 0 right
//   "obtuse-top"    → obtuse angle at apex:        1 obtuse, 2 acute, 0 right
//   "all-acute"     → acute scalene:               0 obtuse, 3 acute, 0 right
//   "all-acute-2"   → acute scalene (variant):     0 obtuse, 3 acute, 0 right
//   "right-left"    → right angle at lower-left:   0 obtuse, 2 acute, 1 right
//   "right-right"   → right angle at lower-right:  0 obtuse, 2 acute, 1 right
//
// Vertices are given as [x, y] offsets from center so SymmetryFigure centers them
// correctly. Width ~180px, height ~104px to match the original item proportions.
function generate2023Q5() {
  // Each entry: vertices (centered at 0,0) + acute/obtuse/right angle counts
  const triangles = [
    // Obtuse at lower-left — matches original item
    { vertices: [[ 55, -52], [-90,  52], [ 90,  52]], acute: 2, obtuse: 1, right: 0, label: 'obtuse-left'  },
    // Obtuse at lower-right
    { vertices: [[-55, -52], [-90,  52], [ 90,  52]], acute: 2, obtuse: 1, right: 0, label: 'obtuse-right' },
    // Obtuse at apex (wide flat triangle)
    { vertices: [[  0, -30], [-95,  55], [ 95,  55]], acute: 2, obtuse: 1, right: 0, label: 'obtuse-top'   },
    // Acute scalene — all three angles are acute
    { vertices: [[ 20, -55], [-75,  45], [ 80,  45]], acute: 3, obtuse: 0, right: 0, label: 'all-acute'    },
    // Another acute scalene — slightly different proportions
    { vertices: [[-10, -58], [-80,  48], [ 70,  48]], acute: 3, obtuse: 0, right: 0, label: 'all-acute-2'  },
    // Right angle at lower-left (legs horizontal/vertical, hypotenuse slanted)
    { vertices: [[-90,  52], [ 90,  52], [-90, -48]], acute: 2, obtuse: 0, right: 1, label: 'right-left'   },
    // Right angle at lower-right
    { vertices: [[-90,  52], [ 90,  52], [ 90, -48]], acute: 2, obtuse: 0, right: 1, label: 'right-right'  },
  ];

  const QUESTION_TYPES = [
    { key: 'acute',  text: 'What is the total number of acute angles the triangle appears to have?' },
    { key: 'obtuse', text: 'What is the total number of obtuse angles the triangle appears to have?' },
    { key: 'right',  text: 'What is the total number of right angles the triangle appears to have?' },
  ];

  const t = pick(triangles);
  const qType = pick(QUESTION_TYPES);
  const answer = t[qType.key];

  return {
    item_id: 'MA002128911',
    question_number: '5',
    answer_type: 'short_answer',
    stimulus_intro: 'A triangle is shown.',
    stimulus_type: 'symmetry_figure',
    stimulus_params: {
      shape: { type: 'polygon', vertices: t.vertices },
      padding: 16
    },
    question_text: qType.text,
    math_expression: null,
    input_widget: 'text',
    answer_options: null,
    parts: null,
    select_count: null,
    // The question asks about acute, obtuse, OR right angles (qType varies) —
    // without exposing which, the template can only hardcode one and is
    // simply wrong 2/3 of the time (caught live: hint talked about right
    // angles for a question asking about acute angles).
    _params: { angleTypePlural: `${qType.key} angles` },
    has_visual: true,
    visual_description: `A scalene triangle (${t.label}). Correct answer: ${answer} ${qType.key} angle(s).`,
    correct_answer: String(answer)
  };
}

// 2023 Q6: NumberLinePlot — plot a hundredths fraction on a 0–1 number line
// Standard 4.NF.C.6: Use decimal notation for fractions with denominators 10 or 100.
function generate2023Q6() {
  // Pick a value not on a tenths boundary so the student must place between tick marks
  const tenths = randInt(1, 8);
  const hundredths = randInt(1, 9);
  const num = tenths * 10 + hundredths;
  const value = (num / 100).toFixed(2);

  return {
    question_number: '6',
    answer_type: 'number_line_plot',
    stimulus_params: { min: 0, max: 1, small_intervals: 10 },
    question_text: `Plot the point that represents the location of [${num}/100] on this number line.`,
    correct_answer: value
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
    correct_answer: correctLetter,
    // No _params previously — the model had no way to know which of the 6
    // scenarios (name/activity pairing) was actually picked, and hardcoded
    // one regardless (caught live: a "math problems" question whose
    // feedback talked about push-ups throughout).
    _params: {
      name,
      pronoun,
      activity,
      step: String(step),
      start: String(start),
      target: String(target)
    }
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

// 2025 Q20: TrueFalseTable — identify whether 3-digit × 1-digit equations are true or false
// Column header: "Equation". Exactly 3 equations; at least one true, at least one false.
//
// Distractor design for false equations:
//   "carry-skip" error — student multiplies digit-by-digit left-to-right without carrying;
//     e.g. 257 × 5: student gets 2×5=10, 5×5=25, 7×5=35 → writes 10_25_35 → 1,025+35 → misplaces
//     More concretely: student adds partial products without regrouping, giving a result that is
//     too low (missing a carry into the hundreds or thousands column).
//   "off-by-one-carry" error — student carries one too few, giving a result close but wrong.
//
// Each generated variant has exactly 3 rows.  We pick 1 or 2 false rows (at least 1 true).
// Rows are NOT shuffled so that the correct_answer encoding is deterministic.
function generate2025Q20() {
  // Pool of (multiplicand, multiplier) pairs that yield 3-digit × 1-digit with a 4-digit product.
  // Kept simple (grade 4 appropriate): multiplier 5–9, multiplicand 200–800.
  const truePool = [
    // [a, b, a*b]  — all verified correct
    [257, 5, 1285], [384, 9, 3456], [601, 7, 4207],
    [312, 6, 1872], [423, 8, 3384], [531, 7, 3717],
    [245, 9, 2205], [467, 6, 2802], [382, 5, 1910],
    [614, 8, 4912], [293, 7, 2051], [478, 9, 4302],
    [356, 6, 2136], [542, 7, 3794], [263, 8, 2104],
    [421, 9, 3789], [317, 5, 1585], [483, 6, 2898],
  ];

  // Pick 3 distinct pairs from the pool
  const poolCopy = shuffle([...truePool]);
  const chosen = poolCopy.slice(0, 3);

  // Decide how many false equations: 1 or 2 (never 0 or 3 — must mix)
  const falseCount = randInt(1, 2);
  // Pick which row indices will be false
  const allIdx = [0, 1, 2];
  const shuffledIdx = shuffle(allIdx);
  const falseIdx = new Set(shuffledIdx.slice(0, falseCount));

  // For false rows, generate a plausible wrong answer using the "carry-skip" error:
  // Multiply each digit of the multiplicand by the multiplier separately, sum without full carrying.
  // This produces a result that is consistently too small by exactly the missing carry amounts.
  function carrySkipError(a, b) {
    const hundreds = Math.floor(a / 100);
    const tens     = Math.floor((a % 100) / 10);
    const ones     = a % 10;
    // Student computes each digit's product independently and concatenates/adds naively:
    // hundreds*b gives partial thousands, but student drops the carry from tens*b into hundreds.
    const partH = hundreds * b;          // e.g. 2*5=10
    const partT = tens * b;              // e.g. 5*5=25
    const partO = ones * b;              // e.g. 7*5=35
    // Naive concatenation: treats each part as occupying its "slot" without full regrouping
    // hundreds partial → thousands place (×100 but student treats as ×100 not full regroup)
    // Actual student mistake: 200*5 + 50*5 + 7*5 = 1000+250+35 = correct... so we need
    // a different error model.  Use "digit-multiply-no-regroup": student multiplies each
    // digit of 'a' by b but forgets to add the carry from the previous (ones→tens) step:
    //   ones*b: write ones-digit, carry = floor
    //   tens*b + NO carry from ones: just tens*b
    //   hundreds*b + NO carry from tens: just hundreds*b
    const carryFromOnes = Math.floor((ones * b) / 10);
    const carryFromTens = Math.floor((tens * b) / 10);
    // Correct result
    const correct = a * b;
    // Error: omit the carry from ones into tens column → loses carryFromOnes * 10
    //        omit the carry from tens into hundreds column → loses carryFromTens * 100
    const wrong = correct - carryFromOnes * 10 - carryFromTens * 100;
    // Sanity: wrong must differ from correct and be positive
    if (wrong === correct || wrong <= 0) {
      // Fallback: just subtract a round number that keeps it plausible
      return correct - 50;
    }
    return wrong;
  }

  const statements = chosen.map(([a, b, correct], i) => {
    if (falseIdx.has(i)) {
      const wrong = carrySkipError(a, b);
      return { text: `${a} \u00d7 ${b} = ${wrong.toLocaleString('en-US')}` };
    }
    return { text: `${a} \u00d7 ${b} = ${correct.toLocaleString('en-US')}` };
  });

  const correctAnswer = chosen.map((_, i) => falseIdx.has(i) ? 'False' : 'True').join(',');

  return {
    question_number: '20',
    answer_type: 'true_false_table',
    column_label: 'Equation',
    question_text: 'Identify whether or not each equation in the table is true.\n\nSelect \u201cTrue\u201d or \u201cFalse\u201d for each equation.',
    statements,
    correct_answer: correctAnswer
  };
}

// 2023 Q8: MultipleChoice + DotPlot — read a dot plot with quarter-hour values,
// find the total time for the N puzzles that took the most time.
function generate2023Q8() {
  // ── Scenario pool ──────────────────────────────────────────────────────
  const SCENARIOS = [
    {
      unit: 'hours',
      unitSingular: 'hour',
      activity: 'puzzles',
      activitySingular: 'puzzle',
      title: 'Completed Puzzles',
      axis_label: 'Time (hours)',
      intro: (n, unit) =>
        `This dot plot shows the amounts of time, in ${unit}, it took a student to complete ${n} different puzzles last week.`,
      q1: (k, unit) =>
        `The ${k === 3 ? 'three' : k === 2 ? 'two' : 'four'} puzzles that took the greatest amount of time were completed by the student on Saturday.`,
      q2: (k, unit, unitS) =>
        `What was the total amount of time, in ${unit}, it took the student to complete the ${k === 3 ? 'three' : k === 2 ? 'two' : 'four'} puzzles on Saturday?`,
    },
    {
      unit: 'miles',
      unitSingular: 'mile',
      activity: 'runs',
      activitySingular: 'run',
      title: 'Morning Runs',
      axis_label: 'Distance (miles)',
      intro: (n, unit) =>
        `This dot plot shows the distances, in ${unit}, a student ran on ${n} different mornings last week.`,
      q1: (k, unit) =>
        `The ${k === 3 ? 'three' : k === 2 ? 'two' : 'four'} longest runs were completed before breakfast.`,
      q2: (k, unit, unitS) =>
        `What was the total distance, in ${unit}, of the ${k === 3 ? 'three' : k === 2 ? 'two' : 'four'} longest runs?`,
    },
    {
      unit: 'hours',
      unitSingular: 'hour',
      activity: 'books',
      activitySingular: 'book',
      title: 'Reading Log',
      axis_label: 'Time (hours)',
      intro: (n, unit) =>
        `This dot plot shows the amounts of time, in ${unit}, a student spent reading ${n} different books last month.`,
      q1: (k, unit) =>
        `The ${k === 3 ? 'three' : k === 2 ? 'two' : 'four'} books that took the most time to read were finished on the weekend.`,
      q2: (k, unit, unitS) =>
        `What was the total amount of time, in ${unit}, the student spent reading those ${k === 3 ? 'three' : k === 2 ? 'two' : 'four'} books?`,
    },
  ];

  const scenario = pick(SCENARIOS);

  // ── Data generation ────────────────────────────────────────────────────
  // Labels on the number line are always: 0, 1/4, 2/4, 3/4, 1
  // We assign dot counts to each non-zero bin.
  // Constraint: total N ∈ {8, 9, 10} puzzles, each non-zero bin has 1–5 dots.
  // We want exactly k = 3 puzzles at the "top" (combining the highest bins).
  // Top bins: bin index 3 (3/4) and bin index 4 (1).
  // We'll ensure counts[3] + counts[4] === 3 (always exactly 3 at top)
  // so the question "top 3" is unambiguous.

  // Decide how many dots at the very top two bins (sum = 3)
  const topSplit = pick([
    [2, 1],   // 2 at 3/4, 1 at 1
    [1, 2],   // 1 at 3/4, 2 at 1
    [3, 0],   // 3 at 3/4, 0 at 1 — kept for variety but rare in real items
  ].filter(([a, b]) => a + b === 3));

  const c3 = topSplit[0];   // count at 3/4
  const c4 = topSplit[1];   // count at 1

  // Lower bins (1/4 and 2/4): fill with 2–5 dots each
  const c1 = randInt(2, 4);  // count at 1/4
  const c2 = randInt(2, 5);  // count at 2/4

  const totalN = c1 + c2 + c3 + c4;  // 0-bin always 0

  // Fractions as numerators over 4 (denominator 4 throughout)
  // bin values: 0=0, 1=1/4, 2=2/4, 3=3/4, 4=4/4
  // correct answer: sum of top 3 in quarters
  const topValues = [];
  for (let j = 0; j < c3; j++) topValues.push(3);  // 3/4 each
  for (let j = 0; j < c4; j++) topValues.push(4);  // 4/4 = 1 each
  const correctNumerator = topValues.reduce((s, v) => s + v, 0);

  // Convert to mixed number string for display
  function toMixedStr(numerator, denom = 4) {
    const whole = Math.floor(numerator / denom);
    const rem   = numerator % denom;
    if (rem === 0) return `${whole}`;
    if (whole === 0) return `[${rem}/${denom}]`;
    // Simplify fraction: GCD
    function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
    const g = gcd(rem, denom);
    return `${whole}[${rem / g}/${denom / g}]`;
  }

  const correctStr = toMixedStr(correctNumerator);

  // ── Distractors ────────────────────────────────────────────────────────
  // B: student counts only the top 2 puzzles (skips one) — sum top 2 values
  const top2Values = [...topValues].sort((a, b) => b - a).slice(0, 2);
  const wrong2Num  = top2Values.reduce((s, v) => s + v, 0);
  const wrongBStr  = toMixedStr(wrong2Num);

  // C: student reads only the single highest-value puzzle instead of summing
  const maxVal    = Math.max(...topValues);
  const wrongCStr = toMixedStr(maxVal);

  // D: student confuses "greatest" with "smallest" and sums the 3 lowest values
  // Lowest 3 puzzles (from c1 at 1/4 and c2 at 2/4)
  const lowValues = [];
  for (let j = 0; j < c1; j++) lowValues.push(1);  // 1/4 each
  for (let j = 0; j < c2; j++) lowValues.push(2);  // 2/4 each
  const lowSorted  = [...lowValues].sort((a, b) => a - b).slice(0, 3);
  const wrongDNum  = lowSorted.reduce((s, v) => s + v, 0);
  const wrongDStr  = toMixedStr(wrongDNum);

  // Deduplicate: if any distractor equals correct or another distractor, adjust
  const usedStrs = new Set([correctStr]);
  function uniqueStr(s, fallback) {
    if (!usedStrs.has(s)) { usedStrs.add(s); return s; }
    return fallback;
  }
  const bStr = uniqueStr(wrongBStr, toMixedStr(correctNumerator - 1));
  const cStr = uniqueStr(wrongCStr, toMixedStr(maxVal - 1 > 0 ? maxVal - 1 : maxVal + 1));
  const dStr = uniqueStr(wrongDStr, toMixedStr(wrongDNum + 1));

  const rawOptions = shuffle([
    { val: correctStr, correct: true },
    { val: bStr,       correct: false },
    { val: cStr,       correct: false },
    { val: dStr,       correct: false },
  ]);

  const letters = ['A', 'B', 'C', 'D'];
  const answer_options = rawOptions.map((o, i) => ({
    letter: letters[i],
    text: o.val + (o.val.endsWith('hours') || o.val.endsWith('hour') ? '' :
      (Number(o.val) === 1 || (o.val.match(/^\[/) && !o.val.includes('[1/')) ? ` ${scenario.unitSingular}` : ` ${scenario.unit}`)),
  }));

  // Fix up unit suffixes — attach directly
  const optionsWithUnits = rawOptions.map((o, i) => {
    const n = correctNumerator;  // reference
    // Determine singular vs plural based on the numeric value
    // Parse the value string to get a number
    let numVal = 0;
    const mixedM = o.val.match(/^(\d+)\[(\d+)\/(\d+)\]$/);
    const fracM  = o.val.match(/^\[(\d+)\/(\d+)\]$/);
    const plainM = o.val.match(/^(\d+(?:\.\d+)?)$/);
    if (mixedM)  numVal = parseInt(mixedM[1]) + parseInt(mixedM[2]) / parseInt(mixedM[3]);
    else if (fracM)  numVal = parseInt(fracM[1]) / parseInt(fracM[2]);
    else if (plainM) numVal = parseFloat(plainM[1]);
    const unitLabel = numVal === 1 ? scenario.unitSingular : scenario.unit;
    return {
      letter: letters[i],
      text: `${o.val} ${unitLabel}`,
    };
  });

  const correctLetter = letters[rawOptions.findIndex(o => o.correct)];

  return {
    question_number: '8',
    answer_type: 'multiple_choice',
    stimulus_intro: scenario.intro(totalN, scenario.unit),
    stimulus_type: 'dot_plot',
    stimulus_params: {
      title: scenario.title,
      axis_label: scenario.axis_label,
      data_points: [
        { label: '0',     count: 0 },
        { label: '[1/4]', count: c1 },
        { label: '[2/4]', count: c2 },
        { label: '[3/4]', count: c3 },
        { label: '1',     count: c4 },
      ],
    },
    question_text:
      scenario.q1(3, scenario.unit) + '\n\n' +
      scenario.q2(3, scenario.unit, scenario.unitSingular),
    answer_options: optionsWithUnits,
    correct_answer: correctLetter,
  };
}

// 2023 Q13: MultiPart (3 parts) — chained multiplication distance problem
// Part A: daily miles × days/week → weekly total
// Part B: weekly total × weeks/year → annual total
// Part C: annual total × years → multi-year total
//
// Distractor design (for correct_answer encoding — these are constructed_response,
// so no MC options, but the generator tags the numeric answers so algo-check can
// display the chain):
//   Each part builds on the previous — a student error in Part A propagates through B and C.
//   Common errors:
//     - Part A: adds days + miles instead of multiplying (daysPerWeek + milesPerDay)
//     - Part B: uses daysPerWeek × weeksPerYear (skips miles, applies wrong multiplier)
//     - Part C: multiplies Part B answer by daysPerWeek instead of years
//
// Scenario pool: worker-commute scenarios with different subjects
function generate2023Q13() {
  const scenarios = [
    {
      subject: 'A doctor',
      pronoun: 'she',
      workplace: 'office',
      worksVerb: 'works in her office',
      driveContext: 'to and from her office',
    },
    {
      subject: 'A teacher',
      pronoun: 'she',
      workplace: 'school',
      worksVerb: 'works at her school',
      driveContext: 'to and from her school',
    },
    {
      subject: 'A nurse',
      pronoun: 'she',
      workplace: 'hospital',
      worksVerb: 'works at the hospital',
      driveContext: 'to and from the hospital',
    },
    {
      subject: 'A librarian',
      pronoun: 'he',
      workplace: 'library',
      worksVerb: 'works at the library',
      driveContext: 'to and from the library',
    },
    {
      subject: 'A firefighter',
      pronoun: 'he',
      workplace: 'fire station',
      worksVerb: 'works at the fire station',
      driveContext: 'to and from the fire station',
    },
  ];

  const sc = pick(scenarios);

  // Days per week: 4 or 5 (common real-world work schedules)
  const daysPerWeek = pick([4, 5]);

  // Miles per day: odd numbers 11–27 so multiply is non-trivial but grade-appropriate
  const milesOptions = [11, 13, 14, 16, 17, 19, 21, 22, 23, 24, 26, 27];
  const milesPerDay = pick(milesOptions);

  // Weeks per year: 40–50 in steps of 2 (plausible work-year lengths)
  const weeksOptions = [40, 42, 44, 45, 46, 48, 50];
  const weeksPerYear = pick(weeksOptions);

  // Years: 3–10 (multi-year span, grade-appropriate scale)
  const years = randInt(3, 10);

  // Correct chain
  const weeklyMiles  = daysPerWeek * milesPerDay;
  const annualMiles  = weeksPerYear * weeklyMiles;
  const totalMiles   = years * annualMiles;

  // Subject used at start of sentence in Part B/C (e.g. "The doctor", "The nurse")
  // sc.subject is already "A doctor" etc — replace "A" with "The" for mid-story references
  const theSubject = sc.subject.replace(/^A /, 'The ');

  return {
    question_number: '13',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text:
      `${sc.subject} ${sc.worksVerb} ${daysPerWeek} days each week. ` +
      `Each day ${sc.pronoun} works, ${sc.pronoun} drives a total of ${milesPerDay} miles ${sc.driveContext}.`,
    parts: [
      {
        label: 'A',
        question_text:
          `What is the total distance, in miles, ${theSubject.toLowerCase()} drives ${sc.driveContext} each week? ` +
          `Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: weeklyMiles,
      },
      {
        label: 'B',
        question_text:
          `${theSubject} worked ${weeksPerYear} weeks last year.\n\n` +
          `What is the total distance, in miles, ${sc.pronoun} drove ${sc.driveContext} last year? ` +
          `Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: annualMiles,
      },
      {
        label: 'C',
        question_text:
          `${theSubject} worked the same number of weeks each year for the last ${years} years.\n\n` +
          `What is the total distance, in miles, ${sc.pronoun} drove ${sc.driveContext} over the last ${years} years? ` +
          `Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: totalMiles,
      },
    ],
    correct_answer: {
      A: weeklyMiles,
      B: annualMiles,
      C: totalMiles,
    },
    // No _params previously — the model had no way to know which of the 5
    // scenarios (subject/pronoun/workplace) was actually picked, and
    // hardcoded one regardless (caught live: a librarian/"he" question whose
    // feedback referred to "she"/"her" and a hospital throughout).
    _params: {
      subject: theSubject.toLowerCase(),
      pronoun: sc.pronoun,
      workplace: sc.workplace,
      daysPerWeek: String(daysPerWeek),
      milesPerDay: String(milesPerDay),
      weeksPerYear: String(weeksPerYear),
      years: String(years)
    },
  };
}

// 2025 Q3: MultiPart (4 parts) — fraction addition and subtraction with a cafe dessert context
//
// Structure mirrors the real item:
//   • Left pane: a cafe sold pies ([pieN/8]), cakes ([cakeN/8]), and cookies (remainder).
//   • Part A (MC): pick the correct equation for total pies+cakes.
//       Distractors:
//         Wrong sum (pieN + cakeN as numerator, 16 as denominator — multiplies both ×2)
//         Wrong sum (pieN + cakeN as numerator, 16 as denominator — adds denom)
//         Wrong numerator (pieN + cakeN - 1 or +1) / 8 — arithmetic slip
//   • Part B (CR): fraction that were cookies = (8 - pieN - cakeN) / 8
//   • Part C (CR): Worker claims [workerA/workerAD] + [workerB/workerBD] = sold fraction.
//       The claim is FALSE; the correct sum is something different.
//       (Replicates the real item's structure: a fraction X/10 is asserted to equal the sum.)
//   • Part D (CR): Starting pies = big mixed number; remaining = smaller mixed number.
//       Sold = difference (requires fraction subtraction with possible borrowing).
//
// Distractor design for Part A:
//   (1) Sum numerators but double the denominator: (pieN+cakeN)/16
//       Misconception: student adds both numerator AND denominator (8+8=16)
//   (2) Double both numerator and denominator: (pieN+cakeN)*2 / 16
//       Misconception: student "converts to common denominator" by doubling everything
//   (3) Off-by-one numerator: (pieN+cakeN+1)/8 or (pieN+cakeN-1)/8
//       Misconception: arithmetic error when counting up
//
function generate2025Q3() {
  // ── Pie and cake fractions (both /8, cookies fill the rest) ──────────────────
  // pieN ∈ {3,4,5}, cakeN ∈ {1,2}, and pieN + cakeN < 8 so cookies > 0
  const configs = [
    { pieN: 3, cakeN: 1 },  // cookies = 4/8
    { pieN: 3, cakeN: 2 },  // cookies = 3/8
    { pieN: 4, cakeN: 1 },  // cookies = 3/8
    { pieN: 4, cakeN: 2 },  // cookies = 2/8
    { pieN: 5, cakeN: 1 },  // cookies = 2/8
    { pieN: 5, cakeN: 2 },  // cookies = 1/8
  ];
  const { pieN, cakeN } = pick(configs);
  const piesCakeSum = pieN + cakeN;          // correct numerator
  const cookiesN    = 8 - piesCakeSum;       // cookies numerator

  // ── Part A: MC options ───────────────────────────────────────────────────────
  const correctText = `[${pieN}/8] + [${cakeN}/8] = [${piesCakeSum}/8]`;

  // Distractor 1: adds denominators (8+8=16), keeps sum numerator → piesCakeSum/16
  const d1Text = `[${pieN}/8] + [${cakeN}/8] = [${piesCakeSum}/16]`;

  // Distractor 2: doubles both → (piesCakeSum*2)/16
  const d2Text = `[${pieN}/8] + [${cakeN}/8] = [${piesCakeSum * 2}/16]`;

  // Distractor 3: off-by-one numerator (+1 or -1, bounded to stay plausible 1–7)
  const slip = piesCakeSum < 7 ? piesCakeSum + 1 : piesCakeSum - 1;
  const d3Text = `[${pieN}/8] + [${cakeN}/8] = [${slip}/8]`;

  const rawOpts = shuffle([
    { text: correctText, correct: true  },
    { text: d1Text,      correct: false },
    { text: d2Text,      correct: false },
    { text: d3Text,      correct: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[rawOpts.findIndex(o => o.correct)];
  const answerOptions = rawOpts.map((o, i) => ({ letter: letters[i], text: o.text }));

  // ── Part C: worker's incorrect equation ──────────────────────────────────────
  // We pick a "sold in first N hours" fraction (with denom 10 or 12) and build a
  // plausible-looking but wrong sum of two unlike fractions that the worker claims
  // equals that fraction.
  //
  // Pattern matches the real item: X/D1 + Y/D2 = Z/D3 is asserted, but is wrong.
  // The common student misconception is adding numerators and denominators separately.
  //
  // We pick from a fixed pool of (A/AD + B/BD = C/CD) triples where A/AD + B/BD ≠ C/CD
  // but A+B = C and AD+BD = CD (misconception arithmetic). This makes Part C
  // pedagogically rich: students must verify by finding a common denominator.
  const partCPool = [
    // [workerA, workerAD, workerB, workerBD, claimedC, claimedCD, actualNum, actualDen]
    // 3/4 + 1/6 = 4/10? → 3/4+1/6 = 9/12+2/12 = 11/12. Misconception: 3+1=4, 4+6=10. (real item)
    { wA: 3, wAD: 4, wB: 1, wBD: 6,  clC: 4,  clCD: 10, actN: 11, actD: 12 },
    // 1/3 + 1/4 = 2/7? → 1/3+1/4 = 4/12+3/12 = 7/12. Misconception: 1+1=2, 3+4=7.
    { wA: 1, wAD: 3, wB: 1, wBD: 4,  clC: 2,  clCD: 7,  actN: 7,  actD: 12 },
    // 2/5 + 1/4 = 3/9? → 2/5+1/4 = 8/20+5/20 = 13/20. Misconception: 2+1=3, 5+4=9.
    { wA: 2, wAD: 5, wB: 1, wBD: 4,  clC: 3,  clCD: 9,  actN: 13, actD: 20 },
    // 1/2 + 1/5 = 2/7? → 1/2+1/5 = 5/10+2/10 = 7/10. Misconception: 1+1=2, 2+5=7.
    { wA: 1, wAD: 2, wB: 1, wBD: 5,  clC: 2,  clCD: 7,  actN: 7,  actD: 10 },
    // 3/8 + 1/6 = 4/14? → 3/8+1/6 = 9/24+4/24 = 13/24. Misconception: 3+1=4, 8+6=14.
    { wA: 3, wAD: 8, wB: 1, wBD: 6,  clC: 4,  clCD: 14, actN: 13, actD: 24 },
  ];
  const pc = pick(partCPool);

  // ── Part D: mixed number subtraction ─────────────────────────────────────────
  // Starting pies = whole + frac/8, remaining = smaller whole + smaller/8.
  // We want borrowing to sometimes be needed (when remaining frac > starting frac).
  // Sold = (startWhole - remWhole) + (startFrac - remFrac)/8, or with borrowing.
  const partDPool = [
    // [startW, startF, remW, remF] → sold = startW+startF/8 - remW-remF/8
    // borrowing needed when startF < remF
    { sW: 6, sF: 1, rW: 2, rF: 3, soldW: 3, soldF: 6 },  // 6 1/8 - 2 3/8: borrow → 3 6/8
    { sW: 7, sF: 2, rW: 3, rF: 5, soldW: 3, soldF: 5 },  // 7 2/8 - 3 5/8: borrow → 3 5/8
    { sW: 5, sF: 3, rW: 1, rF: 7, soldW: 3, soldF: 4 },  // 5 3/8 - 1 7/8: borrow → 3 4/8
    { sW: 8, sF: 1, rW: 4, rF: 6, soldW: 3, soldF: 3 },  // 8 1/8 - 4 6/8: borrow → 3 3/8
    // no borrowing needed
    { sW: 6, sF: 5, rW: 2, rF: 3, soldW: 4, soldF: 2 },  // 6 5/8 - 2 3/8 = 4 2/8
    { sW: 7, sF: 6, rW: 3, rF: 2, soldW: 4, soldF: 4 },  // 7 6/8 - 3 2/8 = 4 4/8
  ];
  const pd = pick(partDPool);

  return {
    question_number: '3',
    answer_type: 'multi_part',
    layout: null,
    question_text: 'A cafe owner recorded how many desserts were sold on Saturday.',
    stimulus_list: [
      `[${pieN}/8] of the desserts sold were pies.`,
      `[${cakeN}/8] of the desserts sold were cakes.`,
      'The remaining desserts sold were cookies.',
    ],
    parts: [
      {
        label: 'A',
        question_text:
          'Which equation can be used to find the <strong>total</strong> fraction of desserts sold that were either pies or cakes?',
        answer_type: 'multiple_choice',
        answer_options: answerOptions,
        correct_answer: correctLetter,
      },
      {
        label: 'B',
        question_text:
          `Of <strong>all</strong> the desserts sold on Saturday, what fraction were <strong>cookies</strong>? Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: `[${cookiesN}/8]`,
      },
      {
        label: 'C',
        question_text:
          `Of all the desserts sold on Saturday, [${pc.clC}/${pc.clCD}] of the desserts were sold in the first two hours.\n\n` +
          `A worker at the cafe created this equation to represent the fraction of all the desserts sold in the first two hours.\n\n` +
          `Is the worker's equation correct?`,
        math_expression: `[${pc.wA}/${pc.wAD}] + [${pc.wB}/${pc.wBD}] = [${pc.clC}/${pc.clCD}]`,
        answer_type: 'yes_no_explanation',
        // The claimed sum is always wrong by construction (partCPool), so "No" every time
        correct_answer: 'no',
      },
      {
        label: 'D',
        question_text:
          `At the beginning of the day on Saturday, the cafe had ${pd.sW}[${pd.sF}/8] pies to sell. At the end of the day, the cafe had ${pd.rW}[${pd.rF}/8] pies remaining.\n\n` +
          `What is the total amount of pie the cafe sold on Saturday? Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: `${pd.soldW}[${pd.soldF}/8]`,
      },
    ],
    correct_answer: {
      A: correctLetter,
      B: `[${cookiesN}/8]`,
      C: 'no',
      D: `${pd.soldW}[${pd.soldF}/8]`,
    },
  };
}

// 2025 Q14: MultiPart (4 parts) — graduated cylinder reading + metric conversions
//
// Structure mirrors the real item:
//   Part A: FillInBlank — read a graduated cylinder (liters), short_answer
//   Part B: CR — convert liters used to milliliters (×1000)
//   Part C: CR — convert hours+minutes to total minutes (×60 + extra)
//   Part D: CR — find a gram mass between two quantities given in mixed metric units
//
// Distractors for Part A are not applicable (it's fill-in), but the generator
// varies the liquid level and scale so students can't memorize "8".
// Parts B–D are constructed_response; only numeric targets are tagged for algo-check.
//
// Scenario pool: the same context (gardener) with varied numbers for each run.
function generate2025Q14() {
  // ── Part A: graduated cylinder ──────────────────────────────────────────────
  // Scale is always 0–maxL liters, ticks every tickInterval.
  // Liquid level is a whole-number multiple of tickInterval/5 — keeps it readable.

  const cylinderConfigs = [
    { max: 20, interval: 5, values: [8, 12, 6, 14] },
    { max: 10, interval: 2, values: [4,  6,  3,  8] },
    { max: 25, interval: 5, values: [5, 10, 15, 20] },
    { max: 30, interval: 5, values: [8, 12, 18, 22] },
  ];
  const cfg = pick(cylinderConfigs);
  const cylinderValue = pick(cfg.values);

  // ── Part B: liters used → milliliters ────────────────────────────────────────
  // Student reads cylinder (cylinderValue L remaining). Gardener used some amount.
  // We tell them how many liters were used; they convert to mL (×1000).
  const litersUsedOptions = [1, 2, 3, 4, 5].filter(v => v < cylinderValue);
  const litersUsed = pick(litersUsedOptions.length > 0 ? litersUsedOptions : [1, 2]);
  const mLAnswer = litersUsed * 1000;

  // ── Part C: hours + minutes → total minutes ───────────────────────────────────
  // Common Grade 4 examples: 1h 15m, 1h 30m, 1h 45m, 2h 20m, 2h 45m, 3h 45m
  const timeOptions = [
    { hours: 1, minutes: 15,  total: 75  },
    { hours: 1, minutes: 30,  total: 90  },
    { hours: 1, minutes: 45,  total: 105 },
    { hours: 2, minutes: 20,  total: 140 },
    { hours: 2, minutes: 45,  total: 165 },
    { hours: 3, minutes: 15,  total: 195 },
    { hours: 3, minutes: 45,  total: 225 },
  ];
  const timeChoice = pick(timeOptions);

  // ── Part D: find a gram value between two masses given in different units ─────
  // High mass in kg (whole number), low mass in g (just below kg×1000).
  // Student must identify any valid gram value in (lowG, highKg*1000).
  const massKgOptions = [5, 6, 7, 8, 9, 10];
  const massKg = pick(massKgOptions);
  // Low mass in grams: some value between (massKg-1)*1000 and massKg*1000-1
  const lowGramBase = (massKg - 1) * 1000;
  const lowGramOffset = pick([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  const lowGrams = lowGramBase + lowGramOffset;

  const bagColors = shuffle(['black', 'green', 'white']);
  const [highBag, lowBag, targetBag] = bagColors;

  return {
    question_number: '14',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: 'A gardener cut grass with a lawnmower and then raked and bagged leaves.',
    parts: [
      {
        label: 'A',
        question_text:
          `Before cutting the grass, the gardener added fuel to the lawnmower from a container. ` +
          `This picture shows the amount of fuel, in liters, <strong>remaining</strong> in the container after adding fuel to the lawnmower.`,
        stimulus_type: 'graduated_cylinder',
        stimulus_params: {
          min: 0,
          max: cfg.max,
          interval: cfg.interval,
          value: cylinderValue,
          unit: 'liters'
        },
        answer_type: 'short_answer',
        answer_suffix: 'liters',
        correct_answer: String(cylinderValue)
      },
      {
        label: 'B',
        question_text:
          `The gardener used ${litersUsed} ${litersUsed === 1 ? 'liter' : 'liters'} of fuel to cut the grass.\n\n` +
          `What is the total amount of fuel, in <strong>milliliters</strong>, the gardener used to cut the grass? ` +
          `Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: String(mLAnswer)
      },
      {
        label: 'C',
        question_text:
          `It took the gardener ${timeChoice.hours} ${timeChoice.hours === 1 ? 'hour' : 'hours'} and ${timeChoice.minutes} minutes to rake the leaves.\n\n` +
          `What is the total amount of time, in <strong>minutes</strong>, it took the gardener to rake the leaves? ` +
          `Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        correct_answer: String(timeChoice.total)
      },
      {
        label: 'D',
        question_text:
          `The gardener placed the leaves into three large plastic bags: ` +
          `a ${bagColors[0]} bag, a ${bagColors[1]} bag, and a ${bagColors[2]} bag.\n\n` +
          `<ul>` +
          `<li>The mass of the ${highBag} bag was ${massKg} kilograms.</li>` +
          `<li>The mass of the ${lowBag} bag was ${lowGrams.toLocaleString()} grams.</li>` +
          `<li>The mass of the ${targetBag} bag was <strong>less than</strong> the mass of the ${highBag} bag but <strong>more than</strong> the mass of the ${lowBag} bag.</li>` +
          `</ul>\n\n` +
          `What could be the mass, in <strong>grams</strong>, of the <strong>${targetBag}</strong> bag? ` +
          `Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        // Any value strictly between lowGrams and massKg*1000
        correct_answer: `>${lowGrams},<${massKg * 1000}`
      }
    ],
    correct_answer: {
      A: String(cylinderValue),
      B: String(mLAnswer),
      C: String(timeChoice.total),
      D: `>${lowGrams},<${massKg * 1000}`,
    },
    // Part D's correct_answer is raw range notation (">4700,<5000") — the
    // generic multi_part rule exposes that literally as D_correctValue,
    // which reads like answer-key shorthand, not a sentence a 4th grader can
    // parse. These give the reveal clean, prose-ready boundary numbers instead.
    _params: {
      D_lowGrams: lowGrams.toLocaleString(),
      D_highGrams: (massKg * 1000).toLocaleString()
    }
  };
}

// ─── 2023 Q18: MultiPart — multiplication comparison (short_answer + inline_choice) ───
//
// Part A: "The teacher says that A is F times as many as B. Write a multiplication equation."
//   Correct: A = F × B  (or F × B = A)
//
// Part B: show equation P = Q × R, ask student to fill in:
//   "The number [BLANK1] is Q times as many as the number [BLANK2]."
//   Correct: BLANK1 = P, BLANK2 = R
//   Distractor pool for each dropdown: {P, Q, R}
//
// Constraints:
//   - F ∈ {3,4,5,6,7,8}, B ∈ {2,3,4,5,6,7,8,9}, A = F×B ≤ 81
//   - Part B equation uses different factor (factorB) and different base (baseB)
//   - Product ≤ 81, all three values distinct so dropdowns are non-trivial
function generate2023Q18() {
  // Part A: pick factor and small base
  const FACTORS_A = [3, 4, 5, 6, 7, 8];
  const factorA = pick(FACTORS_A);
  // base small enough so product ≤ 81
  const maxBase = Math.floor(81 / factorA);
  const baseA = randInt(2, Math.min(9, maxBase));
  const productA = factorA * baseA;

  // Part B: pick a different factor and base, keep values distinct
  let factorB, baseB, productB;
  let attempts = 0;
  do {
    factorB = pick([3, 4, 5, 6, 7, 8].filter(f => f !== factorA));
    const maxB = Math.floor(81 / factorB);
    baseB = randInt(2, Math.min(9, maxB));
    productB = factorB * baseB;
    attempts++;
  } while (
    attempts < 50 &&
    (productB === factorB || productB === baseB || factorB === baseB ||
     productB === productA)
  );

  // Build distractor pool for Part B dropdowns: {productB, factorB, baseB}
  // (these are the three values in the equation; student picks product and base)
  const opts = [String(productB), String(factorB), String(baseB)];

  return {
    item_id: 'MA704653374',
    question_number: '18',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    question_text: 'A teacher is using multiplication to compare numbers.',
    math_expression: null,
    answer_type: 'multi_part',
    layout: 'stacked',
    answer_options: null,
    parts: [
      {
        label: 'A',
        question_text:
          `The teacher says that ${productA} is ${factorA} times as many as ${baseA}.\n\n` +
          `Write a multiplication equation to show the teacher\u2019s comparison.\n\n` +
          `Enter your equation in the space provided. Enter <strong>only</strong> your equation. ` +
          `Click <strong>Save</strong> after entering your answer.`,
        answer_type: 'short_answer',
        input_widget: 'math',
        correct_answer: `${factorA} \u00d7 ${baseA} = ${productA}`
      },
      {
        label: 'B',
        question_text: 'The teacher uses a comparison to describe this equation.',
        math_expression: `${productB} = ${factorB} \u00d7 ${baseB}`,
        answer_type: 'inline_choice',
        instruction: 'Select from the drop-down menus to correctly complete the teacher\u2019s comparison.',
        sentences: [
          `The number [RESPONSE_B1] is ${factorB} times as many as the number [RESPONSE_B2].`
        ],
        dropdowns: [
          { id: 'RESPONSE_B1', options: opts },
          { id: 'RESPONSE_B2', options: opts }
        ],
        // MultiPart's own inline_choice renderer (used for parts nested inside a
        // multi_part question) joins selections with commas, not pipes \u2014 that's a
        // separate implementation from the standalone InlineChoice.svelte component.
        correct_answer: `${productB},${baseB}`
      }
    ],
    select_count: null,
    has_visual: false,
    visual_description: null,
    correct_answer: {
      A: `${factorA} \u00d7 ${baseA} = ${productA}`,
      B: `${productB},${baseB}`,
    }
  };
}

// 2025 Q13: ShortAnswer + DecimalGrid stimulus — write a decimal less than the model
//
// The model is a 10×10 grid with `shaded` cells filled, representing shaded/100.
// A companion fully-shaded grid labeled "represents 1 whole" appears beside it.
// The student must enter any decimal strictly less than the represented value.
//
// Pedagogy: vary the number of shaded cells across tenths-boundary and hundredths-only
// values so students practise reading two-place decimals from area models.
function generate2025Q13() {
  // Candidate shaded counts: interesting values spanning tenths and hundredths
  // Avoid 0 and 100; prefer values students might confuse (e.g. 30 = 0.30 vs 0.3)
  const candidates = [
    { shaded: 7,  decimal: '0.07' },
    { shaded: 9,  decimal: '0.09' },
    { shaded: 13, decimal: '0.13' },
    { shaded: 20, decimal: '0.20' },
    { shaded: 25, decimal: '0.25' },
    { shaded: 34, decimal: '0.34' },
    { shaded: 40, decimal: '0.40' },
    { shaded: 47, decimal: '0.47' },
    { shaded: 50, decimal: '0.50' },
    { shaded: 58, decimal: '0.58' },
    { shaded: 63, decimal: '0.63' },
    { shaded: 71, decimal: '0.71' },
    { shaded: 75, decimal: '0.75' },
    { shaded: 80, decimal: '0.80' },
    { shaded: 86, decimal: '0.86' },
    { shaded: 90, decimal: '0.90' },
    { shaded: 95, decimal: '0.95' },
  ];

  const chosen = pick(candidates);

  return {
    question_number: '13',
    answer_type: 'short_answer',
    input_widget: 'text',
    stimulus_intro: 'The shaded part of this model represents a decimal number that is less than 1.',
    stimulus_type: 'decimal_grid',
    stimulus_params: {
      shaded: chosen.shaded,
      show_whole: true
    },
    question_text: `Write a decimal number that is <strong>less than</strong> the decimal number represented in the model.`,
    correct_answer: `<${chosen.decimal}`
  };
}

// ─── 2023 Q7: MultipleChoice — which quadrilateral has perpendicular sides? ──
//
// The question shows four shapes; exactly one is a quadrilateral with perpendicular
// (right-angle) sides. The generator builds a pool of correct shapes (rectangles,
// squares) and wrong shapes targeting three distinct misconceptions:
//
//   (a) "It looks like a rectangle" — parallelogram: 4 sides but NO right angles.
//       Students mistake the equal-length sides for right angles.
//   (b) "It has right angles" but wrong side count — pentagon/house: clearly has
//       right angles in the base corners but has 5 sides, not 4.
//   (c) "I know that word" — kite / rhombus: quadrilateral, but sides are not
//       perpendicular (diagonals are, which students confuse with sides).
//
// Correct pool: rect, square, right-angle variants
// Wrong pool:   parallelogram, pentagon, kite, rhombus, non-right trapezoid
function generate2023Q7() {
  const correct = [
    // Rectangle — the canonical answer: 4 sides, all corners right angles
    { shape: { type: 'rect', width: 110, height: 90 },    label: 'rectangle' },
    // Wider rectangle
    { shape: { type: 'rect', width: 130, height: 75 },    label: 'rectangle-wide' },
    // Tall rectangle
    { shape: { type: 'rect', width: 80,  height: 110 },   label: 'rectangle-tall' },
    // Square — also has perpendicular sides
    { shape: { type: 'square', size: 96 },                 label: 'square' },
  ];

  const wrong = [
    // (a) Parallelogram — 4 sides, NO right angles; classic "looks like rectangle" trap
    { shape: { type: 'polygon', vertices: [[-65, 38], [55, 38], [85, -38], [-35, -38]] }, label: 'parallelogram' },
    // (a) Leaner parallelogram variant
    { shape: { type: 'polygon', vertices: [[-55, 35], [65, 35], [85, -35], [-35, -35]] }, label: 'parallelogram-lean' },
    // (b) Pentagon / house — has right angles at base but 5 sides (not a quadrilateral)
    { shape: { type: 'polygon', vertices: [[-55, 72], [55, 72], [55, -20], [0, -72], [-55, -20]] }, label: 'pentagon' },
    // (b) Shorter house pentagon
    { shape: { type: 'polygon', vertices: [[-52, 65], [52, 65], [52, -15], [0, -65], [-52, -15]] }, label: 'pentagon-short' },
    // (c) Kite — quadrilateral, perpendicular DIAGONALS (not sides); students confuse these
    { shape: { type: 'polygon', vertices: [[0, -95], [55, 0], [0, 95], [-55, 0]] },       label: 'kite-tall' },
    // (c) Wider kite
    { shape: { type: 'polygon', vertices: [[0, -80], [65, 5], [0, 85], [-65, 5]] },       label: 'kite-wide' },
    // (c) Rhombus — all 4 sides equal but no right angles
    { shape: { type: 'polygon', vertices: [[0, -55], [70, 0], [0, 55], [-70, 0]] },       label: 'rhombus' },
  ];

  const chosen = pick(correct);

  // Pick one distractor from each misconception family (a, b, c), no duplicates
  const aPool = wrong.filter(w => w.label.startsWith('parallelogram'));
  const bPool = wrong.filter(w => w.label.startsWith('pentagon'));
  const cPool = wrong.filter(w => w.label.startsWith('kite') || w.label.startsWith('rhombus'));

  const d1 = pick(aPool);
  const d2 = pick(bPool);
  const d3 = pick(cPool);

  const opts = shuffle([chosen, d1, d2, d3]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[opts.indexOf(chosen)];

  return {
    question_number: '7',
    answer_type: 'multiple_choice',
    question_text: 'Which of these shapes appears to be a quadrilateral with perpendicular sides?',
    answer_options: opts.map((o, i) => ({ letter: letters[i], shape: o.shape })),
    correct_answer: correctLetter,
    _params: {
      correctLetter,
      // .label is an internal disambiguation tag for the distractor pool
      // (e.g. "rectangle-tall", "kite-wide") — strip to the plain shape
      // family name before exposing, or it leaks straight into the reveal
      // as a raw internal identifier a student can't parse.
      correctShapeLabel: chosen.label.split('-')[0],
      // d1/d2/d3 each come from a DIFFERENT misconception family (parallelogram
      // = right side count, wrong angles; pentagon = right angles, wrong side
      // count; kite/rhombus = right side count, perpendicular DIAGONALS not
      // sides) — giving one shared reason for all three produced unsound or
      // imprecise reveals ("a rectangle IS a parallelogram" contradictions).
      // Exposing each one's actual reason directly removes the need to
      // synthesize a single explanation that has to be simultaneously true
      // for three structurally different shapes.
      distractor1Label: d1.label.split('-')[0],
      distractor1Reason: 'has four sides, but its corners are not right angles',
      distractor2Label: d2.label.split('-')[0],
      distractor2Reason: 'has right angles, but five sides instead of four — it is not even a quadrilateral',
      distractor3Label: d3.label.split('-')[0],
      distractor3Reason: 'has four sides, but the right angle is between its two diagonal lines, not between its sides',
    },
  };
}

// ─── 2025 Q5: MultipleSelect — which shapes have at least one pair of parallel sides? ──
//
// Five polygon shapes are shown as answer options. Three are correct (have ≥1 pair of
// parallel sides). Two are distractors that look like they might have parallel sides but don't.
//
// Correct shapes (≥1 pair of parallel sides):
//   • right trapezoid — horizontal top and bottom are parallel; the right-angle corner
//     makes it look "almost rectangular," so students may overlook the slanted side
//   • parallelogram — both pairs of sides are parallel; slanted orientation may confuse
//     students who think only horizontal/vertical sides can be "parallel"
//   • isosceles trapezoid — top and bottom parallel; symmetric shape students recognize
//
// Distractor misconceptions:
//   (a) "It has four sides so it must have parallel sides" — irregular quadrilateral
//       where NO two sides are parallel. Students apply the property of rectangles/squares
//       to all quadrilaterals.
//   (b) "The sides look close to parallel" — a near-trapezoid irregular pentagon where
//       the top and bottom edges are only nearly (not actually) parallel. Students
//       rely on visual estimation rather than geometric reasoning.
//
// Select count: 3 (unchanged from base item).
function generate2025Q5() {
  // ── Correct shape pools ──

  // Right trapezoids: one pair of horizontal parallel sides, right angle at one corner.
  // Varying proportions keep each variant visually distinct.
  const rightTrapezoids = [
    { type: 'polygon', vertices: [[-28, 38], [28, 38], [28, -38], [-2, -38]] },
    { type: 'polygon', vertices: [[-30, 40], [25, 40], [25, -40], [-5, -40]] },
    { type: 'polygon', vertices: [[-22, 35], [30, 35], [30, -35], [2, -35]]  },
  ];

  // Parallelograms: both pairs of sides parallel, tilted so students must reason geometrically.
  const parallelograms = [
    { type: 'polygon', vertices: [[-28, 18], [8, 38], [28, -18], [-8, -38]]  },
    { type: 'polygon', vertices: [[-25, 20], [10, 40], [25, -20], [-10, -40]] },
    { type: 'polygon', vertices: [[-30, 15], [5,  38], [30, -15], [-5, -38]]  },
  ];

  // Isosceles trapezoids: symmetric, top and bottom are both horizontal and parallel.
  const isoTrapezoids = [
    { type: 'polygon', vertices: [[-35, 30], [35, 30], [25, -30], [-25, -30]] },
    { type: 'polygon', vertices: [[-30, 28], [30, 28], [20, -28], [-20, -28]] },
    { type: 'polygon', vertices: [[-38, 32], [38, 32], [22, -32], [-22, -32]] },
  ];

  // ── Distractor shape pools ──

  // (a) Irregular quadrilateral: four sides, zero pairs parallel.
  // Students apply "quadrilateral → must have parallel sides" incorrectly.
  const irregularQuads = [
    { type: 'polygon', vertices: [[-10, 38], [28, 38], [20, -38], [-28, -10]] },
    { type: 'polygon', vertices: [[-5,  35], [30, 30], [15, -38], [-28, -12]] },
    { type: 'polygon', vertices: [[-12, 36], [26, 40], [22, -36], [-26, -8]]  },
  ];

  // (b) Irregular pentagon: five sides, no parallel sides.
  // Visually complex; some edges appear nearly parallel, targeting students who estimate.
  const irregularPentagons = [
    { type: 'polygon', vertices: [[-30, 25], [-5, 38], [30, 5], [20, -35], [-15, -30]] },
    { type: 'polygon', vertices: [[-28, 22], [-2, 40], [28, 8], [18, -32], [-18, -28]] },
    { type: 'polygon', vertices: [[-32, 28], [-8, 40], [26, 6], [22, -34], [-16, -32]] },
  ];

  // ── Select one from each pool ──
  const rt   = pick(rightTrapezoids);
  const para = pick(parallelograms);
  const iso  = pick(isoTrapezoids);
  const iq   = pick(irregularQuads);
  const ip   = pick(irregularPentagons);

  const allOpts = shuffle([
    { shape: rt,   correct: true  },
    { shape: para, correct: true  },
    { shape: iso,  correct: true  },
    { shape: iq,   correct: false },
    { shape: ip,   correct: false },
  ]);

  const letters = ['A', 'B', 'C', 'D', 'E'];
  const correctLetters = allOpts
    .map((o, i) => o.correct ? letters[i] : null)
    .filter(Boolean)
    .join(',');

  return {
    question_number: '5',
    answer_type: 'multiple_select',
    select_count: 3,
    question_text: 'Which of these shapes appear to have <strong>at least</strong> one pair of parallel sides?',
    answer_options: allOpts.map((o, i) => ({ letter: letters[i], shape: o.shape })),
    correct_answer: correctLetters,
    _params: { correctLetters: correctLetters.split(',').join(', ') },
  };
}

// ─── 2025 Q10: TrueFalseTable with SVG figures — line of symmetry ─────────────
// Each row shows a shape+line; student selects "Line of Symmetry" or "Not".
// We build pools of symmetric and asymmetric (shape+line) combos and pick 3.
function generate2025Q10() {
  // ── Shape+line definitions ──
  // Each entry: { shapeParams, isSymmetric, description }
  // shapeParams → the full `params` object passed to SymmetryFigure

  // ---- Symmetric shapes with their symmetry line ----
  const symmetricPool = [
    // Kite with vertical line
    {
      shapeParams: {
        shape: { type: 'polygon', vertices: [[0, -50], [42, 10], [20, 48], [-20, 48], [-42, 10]] },
        line: { from: [0, -66], to: [0, 64] },
        padding: 20
      },
      isSymmetric: true
    },
    // Regular hexagon with horizontal line
    {
      shapeParams: {
        shape: { type: 'polygon', vertices: [[-54, 0], [-30, -26], [30, -26], [54, 0], [30, 26], [-30, 26]] },
        line: { from: [-72, 0], to: [72, 0] },
        padding: 20
      },
      isSymmetric: true
    },
    // Isosceles triangle with vertical line
    {
      shapeParams: {
        shape: { type: 'triangle', kind: 'isosceles', base: 80, height: 70 },
        line: { from: [0, -52], to: [0, 52] },
        padding: 20
      },
      isSymmetric: true
    },
    // Square with vertical line
    {
      shapeParams: {
        shape: { type: 'square', size: 80 },
        line: { from: [0, -56], to: [0, 56] },
        padding: 20
      },
      isSymmetric: true
    },
    // Rectangle with horizontal line
    {
      shapeParams: {
        shape: { type: 'rect', width: 90, height: 50 },
        line: { from: [-64, 0], to: [64, 0] },
        padding: 20
      },
      isSymmetric: true
    },
    // Regular hexagon with vertical line
    {
      shapeParams: {
        shape: { type: 'polygon', vertices: [[0, -50], [44, -25], [44, 25], [0, 50], [-44, 25], [-44, -25]] },
        line: { from: [0, -68], to: [0, 68] },
        padding: 20
      },
      isSymmetric: true
    },
    // Circle with horizontal line
    {
      shapeParams: {
        shape: { type: 'circle', r: 42 },
        line: { from: [-62, 0], to: [62, 0] },
        padding: 20
      },
      isSymmetric: true
    },
    // Regular pentagon with vertical line (top vertex at top)
    {
      shapeParams: {
        shape: {
          type: 'polygon',
          vertices: [
            [0, -50],
            [48, -15],
            [30, 42],
            [-30, 42],
            [-48, -15]
          ]
        },
        line: { from: [0, -68], to: [0, 68] },
        padding: 20
      },
      isSymmetric: true
    }
  ];

  // ---- Asymmetric: shape+line combinations where the line is NOT a line of symmetry ----
  const asymmetricPool = [
    // Non-isosceles trapezoid with horizontal line (wider on one side)
    {
      shapeParams: {
        shape: { type: 'polygon', vertices: [[-52, -18], [16, -18], [52, 18], [-16, 18]] },
        line: { from: [-72, 0], to: [72, 0] },
        padding: 20
      },
      isSymmetric: false
    },
    // Right triangle with vertical line through centroid
    {
      shapeParams: {
        shape: { type: 'triangle', kind: 'right', legs: [80, 70] },
        line: { from: [0, -56], to: [0, 56] },
        padding: 20
      },
      isSymmetric: false
    },
    // Rectangle with diagonal line
    {
      shapeParams: {
        shape: { type: 'rect', width: 90, height: 50 },
        line: { from: [-60, -36], to: [60, 36] },
        padding: 20
      },
      isSymmetric: false
    },
    // Kite with horizontal line (cuts kite asymmetrically top/bottom)
    {
      shapeParams: {
        shape: { type: 'polygon', vertices: [[0, -50], [42, 10], [20, 48], [-20, 48], [-42, 10]] },
        line: { from: [-64, 0], to: [64, 0] },
        padding: 20
      },
      isSymmetric: false
    },
    // Irregular quadrilateral with vertical line
    {
      shapeParams: {
        shape: { type: 'polygon', vertices: [[-40, -30], [36, -18], [50, 30], [-24, 40]] },
        line: { from: [0, -56], to: [0, 56] },
        padding: 20
      },
      isSymmetric: false
    },
    // Square with diagonal line
    {
      shapeParams: {
        shape: { type: 'square', size: 80 },
        line: { from: [-56, -40], to: [56, 40] },
        padding: 20
      },
      isSymmetric: false
    }
  ];

  // Pick a mix: always include at least 1 symmetric and 1 asymmetric in 3 rows.
  // Options: [2 sym + 1 asym] or [1 sym + 2 asym]
  const mixChoice = Math.random() < 0.5 ? '2sym1asym' : '1sym2asym';

  let chosen;
  if (mixChoice === '2sym1asym') {
    const syms = shuffle(symmetricPool).slice(0, 2);
    const asym = shuffle(asymmetricPool).slice(0, 1);
    chosen = shuffle([...syms, ...asym]);
  } else {
    const sym = shuffle(symmetricPool).slice(0, 1);
    const asyms = shuffle(asymmetricPool).slice(0, 2);
    chosen = shuffle([...sym, ...asyms]);
  }

  // Build statements (shape field)
  const statements = chosen.map(c => ({ shape: c.shapeParams }));

  return {
    question_number: '10',
    answer_type: 'true_false_table',
    column_label: 'Figure',
    true_label: 'Line of Symmetry',
    false_label: 'Not a Line of Symmetry',
    question_text: 'Determine whether the line shown on each figure in the table is a line of symmetry.\n\nSelect \u201cLine of Symmetry\u201d or \u201cNot a Line of Symmetry\u201d for each figure.',
    statements,
    correct_answer: chosen.map(c => c.isSymmetric ? 'True' : 'False').join(','),
  };
}

// ─── 2025 Q15: InlineChoice + ProtractorImage — read two angles from a protractor ───
//
// Base item: Ray P (horizontal, 0°), vertex L (center), Ray M at 70°, Ray K at 145°.
// Angle PLM = 70°.  Angle KLP = 145°.
//
// Generator varies both angles while keeping the protractor pedagogy intact:
//   • Angle for ray M is picked from common protractor-reading angles (30°–90° range so
//     the ray points clearly upward and does NOT overlap ray K).
//   • Angle for ray K is picked from the 110°–160° range so it clearly differs from M
//     and lands on a major tick.
//   • Distractors follow two pedagogical error patterns:
//       1. Reading the wrong scale: supplement (180 − correct).
//       2. Off-by-one major tick: ±10°.
//   • Dropdowns are shuffled so the correct answer is never in a fixed position.
function generate2025Q15() {
  // Candidate angles for ray M (PLM angle): multiples of 10, upper-right quadrant
  const mAngles = [30, 40, 50, 60, 70, 80, 90];
  // Candidate angles for ray K (KLP angle): multiples of 10, upper-left quadrant
  const kAngles = [110, 120, 130, 140, 145, 150, 160];

  const mAngle = pick(mAngles);
  const kAngle = pick(kAngles);

  // Build distractors for PLM (mAngle):
  //   - Wrong-scale reading: 180 - mAngle
  //   - Off by a major tick: mAngle - 10, mAngle + 10 (clamped 10–170)
  function distractors(correct) {
    const wrongScale = 180 - correct;
    const lowTick  = correct - 10;
    const highTick = correct + 10;
    const pool = new Set([wrongScale]);
    if (lowTick >= 10)  pool.add(lowTick);
    if (highTick <= 170) pool.add(highTick);
    // Fill to 3 distractors with off-by-20 if needed
    if (pool.size < 3 && correct - 20 >= 10)  pool.add(correct - 20);
    if (pool.size < 3 && correct + 20 <= 170) pool.add(correct + 20);
    // Return exactly 3 unique distractors (exclude correct)
    return [...pool].filter(v => v !== correct).slice(0, 3);
  }

  const mDistractors = distractors(mAngle);
  const kDistractors = distractors(kAngle);

  // Build option arrays (correct + distractors), sorted numerically for natural order
  const mOptions = shuffle([mAngle, ...mDistractors]).sort((a, b) => a - b);
  const kOptions = shuffle([kAngle, ...kDistractors]).sort((a, b) => a - b);

  return {
    question_number: '15',
    answer_type: 'inline_choice',
    stimulus_intro: 'Angles <i>PLM</i> and <i>KLP</i> are shown on this protractor.',
    stimulus_type: 'protractor_image',
    stimulus_params: {
      rays: [
        { label: 'M', angle: mAngle },
        { label: 'K', angle: kAngle }
      ],
      center_label: 'L',
      base_label: 'P'
    },
    question_text: 'What is the measure of each angle?',
    instruction: 'Select from the drop-down menus to correctly complete each sentence.',
    sentences: [
      'The measure of angle <i>PLM</i> is [RESPONSE_A1] degrees.',
      'The measure of angle <i>KLP</i> is [RESPONSE_A2] degrees.'
    ],
    dropdowns: [
      { id: 'RESPONSE_A1', options: mOptions.map(String) },
      { id: 'RESPONSE_A2', options: kOptions.map(String) }
    ],
    // InlineChoice.svelte (standalone, used for top-level inline_choice questions)
    // emits pipe-separated raw selections in dropdown order — not letter codes.
    correct_answer: `${mAngle}|${kAngle}`,
    // stimulus_params.rays is an array of objects — the generic extractor
    // deliberately doesn't flatten those (too structured to do safely), so
    // without this the LLM has no way to know the actual angle measures at all.
    _params: {
      PLM_angle: String(mAngle),
      KLP_angle: String(kAngle)
    }
  };
}

// ─── 2023 Q4: MultiPart (4 parts) — fraction comparison with bucket diagrams ─
//
// Context: Four friends collected rainwater in equal-sized buckets. Each bucket
// shows a fraction indicating how full it is. The four parts progress from
// direct comparison (Part A) to a critical-thinking "is the friend correct?"
// task (Part C) and a bounded fraction production task (Part D).
//
// Part A: Compare two fractions with different denominators (7/8 vs 5/6).
//         Generated pair always has different denominators; the comparison
//         requires finding a common denominator or using benchmark fractions.
//
// Part B: Identify which of two fractions is greater (same denominator strategy
//         possible when one fraction uses half as denominator, e.g. 5/6 vs 1/2).
//
// Part C: All four buckets shown. A fictitious friend claims two buckets are
//         equal because they share the same fraction label.
//         The generator creates a pair where B and C have the SAME fraction
//         (so the friend's claim IS correct) — mirroring the original item —
//         OR where B and C have DIFFERENT fractions (so the friend is wrong).
//         This makes the generator non-trivial: answer varies.
//
// Part D: Write a fraction less than a given benchmark (typically 1/2).
//         The benchmark varies across runs.
//
// Distractor / variation design:
//   - Bucket A is always the "largest" fraction (close to 1).
//   - Bucket D is always the "smallest" (close to 0 or at most 1/2).
//   - Bucket B and C share the same denominator (reinforces the Part C trap).
//   - The generator picks denominators from {4, 6, 8} so fractions are
//     grade-appropriate (4th grade: unit fractions with denominators ≤8).
//
function generate2023Q4() {
  // ── Pick fractions ──────────────────────────────────────────────────────────
  // Bucket A: large fraction, denominator 8 → 5/8, 6/8, 7/8
  const buckADenom = 8;
  const buckANum   = pick([5, 6, 7]);

  // Bucket B and C: same fraction, denominator 4 or 6
  const bcDenom = pick([4, 6]);
  // Numerator: at least half the denominator but less than denominator
  const bcNum   = randInt(Math.ceil(bcDenom / 2), bcDenom - 1);

  // Bucket D: small fraction < 1/2, denominator 4 or 8
  const buckDDenom = pick([4, 8]);
  // numerator < half denominator → clearly less than 1/2
  const buckDNum   = randInt(1, Math.floor(buckDDenom / 2) - 1);

  // Part D benchmark: students must write a fraction less than this value.
  // Pool sticks to denominators already used elsewhere in the question (2,3,4,6,8).
  const [benchmarkN, benchmarkD] = pick([
    [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 6], [5, 6], [1, 8], [3, 8], [5, 8], [7, 8],
  ]);

  // ── Comparison helper ────────────────────────────────────────────────────────
  // Returns ">", "<", or "=" for a/b vs c/d
  function compare(an, ad, bn, bd) {
    const diff = an * bd - bn * ad;
    return diff > 0 ? '>' : diff < 0 ? '<' : '=';
  }

  const partAOp = compare(buckANum, buckADenom, bcNum, bcDenom); // A vs B

  // ── Build the question ──────────────────────────────────────────────────────
  return {
    item_id: 'MA801035466',
    question_number: '4',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    question_text:
      'Four friends live in different towns. ' +
      'They each placed a bucket outside to collect rainwater on the same night. ' +
      'The four buckets were labeled A, B, C, and D.',
    math_expression: null,
    answer_type: 'multi_part',
    layout: 'stacked',
    answer_options: null,
    parts: [
      {
        label: 'A',
        question_text:
          'Bucket A and Bucket B are the same size. ' +
          'This diagram shows the fraction of each bucket that was filled with rainwater.',
        stimulus_type: 'bucket_diagram',
        stimulus_params: {
          buckets: [
            { label: 'Bucket A', numerator: buckANum,  denominator: buckADenom },
            { label: 'Bucket B', numerator: bcNum,     denominator: bcDenom    },
          ]
        },
        answer_type: 'constructed_response',
        answer_instruction:
          'Write a number sentence using >, <, or = to compare the fraction of ' +
          'Bucket A that was filled to the fraction of Bucket B that was filled. ' +
          'Show or explain how you got your answer.\n\n' +
          'Enter your number sentence and your work or explanation in the space provided.',
        correct_answer: `[${buckANum}/${buckADenom}] ${partAOp} [${bcNum}/${bcDenom}]`,
      },
      {
        label: 'B',
        question_text:
          'Bucket C and Bucket D are the same size. ' +
          'This diagram shows the fraction of each bucket that was filled with rainwater.',
        stimulus_type: 'bucket_diagram',
        stimulus_params: {
          buckets: [
            { label: 'Bucket C', numerator: bcNum,    denominator: bcDenom    },
            { label: 'Bucket D', numerator: buckDNum, denominator: buckDDenom },
          ]
        },
        answer_type: 'constructed_response',
        answer_instruction:
          'Which bucket, Bucket C or Bucket D, was filled with more rainwater? ' +
          'Explain how you got your answer.\n\n' +
          'Enter your answer and your explanation in the space provided.',
        // C > D always by construction (bcNum/bcDenom > buckDNum/buckDDenom)
        // Accept the bare letter too, not just "Bucket C"
        correct_answer: 'Bucket C|C',
      },
      {
        label: 'C',
        question_text:
          "This diagram shows all of the friends' buckets and the fraction of each bucket " +
          "that was filled with rainwater.\n\n" +
          `One of the friends says that Bucket B and Bucket C were filled with the same amount of rainwater since [${bcNum}/${bcDenom}] of each bucket was filled with rainwater.\n\n` +
          'Is the friend correct?',
        stimulus_type: 'bucket_diagram',
        stimulus_params: {
          buckets: [
            { label: 'Bucket A', numerator: buckANum,  denominator: buckADenom },
            { label: 'Bucket B', numerator: bcNum,     denominator: bcDenom    },
            { label: 'Bucket C', numerator: bcNum,     denominator: bcDenom    },
            { label: 'Bucket D', numerator: buckDNum,  denominator: buckDDenom },
          ]
        },
        answer_type: 'yes_no_explanation',
        // B and C share the same fraction by construction, so the friend IS correct
        correct_answer: 'yes',
      },
      {
        label: 'D',
        question_text:
          `A weatherman in another town says that his town received <strong>less than</strong> [${benchmarkN}/${benchmarkD}] inch of rainwater.\n\n` +
          'Write a fraction that represents the amount of rainwater, in inches, this town could have received. ' +
          'Explain how you know your answer is correct.\n\n' +
          'Enter your answer and your explanation in the space provided.',
        stimulus_type: null,
        stimulus_params: null,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer and your explanation in the space provided.',
        // Any fraction strictly less than the benchmark is accepted
        correct_answer: `<${benchmarkN}/${benchmarkD}`,
      },
    ],
    select_count: null,
    has_visual: true,
    visual_description:
      `Bucket diagrams: Part A shows Bucket A ([${buckANum}/${buckADenom}]) and Bucket B ([${bcNum}/${bcDenom}]); ` +
      `Part B shows Bucket C ([${bcNum}/${bcDenom}]) and Bucket D ([${buckDNum}/${buckDDenom}]); ` +
      `Part C shows all four buckets.`,
    correct_answer: {
      A: `[${buckANum}/${buckADenom}] ${partAOp} [${bcNum}/${bcDenom}]`,
      B: 'Bucket C|C',
      C: 'yes',
      D: `<${benchmarkN}/${benchmarkD}`,
    },
  };
}

// ─── 2025 Q7: MultiPart (2 parts) — expanded form matching + compare to 13,084 ─
//
// Part A: drag-drop match (shown as static display)
//   Three expanded-form expressions → three word-form targets.
//   Generator varies the five-digit "base" number (tens-thousands digit A,
//   thousands digit B, hundreds digit C, tens digit D, ones digit E, all 1–9,
//   all distinct). Three tiles are:
//     Tile 0: (A × 10,000) + (C × 100)   + (D × 10) + (E × 1)   → word for A0C DE
//     Tile 1: (A × 10,000) + (B × 1,000) + (C × 100) + (D × 10) → word for AB,CD0
//     Tile 2: flat addition A0,000 + B,000 + C00 + E              → word for A0 B C  E
//   (These mirror the structure of the real item: multiplied form, place-value sum,
//   and one flat-addition form.)
//
// Part B: true_false_table — compare three word-form numbers to a reference value R.
//   R is a 5-digit number (reference).
//   One number is greater than R, two are less (or vice versa), varying each run.
//
// Distractor design:
//   The three tiles all share digits with each other, so students who don't
//   carefully evaluate each expression may mis-match them.
//   The Part B reference R is always a 5-digit number; the three comparison
//   numbers differ from R in a single digit position to keep arithmetic
//   grade-appropriate.
//
function generate2025Q7() {
  // ── helpers ──────────────────────────────────────────────────────────────────
  function toWords(n) {
    // Converts an integer 1–99,999 to English word form matching TestNav style.
    // We only need values our generator will actually produce.
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
                  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
                  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
                  'sixty', 'seventy', 'eighty', 'ninety'];

    function twoDigit(n) {
      if (n === 0) return '';
      if (n < 20) return ones[n];
      const t = tens[Math.floor(n / 10)];
      const o = ones[n % 10];
      return o ? `${t}-${o}` : t;
    }

    function threeDigit(n) {
      if (n === 0) return '';
      const h = Math.floor(n / 100);
      const rest = n % 100;
      const hundredPart = h > 0 ? `${ones[h]} hundred` : '';
      const restPart = twoDigit(rest);
      if (hundredPart && restPart) return `${hundredPart} ${restPart}`;
      return hundredPart || restPart;
    }

    if (n >= 10000) {
      const thou = Math.floor(n / 1000);
      const rest = n % 1000;
      const thouWords = thou >= 100 ? threeDigit(thou) : twoDigit(thou);
      const restWords = threeDigit(rest);
      if (restWords) return `${thouWords} thousand, ${restWords}`;
      return `${thouWords} thousand`;
    }
    if (n >= 1000) {
      const thou = Math.floor(n / 1000);
      const rest = n % 1000;
      const restWords = threeDigit(rest);
      if (restWords) return `${ones[thou]} thousand, ${restWords}`;
      return `${ones[thou]} thousand`;
    }
    return threeDigit(n);
  }

  function numWithComma(n) {
    return n.toLocaleString('en-US');
  }

  // ── Pick five distinct non-zero digits A B C D E ──────────────────────────
  // A = tens-thousands, B = thousands, C = hundreds, D = tens, E = ones
  // All 1–9 (no zeros) so toWords never needs to handle zero in a digit slot.
  let A, B, C, D, E;
  do {
    const pool = shuffle([1,2,3,4,5,6,7,8,9]);
    [A, B, C, D, E] = pool.slice(0, 5);
  } while (A === B || A === C || B === C); // redundant but safe

  // ── Compute the three numbers ─────────────────────────────────────────────
  // n0: A×10,000 + C×100 + D×10 + E  (no thousands digit)
  const n0 = A * 10000 + C * 100 + D * 10 + E;
  // n1: A×10,000 + B×1,000 + C×100 + D×10  (no ones digit)
  const n1 = A * 10000 + B * 1000 + C * 100 + D * 10;
  // n2: flat sum A0,000 + B,000 + C00 + E  (no tens digit)
  const n2 = A * 10000 + B * 1000 + C * 100 + E;

  // ── Tile expressions ──────────────────────────────────────────────────────
  const tile0 = `(${A} \u00d7 10,000) + (${C} \u00d7 100) + (${D} \u00d7 10) + (${E} \u00d7 1)`;
  const tile1 = `(${A} \u00d7 10,000) + (${B} \u00d7 1,000) + (${C} \u00d7 100) + (${D} \u00d7 10)`;
  const tile2 = `${numWithComma(A * 10000)} + ${numWithComma(B * 1000)} + ${C * 100} + ${E}`;

  const tiles = [tile0, tile1, tile2];

  // ── Word-form targets (in a shuffled order students see) ──────────────────
  // Target order matches n0, n1, n2 respectively
  const target0 = toWords(n0);
  const target1 = toWords(n1);
  const target2 = toWords(n2);

  // Targets listed in display order: we keep [target0, target1, target2]
  // correct_matches[i] = target index for tile i
  // tile0→target0 (index 0), tile1→target1 (index 1), tile2→target2 (index 2)
  const targets = [target0, target1, target2];
  const correct_matches = [0, 1, 2];

  // ── Part B: reference number R and three comparison numbers ───────────────
  // R is a 5-digit number distinct from n0/n1/n2.
  // We build R as a "round" number: pick thousands+hundreds, no tens/ones variation.
  const Rthous = randInt(1, 9) * 10000 + randInt(1, 9) * 1000;
  // Add a hundreds component that's neither 0 nor the same as C×100 to avoid collision
  const RhundOpts = [100, 200, 300, 400, 500, 600, 700, 800].filter(h => h !== C * 100);
  const Rhund = pick(RhundOpts);
  const R = Rthous + Rhund + randInt(1, 9) * 10 + randInt(1, 9);

  // Three comparison numbers: vary R by ±small offset in each digit position
  // We want a mix: some greater, some less. Pick 1 greater, 2 less (or 2 greater, 1 less).
  const greaterCount = pick([1, 2]);
  const lessCount = 3 - greaterCount;

  // Generate offsets: greater = add to ones/tens/hundreds; less = subtract
  const Rval = R;
  function makeGreater(seed) {
    // add seed hundreds (100–900) + small tens
    const addH = randInt(1, 9) * 100 + randInt(1, 9);
    return Rval + addH;
  }
  function makeLess(seed) {
    const subH = randInt(1, 9) * 100 + randInt(1, 9);
    // Ensure result stays positive and < R
    const v = Rval - subH;
    return v > 0 ? v : Rval - 1;
  }

  const rawComparisons = [];
  for (let i = 0; i < greaterCount; i++) rawComparisons.push({ value: makeGreater(i), relation: 'greater' });
  for (let i = 0; i < lessCount;    i++) rawComparisons.push({ value: makeLess(i),    relation: 'less'    });

  const shuffledComparisons = shuffle(rawComparisons);

  const statements = shuffledComparisons.map(c => ({ text: toWords(c.value) }));

  // Correct answer for Part B:
  // TrueFalseTable encoding: true_label = "Less Than R", false_label = "Greater Than R"
  // true = less than R → value "true"; false = greater than R → value "false"
  // Standard TFT encoding: row N: True = letter(2N-1), False = letter(2N)
  // Row 1: A=True, B=False; Row 2: C=True, D=False; Row 3: E=True, F=False
  const tfLetters = [];
  const partBAnswer = shuffledComparisons.map(c => c.relation === 'less' ? 'True' : 'False').join(',');

  const Rstr = numWithComma(R);

  return {
    question_number: '7',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: null,
    parts: [
      {
        label: 'A',
        question_text:
          'Match the numbers in expanded form to their equivalent numbers in word form.\n\n' +
          'Drag and drop each number in expanded form into the box with the matching word form.',
        answer_type: 'drag_drop_match',
        tiles,
        targets,
        correct_matches,
        correct_answer: correct_matches,
      },
      {
        label: 'B',
        question_text:
          `Three different numbers in word form are shown in this table. Compare the value of each number in the table to ${Rstr}.\n\n` +
          `For each number in word form, select \u201cLess Than ${Rstr}\u201d or \u201cGreater Than ${Rstr}.\u201d`,
        answer_type: 'true_false_table',
        column_label: 'Number',
        true_label: `Less Than ${Rstr}`,
        false_label: `Greater Than ${Rstr}`,
        statements,
        correct_answer: partBAnswer,
      },
    ],
    correct_answer: {
      A: correct_matches,
      B: partBAnswer,
    },
    // Part B is a true_false_table, but the generic multi_part rule only
    // derives {label}_correctValue from a plain string/number correct_answer
    // — it doesn't know to zip statements against a true_false_table's row
    // encoding the way the TOP-LEVEL generic rule does. Without this, the
    // only thing exposed was the raw "True,False,True" encoding, which
    // leaked straight into the reveal instead of the actual on-screen labels
    // ("Less Than {{B_referenceNumber}}" / "Greater Than {{B_referenceNumber}}").
    _params: {
      B_referenceNumber: Rstr,
      B_row1_statement: statements[0].text,
      B_row1_answer: shuffledComparisons[0].relation === 'less' ? `Less Than ${Rstr}` : `Greater Than ${Rstr}`,
      B_row2_statement: statements[1].text,
      B_row2_answer: shuffledComparisons[1].relation === 'less' ? `Less Than ${Rstr}` : `Greater Than ${Rstr}`,
      B_row3_statement: statements[2].text,
      B_row3_answer: shuffledComparisons[2].relation === 'less' ? `Less Than ${Rstr}` : `Greater Than ${Rstr}`,
    },
  };
}

// ─── 2023 Q11: DragDropInequality — decimal tile placement ────────────────────
// Structure: 3 tiles, 3 comparison rows (each with a fixed value and operator).
// Strategy: pick 3 distinct two-digit tenths/hundredths decimals (A < B < C),
// then build rows that force exactly one tile per slot:
//   Row 1: {fixed1} > [blank]   → correct tile is the smallest (A)
//   Row 2: {fixed2} < [blank]   → correct tile is the largest  (C)
//   Row 3: {fixed3} > [blank]   → correct tile is the middle   (B)
// fixed1 is between A and B, fixed2 is between B and C, fixed3 is between B and C+gap.
// All values stay in [0.50, 0.99] range to match the original question's domain.

function generate2023Q11() {
  // Generate three distinct hundredths decimals in [51..97], sorted ascending.
  // Ensure gaps of at least 2 hundredths between each so fixed values fit cleanly.
  let A, B, C;
  let attempts = 0;
  do {
    A = randInt(51, 70);  // smallest tile (hundredths integer, e.g. 51 → 0.51)
    B = randInt(A + 3, A + 18);
    C = randInt(B + 3, B + 18);
    attempts++;
  } while (C > 97 && attempts < 100);

  // Format helper: convert integer hundredths to string like "0.65"
  function fmt(n) {
    // Show as tenths if ends in 0, otherwise hundredths
    if (n % 10 === 0) return `0.${n / 10}`;
    return `0.${n < 10 ? '0' + n : n}`;
  }

  // Tiles (shuffled for display; correct answers don't depend on display order)
  const tiles = shuffle([fmt(A), fmt(B), fmt(C)]);

  // Fixed values:
  //   fixed1: between A and B (forces slot1 blank = A, since fixed1 > A but fixed1 < B)
  //   fixed2: between A and B (forces slot2 blank = C, since fixed2 < C)
  //   fixed3: between B and C (forces slot3 blank = B, since fixed3 > B but fixed3 < C)
  const fixed1int = randInt(A + 1, B - 1);
  const fixed2int = randInt(A + 1, B - 1);
  const fixed3int = randInt(B + 1, C - 1);

  const fixed1 = fmt(fixed1int);
  const fixed2 = fmt(fixed2int);
  const fixed3 = fmt(fixed3int);

  const rows = [
    { left: fixed1, op: '>', id: 'slot1' },  // fixed1 > blank → blank = A (smallest below fixed1)
    { left: fixed2, op: '<', id: 'slot2' },  // fixed2 < blank → blank = C (largest above fixed2)
    { left: fixed3, op: '>', id: 'slot3' },  // fixed3 > blank → blank = B (middle, below fixed3)
  ];

  const correct_answer = {
    slot1: fmt(A),
    slot2: fmt(C),
    slot3: fmt(B),
  };

  return {
    item_id: 'MA002145158',
    question_number: '11',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    question_text: 'Use these decimal numbers to create three comparison statements that are true.',
    instruction2: 'Drag and drop a decimal number into each box so that <strong>all</strong> three comparison statements are true.',
    math_expression: null,
    answer_type: 'drag_drop_inequality',
    tiles,
    rows,
    answer_options: null,
    parts: null,
    select_count: null,
    has_visual: true,
    visual_description: `Tile bank: ${tiles.join(', ')}. Three rows: ${fixed1} > [blank], ${fixed2} < [blank], ${fixed3} > [blank].`,
    correct_answer,
    _params: {
      decimalA: fmt(A),
      decimalB: fmt(B),
      decimalC: fmt(C),
      fixed1, fixed2, fixed3,
    },
  };
}

// 2025 Q2: CategorySort — prime vs. composite number sorting
// Structure: 5 tiles sorted into Composite and Prime boxes.
// Generator strategy: pick a fresh set of 5 numbers (2–50) ensuring at least 2 prime and 2 composite;
// shuffle tiles so the order in the bank varies.
//
// Primes ≤ 50: 2,3,5,7,11,13,17,19,23,29,31,37,41,43,47
// Composites ≤ 50 (grade-4 friendly, not 1): 4,6,8,9,10,12,14,15,16,18,20,21,22,24,25,26,27,28,30,32,33,34,35,36,38,39,40,42,44,45,46,48,49,50
//
// Distractor design: the original uses one square number composite (25) that students might
// confuse as prime because it is odd.  We include such "tricky" composites when possible.
function generate2025Q2() {
  const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  // Grade-4 friendly composites — avoid very large numbers
  const COMPOSITES = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28, 30, 32, 33, 35, 36, 39, 45, 49, 50];
  // "Tricky" composites that students often mis-classify as prime (odd, not obviously divisible)
  const TRICKY = [9, 15, 21, 25, 27, 33, 35, 39, 49];

  // Pick 2 or 3 primes from the pool
  const primeCount = randInt(2, 3);
  const compositeCount = 5 - primeCount;

  const primePool = shuffle([...PRIMES]);
  const chosenPrimes = primePool.slice(0, primeCount);

  // Always try to include at least one tricky composite to match the pedagogical intent of the original
  const trickyPool = shuffle([...TRICKY]);
  const trickyComposite = trickyPool[0];
  const remainingComposites = shuffle(COMPOSITES.filter(n => n !== trickyComposite));
  const chosenComposites = [trickyComposite, ...remainingComposites].slice(0, compositeCount);

  const allTiles = shuffle([...chosenPrimes, ...chosenComposites]).map(String);

  return {
    question_number: '2',
    answer_type: 'category_sort',
    question_text: 'Identify whether each of these numbers is a composite number or a prime number.\n\nDrag and drop each number into the correct box.',
    tiles: allTiles,
    categories: [
      { label: 'Composite', correct_tiles: chosenComposites.map(String) },
      { label: 'Prime',     correct_tiles: chosenPrimes.map(String) },
    ],
    answer_options: null,
    parts: null,
    select_count: null,
    has_visual: false,
    visual_description: null,
    correct_answer: `Composite: ${chosenComposites.join(', ')}; Prime: ${chosenPrimes.join(', ')}`,
    _params: {
      compositeNumbers: chosenComposites.join(', '),
      primeNumbers: chosenPrimes.join(', '),
      trickyComposite: String(trickyComposite),
    },
  };
}

// ─── 2021 Questions ──────────────────────────────────────────────────────────

// 2021 Q1 (MA704649496): FractionModel — sum of two fractions with like denominators (tenths)
// Students are given two fractions with the same denominator and must shade a fraction
// model to show their sum.  We vary the denominator and the two addends so that their
// sum is always less than 1 whole (< denominator parts).
// Pedagogical distractors for the generator: off-by-one errors, wrong denominator, etc.
function generate2021Q1() {
  // Grade-4 appropriate denominators
  const denominators = [4, 5, 6, 8, 10, 12];
  const denom = pick(denominators);

  // Pick two addends a, b (each ≥ 1) whose sum is strictly less than denom
  let a, b;
  do {
    a = randInt(1, denom - 2);
    b = randInt(1, denom - 1 - a);
  } while (a + b >= denom || a + b === 0);

  const sum = a + b;

  const questionText =
    `Create a fraction model in which the shaded part represents the sum of this expression.\n\n` +
    `[${a}/${denom}] + [${b}/${denom}]\n\n` +
    `Divide the figure into the correct number of equal parts by using the More and Fewer buttons. Then shade by selecting the part or parts.`;

  return {
    item_id: 'MA704649496',
    question_number: '1',
    answer_type: 'fraction_model',
    question_text: questionText,
    model_params: {
      numerator: sum,
      denominator: denom,
    },
    math_expression: null,
    answer_options: null,
    parts: null,
    select_count: null,
    has_visual: true,
    visual_description: `Figure divided into ${denom} equal parts with ${sum} parts shaded (${sum}/${denom}, the sum of ${a}/${denom} + ${b}/${denom}).`,
    correct_answer: `[${sum}/${denom}]`,
  };
}

// 2021 Q2: MultipleChoice — multiplicative comparison equation (4.OA.A.1)
// A child is N years old; a sibling is M times as old. Which equation finds b?
// Correct: b = N × M. Distractors are pedagogically motivated student errors:
//   A: b = 1 × M     — student thinks "times as old" means the base is 1
//   B: b = M × M     — student uses the multiplier itself as the age
//   D: b = (N×M) × M — student first computes the answer then re-applies the multiplier
function generate2021Q2() {
  // Vary the child's age (3–9) and the multiplier (2–5)
  const ages = [3, 4, 5, 6, 7, 8, 9];
  const multipliers = [2, 3, 4, 5];
  const age = pick(ages);
  const multiplier = pick(multipliers);
  const correctProduct = age * multiplier;

  // Pick a name for the child (female pronoun so "her brother" framing works)
  const femaleNames = [
    { name: 'Sofia', poss: 'her' },
    { name: 'Emma', poss: 'her' },
    { name: 'Priya', poss: 'her' },
    { name: 'Aisha', poss: 'her' },
    { name: 'Lily', poss: 'her' },
    { name: 'Mia', poss: 'her' },
    { name: 'Anna', poss: 'her' },
    { name: 'Carmen', poss: 'her' },
  ];
  const person = pick(femaleNames);
  const name = person.name;
  const poss = person.poss;

  // Relative — pick sibling label
  const relatives = ['brother', 'sister'];
  const relative = pick(relatives);

  // Distractor values
  const dA = 1;                   // b = 1 × M  (mistakes base as 1)
  const dB = multiplier;          // b = M × M  (uses multiplier as the age)
  const dD = correctProduct;      // b = (N×M) × M  (re-multiplies result)

  const rawOptions2 = shuffle([
    { label: `b = ${dA} × ${multiplier}`,  isCorrect: false },
    { label: `b = ${dB} × ${multiplier}`,  isCorrect: false },
    { label: `b = ${age} × ${multiplier}`, isCorrect: true  },
    { label: `b = ${dD} × ${multiplier}`,  isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const answerOptions = rawOptions2.map((opt, i) => ({ letter: letters[i], text: opt.label }));
  const correctLetter = letters[rawOptions2.findIndex(o => o.isCorrect)];

  return {
    item_id: 'MA307079',
    question_number: '2',
    answer_type: 'multiple_choice',
    stimulus_intro: `${name} is ${age} years old. ${poss.charAt(0).toUpperCase() + poss.slice(1)} ${relative} is ${multiplier} times as old as ${name}.`,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    question_text: `Which equation can be used to find b, the age in years of ${name}'s ${relative}?`,
    answer_options: answerOptions,
    parts: null,
    select_count: null,
    correct_answer: correctLetter,
  };
}

// 2023 Q19: FractionModel — chocolate bar remains
// The question presents two fractions eaten (a/d and b/d, same denominator) and asks
// the student to model the remaining fraction ((d - a - b)/d) using the interactive
// rectangle widget.  We vary denominator (4, 6, 8, 10, 12) and pick two numerators
// that eat less than the whole bar and leave at least 1 part remaining.
function generate2023Q19() {
  // Grade-4 appropriate denominators for unit-fraction thinking
  const denominators = [4, 6, 8, 10, 12];
  const denom = pick(denominators);

  // Pick two positive numerators a, b such that a + b < denom (so remainder ≥ 1)
  // and a ≥ 1, b ≥ 1, a ≠ b for variety
  let a, b;
  do {
    a = randInt(1, denom - 2);
    b = randInt(1, denom - 1 - a);
  } while (a === b || a + b >= denom);

  const remaining = denom - a - b;

  // Vary the food item for narrative variety
  const items = [
    'a chocolate bar',
    'a granola bar',
    'a sandwich',
    'a pizza',
  ];
  const food = pick(items);

  // Two friend names (distinct)
  const [p1, p2] = shuffle(PEOPLE).slice(0, 2);

  const questionText =
    `${p1.name} and ${p2.name} bought ${food}.` +
    `<ul>` +
    `<li>${p1.name} ate [${a}/${denom}] of the ${food}.</li>` +
    `<li>${p2.name} ate [${b}/${denom}] of the ${food}.</li>` +
    `</ul>` +
    `Create a fraction model in which the shaded part represents the fraction of the ${food} that <strong>remains</strong>.\n\n` +
    `Divide the figure into the correct number of equal parts by using the More and Fewer buttons. Then shade by selecting the part or parts.`;

  return {
    item_id: 'MA900846441',
    question_number: '19',
    answer_type: 'fraction_model',
    question_text: questionText,
    model_params: {
      numerator: remaining,
      denominator: denom,
    },
    math_expression: null,
    answer_options: null,
    parts: null,
    select_count: null,
    has_visual: true,
    visual_description: `Rectangle divided into ${denom} equal vertical parts with ${remaining} parts shaded (${remaining}/${denom} remaining).`,
    correct_answer: `[${remaining}/${denom}]`,
  };
}

// ─── 2023 Q9–Q20 remaining generators ────────────────────────────────────────

// 2023 Q9: MultipleChoice — 6-digit minus 4-digit subtraction
// Standard: 4.NBT.B.4 — fluently add/subtract multi-digit whole numbers
function generate2023Q9() {
  const minuend = randInt(200, 800) * 1000 + randInt(100, 999);
  const subtrahend = randInt(1000, 9999);
  const diff = minuend - subtrahend;

  const pool = shuffle([
    { val: diff,        isCorrect: true  },
    { val: diff + 100,  isCorrect: false }, // forgot to reduce hundreds digit after borrow
    { val: diff + 1000, isCorrect: false }, // forgot to reduce thousands digit after borrow
    { val: diff + 2000, isCorrect: false }, // double-missed borrow in thousands
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '9',
    answer_type: 'multiple_choice',
    stimulus_intro: 'An expression is shown.',
    math_expression: `${minuend.toLocaleString()} − ${subtrahend.toLocaleString()}`,
    question_text: 'Which of these numbers is the difference of the expression?',
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.val.toLocaleString() })),
    correct_answer: correctLetter,
  };
}

// 2023 Q10: MultipleChoice — fraction of a full turn as angle degrees
// Standard: 4.MD.C.5a — recognize angle turns through 1/n of a circle
function generate2023Q10() {
  const CASES = [
    { num: 1, denom: 2, degrees: 180, distractors: [90, 120, 270]  },
    { num: 1, denom: 3, degrees: 120, distractors: [45, 90, 180]   },
    { num: 1, denom: 4, degrees: 90,  distractors: [45, 120, 180]  },
    { num: 1, denom: 6, degrees: 60,  distractors: [30, 90, 120]   },
    { num: 1, denom: 8, degrees: 45,  distractors: [30, 60, 90]    },
    { num: 3, denom: 4, degrees: 270, distractors: [90, 180, 360]  },
    { num: 2, denom: 3, degrees: 240, distractors: [120, 180, 270] },
  ];
  const c = pick(CASES);
  const pool = shuffle([c.degrees, ...c.distractors]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.indexOf(c.degrees)];

  return {
    question_number: '10',
    answer_type: 'multiple_choice',
    question_text: `Which of these is the measure of an angle that turns through [${c.num}/${c.denom}] of a circle?`,
    answer_options: pool.map((v, i) => ({ letter: letters[i], text: `${v}°` })),
    correct_answer: correctLetter,
  };
}

// 2023 Q12: MultipleChoice + AngleDiagram — sum of three consecutive arc angles
// Standard: 4.MD.C.7 — add angle measures to find unknown angles
function generate2023Q12() {
  const baseAngle = randInt(10, 20);
  let a, b, c, total, dAB, dBC, dAC;
  do {
    a = randInt(15, 55);
    b = randInt(15, 55);
    c = randInt(15, 45);
    total = a + b + c;
    dAB = a + b;   // forgot arc c
    dBC = b + c;   // forgot arc a
    dAC = a + c;   // forgot arc b (middle)
  } while (
    total < 50 || baseAngle + total > 170 ||
    new Set([total, dAB, dBC, dAC]).size < 4
  );

  const angleT = baseAngle;
  const angleS = angleT + c;
  const angleR = angleS + b;
  const angleQ = angleR + a;

  const pool = shuffle([
    { val: total, isCorrect: true  },
    { val: dAB,   isCorrect: false },
    { val: dBC,   isCorrect: false },
    { val: dAC,   isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '12',
    answer_type: 'multiple_choice',
    stimulus_intro: 'Some angle measures are shown in this diagram.',
    stimulus_type: 'angle_diagram',
    stimulus_params: {
      center: 'V',
      rays: [
        { label: 'Q', angle: angleQ },
        { label: 'R', angle: angleR },
        { label: 'S', angle: angleS },
        { label: 'T', angle: angleT },
      ],
      arc_labels: [
        { between: ['Q', 'R'], text: `${a}°`, radius: 45 },
        { between: ['R', 'S'], text: `${b}°`, radius: 52 },
        { between: ['S', 'T'], text: `${c}°`, radius: 62 },
      ],
    },
    question_text: `Angle QVR has a measure of ${a}°. Angle RVS has a measure of ${b}°. Angle SVT has a measure of ${c}°. Which of the following is the measure, in degrees, of angle QVT?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: `${o.val}°` })),
    correct_answer: correctLetter,
  };
}

// 2023 Q14: MultipleChoice — mass unit conversion (kilograms to grams)
// Standard: 4.MD.A.1 — know and apply relative sizes of measurement units
function generate2023Q14() {
  const objects = ['metal bar', 'rock', 'piece of wood', 'iron block', 'bag of sand'];
  const obj = pick(objects);
  const kg = randInt(2, 9);

  const pool = shuffle([
    { text: `${(kg * 10).toLocaleString()} grams`,    isCorrect: false }, // ×10 error
    { text: `${(kg * 100).toLocaleString()} grams`,   isCorrect: false }, // ×100 error
    { text: `${(kg * 1000).toLocaleString()} grams`,  isCorrect: true  }, // ×1000 correct
    { text: `${(kg * 10000).toLocaleString()} grams`, isCorrect: false }, // ×10000 error
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '14',
    answer_type: 'multiple_choice',
    question_text: `A ${obj} has a mass of ${kg} kilograms.\n\n Which of these is the mass, in <strong>grams</strong>, of the ${obj}?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer: correctLetter,
  };
}

// 2023 Q15: MultipleChoice — perimeter equation for a rectangle
// Standard: 4.MD.A.3 — apply perimeter formula for rectangles
function generate2023Q15() {
  const w = randInt(2, 12);
  let l;
  // l >= 3 prevents 2+2w+l equalling 2w+2l (which happens only when l=2)
  do { l = randInt(3, 12); } while (l === w);

  const perim   = 2 * w + 2 * l;
  const area    = w * l;
  const halfP   = w + l;
  const wrongC  = 2 + w * 2 + l; // "2 + w × 2 + l" — order-of-operations confusion

  const rawOpts15 = shuffle([
    { text: `${w} + ${l} = ${halfP}`,           isCorrect: false },
    { text: `${w} × ${l} = ${area}`,            isCorrect: false },
    { text: `2 + ${w} × 2 + ${l} = ${wrongC}`, isCorrect: false },
    { text: `2 × ${w} + 2 × ${l} = ${perim}`,  isCorrect: true  },
  ]);
  const ABCD15 = ['A', 'B', 'C', 'D'];
  return {
    question_number: '15',
    answer_type: 'multiple_choice',
    question_text: `A rectangle has a width of ${w} inches and a length of ${l} inches.\n\n Which of these equations shows the perimeter, in inches, of the rectangle?`,
    answer_options: rawOpts15.map((o, i) => ({ letter: ABCD15[i], text: o.text })),
    correct_answer: ABCD15[rawOpts15.findIndex(o => o.isCorrect)],
  };
}

// 2023 Q16: TrueFalseTable — rounding a 5-digit number to nearest hundred/thousand/ten-thousand
// Standard: 4.NBT.A.3 — use place value understanding to round multi-digit whole numbers
function generate2023Q16() {
  let n, roundH, roundTH, roundTTH;
  do {
    n = randInt(11111, 98888);
    roundH   = Math.round(n / 100) * 100;
    roundTH  = Math.round(n / 1000) * 1000;
    roundTTH = Math.round(n / 10000) * 10000;
  } while (n % 100 === 50 || n % 1000 === 500 || n % 10000 === 5000);

  // "Wrong direction" values: flip to the opposite rounding direction
  // Each digit is the one that determines rounding at that place value
  const tensDigit      = Math.floor((n % 100)   / 10);   // tens → nearest hundred
  const hundredsDigit  = Math.floor((n % 1000)  / 100);  // hundreds → nearest thousand
  const thousandsDigit = Math.floor((n % 10000) / 1000); // thousands → nearest ten-thousand

  const wrongH   = tensDigit      >= 5 ? roundH   - 100   : roundH   + 100;
  const wrongTH  = hundredsDigit  >= 5 ? roundTH  - 1000  : roundTH  + 1000;
  const wrongTTH = thousandsDigit >= 5 ? roundTTH - 10000 : roundTTH + 10000;

  // Mix of True/False — never all-true (too easy)
  const patterns = [
    [true,  true,  false],
    [true,  false, true ],
    [false, true,  true ],
    [true,  false, false],
    [false, true,  false],
    [false, false, true ],
  ];
  const [r1, r2, r3] = pick(patterns);

  const nStr = n.toLocaleString();
  return {
    question_number: '16',
    answer_type: 'true_false_table',
    stimulus_intro: `Round the number ${nStr} to the nearest hundred, the nearest thousand, and the nearest ten thousand.`,
    question_text: 'Select "True" or "False" for each statement in the table.',
    statements: [
      { text: `${nStr} rounded to the nearest <strong>hundred</strong> is ${(r1 ? roundH : wrongH).toLocaleString()}.` },
      { text: `${nStr} rounded to the nearest <strong>thousand</strong> is ${(r2 ? roundTH : wrongTH).toLocaleString()}.` },
      { text: `${nStr} rounded to the nearest <strong>ten thousand</strong> is ${(r3 ? roundTTH : wrongTTH).toLocaleString()}.` },
    ],
    correct_answer: [r1, r2, r3].map(v => v ? 'True' : 'False').join(','),
  };
}

// 2023 Q17: MultipleChoice — which total cost is a multiple of the item price?
// Standard: 4.OA.A.3 — solve multistep word problems; interpret remainders
function generate2023Q17() {
  const SETTINGS = [
    {
      place: 'the cafeteria',
      activity: 'eat lunch in the cafeteria',
      items: [
        { price: 3, item: 'juice boxes'   },
        { price: 4, item: 'granola bars'  },
        { price: 5, item: 'sandwiches'    },
        { price: 6, item: 'meal kits'     },
        { price: 7, item: 'boxed lunches' },
        { price: 8, item: 'lunch trays'   },
        { price: 9, item: 'meal deals'    },
      ],
    },
    {
      place: 'the school store',
      activity: 'shop at the school store',
      items: [
        { price: 3, item: 'pencils'        },
        { price: 4, item: 'erasers'        },
        { price: 5, item: 'folders'        },
        { price: 6, item: 'notebooks'      },
        { price: 7, item: 'water bottles'  },
        { price: 8, item: 'pencil pouches' },
        { price: 9, item: 'school hats'    },
      ],
    },
    {
      place: 'the bake sale',
      activity: 'buy treats at the bake sale',
      items: [
        { price: 3, item: 'cookies'    },
        { price: 4, item: 'brownies'   },
        { price: 5, item: 'cupcakes'   },
        { price: 6, item: 'muffins'    },
        { price: 7, item: 'pie slices' },
        { price: 8, item: 'gift boxes' },
        { price: 9, item: 'treat bags' },
      ],
    },
  ];
  const GROUP_WORDS = ['friends', 'classmates', 'teammates', 'neighbors'];

  const setting = pick(SETTINGS);
  const sc = pick(setting.items);
  const { price, item } = sc;
  const group = pick(GROUP_WORDS);
  const groupSingular = group.slice(0, -1); // "friends" → "friend"
  const multiplier = randInt(5, 14);
  const correct = price * multiplier;

  // Build 3 non-multiples near correct
  const candidates = [];
  for (let delta = -8; delta <= 8; delta++) {
    if (delta === 0) continue;
    const v = correct + delta;
    if (v > 0 && v % price !== 0) candidates.push(v);
  }
  const distractors = shuffle([...new Set(candidates)]).slice(0, 3);

  const pool = shuffle([
    { val: correct,        isCorrect: true  },
    { val: distractors[0], isCorrect: false },
    { val: distractors[1], isCorrect: false },
    { val: distractors[2], isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '17',
    answer_type: 'multiple_choice',
    stimulus_intro: `A group of ${group} are going to ${setting.activity}.`,
    stimulus_list: [
      `At ${setting.place}, ${item} cost $${price} each.`,
      `Each ${groupSingular} in the group will buy one.`,
    ],
    question_text: `Which of these could be the <strong>total</strong> cost for all the ${group} in the group?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: `$${o.val}` })),
    correct_answer: correctLetter,
    // The per-item price lives inside stimulus_list (plain display strings),
    // not stimulus_params, so the generic extractor can't pull it out —
    // without this the LLM has no number to build a skip-counting/
    // factor-pair technique around at all.
    _params: {
      price: String(price),
      groupSingular
    }
  };
}

// 2023 Q20: MultipleChoice — fraction × whole number (bags of product)
// Standard: 4.NF.B.4b — multiply a fraction by a whole number
function generate2023Q20() {
  // All cases produce a whole-number result
  const CASES = [
    { num: 3, denom: 4, bags: 8,  item: 'beans'    },
    { num: 1, denom: 2, bags: 6,  item: 'flour'    },
    { num: 2, denom: 3, bags: 9,  item: 'rice'     },
    { num: 1, denom: 4, bags: 8,  item: 'sugar'    },
    { num: 3, denom: 5, bags: 10, item: 'oats'     },
    { num: 2, denom: 5, bags: 10, item: 'seeds'    },
    { num: 3, denom: 4, bags: 4,  item: 'nuts'     },
    { num: 1, denom: 3, bags: 6,  item: 'cornmeal' },
    { num: 2, denom: 3, bags: 6,  item: 'lentils'  },
  ];
  const c = pick(CASES);
  const { num, denom, bags, item } = c;
  const correct = (num * bags) / denom; // whole number by CASES design

  // Distractor A: bags ÷ denom then append numerator as fraction
  //   (error: divide bags by denominator, ignore that numerator multiplies)
  const whole1 = Math.floor(bags / denom);
  const d1Text = `${whole1}[${num}/${denom}]`;

  // Distractor B: bags + n/denom as mixed number (add instead of multiply)
  const d2Text = `${bags}[${num}/${denom}]`;

  // Distractor C: add all numbers together (num + denom + bags)
  const d3Text = String(num + denom + bags);

  const pool = shuffle([
    { text: String(correct), isCorrect: true  },
    { text: d1Text,          isCorrect: false },
    { text: d2Text,          isCorrect: false },
    { text: d3Text,          isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '20',
    answer_type: 'multiple_choice',
    question_text: `A market sells ${item} in bags. Each bag has [${num}/${denom}] pound of ${item}. How many pounds of ${item} are in ${bags} bags altogether?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer: correctLetter,
  };
}

// 2021 Q3: MultipleSelect + DecimalGrid — which decimals equal 80/100?
// The 10×10 grid has N cells shaded (where N is a multiple of 10: 10–90).
// Students must pick the two decimals that equal N/100.
// Distractors: shift the decimal left/right by one or two places.
function generate2021Q3() {
  // Valid shaded counts: multiples of 10 from 10 to 90 (fraction < 1, as stated)
  const shadedOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  const shaded = pick(shadedOptions);

  // The fraction: shaded/100
  // Canonical decimal: e.g. 80/100 = 0.8
  const tensDigit = shaded / 10; // 1–9
  // The two correct representations: 0.N0 and 0.N (trailing-zero equivalence)
  const correct1 = `0.${tensDigit}0`;   // e.g. "0.80"
  const correct2 = `0.${tensDigit}`;    // e.g. "0.8"

  // Distractors — named student errors:
  //   D1: shift decimal right one place → whole number (8.0)   "place value off by 10×"
  //   D2: shift decimal right two places → integer (80)        not used here; TestNav uses 80.0
  //   D3: shift decimal left one place → hundredths (0.08)     "interprets as hundredths, not tenths"
  const distractor1 = `${tensDigit}.0`;          // e.g. "8.0"   — treated as tenths*10
  const distractor2 = `${tensDigit * 10}.0`;     // e.g. "80.0"  — treated as whole number
  const distractor3 = `0.0${tensDigit}`;         // e.g. "0.08"  — hundredths confusion

  const rawOpts3 = shuffle([
    { text: correct1,    isCorrect: true  },
    { text: distractor1, isCorrect: false },
    { text: distractor3, isCorrect: false },
    { text: distractor2, isCorrect: false },
    { text: correct2,    isCorrect: true  },
  ]);
  const ABCDE3 = ['A', 'B', 'C', 'D', 'E'];
  const options = rawOpts3.map((o, i) => ({ letter: ABCDE3[i], text: o.text, isCorrect: o.isCorrect }));
  const correctLetters = options.filter(o => o.isCorrect).map(o => o.letter).sort().join(',');

  return {
    item_id: 'MA229063',
    question_number: '3',
    answer_type: 'multiple_select',
    select_count: 2,
    stimulus_intro: 'The shaded portion of this model represents a fraction less than 1.',
    stimulus_type: 'decimal_grid',
    stimulus_params: { shaded, show_whole: true },
    math_expression: null,
    question_text: 'Which of these decimals are equivalent to the fraction represented in the model?',
    answer_options: options.map(({ letter, text }) => ({ letter, text })),
    parts: null,
    correct_answer: correctLetters,
  };
}

// 2021 Q4: MultipleChoice — multiply a whole number by a unit fraction (word problem)
// Ms. Lewis bought N sticks of butter, each weighing 1/D pound.
// Correct: N/D  (N × 1/D = N/D)
// Distractors:
//   B — (N+1)/D  : adds 1 to numerator instead of multiplying (counting-on error)
//   C — 1/(N×D) : multiplies denominators, ignores numerator (fraction × fraction confusion)
//   D — N/(N×D) : multiplies both numerator and denominator by N (scales both parts equally)
function generate2021Q4() {
  // Choose a whole number of sticks (count) and a unit-fraction denominator
  const counts = [3, 4, 5, 6, 7, 8];
  const denoms = [3, 4, 5, 6, 8, 10];

  const count = pick(counts);
  const denom = pick(denoms);

  // Correct answer: count/denom
  const correctNum = count;
  const correctDen = denom;

  // Distractors
  const bNum = count + 1;  const bDen = denom;            // counting-on error
  const cNum = 1;          const cDen = count * denom;    // multiply denominators
  const dNum = count;      const dDen = count * denom;    // multiply both

  // Items context variety
  const items = [
    { noun: 'sticks of butter', singular: 'stick of butter', unit: 'pound', unit_plural: 'pounds', verb: 'bought',     measure: 'weighs', measure_suffix: '',      quantity: 'weight' },
    { noun: 'bags of flour',    singular: 'bag of flour',    unit: 'pound', unit_plural: 'pounds', verb: 'bought',     measure: 'weighs', measure_suffix: '',      quantity: 'weight' },
    { noun: 'pieces of ribbon', singular: 'piece of ribbon', unit: 'foot',  unit_plural: 'feet',   verb: 'cut',        measure: 'is',     measure_suffix: ' long', quantity: 'length' },
    { noun: 'jars of honey',    singular: 'jar of honey',    unit: 'pound', unit_plural: 'pounds', verb: 'purchased',  measure: 'weighs', measure_suffix: '',      quantity: 'weight' },
  ];
  const item = pick(items);
  const person = pick(PEOPLE);

  const subject = person.name;

  const questionText =
    `${subject} ${item.verb} ${count} ${item.noun}. Each ${item.singular} ${item.measure} ` +
    `[1/${denom}] ${item.unit}${item.measure_suffix}.\n\nWhat is the total ${item.quantity}, in ${item.unit_plural}, of the ${count} ${item.noun}?`;

  const rawOpts4 = shuffle([
    { text: `[${correctNum}/${correctDen}]`, isCorrect: true  },
    { text: `[${bNum}/${bDen}]`,             isCorrect: false },
    { text: `[${cNum}/${cDen}]`,             isCorrect: false },
    { text: `[${dNum}/${dDen}]`,             isCorrect: false },
  ]);
  const ABCD4 = ['A', 'B', 'C', 'D'];
  return {
    item_id: 'MA297973',
    question_number: '4',
    answer_type: 'multiple_choice',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    question_text: questionText,
    answer_options: rawOpts4.map((o, i) => ({ letter: ABCD4[i], text: o.text })),
    parts: null,
    select_count: null,
    correct_answer: ABCD4[rawOpts4.findIndex(o => o.isCorrect)],
  };
}

// 2021 Q5: MultipleSelect — identify prime numbers from a list of 5 (select two)
// Correct: exactly 2 primes from the 5 options
// Distractors (non-primes):
//   Odd composite ending in 7-digit: looks prime but has factors (e.g. 27 = 3×9, 49 = 7×7)
//   Even number: clearly composite but students may overlook (e.g. 52 = 4×13)
//   Odd composite: looks prime at a glance (e.g. 95 = 5×19)
function generate2021Q5() {
  // Pool of primes in range 20–99 (suitable for 4th grade)
  const primesPool = [23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

  // Pool of composite non-primes — categorized by student error type
  // Odd composites that "look" prime (no obvious small factor visible):
  const oddComposites = [27, 33, 35, 49, 51, 57, 63, 65, 69, 77, 81, 85, 87, 91, 93, 95];
  // Even composites (clearly divisible by 2 but students may confuse):
  const evenComposites = [22, 26, 34, 38, 46, 52, 58, 62, 74, 82, 86, 94, 98];

  // Pick 2 distinct primes
  const shuffledPrimes = shuffle(primesPool);
  const prime1 = shuffledPrimes[0];
  const prime2 = shuffledPrimes[1];

  // Pick 3 distractors: 2 odd composites, 1 even composite
  const shuffledOdd = shuffle(oddComposites);
  const shuffledEven = shuffle(evenComposites);
  const dist1 = shuffledOdd[0]; // odd composite — "looks prime"
  const dist2 = shuffledOdd[1]; // another odd composite
  const dist3 = shuffledEven[0]; // even composite

  // Arrange all 5 in ascending order (matches TestNav display style)
  const all = [
    { value: prime1, isCorrect: true },
    { value: prime2, isCorrect: true },
    { value: dist1,  isCorrect: false },
    { value: dist2,  isCorrect: false },
    { value: dist3,  isCorrect: false },
  ].sort((a, b) => a.value - b.value);

  const letters = ['A', 'B', 'C', 'D', 'E'];
  const options = all.map((item, i) => ({
    letter: letters[i],
    text: String(item.value),
    isCorrect: item.isCorrect,
  }));

  const correctLetters = options
    .filter(o => o.isCorrect)
    .map(o => o.letter)
    .join(',');

  return {
    item_id: 'MA800628900',
    question_number: '5',
    answer_type: 'multiple_select',
    select_count: 2,
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    question_text: 'Which of these numbers are prime numbers?',
    answer_options: options.map(({ letter, text }) => ({ letter, text })),
    parts: null,
    correct_answer: correctLetters,
  };
}

// 2021 Q6 — Multi-part constructed response: place value (standard form, expanded form, comparison, 1,000 more)
// The number words, base number, and comparison target are all varied algorithmically.
// Parts: A = word form → standard form, B = standard form → expanded form,
//        C = compare Part A and Part B numbers, D = find 1,000 more than a given number.
function generate2021Q6() {
  // Pick a 6-digit number with non-zero digits in each place for clarity.
  // Structure: H_thousands * 1000 + ten_thousands * 10000 + hundreds * 100 + tens * 10 + ones
  // Keep it near 168,000 range but vary each part.
  const hundredThousands = randInt(1, 3);
  const tenThousands = randInt(1, 9);
  const thousands = randInt(1, 9);
  const hundreds = randInt(1, 9);
  const tens = randInt(1, 9);
  const ones = randInt(1, 9);

  // Part A number (word form → standard form)
  const partAValue = hundredThousands * 100000 + tenThousands * 10000 + thousands * 1000 + hundreds * 100 + tens * 10 + ones;

  // Part B number: same hundred-thousands and ten-thousands, but different lower digits
  // to ensure a meaningful but close comparison
  const partBThousands = randInt(1, 9);
  const partBHundreds = randInt(1, 9);
  const partBTens = randInt(1, 9);
  const partBOnes = randInt(1, 9);
  const partBValue = hundredThousands * 100000 + tenThousands * 10000 + partBThousands * 1000 + partBHundreds * 100 + partBTens * 10 + partBOnes;

  // Part D number: a separate 6-digit number near the same range (used as the "given" number)
  const partDGiven = hundredThousands * 100000 + tenThousands * 10000 + randInt(1, 9) * 1000 + randInt(0, 9) * 100 + randInt(0, 9) * 10 + randInt(1, 9);
  const partDAnswer = partDGiven + 1000;

  // Word form helpers
  const ones_words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const tens_words = ['', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

  function tensAndOnes(t, o) {
    if (t === 1) return teens[o];
    if (t === 0 && o === 0) return '';
    if (t === 0) return ones_words[o];
    if (o === 0) return tens_words[t];
    return tens_words[t] + '-' + ones_words[o];
  }

  function threeDigits(h, t, o) {
    let result = '';
    if (h > 0) result += ones_words[h] + ' hundred';
    const to = tensAndOnes(t, o);
    if (to) result += (result ? ' ' : '') + to;
    return result;
  }

  function numberToWords(n) {
    const ht = Math.floor(n / 100000);
    const rem5 = n % 100000;
    const tth = Math.floor(rem5 / 10000);
    const rem4 = rem5 % 10000;
    const th = Math.floor(rem4 / 1000);
    const rem3 = rem4 % 1000;
    const h = Math.floor(rem3 / 100);
    const t = Math.floor((rem3 % 100) / 10);
    const o = rem3 % 10;

    let parts = [];
    const thousandPart = ht * 100 + tth * 10 + th;
    if (thousandPart > 0) {
      parts.push(threeDigits(ht, tth, th) + ' thousand');
    }
    const remainderPart = threeDigits(h, t, o);
    if (remainderPart) parts.push(remainderPart);
    return parts.join(', ');
  }

  // Expanded form of partBValue
  function expandedForm(n) {
    const ht = Math.floor(n / 100000);
    const rem5 = n % 100000;
    const tth = Math.floor(rem5 / 10000);
    const rem4 = rem5 % 10000;
    const th = Math.floor(rem4 / 1000);
    const rem3 = rem4 % 1000;
    const h = Math.floor(rem3 / 100);
    const t = Math.floor((rem3 % 100) / 10);
    const o = rem3 % 10;
    const parts = [];
    if (ht) parts.push(`${ht * 100000}`);
    if (tth) parts.push(`${tth * 10000}`);
    if (th) parts.push(`${th * 1000}`);
    if (h) parts.push(`${h * 100}`);
    if (t) parts.push(`${t * 10}`);
    if (o) parts.push(`${o}`);
    return parts.join(' + ');
  }

  const wordForm = numberToWords(partAValue);
  const partAFormatted = partAValue.toLocaleString('en-US');
  const partBFormatted = partBValue.toLocaleString('en-US');
  const partDGivenFormatted = partDGiven.toLocaleString('en-US');
  const partDAnswerFormatted = partDAnswer.toLocaleString('en-US');
  const partBExpanded = expandedForm(partBValue);

  let comparison;
  if (partAValue < partBValue) comparison = '<';
  else if (partAValue > partBValue) comparison = '>';
  else comparison = '=';

  return {
    item_id: 'MA800780932',
    question_number: '6',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: 'This question has four parts.',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    parts: [
      {
        label: 'A',
        question_text: 'Write this number in standard form.',
        stimulus_type: 'number_box',
        stimulus_params: { rows: [[wordForm]] },
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer in the box.',
        correct_answer: String(partAValue),
      },
      {
        label: 'B',
        question_text: `Write the number ${partBFormatted} in expanded form.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer in the space provided.',
        correct_answer: partBExpanded,
      },
      {
        label: 'C',
        question_text: `Use >, <, or = to write a comparison of the two numbers in Part A and Part B. Explain how you got your answer.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer and your explanation in the space provided.',
        correct_answer: comparison,
      },
      {
        label: 'D',
        question_text: `Write a number that is 1,000 greater than the number ${partDGivenFormatted}. Explain how you got your answer.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer and your explanation in the space provided.',
        correct_answer: String(partDAnswer),
      },
    ],
    select_count: null,
    correct_answer: {
      A: String(partAValue),
      B: partBExpanded,
      C: comparison,
      D: String(partDAnswer),
    },
  };
}

// ─── 2021 Q7: MultipleChoice — area of a square ──────────────────────────────
//
// A real-world object is in the shape of a square. Each side has a given length.
// Student must find the area (side × side), not the perimeter.
//
// Distractors target three named errors:
//   A: "Two-side sum" — student adds two sides (side + side = 2×side), confusing
//      area with adding two lengths.
//   B: "Perimeter" — student multiplies side by 4 (finds perimeter instead of area),
//      a very common 4th-grade misconception.
//   D: "Wrong factor" — student multiplies side by (side+2) or some nearby wrong
//      value, a procedural slip.
//
// Side lengths chosen from squares where the correct answer and distractors are
// all distinct and plausible-looking (no fractions, no overlap with distractors).
function generate2021Q7() {
  const scenarios = [
    { object: 'sign',     unit: 'inch' },
    { object: 'window',   unit: 'inch' },
    { object: 'tile',     unit: 'inch' },
    { object: 'mat',      unit: 'foot' },
    { object: 'poster',   unit: 'inch' },
    { object: 'rug',      unit: 'foot' },
    { object: 'painting', unit: 'inch' },
  ];
  // Side lengths 3–9 keep arithmetic manageable for 4th graders.
  // Exclude 4: area=16 equals perimeter=16, causing B=C collision.
  const sideLengths = [3, 5, 6, 7, 8, 9];

  const scenario = pick(scenarios);
  const side = pick(sideLengths);
  const area = side * side;          // correct
  const perimeter = 4 * side;       // distractor B: computes perimeter
  const twoSide = 2 * side;         // distractor A: adds two sides
  const wrongFactor = side * (side + 2); // distractor D: multiplies by side+2

  const unitLabel = scenario.unit === 'inch' ? 'square inches' : 'square feet';

  const rawOpts7 = shuffle([
    { text: `${twoSide} ${unitLabel}`,     isCorrect: false },
    { text: `${perimeter} ${unitLabel}`,   isCorrect: false },
    { text: `${area} ${unitLabel}`,        isCorrect: true  },
    { text: `${wrongFactor} ${unitLabel}`, isCorrect: false },
  ]);
  const ABCD7 = ['A', 'B', 'C', 'D'];
  return {
    item_id: 'MA306940',
    question_number: '7',
    answer_type: 'multiple_choice',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    question_text: `A ${scenario.object} is in the shape of a square. Each side of the ${scenario.object} has a length of ${side} ${scenario.unit}s.\n\nWhat is the area of the ${scenario.object}?`,
    answer_options: rawOpts7.map((o, i) => ({ letter: ABCD7[i], text: o.text })),
    parts: null,
    select_count: null,
    correct_answer: ABCD7[rawOpts7.findIndex(o => o.isCorrect)],
  };
}

// ─── 2021 Q8: Lines of Symmetry — Sort Shapes ─────────────────────────────────
// Fixed question: 4 geometric shapes (trapezoid, parallelogram, rectangle, square)
// are sorted into 4 categories by number of lines of symmetry (0, 1, 2, 4).
// The math is fixed (these shapes have a definite number of lines of symmetry),
// so the generator returns the canonical question each time.
// Distractor reasoning (why each category exists):
//   0 lines: trapezoid and parallelogram — students may guess symmetric because
//            they look "balanced," but neither has a fold that produces matching halves.
//   1 line:  empty bucket — students may mistakenly place the trapezoid here
//            thinking the vertical midline is a line of symmetry.
//   2 lines: rectangle — horizontal and vertical axes only; NOT the diagonals.
//   4 lines: square — horizontal, vertical, and both diagonals.
function generate2021Q8() {
  // Tile shape params (shared between tile bank and category correct_tiles)
  const trapezoid = {
    label: 'trapezoid',
    shape: { shape: { type: 'polygon', vertices: [[-30,-35],[30,-35],[50,35],[-50,35]] }, padding: 12 },
  };
  const parallelogram = {
    label: 'parallelogram',
    shape: { shape: { type: 'polygon', vertices: [[-50,-30],[30,-30],[50,30],[-30,30]] }, padding: 12 },
  };
  const rectangle = {
    label: 'rectangle',
    shape: { shape: { type: 'rect', width: 100, height: 60 }, padding: 12 },
  };
  const square = {
    label: 'square',
    shape: { shape: { type: 'square', size: 70 }, padding: 12 },
  };

  return {
    item_id: 'MA800629956',
    question_number: '8',
    answer_type: 'category_sort',
    question_text: 'Determine the number of lines of symmetry for each shape.\n\nDrag and drop each shape into the correct box to show the number of lines of symmetry the shape has.',
    tiles: [trapezoid, parallelogram, rectangle, square],
    categories: [
      { label: '0 lines of symmetry', correct_tiles: [trapezoid, parallelogram] },
      { label: '1 line of symmetry',  correct_tiles: [] },
      { label: '2 lines of symmetry', correct_tiles: [rectangle] },
      { label: '4 lines of symmetry', correct_tiles: [square] },
    ],
    parts: null,
    select_count: null,
    correct_answer: '{"0 lines of symmetry": ["parallelogram", "trapezoid"], "1 line of symmetry": [], "2 lines of symmetry": ["rectangle"], "4 lines of symmetry": ["square"]}',
    // Fixed content — this generator never randomizes (same 4 shapes every time).
    _params: {
      categorySummary: 'trapezoid and parallelogram have 0 lines of symmetry; rectangle has 2 lines of symmetry; square has 4 lines of symmetry',
    },
  };
}

function generate2021Q9() {
  // Q9 (2021): Complete a line plot of snowfall (in inches) for 8 towns.
  // 7 distinct quarter-inch positions (¼–2¾); one appears twice — that's the missing mark.
  // data_point labels must use unsimplified form ('1[2/4]' not '1[1/2]') to match the
  // tick labels the DragDropLinePlot component generates.

  const DEN = 4;

  // Quarter steps ¼–2¾ (steps 1–11, avoiding 0 and 3 as edge values)
  const allSteps = [1,2,3,4,5,6,7,8,9,10,11];

  // Tick label as component generates it (unsimplified)
  function tickLabel(step) {
    const whole = Math.floor(step / DEN);
    const rem   = step % DEN;
    if (rem === 0)    return String(whole);
    if (whole === 0)  return `[${rem}/${DEN}]`;
    return `${whole}[${rem}/${DEN}]`;
  }

  // Display label for the student list (simplified ½ etc.)
  function displayLabel(step) {
    const whole = Math.floor(step / DEN);
    const rem   = step % DEN;
    if (rem === 0) return String(whole);
    const sNum = rem === 2 ? 1 : rem;
    const sDen = rem === 2 ? 2 : DEN;
    if (whole === 0) return `[${sNum}/${sDen}]`;
    return `${whole}[${sNum}/${sDen}]`;
  }

  // Pick 6 distinct positions → 8 readings total with 2 positions each appearing twice.
  // This matches the original: some snowfall amounts naturally appear more than once,
  // and the missing mark is a second reading at one of those doubled positions.
  const positions = shuffle(allSteps).slice(0, 6).sort((a, b) => a - b);

  // Give count=2 to 2 distinct positions chosen at random
  const doubleIdxs = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2);
  const counts = positions.map((_, i) => doubleIdxs.includes(i) ? 2 : 1);

  // Missing mark is one of the two doubled positions
  const missingIdx   = doubleIdxs[randInt(0, 1)];
  const missingStep  = positions[missingIdx];
  const missingLabel = tickLabel(missingStep);

  const data_points = positions.map((step, i) => ({
    label: tickLabel(step),
    count: counts[i],
  }));

  // Build the shuffled list of all 8 values for the student to read
  const allValues = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < counts[i]; j++) {
      allValues.push(displayLabel(positions[i]));
    }
  }
  const math_expression = shuffle(allValues).join(',  ');

  return {
    item_id: 'MA800763292',
    question_number: '9',
    stimulus_intro: 'This list shows the snowfall amounts, in inches, for eight towns during a storm.',
    stimulus_type: null,
    stimulus_params: {
      title: 'Snowfall Amounts',
      axis_label: 'Snowfall (inches)',
      min: 0,
      max: 3,
      denominator: DEN,
      missing_label: missingLabel,
      data_points,
    },
    math_expression,
    answer_type: 'drag_drop_line_plot',
    question_text:
      'This line plot also shows some of the snowfall amounts. One of the snowfall amounts is missing from the line plot.\n\n' +
      'Drag and drop the X into the correct box above the number line to complete the line plot.',
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: missingLabel,
  };
}

function generate2021Q10() {
  // Q10 (2021): Find the missing addend in a 3-digit addition equation.
  // The equation has the form: sum = known + {?}
  // Correct answer: sum - known
  //
  // Distractors:
  //   B: student adds tens-digit wrong by 10 (off-by-one tens error)
  //   C: student subtracts hundreds only, ignores tens/ones (e.g. 300 - 147 = 153, no — use: subtracts known from wrong sum)
  //   D: student adds the two given numbers instead of subtracting (sum + known)

  // Randomize: keep structure of test item but vary the numbers
  // sum in 200–600, known in 100–sum-50, ensuring nice subtraction
  const sums = [325, 412, 508, 347, 463, 521, 384, 456, 514, 602];
  const knownOffsets = [147, 163, 219, 184, 257, 238, 165, 193, 276, 248];
  const idx = randInt(0, sums.length - 1);
  const sum = sums[idx];
  const known = knownOffsets[idx];
  const correct = sum - known;

  // Distractor B: off by 10 in the tens place (student mis-borrows)
  const distractorB = correct + 10;
  // Distractor C: student subtracts hundreds digit only (ignores tens/ones)
  const distractorC = (Math.floor(sum / 100) * 100) - (Math.floor(known / 100) * 100) + (sum % 100);
  // If distractorC collides with correct or B, nudge it
  const safeC = (distractorC === correct || distractorC === distractorB) ? correct - 100 : distractorC;
  // Distractor D: student adds sum + known instead of subtracting
  const distractorD = sum + known;

  const rawOpts10 = shuffle([
    { text: String(correct),     isCorrect: true  },
    { text: String(distractorB), isCorrect: false },
    { text: String(safeC),       isCorrect: false },
    { text: String(distractorD), isCorrect: false },
  ]);
  const ABCD10 = ['A', 'B', 'C', 'D'];
  return {
    item_id: 'MA270627',
    question_number: '10',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: `${sum} = ${known} + {?}`,
    answer_type: 'multiple_choice',
    question_text: 'What is the value of {?} that makes this number sentence true?',
    answer_options: rawOpts10.map((o, i) => ({ letter: ABCD10[i], text: o.text })),
    parts: null,
    select_count: null,
    correct_answer: ABCD10[rawOpts10.findIndex(o => o.isCorrect)],
  };
}

function generate2021Q11() {
  // Q11 (2021): Find the Nth term of a multiply-by-K pattern starting at S.
  // The correct answer is S × K^(N-1).
  // The generator varies start, multiplier, and which term is asked for.
  //
  // Pedagogically motivated distractors:
  //   B: student adds K instead of multiplying (arithmetic pattern error)
  //   C: student multiplies correctly but asks for term N-1 (off-by-one error)
  //   D: student uses K^N instead of K^(N-1) (index-by-one error, too large)

  // Vary starting value and multiplier
  const configs = [
    { start: 2, mult: 3, term: 5 },  // original test item: 2,6,18,54,162
    { start: 3, mult: 2, term: 5 },  // 3,6,12,24,48
    { start: 1, mult: 4, term: 4 },  // 1,4,16,64
    { start: 2, mult: 4, term: 4 },  // 2,8,32,128
    { start: 5, mult: 2, term: 5 },  // 5,10,20,40,80
    { start: 3, mult: 3, term: 4 },  // 3,9,27,81
    { start: 4, mult: 2, term: 5 },  // 4,8,16,32,64
    { start: 2, mult: 5, term: 4 },  // 2,10,50,250
  ];
  const cfg = pick(configs);
  const { start, mult, term } = cfg;

  // Build the sequence up to term
  const seq = [start];
  for (let i = 1; i < term; i++) seq.push(seq[i - 1] * mult);
  const correct = seq[term - 1];

  // Ordinal labels
  const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const termLabel = ordinals[term] || `${term}th`;

  // Distractors
  // B: arithmetic mistake — adds mult each time instead of multiplying
  const addDistractor = start + mult * (term - 1);
  // C: off-by-one — gives term (N-1) instead of term N
  const offByOne = seq[term - 2];
  // D: index error — multiplies one extra time (S × mult^term instead of mult^(N-1))
  const tooLarge = correct * mult;

  // Build options ensuring no duplicates; correct is always A
  const distractors = [addDistractor, offByOne, tooLarge];
  // Deduplicate: if any distractor equals correct or each other, nudge it
  const seen = new Set([correct]);
  const safeDistractors = distractors.map(d => {
    let v = d;
    while (seen.has(v)) v += mult;
    seen.add(v);
    return v;
  });

  return {
    item_id: 'MA803730594',
    question_number: '11',
    stimulus_intro: `The rule for a pattern is \u201cmultiply by ${mult}.\u201d The first number in the pattern is ${start}.`,
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    answer_type: 'short_answer',
    question_text: `What is the <strong>${termLabel}</strong> number in the pattern?`,
    input_widget: 'text',
    answer_suffix: null,
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: String(correct),
  };
}

// ─── 2021 Q12: Equivalent fractions — find x in N/10 = x/100 ────────────────
function generate2021Q12() {
  // Original: 7/10 = x/100, answer 70.
  // Standard 4.NF.C.6 caps denominators at 10 or 100 for 4th grade (thousandths is
  // 5th-grade content), so only the 10↔100 pair is used.
  // Direction: forward (x in larger denom) or reverse (x in smaller denom).

  const pair = { small: 10, large: 100, factor: 10 };

  // N = numerator of the small-denominator fraction (avoid values that make x > 999)
  const maxN = Math.floor(999 / pair.factor);
  const N = randInt(1, Math.min(9, maxN));
  const X = N * pair.factor;   // numerator of the large-denominator fraction

  const reverse = randInt(0, 1) === 1;

  return {
    item_id: 'MA736379417',
    question_number: '12',
    stimulus_intro: 'What value of x makes this equation true?',
    stimulus_type: null,
    stimulus_params: null,
    math_expression: reverse
      ? `[x/${pair.small}] = [${X}/${pair.large}]`
      : `[${N}/${pair.small}] = [x/${pair.large}]`,
    answer_type: 'short_answer',
    question_text: null,
    input_widget: 'text',
    answer_suffix: null,
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: reverse ? String(N) : String(X),
  };
}

// 2021 Q13: MultipleSelect — identify triangles with at least one obtuse angle
function generate2021Q13() {
  // This question uses fixed triangle images — the shapes are static SVG polygons.
  // The question itself is not algorithmically varied because the specific triangles
  // (their angles) define the concept being tested.
  //
  // Triangle breakdown:
  //   A — right triangle (right angle at top-right): NOT obtuse
  //   B — very wide flat triangle (large obtuse angle at top): IS obtuse  ✓
  //   C — equilateral-looking acute triangle: NOT obtuse
  //   D — inverted wide triangle with right angle at bottom: NOT obtuse
  //   E — scalene triangle with clear obtuse angle at top-left: IS obtuse ✓

  const rawTris13 = shuffle([
    { vertices: [[-38,-48],[32,60],[32,-48]],    isCorrect: false }, // right triangle
    { vertices: [[-120,22],[120,22],[0,-22]],     isCorrect: true  }, // very wide obtuse
    { vertices: [[0,-52],[46,36],[-46,36]],       isCorrect: false }, // equilateral-looking
    { vertices: [[-70,-28],[70,-28],[0,32]],      isCorrect: false }, // inverted with right angle
    { vertices: [[-70,-60],[70,80],[-50,80]],     isCorrect: true  }, // scalene obtuse
  ]);
  const ABCDE13 = ['A', 'B', 'C', 'D', 'E'];
  return {
    item_id: 'MA311574',
    question_number: '13',
    answer_type: 'multiple_select',
    select_count: 2,
    question_text: 'Which of these triangles have at least one obtuse angle?',
    answer_options: rawTris13.map((t, i) => ({ letter: ABCDE13[i], shape: { type: 'polygon', vertices: t.vertices } })),
    parts: null,
    correct_answer: ABCDE13.filter((_, i) => rawTris13[i].isCorrect).join(','),
    _params: {
      correctLetters: ABCDE13.filter((_, i) => rawTris13[i].isCorrect).join(', '),
    },
  };
}

// 2021 Q14 (MA287484): Multi-part constructed response — reading an analog clock and adding/subtracting time intervals
//
// This is a fixed-stimulus item: the clock shows 7:00 a.m. and all four parts derive from that time.
// We vary the person name, the departure offset (Part B), the school departure time (Part C, whole hours),
// and the homework duration (Part D, multiples of 5 minutes). All arithmetic remains 4th-grade appropriate.
//
// Part A: Read the clock → report wake-up time (fixed in original: 7:00 a.m.)
// Part B: Add hours + minutes to wake-up time → school departure
// Part C: Subtract whole hours from school end time → lunch time
// Part D: Subtract minutes from TV show start time → latest homework start
function generate2021Q14() {
  const PEOPLE = [
    { name: 'Cary',   pronoun: 'he', poss: 'his' },
    { name: 'Mia',    pronoun: 'she', poss: 'her' },
    { name: 'Jordan', pronoun: 'they', poss: 'their' },
    { name: 'Sam',    pronoun: 'he', poss: 'his' },
    { name: 'Priya',  pronoun: 'she', poss: 'her' },
    { name: 'Alex',   pronoun: 'they', poss: 'their' },
  ];
  const person = pick(PEOPLE);

  // Wake-up time: hour between 6 and 9 a.m., always on the hour (clock reads cleanly)
  const wakeHour = randInt(6, 9);
  const wakeMinute = 0;

  // Part B: departure offset — 1 hour + N*15 minutes (N = 0,1,2,3 → 0,15,30,45 min)
  const departOffsetHours = 1;
  const departOffsetMinutes = pick([0, 15, 30, 45]);
  let departHour = wakeHour + departOffsetHours;
  let departMinute = wakeMinute + departOffsetMinutes;
  if (departMinute >= 60) { departHour += 1; departMinute -= 60; }
  const departTimeStr = `${departHour}:${departMinute.toString().padStart(2, '0')} a.m.`;
  const departOffsetStr = departOffsetMinutes === 0
    ? '1 hour'
    : `1 hour and ${departOffsetMinutes} minutes`;

  // Part C: left school at H:M p.m. (hours 2–4, minute options: 20, 30, 40, 50)
  // Use 24-hour arithmetic internally, then convert back to 12-hour for display.
  const leftSchoolHour12 = randInt(2, 4);   // 2, 3, or 4 p.m.
  const leftSchoolHour24 = leftSchoolHour12 + 12;  // 14, 15, or 16
  const leftSchoolMinute = pick([20, 30, 40, 50]);
  const lunchOffsetHours = randInt(3, 5);  // whole hours before leaving school
  // lunchHour24 = leftSchoolHour24 - offset: range 14-3=11 … 16-5=11 → 9..13
  const lunchHour24 = leftSchoolHour24 - lunchOffsetHours;
  const lunchHour12 = lunchHour24 > 12 ? lunchHour24 - 12 : lunchHour24;
  const lunchAmPm = lunchHour24 < 12 ? 'a.m.' : 'p.m.';
  const leftSchoolTimeStr = `${leftSchoolHour12}:${leftSchoolMinute.toString().padStart(2, '0')}`;
  const lunchTimeStr = `${lunchHour12}:${leftSchoolMinute.toString().padStart(2, '0')} ${lunchAmPm}`;

  // Part D: TV show time 5:00–6:30 p.m. (options: 5:00, 5:30, 6:00, 6:30)
  const showOptions = [{ h: 5, m: 0 }, { h: 5, m: 30 }, { h: 6, m: 0 }, { h: 6, m: 30 }];
  const show = pick(showOptions);
  // Homework duration: 30, 45, or 60 minutes
  const hwMinutes = pick([30, 45, 60]);
  let hwStartHour = show.h;
  let hwStartMinute = show.m - hwMinutes;
  if (hwStartMinute < 0) { hwStartHour -= 1; hwStartMinute += 60; }
  const showTimeStr = `${show.h}:${show.m.toString().padStart(2, '0')}`;
  const hwStartStr = `${hwStartHour}:${hwStartMinute.toString().padStart(2, '0')} p.m.`;

  return {
    item_id: 'MA287484',
    question_number: '14',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: `This clock shows the time that ${person.name} woke up this morning.`,
    stimulus_type: 'clock_face',
    stimulus_params: { hour: wakeHour, minute: wakeMinute },
    parts: [
      {
        label: 'A',
        question_text: `At what time did ${person.name} wake up? Be sure to label your answer with a.m. or p.m.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer in the space provided.',
        correct_answer: `${wakeHour}:${wakeMinute.toString().padStart(2, '0')} a.m.`,
      },
      {
        label: 'B',
        question_text: `${person.name} left for school ${departOffsetStr} after ${person.pronoun} woke up. At what time did ${person.name} leave for school? Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer and your work or explanation in the space provided.',
        correct_answer: departTimeStr,
      },
      {
        label: 'C',
        question_text: `${person.name} left school at ${leftSchoolTimeStr}. ${person.pronoun.charAt(0).toUpperCase() + person.pronoun.slice(1)} ate lunch ${lunchOffsetHours} hours before ${person.pronoun} left school. At what time did ${person.name} eat lunch? Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer and your work or explanation in the space provided.',
        correct_answer: lunchTimeStr,
      },
      {
        label: 'D',
        question_text: `${person.name} has ${hwMinutes} minutes of homework. ${person.poss.charAt(0).toUpperCase() + person.poss.slice(1)} favorite TV show is at ${showTimeStr}. What is the <strong>latest</strong> time ${person.name} can start ${person.poss} homework to be finished at ${showTimeStr}? Show or explain how you got your answer.`,
        answer_type: 'constructed_response',
        answer_instruction: 'Enter your answer and your work or explanation in the space provided.',
        correct_answer: hwStartStr,
      },
    ],
    select_count: null,
    correct_answer: {
      A: `${wakeHour}:${wakeMinute.toString().padStart(2, '0')} a.m.`,
      B: departTimeStr,
      C: lunchTimeStr,
      D: hwStartStr,
    },
  };
}

// ─── 2021 Q15: InlineChoice — two-person pretzel word problem (multistep division) ───
//
// Context: Two people buy items; one buys N times as many as the other.
// Combined total → divide by bag capacity → interpret remainder (ceiling division).
// Two dropdowns: (1) total items, (2) minimum bags needed.
//
// Distractors:
//   Total options: forgets person A (just B's amount), forgets person B (just A's),
//                  adds wrong (A+B without multiplying), correct total, over-count.
//   Bags options: floor division (ignores remainder), ±1 around correct, correct.
function generate2021Q15() {
  // stimulus_intro/stimulus_list are kept SEPARATE (plain sentence + bullet
  // array), matching every other generator's convention — not one combined
  // HTML block. AudioText/renderSpokenFields only understand narrated text
  // through those two fields; a hand-built <p>+<ul><li> HTML blob bypasses
  // both (no highlighting, even though audio for the whole blob still gets
  // synthesized as one opaque string).
  const PAIR_SCENARIOS = [
    {
      person1: 'Alonzo', person2: 'Mindy',
      item: 'pretzels', container: 'bags', containerSingular: 'bag',
      introText: () => 'Alonzo and Mindy are buying pretzels to share with their class. They will put all the pretzels into bags.',
      introList: (a, mult, cap) => [
        `Alonzo buys ${a} pretzels.`,
        `Mindy buys ${mult} times as many pretzels as Alonzo.`,
        `Each bag will hold up to ${cap} pretzels.`,
      ],
      question: (p1, p2) => `${p1} and ${p2} want to know the least number of bags they need to hold all the pretzels.`,
      sentence1: (p1, p2) => `${p1} and ${p2} have a total of [RESPONSE_A1] pretzels.`,
      sentence2: (p1, p2) => `${p1} and ${p2} need [RESPONSE_A2] bags to hold all the pretzels.`,
    },
    {
      person1: 'Carmen', person2: 'Noah',
      item: 'stickers', container: 'bags', containerSingular: 'bag',
      introText: () => 'Carmen and Noah are collecting stickers to share with their class. They will put all the stickers into bags.',
      introList: (a, mult, cap) => [
        `Carmen has ${a} stickers.`,
        `Noah has ${mult} times as many stickers as Carmen.`,
        `Each bag will hold up to ${cap} stickers.`,
      ],
      question: (p1, p2) => `${p1} and ${p2} want to know the least number of bags they need to hold all the stickers.`,
      sentence1: (p1, p2) => `${p1} and ${p2} have a total of [RESPONSE_A1] stickers.`,
      sentence2: (p1, p2) => `${p1} and ${p2} need [RESPONSE_A2] bags to hold all the stickers.`,
    },
    {
      person1: 'Marcus', person2: 'Sofia',
      item: 'marbles', container: 'boxes', containerSingular: 'box',
      introText: () => 'Marcus and Sofia are collecting marbles to share with their class. They will put all the marbles into boxes.',
      introList: (a, mult, cap) => [
        `Marcus has ${a} marbles.`,
        `Sofia has ${mult} times as many marbles as Marcus.`,
        `Each box will hold up to ${cap} marbles.`,
      ],
      question: (p1, p2) => `${p1} and ${p2} want to know the least number of boxes they need to hold all the marbles.`,
      sentence1: (p1, p2) => `${p1} and ${p2} have a total of [RESPONSE_A1] marbles.`,
      sentence2: (p1, p2) => `${p1} and ${p2} need [RESPONSE_A2] boxes to hold all the marbles.`,
    },
  ];

  const sc = pick(PAIR_SCENARIOS);
  // person1 buys `a` items; person2 buys `mult` × `a` items; capacity = `cap`
  const a    = pick([6, 7, 8, 9]);
  const mult = pick([2, 3, 4]);
  const cap  = pick([4, 5, 6]);

  const bAmount = mult * a;    // person2's items
  const total   = a + bAmount; // combined total
  // Minimum bags = ceiling division
  const minBags = Math.ceil(total / cap);
  const floorBags = Math.floor(total / cap);

  // Build total-item distractor options (5 items, sorted ascending)
  // Distractor ideas:
  //   d1: just person2's amount (forgets person1)
  //   d2: person1 + person2 without multiplying (a + mult = wrong)
  //   d3: over-count: total + cap  (counts one extra bag worth)
  //   d4: total - a (off by person1 subtracted instead of added)
  const d1 = bAmount;                   // forgot to add person1
  const d2 = a + mult;                  // didn't multiply, just added the factor
  const d3 = total + cap;               // added one too many bags of capacity
  const d4 = total - a;                 // subtracted instead of adding person1
  // Collect unique distractors, filter correct, pick 4
  const totalDistractors = [...new Set([d1, d2, d3, d4])]
    .filter(v => v !== total && v > 0)
    .slice(0, 4);
  // Ensure we have exactly 4 distractors (pad if duplicates collapsed)
  while (totalDistractors.length < 4) {
    totalDistractors.push(total + totalDistractors.length * 2);
  }
  const totalOptions = [total, ...totalDistractors].sort((a, b) => a - b);

  // Build bags distractor options (5 items, sorted ascending)
  // d1: floor division (ignores remainder, most common student error)
  // d2: floorBags - 1 (off by one low)
  // d3: minBags + 1 (off by one high)
  // d4: total / cap rounded to nearest whole (could duplicate)
  const bagDistractors = [...new Set([
    floorBags,
    floorBags - 1,
    minBags + 1,
    minBags + 2
  ])].filter(v => v !== minBags && v > 0).slice(0, 4);
  while (bagDistractors.length < 4) {
    bagDistractors.push(minBags + bagDistractors.length);
  }
  const bagOptions = [minBags, ...bagDistractors].sort((a, b) => a - b);

  return {
    item_id: 'MA713629341',
    question_number: '15',
    answer_type: 'inline_choice',
    stimulus_intro: sc.introText(),
    stimulus_list: sc.introList(a, mult, cap),
    stimulus_type: null,
    stimulus_params: null,
    question_text: sc.question(sc.person1, sc.person2),
    instruction: 'Choose from the drop-down menus to correctly complete each statement.',
    sentences: [
      sc.sentence1(sc.person1, sc.person2),
      sc.sentence2(sc.person1, sc.person2),
    ],
    dropdowns: [
      { id: 'RESPONSE_A1', options: totalOptions.map(String) },
      { id: 'RESPONSE_A2', options: bagOptions.map(String) },
    ],
    correct_answer: `${total},${minBags}`,
    // sc.item/sc.container are the ACTUAL randomly-picked nouns for this
    // sample (marbles/boxes, stickers/bags, pretzels/bags) — without exposing
    // them, the model has no way to know which scenario it's writing about
    // and hardcodes a fixed/wrong one from training bias instead (caught
    // live: a "marbles" question whose tips talked about "pretzels").
    _params: {
      person1: sc.person1,
      person2: sc.person2,
      item: sc.item,
      container: sc.container,
      containerSingular: sc.containerSingular,
      amountA: String(a),
      multiplier: String(mult),
      capacity: String(cap),
      totalItems: String(total),
      minBags: String(minBags),
    },
  };
}

function generate2021Q16() {
  // Part A: fraction n/100 → decimal equivalent (short answer)
  // Part B: plot a decimal d/100 on a 0–1 number line
  // Vary the numerators independently; keep them two-digit hundredths values.
  // Pedagogically motivated distractors for Part A:
  //   - Student reads 54/100 as 5.4 (misplaces decimal — one fewer zero)
  //   - Student reads 54/100 as 54 (drops decimal entirely)
  //   - Student reads 54/100 as 0.054 (adds extra zero — confuses /1000)

  const SCENARIOS = [
    {
      shopItem1: 'peppers', shopItem2: 'grapes',
      context: 'A shopper bought peppers and grapes.',
    },
    {
      shopItem1: 'apples', shopItem2: 'oranges',
      context: 'A shopper bought apples and oranges.',
    },
    {
      shopItem1: 'carrots', shopItem2: 'broccoli',
      context: 'A shopper bought carrots and broccoli.',
    },
  ];

  const sc = pick(SCENARIOS);

  // Part A: numerator for the /100 fraction (two-digit, 11–89, not ending in 0)
  const partANumeratorChoices = [
    13, 17, 23, 27, 32, 36, 41, 43, 47, 51, 54, 57, 61, 63, 67, 71, 73, 76, 82, 87, 93
  ];
  const numA = pick(partANumeratorChoices);
  const decimalA = numA / 100; // e.g. 0.54

  // Part B: a different decimal hundredths value to plot on the number line
  const partBNumeratorChoices = partANumeratorChoices.filter(n => n !== numA);
  const numB = pick(partBNumeratorChoices);
  const decimalB = numB / 100; // e.g. 0.62

  // Format helper — always show two decimal places for hundredths
  function fmt2(v) {
    return v.toFixed(2);
  }

  return {
    item_id: 'MA714226701',
    question_number: '16',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: sc.context,
    stimulus_type: null,
    stimulus_params: null,
    parts: [
      {
        label: 'A',
        question_text:
          `The shopper bought [${numA}/100] pound of ${sc.shopItem1}.\n\n` +
          `What is the decimal equivalent of the fraction [${numA}/100]?`,
        answer_type: 'short_answer',
        math_expression_prefix: `[${numA}/100] =`,
        correct_answer: fmt2(decimalA),
      },
      {
        label: 'B',
        question_text:
          `The shopper bought ${fmt2(decimalB)} pound of ${sc.shopItem2}.\n\n` +
          `Plot the point that represents where ${fmt2(decimalB)} is located on this number line.`,
        answer_type: 'number_line_plot',
        stimulus_params: { min: 0, max: 1, small_intervals: 10 },
        correct_answer: fmt2(decimalB),
      },
    ],
    correct_answer: `${fmt2(decimalA)};${fmt2(decimalB)}`,
    // Top-level correct_answer here is a semicolon-joined string, not the
    // standard {A,B} object shape, so the generic multi_part rule doesn't
    // apply — exposed directly instead.
    _params: {
      A_numerator: String(numA),
      A_correctValue: fmt2(decimalA),
      B_correctValue: fmt2(decimalB),
      shopItem1: sc.shopItem1,
      shopItem2: sc.shopItem2,
    },
  };
}

// ─── 2021 Q17 — MA803742735 — Equivalent fraction model for a mixed number ──
// Standard 4.NF.A.1: Explain why a fraction a/b is equivalent to (n×a)/(n×b)
// using visual fraction models.
// Question: Which pair of rectangle models is shaded to show a fraction
// equivalent to 1 whole_num/denom?
// Generator varies the mixed number (whole=1, fractional part from allowed list).
// Each option shows two rectangles: left = 1 whole (fully shaded), right = fractional part.
// Option D is always correct; A/B/C are pedagogically motivated distractors.
function generate2021Q17() {
  // Allowed mixed numbers: { whole, num, denom } where 1+num/denom is the target
  // and we find an equivalent fraction with a doubled denominator.
  const CASES = [
    { whole: 1, num: 2, denom: 3,  eqNum: 4,  eqDenom: 6 },  // 1⅔ = 1 4/6
    { whole: 1, num: 1, denom: 2,  eqNum: 2,  eqDenom: 4 },  // 1½  = 1 2/4
    { whole: 1, num: 3, denom: 4,  eqNum: 6,  eqDenom: 8 },  // 1¾  = 1 6/8
    { whole: 1, num: 1, denom: 3,  eqNum: 2,  eqDenom: 6 },  // 1⅓  = 1 2/6
    { whole: 1, num: 2, denom: 4,  eqNum: 4,  eqDenom: 8 },  // 1½  = 1 4/8 (as 2/4)
    { whole: 1, num: 1, denom: 4,  eqNum: 2,  eqDenom: 8 },  // 1¼  = 1 2/8
  ];

  const c = pick(CASES);
  const { whole, num, denom, eqNum, eqDenom } = c;

  // Grid layout for the equivalent-fraction rectangles
  // For each option rectangle: denominator=cols, rows=rows param
  // We display each rectangle as denom cols × rows rows = eqDenom total cells
  const cols = denom;   // columns per rectangle = original denominator
  const rows = eqDenom / denom;  // rows so that cols*rows = eqDenom

  // Helper: build a model object for a rectangle
  function rect(numerator) {
    return { type: 'rect', numerator, denominator: cols, rows };
  }

  // Full shading for one whole (all cells in the equivalent-fraction grid)
  const fullShading = eqDenom;

  // ── Correct answer (D): left fully shaded (1 whole), right eqNum/eqDenom shaded ──
  const correctRight = eqNum;

  // ── Distractors ──────────────────────────────────────────────────────────────
  // A: Uses original denominator only (6 vertical strips, rows=1): right = num/denom strips
  //    (student does not convert to equivalent fraction, uses original denominator with strips)
  //    Total = denom/denom + num/denom = (denom+num)/denom ≠ (eqDenom+eqNum)/eqDenom if denom≠eqDenom
  //    But in this case both are equivalent, so the distractor WRONG amount is: right shows num-1 strips
  //    (student error: off-by-one in original fraction)
  const distA_right = num - 1 >= 0 ? num - 1 : num + 1;

  // B: Uses grid but right shows only 1/eqDenom (student picks far too few — reads just 1 part)
  const distB_right = 1;

  // C: Uses grid but right shows (eqNum - 2) or wrong count (one less group of rows)
  //    Student shades one fewer "equivalent row" worth of cells
  const distC_right = Math.max(1, eqNum - rows);

  return {
    item_id: 'MA803742735',
    question_number: '17',
    stimulus_intro: 'A model of 1 whole is shown.',
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    answer_type: 'multiple_choice',
    question_text:
      `Based on the model, which of these models is shaded to represent a fraction that is equivalent to ${whole}[${num}/${denom}]?`,
    ...(() => {
      const rawOpts17 = shuffle([
        { model: { left: { type: 'rect', numerator: denom, denominator: denom }, operator: '', right: { type: 'rect', numerator: distA_right, denominator: denom } }, isCorrect: false },
        { model: { left: rect(fullShading), operator: '', right: rect(distB_right) }, isCorrect: false },
        { model: { left: rect(fullShading), operator: '', right: rect(distC_right) }, isCorrect: false },
        { model: { left: rect(fullShading), operator: '', right: rect(correctRight) }, isCorrect: true },
      ]);
      const ABCD17 = ['A', 'B', 'C', 'D'];
      const correctLetter = ABCD17[rawOpts17.findIndex(o => o.isCorrect)];
      return {
        answer_options: rawOpts17.map((o, i) => ({ letter: ABCD17[i], model: o.model })),
        correct_answer: correctLetter,
        _params: {
          mixedNumber: `${whole} ${num}/${denom}`,
          equivalentFraction: `${eqNum}/${eqDenom}`,
          correctLetter,
        },
      };
    })(),
  };
}

// 2021 Q18 — Round to nearest ten thousand: match each number to 30,000 or 40,000
// Generator picks 4 numbers in the 30,000–39,999 range and randomly assigns which
// round down (30,000) and which round up (40,000), ensuring at least one of each.
function generate2021Q18() {
  // Build 4 numbers: some in [30000,34999] (round to 30k), some in [35000,39999] (round to 40k)
  // Shuffle to vary row order. Always at least one of each category.
  function makeNum(low, high) {
    return low + Math.floor(Math.random() * (high - low + 1));
  }

  // Decide split: 2+2, 1+3, or 3+1
  const splits = [[2,2],[1,3],[3,1]];
  const [nDown, nUp] = splits[Math.floor(Math.random() * splits.length)];

  const downNums = [];
  const usedDown = new Set();
  while (downNums.length < nDown) {
    const n = makeNum(30000, 34999);
    if (!usedDown.has(n)) { usedDown.add(n); downNums.push(n); }
  }

  const upNums = [];
  const usedUp = new Set();
  while (upNums.length < nUp) {
    const n = makeNum(35000, 39999);
    if (!usedUp.has(n)) { usedUp.add(n); upNums.push(n); }
  }

  // Tag each number with which column it belongs to
  const tagged = [
    ...downNums.map(n => ({ n, cat: 'down' })),
    ...upNums.map(n => ({ n, cat: 'up' })),
  ];

  // Shuffle row order
  for (let i = tagged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }

  // Format number with comma: 34124 → "34,124"
  function fmt(n) {
    return n.toLocaleString('en-US');
  }

  const statements = tagged.map(({ n }) => ({ text: fmt(n) }));

  return {
    item_id: 'MA803846674',
    question_number: '18',
    answer_type: 'true_false_table',
    question_text: 'Round each number to the nearest <strong>ten thousand</strong>.\n\nSelect \u201cRounds to 30,000\u201d or \u201cRounds to 40,000\u201d for each number in the table.',
    column_label: 'Number',
    true_label: 'Rounds to 30,000',
    false_label: 'Rounds to 40,000',
    statements,
    correct_answer: tagged.map(({ cat }) => cat === 'down' ? 'True' : 'False').join(','),
  };
}

// 2021 Q19 — MultipleChoice + AngleDiagram — find angle SRT given QRS and QRT
// Three rays from R: Q (upper), S (right), T (lower-right)
// angle QRS = a, angle QRT = b (b > a), angle SRT = b - a
function generate2021Q19() {
  // Pick angle QRS (small angle between Q and S)
  const qrs = randInt(20, 70);
  // Pick angle SRT (the unknown, between S and T)
  const srt = randInt(10, 40);
  // Angle QRT = QRS + SRT
  const qrt = qrs + srt;

  // Lay out rays (CCW from east):
  // S at 0°, Q at qrs° above S, T at -srt° below S
  const rayQ = qrs;
  const rayS = 0;
  const rayT = -srt;

  // Distractors:
  // B: student adds instead of subtracts (qrt - qrs + something off) → qrs - srt (wrong subtraction order) or just a nearby wrong value
  // Let's use named errors:
  const dB = qrt - qrs - randInt(1, 5);  // off-by-a-few (rounding/careless error)
  const dC = qrs;                          // confuses answer with known angle QRS
  const dD = qrs + qrt;                   // adds all three angles (wrong operation)

  // Ensure distractors are distinct and positive, and differ from correct
  const candidateB = (dB > 0 && dB !== srt) ? dB : srt + randInt(1, 5);
  const candidateC = (dC !== srt) ? dC : srt + 10;
  const candidateD = (dD !== srt && dD > 0) ? dD : srt + qrs + 10;

  const rawOptions = [
    { val: srt, isCorrect: true },
    { val: candidateB, isCorrect: false },
    { val: candidateC, isCorrect: false },
    { val: candidateD, isCorrect: false },
  ];

  const shuffled = shuffle(rawOptions);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[shuffled.findIndex(o => o.isCorrect)];

  return {
    item_id: 'MA306993',
    question_number: '19',
    answer_type: 'multiple_choice',
    stimulus_intro: `Angle QRS has a measure of ${qrs}°, as shown in this diagram.`,
    stimulus_type: 'angle_diagram',
    stimulus_params: {
      center: 'R',
      rays: [
        { label: 'Q', angle: rayQ },
        { label: 'S', angle: rayS },
        { label: 'T', angle: rayT },
      ],
      arc_labels: [
        { between: ['Q', 'S'], text: `${qrs}°`, radius: 48 },
      ],
    },
    question_text: `Angle QRT has a measure of ${qrt}°. What is the measure of angle SRT?`,
    answer_options: shuffled.map((o, i) => ({ letter: letters[i], text: `${o.val}°` })),
    correct_answer: correctLetter,
  };
}

// 2021 Q20 — Compare two fractions using >, <, or =
// The real item uses 3/6 and 4/12 (= 1/2 vs 1/3, so ">").
// Algorithmic version: pick two equivalent-fraction pairs with different denominators
// where the relationship is either >, <, or =.
function generate2021Q20() {
  // Pairs: [numerator_a, denom_a, numerator_b, denom_b, symbol, context]
  // Each pair is designed to require fraction reasoning (find common denominator or
  // benchmark). "=" cases use equivalent fractions. ">" and "<" use non-equivalent.
  const SCENARIOS = [
    // context: cloth with two colors
    { clothA: 'blue', clothB: 'yellow' },
    { clothA: 'red', clothB: 'green' },
    { clothA: 'purple', clothB: 'orange' },
  ];

  // Pick a fraction pair
  const PAIRS = [
    { nA: 3, dA: 6,  nB: 4,  dB: 12, symbol: '>' },  // 1/2 > 1/3
    { nA: 2, dA: 4,  nB: 3,  dB: 6,  symbol: '=' },  // 1/2 = 1/2
    { nA: 1, dA: 3,  nB: 2,  dB: 6,  symbol: '=' },  // 1/3 = 1/3
    { nA: 3, dA: 4,  nB: 6,  dB: 12, symbol: '>' },  // 3/4 > 1/2
    { nA: 2, dA: 6,  nB: 3,  dB: 6,  symbol: '<' },  // 1/3 < 1/2
    { nA: 1, dA: 4,  nB: 2,  dB: 8,  symbol: '=' },  // 1/4 = 1/4
    { nA: 5, dA: 6,  nB: 3,  dB: 4,  symbol: '>' },  // 5/6 > 3/4
    { nA: 2, dA: 3,  nB: 3,  dB: 4,  symbol: '<' },  // 2/3 < 3/4
  ];

  const pair = pick(PAIRS);
  const scenario = pick(SCENARIOS);

  const { nA, dA, nB, dB, symbol } = pair;
  const { clothA, clothB } = scenario;

  return {
    item_id: 'MA803746135',
    question_number: '20',
    answer_type: 'short_answer',
    stimulus_intro: `A parent bought equal amounts of ${clothA} cloth and ${clothB} cloth to make a costume. The parent used [${nA}/${dA}] of the ${clothA} cloth and [${nB}/${dB}] of the ${clothB} cloth.`,
    question_text: `Write a comparison using >, <, or = to correctly compare the fractions [${nA}/${dA}] and [${nB}/${dB}].`,
    input_widget: 'equation_editor',
    correct_answer: `${nA}/${dA} ${symbol} ${nB}/${dB}`,
  };
}

// ─── 2022 Q1: MultipleChoice — fraction addition with like denominators (4.NF.B.3.d) ───
// Two pizzas each cut into D equal slices. After dinner, A slices remain from pizza 1
// and B slices from pizza 2. Which equation finds the total fraction remaining?
// Correct: A/D + B/D = (A+B)/D
// Distractors (pedagogically motivated):
//   "wrong-denom": A/eatenA + B/eatenB = (A+B)/(eatenA+eatenB)
//     Student confuses "remaining" with "ratio of remaining-to-eaten" — uses eaten count as denominator
//   "eaten": eatenA/D + eatenB/D = eatenSum/D
//     Student counts eaten slices instead of remaining slices
//   "add-denom": A/D + B/D = (A+B)/(2D)
//     Student incorrectly adds the denominators as well as the numerators
function generate2022Q1() {
  // Pizza slice denominators (like TestNav, must be same for both pizzas)
  const denoms = [4, 6, 8, 10, 12];
  const D = pick(denoms);

  // Remaining slices: each at least 1, at most D-2 (so there's at least 1 eaten)
  // Also ensure eatenA != eatenB so the "eaten" distractor looks distinct from the "add-denom" one
  let A, B;
  do {
    A = randInt(1, D - 2);
    B = randInt(1, D - 2);
    // A + B must not equal D: if A+B=D then eatenA=B and eatenB=A, making the
    // "eaten" distractor [B/D]+[A/D]=[D/D] — a commuted copy of the correct answer.
  } while (A === B || A + B === D);

  const sumAB = A + B;
  const eatenA = D - A;
  const eatenB = D - B;
  const eatenSum = eatenA + eatenB;

  // Build the four options and track which is correct
  const optionData = [
    // Correct: add remaining fractions with same denominator
    { expr: `[${A}/${D}] + [${B}/${D}] = [${sumAB}/${D}]`, isCorrect: true },
    // Distractor: student uses eaten count as denominator (misidentifies the whole)
    { expr: `[${A}/${eatenA}] + [${B}/${eatenB}] = [${sumAB}/${eatenA + eatenB}]`, isCorrect: false },
    // Distractor: student counts eaten slices instead of remaining
    { expr: `[${eatenA}/${D}] + [${eatenB}/${D}] = [${eatenSum}/${D}]`, isCorrect: false },
    // Distractor: student adds denominators (doubles denominator in the sum)
    { expr: `[${A}/${D}] + [${B}/${D}] = [${sumAB}/${2 * D}]`, isCorrect: false },
  ];

  // Shuffle and assign letters
  const shuffled = shuffle(optionData);
  const letters = ['A', 'B', 'C', 'D'];
  const answer_options = shuffled.map((opt, i) => ({ letter: letters[i], text: opt.expr }));
  const correct_answer = letters[shuffled.findIndex(o => o.isCorrect)];

  return {
    item_id: 'MA900845776',
    question_number: '1',
    stimulus_intro: `A family ordered two pizzas for dinner. Both pizzas were the same size. Each slice of pizza was the same size.<br><br>This diagram shows the amount of pizza remaining after dinner.`,
    stimulus_type: 'fraction_comparison',
    stimulus_params: {
      type: 'circle',
      left_numerator: A,
      left_denominator: D,
      right_numerator: B,
      right_denominator: D,
    },
    stimulus_list: null,
    math_expression: null,
    question_text: 'Which of these equations shows how to find the fraction of a whole pizza that was <strong>remaining</strong> after dinner?',
    answer_type: 'multiple_choice',
    answer_options,
    parts: null,
    select_count: null,
    has_visual: true,
    visual_description: `Two circles each divided into ${D} equal parts. One circle has ${A} parts shaded (remaining), the other has ${B} parts shaded (remaining).`,
    correct_answer,
  };
}

// ─── 2022 Q2: MultipleChoice — identify correct subtraction work with regrouping (4.NBT.B.4) ───
// A student correctly solves a 4-digit minus 3-digit subtraction. Four boxes of
// student work are shown; the student must identify the one with correct regrouping
// and correct answer.
//
// The minuend has 0 in the tens place (so regrouping cascades), e.g. X0YZ.
// Distractors (pedagogically motivated):
//   "no-regroup": student subtracts smaller digit from larger in each column,
//     getting a sum-like wrong answer (adds ones instead of borrows)
//   "partial-regroup": student only borrows for ones/tens but not hundreds —
//     gets ones/tens right but hundreds wrong (adds instead of regrouping from thousands)
//   "wrong-borrow-hundreds": student borrows correctly for ones/tens but makes
//     an off-by-one error when reducing the hundreds digit

function generate2022Q2() {
  // Minuend: 4-digit number of form A0BC where A in [2..6], B in [2..8], C in [3..9]
  // Tens digit is 0 to force cascading regrouping
  const A = randInt(2, 6);   // thousands digit
  const B = randInt(2, 8);   // hundreds digit
  const C = randInt(3, 9);   // ones digit
  const minuend = A * 1000 + 0 * 100 + B * 10 + C;

  // Subtrahend: 3-digit number d1d2d3 where d3 > C (forces ones borrow),
  // d2 > B (forces tens borrow), d1 < A (so result is positive and reasonable)
  const d3 = randInt(C + 1, 9);        // ones digit of subtrahend > minuend ones
  const d2 = randInt(B + 1, 9);        // tens digit of subtrahend > minuend tens
  const d1 = randInt(1, A - 1);        // hundreds digit < minuend thousands
  const subtrahend = d1 * 100 + d2 * 10 + d3;

  const correctResult = minuend - subtrahend;

  // Distractor 1: "no-regroup" — student ignores borrowing entirely,
  // subtracts smaller from larger in each column (or adds in ones column)
  // Effectively computes: |C - d3| in ones, |B - d2| in tens, |0 - d1| treated as d1,
  // thousands stays as A → gives A*1000 + d1*100 + (d2-B)*10 + (d3-C)
  const noRegroup = A * 1000 + d1 * 100 + (d2 - B) * 10 + (d3 - C);

  // Distractor 2: "partial-regroup" — student borrows for ones and tens but
  // forgets to borrow from thousands for the hundreds column.
  // Ones: borrows from tens (which has 0), so it actually cascades from B correctly
  // Hundreds: student sees 0 in tens and borrows 1 from hundreds without reducing thousands.
  // Net effect: hundreds column is computed as (10 + B - 1 - d2) but thousands NOT reduced,
  // so result = A*1000 + (10 + B - 1 - d2)*10 + (10 + C - d3) - wait, let's simulate simply:
  // Student correctly gets ones and tens (by cascade) but leaves thousands intact → adds hundreds wrong
  // Simple model: correct ones + correct tens + WRONG hundreds (B instead of B-1 after borrow) + wrong thousands
  const correctOnes = (10 + C - d3);         // ones after borrowing (C < d3, so borrow gives 10+C-d3)
  const correctTens = (9 + B + 1 - d2);      // tens: borrows 1 from B but gains 10 (9+B-d2) + reduced for ones borrow
  // actually: ones borrows 1 from tens (which is 0, so tens borrows from hundreds giving 10),
  // tens then has 10-1=9 after giving 1 to ones, then hundreds-1 for tens borrow.
  // Partial error: student reduces tens correctly but forgets to reduce hundreds by 1 for tens borrow.
  const partialHundreds = B - d1;            // student uses B (not B-1) — forgot the borrow reduces hundreds
  const partialThousands = A;                // thousands unchanged (student forgot cascade reduces it)
  const partialResult = partialThousands * 1000 + partialHundreds * 100 +
                        (9 - d2) * 10 + (10 + C - d3);
  // Guard: if partialResult === correctResult or === noRegroup, bump by 10
  const safePartial = (partialResult === correctResult || partialResult === noRegroup)
    ? partialResult + 10
    : partialResult;

  // Distractor 3: "wrong-borrow-hundreds" — student borrows correctly everywhere
  // but makes an off-by-one in the hundreds: subtracts d1 from B instead of B-1
  const wrongHundredsResult = correctResult + 100;  // one extra hundred = didn't reduce hundreds by 1 for tens borrow
  const safeWrong = (wrongHundredsResult === correctResult || wrongHundredsResult === noRegroup || wrongHundredsResult === safePartial)
    ? wrongHundredsResult + 10
    : wrongHundredsResult;

  const person = pick(PEOPLE);

  const optionData = [
    { text: `${minuend} − ${subtrahend} = ${correctResult}`, isCorrect: true },
    { text: `${minuend} − ${subtrahend} = ${noRegroup}`,     isCorrect: false },
    { text: `${minuend} − ${subtrahend} = ${safePartial}`,   isCorrect: false },
    { text: `${minuend} − ${subtrahend} = ${safeWrong}`,     isCorrect: false },
  ];

  const shuffled = shuffle(optionData);
  const letters = ['A', 'B', 'C', 'D'];
  const answer_options = shuffled.map((opt, i) => ({ letter: letters[i], text: opt.text }));
  const correct_answer = letters[shuffled.findIndex(o => o.isCorrect)];

  return {
    item_id: 'MA307692',
    question_number: '2',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    question_text: `${person.name} correctly worked out the answer to a subtraction problem. Which of these could be ${person.name}'s problem and work?`,
    answer_type: 'multiple_choice',
    answer_options,
    parts: null,
    select_count: null,
    has_visual: false,
    correct_answer,
  };
}

function generate2022Q3() {
  // This question asks students to identify which line segments and angles
  // from a list are actually present in the drawn quadrilateral PQRS.
  // The figure is a quadrilateral with vertices P (top-left), S (top-right),
  // R (bottom-right), Q (bottom-left). Sides: PS (top), SR (right, angled),
  // QR (bottom), PQ (left).
  //
  // Row 1 — line segment PR: a diagonal across the figure interior → No (B)
  // Row 2 — line segment PQ: the left side of the figure → Yes (C)
  // Row 3 — angle SPQ: angle at P between sides PS and PQ → Yes (E)
  // Row 4 — angle SQR: requires S-Q which is a diagonal, not a side → No (H)
  //
  // Quadrilateral with 4 labeled vertices (shape fixed, labels vary):
  //   tl=top-left, tr=top-right, br=bottom-right, bl=bottom-left
  // Sides: tl-tr (top), tr-br (right), br-bl (bottom), bl-tl (left)
  // Diagonals: tl-br, tr-bl
  //
  // Rows: 1 side (Yes), 1 diagonal (No), 1 valid angle (Yes), 1 invalid angle (No) -- shuffled.
  // Valid angle: vertex's two adjacent sides both exist (e.g., angle tr-tl-bl at tl).
  // Invalid angle: one ray goes along a diagonal (e.g., angle tr-bl-br -- tr is diagonal from bl).

  const labelSets = [
    ['P', 'S', 'R', 'Q'],
    ['A', 'B', 'C', 'D'],
    ['E', 'F', 'G', 'H'],
    ['J', 'K', 'L', 'M'],
    ['W', 'X', 'Y', 'Z'],
    ['M', 'N', 'R', 'T'],
  ];
  const [tl, tr, br, bl] = pick(labelSets);

  const allSides = [[tl,tr],[tr,br],[br,bl],[bl,tl]];
  const allDiagonals = [[tl,br],[tr,bl]];

  // Valid angles: [outer1, vertex, outer2] -- both outer vertices adjacent to vertex
  const validAngles = [
    [tr,tl,bl], // at tl
    [tl,tr,br], // at tr
    [tr,br,bl], // at br
    [br,bl,tl], // at bl
  ];

  // Invalid angles: one outer vertex is the diagonal endpoint from the middle vertex
  const invalidAngles = [
    [br,tl,tr],[br,tl,bl], // at tl, br is diagonal
    [bl,tr,tl],[bl,tr,br], // at tr, bl is diagonal
    [tl,br,tr],[tl,br,bl], // at br, tl is diagonal
    [tr,bl,br],[tr,bl,tl], // at bl, tr is diagonal
  ];

  const yesSide  = pick(allSides);
  const noDiag   = pick(allDiagonals);
  const yesAngle = pick(validAngles);
  const noAngle  = pick(invalidAngles);

  const rows = shuffle([
    { text: `line segment <em>${yesSide[0]}${yesSide[1]}</em>`,           correct: true  },
    { text: `line segment <em>${noDiag[0]}${noDiag[1]}</em>`,             correct: false },
    { text: `angle <em>${yesAngle[0]}${yesAngle[1]}${yesAngle[2]}</em>`, correct: true  },
    { text: `angle <em>${noAngle[0]}${noAngle[1]}${noAngle[2]}</em>`,    correct: false },
  ]);

  const svgFigure = `<p>A student created this figure by drawing line segments and angles.</p>` +
    `<p style="text-align:center;">` +
    `<svg width="230" height="145" viewBox="0 0 230 145" xmlns="http://www.w3.org/2000/svg" ` +
    `style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">` +
    `<polygon points="30,20 160,20 195,120 25,120" fill="none" stroke="#333" stroke-width="1.5"/>` +
    `<text x="22" y="14" font-size="14" font-style="italic">${tl}</text>` +
    `<text x="163" y="14" font-size="14" font-style="italic">${tr}</text>` +
    `<text x="199" y="130" font-size="14" font-style="italic">${br}</text>` +
    `<text x="12" y="130" font-size="14" font-style="italic">${bl}</text>` +
    `</svg></p>`;

  return {
    item_id: 'MA704652242',
    question_number: '3',
    stimulus_intro: svgFigure,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    question_text: 'Did the student use the line segments and angles in the table to create the figure?',
    instruction: 'Select \u201cYes\u201d or \u201cNo\u201d for each line segment or angle.',
    answer_type: 'true_false_table',
    column_label: 'Line Segment or Angle',
    true_label: 'Yes',
    false_label: 'No',
    statements: rows.map(r => ({ text: r.text })),
    answer_options: null,
    parts: null,
    select_count: null,
    has_visual: true,
    correct_answer: rows.map(r => r.correct ? 'True' : 'False').join(','),
  };
}

function generate2022Q4() {
  // Place value: digit D in a 4-digit number; ask which answer has D at a value
  // that is one / ten / one hundred / one thousand times the value in the reference.
  // Positions: 0=ones, 1=tens, 2=hundreds, 3=thousands.
  // All 4 answer choices put D in a different position; correct = targetPlace.

  const digits = [3, 4, 6, 7, 8, 9];
  const D = pick(digits);

  const multipliers = [
    { word: 'one',          shift: 0 },
    { word: 'ten',          shift: 1 },
    { word: 'one hundred',  shift: 2 },
    { word: 'one thousand', shift: 3 },
  ];

  // All valid (multiplier, refPlace) pairs where targetPlace = refPlace + shift <= 3
  const validPairs = [];
  for (const mo of multipliers) {
    for (let refPlace = 0; refPlace + mo.shift <= 3; refPlace++) {
      validPairs.push({ word: mo.word, shift: mo.shift, refPlace, targetPlace: refPlace + mo.shift });
    }
  }
  const { word, shift, refPlace, targetPlace } = pick(validPairs);

  function otherDigits(count, exclude) {
    const pool = [1,2,3,4,5,6,7,8,9].filter(x => !exclude.includes(x));
    const result = [];
    const used = new Set();
    while (result.length < count) {
      const x = pick(pool);
      if (!used.has(x)) { used.add(x); result.push(x); }
    }
    return result;
  }

  // Build a 4-digit number with D in the given place (0=ones..3=thousands)
  function buildNum(dPlace) {
    const others = otherDigits(3, [D]);
    const d = [0, 0, 0, 0]; // indices match position: d[0]=ones, d[1]=tens, etc.
    d[dPlace] = D;
    let oi = 0;
    for (let i = 0; i <= 3; i++) { if (i !== dPlace) d[i] = others[oi++]; }
    return d[3] * 1000 + d[2] * 100 + d[1] * 10 + d[0];
  }

  const fmt = n => n.toLocaleString('en-US');

  const refNum = buildNum(refPlace);
  const times = shift === 0 ? 'time' : 'times';

  // One answer choice per position (0-3), shuffled; correct = targetPlace
  const rawOpts = shuffle([0, 1, 2, 3].map(p => ({ text: fmt(buildNum(p)), isCorrect: p === targetPlace })));
  const ABCD = ['A', 'B', 'C', 'D'];

  return {
    item_id: 'MA307310',
    question_number: '4',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    question_text: `In which of these numbers does the ${D} have a value that is <strong>${word}</strong> ${times} the value of the ${D} in ${fmt(refNum)}?`,
    answer_type: 'multiple_choice',
    answer_options: rawOpts.map((o, i) => ({ letter: ABCD[i], text: o.text })),
    correct_answer: ABCD[rawOpts.findIndex(o => o.isCorrect)],
    parts: null,
    select_count: null,
  };
}

// ─── 2022 Q5: ShortAnswer — compare two decimals using >, <, or = (4.NF.C.7) ───
// Students write a comparison of two decimals to hundredths.
// The correct answer is the full comparison expression, e.g. "0.29 < 0.8".
//
// Distractors are not needed (it's a short-answer free-response), but the
// generator randomizes the decimal pair so the algorithm stays varied.
// Pairs are chosen so one decimal has hundredths precision and the other
// has tenths precision, mirroring the original item structure.
//
// Common student errors encoded in correct_answer guidance:
//   — confuses digit count: thinks 0.29 > 0.8 because 29 > 8 (ignores place value)
//   — writes the comparison backwards: 0.8 < 0.29
//   — uses = when the decimals are not equal
function generate2022Q5() {
  // Pairs: (hundredths decimal, tenths decimal, symbol)
  // All cases are strictly less-than so the pair with more digits is the SMALLER value,
  // directly targeting the common error of comparing digit counts.
  const pairs = [
    { a: '0.29', b: '0.8',  symbol: '<' },
    { a: '0.14', b: '0.5',  symbol: '<' },
    { a: '0.37', b: '0.6',  symbol: '<' },
    { a: '0.08', b: '0.3',  symbol: '<' },
    { a: '0.45', b: '0.7',  symbol: '<' },
    { a: '0.62', b: '0.9',  symbol: '<' },
    { a: '0.53', b: '0.8',  symbol: '<' },
    { a: '0.11', b: '0.4',  symbol: '<' },
    { a: '0.76', b: '0.9',  symbol: '<' },
    { a: '0.23', b: '0.6',  symbol: '<' },
  ];

  const { a, b, symbol } = pick(pairs);

  return {
    item_id: 'MA900775955',
    question_number: '5',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    answer_type: 'short_answer',
    question_text: `Write a comparison using >, <, or = to compare the numbers ${a} and ${b}.\n\nEnter your comparison in the space provided. Enter <strong>only</strong> your comparison.`,
    input_widget: 'text',
    input_width: '160px',
    answer_suffix: null,
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: `${a} ${symbol} ${b}`,
  };
}

// 2022 Q6 — Lines of symmetry of a triangle
// Varies between:
//   • Isosceles right (45-45-90): 1 line of symmetry  — matches base item
//   • Scalene acute: 0 lines of symmetry
//   • Scalene obtuse: 0 lines of symmetry
//   • Non-right isosceles (e.g. 70-70-40): 1 line of symmetry
// All drawn as inline SVG at ~176×100.
function generate2022Q6() {
  // Each variant: { svg, symmetry, label (for visual_description) }
  const VARIANTS = [
    // ── 1 line: isosceles right (45-45-90), apex at top-center ──────────────
    // Right angle marker: diamond polygon oriented along the two legs.
    // Apex (88,12). Left leg unit (-0.676,0.736), right leg unit (0.676,0.736).
    // Step 9px along each leg: P1=(81,19), P2=(94,19). P3=P1+(P2-apex)=(87,26).
    {
      symmetry: 1,
      label: 'isosceles right triangle (45-45-90)',
      svg: `<svg width="176" height="108" viewBox="0 0 176 108" xmlns="http://www.w3.org/2000/svg"><polygon points="88,12 10,96 166,96" fill="none" stroke="#333" stroke-width="1.5"/><polygon points="88,12 81,19 88,26 95,19" fill="none" stroke="#333" stroke-width="1.2"/><text x="16" y="108" font-size="13" fill="#333">45°</text><text x="138" y="108" font-size="13" fill="#333">45°</text></svg>`,
    },
    // ── 1 line: isosceles right, right angle at bottom-left ─────────────────
    {
      symmetry: 1,
      label: 'isosceles right triangle, right angle at lower-left',
      svg: `<svg width="176" height="100" viewBox="0 0 176 100" xmlns="http://www.w3.org/2000/svg"><polygon points="10,90 10,10 88,90" fill="none" stroke="#333" stroke-width="1.5"/><rect x="10" y="80" width="10" height="10" fill="none" stroke="#333" stroke-width="1.2"/><text x="14" y="30" font-size="13" fill="#333">45°</text><text x="22" y="88" font-size="13" fill="#333">45°</text></svg>`,
    },
    // ── 1 line: isosceles non-right (70-70-40), tall narrow ─────────────────
    {
      symmetry: 1,
      label: 'isosceles triangle (70-70-40)',
      svg: `<svg width="176" height="118" viewBox="0 0 176 118" xmlns="http://www.w3.org/2000/svg"><polygon points="88,8 20,96 156,96" fill="none" stroke="#333" stroke-width="1.5"/><text x="14" y="112" font-size="13" fill="#333">70°</text><text x="132" y="112" font-size="13" fill="#333">70°</text><text x="78" y="28" font-size="13" fill="#333">40°</text></svg>`,
    },
    // ── 1 line: isosceles obtuse (120-30-30) ─────────────────────────────────
    {
      symmetry: 1,
      label: 'isosceles obtuse triangle (120-30-30)',
      svg: `<svg width="176" height="94" viewBox="0 0 176 94" xmlns="http://www.w3.org/2000/svg"><polygon points="88,12 8,72 168,72" fill="none" stroke="#333" stroke-width="1.5"/><text x="4" y="88" font-size="13" fill="#333">30°</text><text x="144" y="88" font-size="13" fill="#333">30°</text><text x="72" y="34" font-size="13" fill="#333">120°</text></svg>`,
    },
    // ── 0 lines: scalene acute (50-60-70) ────────────────────────────────────
    {
      symmetry: 0,
      label: 'scalene acute triangle (50-60-70)',
      svg: `<svg width="176" height="104" viewBox="0 0 176 104" xmlns="http://www.w3.org/2000/svg"><polygon points="55,10 8,84 168,84" fill="none" stroke="#333" stroke-width="1.5"/><text x="2" y="100" font-size="13" fill="#333">70°</text><text x="142" y="100" font-size="13" fill="#333">60°</text><text x="48" y="26" font-size="13" fill="#333">50°</text></svg>`,
    },
    // ── 0 lines: scalene obtuse (110-40-30) ──────────────────────────────────
    {
      symmetry: 0,
      label: 'scalene obtuse triangle (110-40-30)',
      svg: `<svg width="176" height="94" viewBox="0 0 176 94" xmlns="http://www.w3.org/2000/svg"><polygon points="20,10 8,74 168,74" fill="none" stroke="#333" stroke-width="1.5"/><text x="2" y="90" font-size="13" fill="#333">110°</text><text x="144" y="90" font-size="13" fill="#333">30°</text><text x="22" y="26" font-size="13" fill="#333">40°</text></svg>`,
    },
    // ── 0 lines: scalene right (30-60-90) ────────────────────────────────────
    {
      symmetry: 0,
      label: 'scalene right triangle (30-60-90)',
      svg: `<svg width="176" height="106" viewBox="0 0 176 106" xmlns="http://www.w3.org/2000/svg"><polygon points="10,10 10,84 166,84" fill="none" stroke="#333" stroke-width="1.5"/><rect x="10" y="74" width="10" height="10" fill="none" stroke="#333" stroke-width="1.2"/><text x="14" y="46" font-size="13" fill="#333">60°</text><text x="14" y="102" font-size="13" fill="#333">90°</text><text x="132" y="102" font-size="13" fill="#333">30°</text></svg>`,
    },
  ];

  const variant = pick(VARIANTS);
  const svgBlock = `<br><br><p style="text-align:center;">${variant.svg}</p>`;

  return {
    item_id: 'MA307066',
    question_number: '6',
    stimulus_intro: `A triangle is shown.${svgBlock}`,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    answer_type: 'short_answer',
    question_text: 'How many lines of symmetry does the triangle have?',
    input_widget: 'text',
    answer_suffix: null,
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: String(variant.symmetry),
  };
}

function generate2022Q7() {
  // Match division equations with related multiplication equations.
  // Structure: dividend ÷ variable = quotient  →  divisor × quotient = dividend
  // We vary which position the variable occupies and the numbers used.
  // Three equation types:
  //   Type A: number ÷ var = number  → var × quotient = dividend   (e.g. 36 ÷ p = 4 → p × 4 = 36)
  //   Type B: var ÷ number = number  → number × number = var       (e.g. s ÷ 7 = 5 → 7 × 5 = s)
  //   Type C: number ÷ number = var  → divisor × var = dividend    (e.g. 72 ÷ 12 = a → 12 × a = 72)

  // Pool of clean division facts (divisor, quotient, dividend): dividend ÷ divisor = quotient
  const facts = [
    [4, 9, 36], [6, 6, 36], [3, 8, 24], [4, 8, 32],
    [5, 7, 35], [6, 7, 42], [4, 6, 24], [3, 9, 27],
    [5, 8, 40], [6, 8, 48], [7, 8, 56], [4, 7, 28],
    [5, 9, 45], [6, 9, 54], [8, 9, 72], [7, 9, 63],
  ];

  // Pick 3 distinct facts
  const pool = shuffle([...facts]);
  const [f1, f2, f3] = pool;

  // Variable names for each row
  const varNames = shuffle(['a', 'b', 'c', 'k', 'm', 'n', 'p', 'q', 'r', 's', 't']);
  const v1 = varNames[0]; // Type A: divisor is variable  → dividend ÷ v = quotient
  const v2 = varNames[1]; // Type B: dividend is variable → v ÷ divisor = quotient
  const v3 = varNames[2]; // Type C: quotient is variable → dividend ÷ divisor = v

  // Row 1 (Type A): f1[2] ÷ v1 = f1[1]  correct multiplication: v1 × f1[1] = f1[2]
  const div1 = `${f1[2]} ÷ ${v1} = ${f1[1]}`;
  const slots1 = [v1, `${f1[1]}`, `${f1[2]}`];

  // Row 2 (Type B): v2 ÷ f2[0] = f2[1]  correct multiplication: f2[0] × f2[1] = v2
  const div2 = `${v2} ÷ ${f2[0]} = ${f2[1]}`;
  const slots2 = [`${f2[0]}`, `${f2[1]}`, v2];

  // Row 3 (Type C): f3[2] ÷ f3[0] = v3  correct multiplication: f3[0] × v3 = f3[2]
  const div3 = `${f3[2]} ÷ ${f3[0]} = ${v3}`;
  const slots3 = [`${f3[0]}`, v3, `${f3[2]}`];

  // Build tile bank: one tile per slot usage — duplicates get multiple copies
  const allSlotValues = [
    v1, `${f1[1]}`, `${f1[2]}`,
    `${f2[0]}`, `${f2[1]}`, v2,
    `${f3[0]}`, v3, `${f3[2]}`,
  ];
  const tileCount = {};
  for (const t of allSlotValues) tileCount[t] = (tileCount[t] ?? 0) + 1;
  const tiles = [
    ...Object.entries(tileCount).filter(([t]) => isNaN(Number(t))).sort(([a],[b]) => a.localeCompare(b)).flatMap(([t,n]) => Array(n).fill(t)),
    ...Object.entries(tileCount).filter(([t]) => !isNaN(Number(t))).sort(([a],[b]) => Number(a)-Number(b)).flatMap(([t,n]) => Array(n).fill(t)),
  ];

  return {
    item_id: 'MA623833763',
    question_number: '7',
    answer_type: 'drag_drop_match',
    question_text: 'Match each division equation with a related multiplication equation.',
    instruction: 'Drag and drop numbers and variables into the boxes to match each division equation with a related multiplication equation.',
    tiles,
    rows: [
      { division: div1, slots: slots1 },
      { division: div2, slots: slots2 },
      { division: div3, slots: slots3 },
    ],
    correct_answer: `${slots1[0]}×${slots1[1]}=${slots1[2]}, ${slots2[0]}×${slots2[1]}=${slots2[2]}, ${slots3[0]}×${slots3[1]}=${slots3[2]}`,
    _params: {
      divisionRow1: div1, multiplicationRow1: `${slots1[0]}×${slots1[1]}=${slots1[2]}`,
      divisionRow2: div2, multiplicationRow2: `${slots2[0]}×${slots2[1]}=${slots2[2]}`,
      divisionRow3: div3, multiplicationRow3: `${slots3[0]}×${slots3[1]}=${slots3[2]}`,
    },
  };
}

// ─── 2022 Q8: MultiPart (4 parts) — area and perimeter of rectangles (4.MD.A.3) ───
// Part A: find area of garden given length × width
// Part B: find width of patio given length and area (division)
// Part C: explain whether two rectangles have the same perimeter (constructed response)
// Part D: find dimensions of flower bed with area < garden area and same perimeter as patio
function generate2022Q8() {
  // Garden: width × height where area = width * height
  // Choose garden dimensions so area is a clean product
  const gardenDims = shuffle([
    [4, 8],   // area 32
    [3, 9],   // area 27
    [5, 6],   // area 30
    [4, 6],   // area 24
    [3, 8],   // area 24
    [4, 9],   // area 36
    [3, 7],   // area 21
    [5, 8],   // area 40
  ]);
  const [gardenLen, gardenWid] = gardenDims[0];
  const gardenArea = gardenLen * gardenWid;
  const gardenPerim = 2 * gardenLen + 2 * gardenWid;

  // Patio: given length and area, student finds width (width = area / length)
  // Choose patio length and a width such that area is a clean product
  // Patio perimeter should equal garden perimeter for Part C to be interesting
  // We'll set patio perimeter = garden perimeter (same), to match the original question
  // Patio perimeter = 2*patioLen + 2*patioWid = gardenPerim
  // Pick patioLen ≠ gardenLen so the rectangle looks different
  // Sum of patio dims = gardenPerim / 2
  const halfPerim = gardenPerim / 2;
  // Find valid patio lengths (1 < patioLen < halfPerim - 1, patioLen ≠ gardenLen, integer patio width)
  const candidatePatioLens = [];
  for (let pl = 2; pl < halfPerim - 1; pl++) {
    const pw = halfPerim - pl;
    if (pw > 0 && pw !== pl && pl !== gardenLen && pw !== gardenLen && pl * pw < gardenArea) {
      candidatePatioLens.push([pl, pw]);
    }
  }
  let patioLen, patioWid;
  if (candidatePatioLens.length > 0) {
    [patioLen, patioWid] = pick(candidatePatioLens);
    // Ensure patioLen > patioWid for clarity
    if (patioLen < patioWid) [patioLen, patioWid] = [patioWid, patioLen];
  } else {
    // Fallback: use original question values
    patioLen = 5;
    patioWid = 7;
  }
  const patioArea = patioLen * patioWid;
  const patioPerim = 2 * patioLen + 2 * patioWid;

  // Flower bed: same perimeter as patio, area less than garden area
  // Find an example flower bed (for the correct_answer hint)
  let flowerLen = 0, flowerWid = 0;
  for (let fl = 1; fl < halfPerim; fl++) {
    const fw = halfPerim - fl;
    if (fw > 0 && fl !== patioLen && fl * fw < gardenArea) {
      flowerLen = Math.max(fl, fw);
      flowerWid = Math.min(fl, fw);
      break;
    }
  }

  return {
    item_id: 'MA903574399',
    question_number: '8',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: 'There is a garden, a patio, and a flower bed in the backyard of a house. The garden, the patio, and the flower bed are each in the shape of a rectangle.',
    parts: [
      {
        label: 'A',
        question_text: `The garden has a length of ${gardenLen} feet and a width of ${gardenWid} feet, as shown in this diagram.`,
        stimulus_type: 'rectangle_diagram',
        stimulus_params: {
          width: gardenWid,
          height: gardenLen,
          width_label: `${gardenWid} ft.`,
          height_label: `${gardenLen} ft.`,
        },
        answer_prompt: 'What is the area, in square feet, of the garden?',
        answer_type: 'short_answer',
        answer_suffix: 'square feet',
        correct_answer: `${gardenArea}`,
      },
      {
        label: 'B',
        question_text: `The patio has a length of ${patioLen} feet and an area of ${patioArea} square feet.\n\nWhat is the width, in feet, of the patio?`,
        answer_type: 'number_with_work',
        answer_unit: 'feet',
        correct_answer: `${patioWid}`,
      },
      {
        label: 'C',
        question_text: 'The owner of the house thinks the garden and the patio have the same perimeter.\n\nIs the owner correct?',
        answer_type: 'yes_no_explanation',
        correct_answer: 'yes',
      },
      {
        label: 'D',
        question_text: 'The area of the flower bed is <strong>less than</strong> the area of the garden. The perimeter of the flower bed is <strong>equal</strong> to the perimeter of the patio.\n\nWhat could be the length <strong>and</strong> the width of the flower bed?',
        answer_type: 'dimension_pair',
        correct_answer: `halfPerim=${halfPerim},maxArea=${gardenArea}`,
      },
    ],
    correct_answer: {
      A: `${gardenArea}`,
      B: `${patioWid}`,
      C: 'yes',
      D: `halfPerim=${halfPerim},maxArea=${gardenArea}`,
    },
    _params: {
      D_halfPerim: String(halfPerim),
      D_maxArea: String(gardenArea),
      D_exampleLen: String(flowerLen),
      D_exampleWid: String(flowerWid),
    },
  };
}

// 2022 Q9 — Short answer: multiply a unit fraction by a whole number
// A student drinks [n/d] liter of something each morning for k mornings.
// Correct answer: k × n/d = (k*n)/d liters.
// We vary: the fraction (numerator, denominator), number of days, person, and substance.
function generate2022Q9() {
  // Fractions with numerator 1 or 2 and denominator 3–6 (keeps answer a simple fraction)
  const fractions = [
    { n: 1, d: 3 },
    { n: 1, d: 4 },
    { n: 1, d: 5 },
    { n: 2, d: 3 },
    { n: 2, d: 5 },
    { n: 3, d: 4 },
    { n: 3, d: 5 },
  ];
  const { n, d } = pick(fractions);

  // Number of days: 3–6 (keeps product a single fraction, not too large)
  const k = randInt(3, 6);

  // Correct answer numerator
  const ansNumer = k * n;
  // Express as [ansNumer/d] in renderMath notation
  const correctAnswer = `[${ansNumer}/${d}]`;

  // Substances that work with "drinks X liter(s) of __ each morning"
  const substances = ['water', 'juice', 'milk'];
  const substance = pick(substances);

  // Time periods: mornings, days, afternoons
  const periods = ['mornings', 'days', 'afternoons'];
  const period = pick(periods);

  return {
    item_id: 'MA800633803',
    question_number: '9',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    answer_type: 'short_answer',
    question_text: `A student drinks [${n}/${d}] liter of ${substance} each morning.\n\nWhat is the total amount of ${substance}, in liters, the student drinks over ${k} ${period}?`,
    input_widget: 'text',
    answer_suffix: null,
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: `${ansNumer}/${d}`,
  };
}

// 2022 Q10: MultipleChoice — multi-step word problem: sheets × stickers ÷ per-poster
// Correct: floor(sheets × stickers_per_sheet / stickers_per_poster)
// Distractors:
//   A: correct - 1  (used floor of (sheets-1)*stickers_per_sheet / stickers_per_poster — forgot one sheet)
//   C: correct + 1  (rounded up the remainder, ceiling division)
//   D: correct + 2  (added an extra sheet's worth)
function generate2022Q10() {
  const SCENARIOS = [
    {
      actor: 'A teacher',
      item: 'stickers',
      container: 'sheets',
      purpose: 'decorating posters',
      verb: 'decorate',
      unit: 'poster',
    },
    {
      actor: 'A student',
      item: 'stickers',
      container: 'pages',
      purpose: 'making cards',
      verb: 'make',
      unit: 'card',
    },
    {
      actor: 'A parent',
      item: 'stamps',
      container: 'sheets',
      purpose: 'mailing envelopes',
      verb: 'mail',
      unit: 'envelope',
    },
  ];

  // Keep to values that produce remainder ≠ 0 so the "rounds up" distractor is distinct
  // sheets: 6–9, stickers_per_sheet: 8–12 (multiples of 2), per_poster: 3–5
  let sheets, perSheet, perPoster, total, correct;
  do {
    sheets    = randInt(6, 9);
    perSheet  = pick([8, 9, 10, 11, 12]);
    perPoster = pick([3, 4, 5]);
    total     = sheets * perSheet;
    correct   = Math.floor(total / perPoster);
  } while (total % perPoster === 0); // ensure remainder > 0 so distractors are distinct

  const sc = pick(SCENARIOS);

  // Named distractors
  const dLow  = correct - 1; // forgot one sheet's worth
  const dCeil = correct + 1; // rounded up the remainder
  const dHigh = correct + 2; // added an extra sheet

  const rawOpts10b = shuffle([
    { val: correct, isCorrect: true  },
    { val: dLow,    isCorrect: false },
    { val: dCeil,   isCorrect: false },
    { val: dHigh,   isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[rawOpts10b.findIndex(o => o.isCorrect)];

  const answer_options = rawOpts10b.map((o, i) => ({
    letter: letters[i],
    text: `${o.val} ${sc.unit}s`,
  }));

  return {
    question_number: '10',
    answer_type: 'multiple_choice',
    stimulus_intro: `${sc.actor} has ${sheets} ${sc.container} of ${sc.item} for ${sc.purpose}.`,
    stimulus_list: [
      `Each ${sc.container.replace(/s$/, '')} has ${perSheet} ${sc.item}.`,
      `Each ${sc.unit} will have exactly ${perPoster} ${sc.item}.`,
    ],
    stimulus_type: null,
    stimulus_params: null,
    math_expression: null,
    question_text: `What is the <strong>greatest</strong> number of ${sc.unit}s the ${sc.actor.toLowerCase().replace('a ', '')} can ${sc.verb}?`,
    answer_options,
    parts: null,
    select_count: null,
    correct_answer: correctLetter,
    // No _params previously — the model had no way to know which of the 3
    // scenarios (teacher/stickers/posters, student/stickers/cards,
    // parent/stamps/envelopes) was actually picked, and hardcoded one
    // regardless (caught live: a stamps/envelopes question whose feedback
    // talked about stickers and posters throughout).
    _params: {
      actor: sc.actor.toLowerCase().replace('a ', ''),
      item: sc.item,
      container: sc.container,
      unit: sc.unit,
      sheets: String(sheets),
      perSheet: String(perSheet),
      perPoster: String(perPoster)
    },
  };
}

// 2022 Q11 — Multi-part: unit conversion table (minutes→seconds) + ordering distances
function generate2022Q11() {
  // ── Semantic variation: person + event/activity labels ──
  const person = pick(PEOPLE);
  const SCENARIOS = [
    { event: 'field day',            raceLabel: 'races',        throwLabel: 'softball throws' },
    { event: 'sports day',           raceLabel: 'races',        throwLabel: 'frisbee throws' },
    { event: 'track and field day',  raceLabel: 'sprints',      throwLabel: 'javelin throws' },
    { event: 'the school olympics',  raceLabel: 'relay races',  throwLabel: 'discus throws' },
    { event: 'field day',            raceLabel: 'races',        throwLabel: 'shot put throws' },
    { event: 'summer camp',          raceLabel: 'swim races',   throwLabel: 'beanbag throws' },
  ];
  const sc = pick(SCENARIOS);

  // ── Part A: time conversion ──
  // Generate 3 race finish times. Each time has a whole-minute component and
  // an optional extra-seconds component. The student must convert to total seconds.
  // Constraint: minutes 1–12, extra seconds 0–59. Generate interesting values.
  // We always produce 3 races with distinct total-second values.

  function makeTime() {
    const mins = randInt(1, 12);
    // Occasionally use a round number (no extra seconds)
    const extraSecs = pick([0, 0, randInt(5, 55)]);
    const totalSecs = mins * 60 + extraSecs;
    const label = extraSecs === 0
      ? `${mins} minute${mins === 1 ? '' : 's'}`
      : `${mins} minute${mins === 1 ? '' : 's'}, ${extraSecs} second${extraSecs === 1 ? '' : 's'}`;
    return { mins, extraSecs, totalSecs, label };
  }

  let times;
  do {
    times = [makeTime(), makeTime(), makeTime()];
  } while (
    // Ensure all three total-second values are distinct
    times[0].totalSecs === times[1].totalSecs ||
    times[1].totalSecs === times[2].totalSecs ||
    times[0].totalSecs === times[2].totalSecs
  );

  // ── Part B: ordering distances (least to greatest) ──
  // Generate 4 throw distances in mixed units (inches, feet, yards).
  // Convert all to inches to determine correct order.

  const UNIT_SETS = [
    // [value, unit, inches]
    () => {
      const a = randInt(60, 90);         // inches
      const b = randInt(5, 9);           // feet → *12
      const c = randInt(3, 5);           // yards → *36
      const d = randInt(90, 130);        // inches
      return [
        { label: `${a} inches`,    inches: a      },
        { label: `${b} feet`,      inches: b * 12 },
        { label: `${c} yards`,     inches: c * 36 },
        { label: `${d} inches`,    inches: d      },
      ];
    },
    () => {
      const a = randInt(50, 80);
      const b = randInt(6, 10);
      const c = randInt(2, 4);
      const d = randInt(95, 140);
      return [
        { label: `${a} inches`,    inches: a      },
        { label: `${b} feet`,      inches: b * 12 },
        { label: `${c} yards`,     inches: c * 36 },
        { label: `${d} inches`,    inches: d      },
      ];
    },
  ];

  let distances;
  let sortedDistances;
  let attempts = 0;
  do {
    distances = pick(UNIT_SETS)();
    // Sort by inches to get the correct order
    sortedDistances = [...distances].sort((a, b) => a.inches - b.inches);
    attempts++;
    // Ensure all inch values are distinct (no ties)
  } while (
    new Set(distances.map(d => d.inches)).size < 4 && attempts < 50
  );

  const tiles = distances.map(d => d.label);
  const correctOrder = sortedDistances.map(d => d.label);

  return {
    question_number: '11',
    answer_type: 'multi_part',
    layout: 'stacked',
    question_text: `On ${sc.event}, ${person.name} recorded ${person.poss} finish times for three different ${sc.raceLabel}. ${person.pronoun.charAt(0).toUpperCase() + person.pronoun.slice(1)} also recorded the distances of four of ${person.poss} ${sc.throwLabel}.`,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    parts: [
      {
        label: 'A',
        question_text: `This table shows ${person.poss} finish times for the three ${sc.raceLabel}.\n\nWhat is ${person.poss} finish time, in <strong>seconds</strong>, for each race?\n\nEnter a number into each box to complete the table.`,
        answer_type: 'table_fill',
        table_params: {
          title: 'Finish Times',
          headers: ['Time', 'Time in Seconds'],
          rows: times.map(t => [t.label, '']),
        },
        correct_answer: times.map(t => String(t.totalSecs)).join(','),
      },
      {
        label: 'B',
        question_text: `The distances of ${person.poss} four ${sc.throwLabel} were recorded using different units of measurement.\n\nOrder the distances from <strong>least to greatest</strong>.\n\nDrag and drop the distances into the boxes in the correct order.`,
        answer_type: 'ordering',
        tiles,
        correct_order: correctOrder,
        correct_answer: correctOrder.join(', '),
      },
    ],
    correct_answer: {
      A: times.map(t => String(t.totalSecs)).join(','),
      B: correctOrder.join(', '),
    },
  };
}

// ─── 2022 Q12: ShortAnswer — use a known multiplication fact to solve a scaled version (4.NBT.A.1) ───
// Core concept: if a × b = c, then a × (b×100) = c×100 (place-value scaling)
// Generator varies the base fact; the unknown is always c×100.
function generate2022Q12() {
  const person = pick(PEOPLE);

  // Base facts: small single-digit × single-digit with nice products
  const baseFacts = [
    { a: 3, b: 6, c: 18 },
    { a: 4, b: 7, c: 28 },
    { a: 5, b: 8, c: 40 },
    { a: 6, b: 9, c: 54 },
    { a: 3, b: 8, c: 24 },
    { a: 4, b: 9, c: 36 },
    { a: 2, b: 7, c: 14 },
    { a: 5, b: 6, c: 30 },
    { a: 7, b: 8, c: 56 },
  ];

  const fact = pick(baseFacts);
  const { a, b, c } = fact;
  const zeros = randInt(1, 3);
  const scale = 10 ** zeros;
  const bigB = b * scale;
  const answer = c * scale;

  // Distractors:
  // - forgetting the ×100 scale: just c (forgot to scale)
  // - off-by-one power-of-10: c*10 (scaled by 10 instead of 100)
  // - adding instead of multiplying: a + bigB (confuses × with +)
  // - wrong digit alignment: (a * b) * 10 (scaled by only 10, common error)

  return {
    question_number: '12',
    item_id: 'MA279790',
    answer_type: 'short_answer',
    stimulus_intro: `${person.name} knows this number sentence is true.<br><br><p style="text-align:center;">${a} × ${b} = ${c}</p>`,
    question_text: `What is the value of {?} that makes this number sentence true?<br><br><p style="text-align:center;">${a} × ${bigB} = {?}</p>`,
    input_widget: 'text',
    answer_suffix: null,
    correct_answer: String(answer),
  };
}

// ─── 2022 Q13: ShortAnswer + ProtractorImage — read one angle from a protractor ───
//
// Base item: A protractor shows a single ray labeled A at 45°.
// The student reads the angle measure and enters it in the box.
//
// Generator varies the angle (common whole-number degree values readable from a
// standard protractor). The correct answer equals the angle in degrees.
// Distractors are not needed for short-answer; the generator just randomizes the angle.
//
function generate2022Q13() {
  // Pick from common protractor-reading angles on major/mid ticks
  // Note: ProtractorImage flips the baseline ray to the left whenever the
  // rendered ray's angle exceeds 90°, so the readable measure at that point
  // comes off the inner scale (180 - angle), not the raw render angle.
  const candidateAngles = [30, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150];
  const angle = pick(candidateAngles);
  const measure = angle > 90 ? 180 - angle : angle;

  return {
    question_number: '13',
    item_id: 'MA903537924',
    answer_type: 'short_answer',
    stimulus_intro: 'A protractor is used to measure angle <em>A</em>, as shown.',
    stimulus_type: 'protractor_image',
    stimulus_params: {
      rays: [{ label: 'A', angle }],
      center_label: '',
      base_label: '',
    },
    question_text: 'What is the measure, in degrees, of angle <em>A</em>?',
    input_widget: 'text',
    answer_suffix: 'degrees',
    correct_answer: String(measure),
  };
}

// ─── 2022 Q14: ShortAnswer — equivalent fractions, find the missing denominator ───
//
// Base item: 4/6 = 8/c. Student finds c = 12 (multiply both numerator and
// denominator by 2). No distractors needed for short-answer.
//
// Generator varies the base fraction and multiplier so that the resulting
// numerator is always a whole number and the answer is unambiguous.
// Error types (for pedagogical notes — not used as distractors here):
//   - adds instead of multiplies: 4+4=8, so 6+4=10 → c=10
//   - uses numerator difference: 8-4=4, so c=6+4=10 → c=10
//   - copies denominator: c=6 (ignores the relationship)
//
function generate2022Q14() {
  // Pairs [num, den] where multiplier yields clean whole-number results
  const baseFractions = [
    [1, 2], [1, 3], [1, 4], [2, 3], [3, 4],
    [2, 5], [3, 5], [1, 5], [2, 6], [3, 8],
  ];
  const multipliers = [2, 3, 4, 5];

  const [num, den] = pick(baseFractions);
  const mult = pick(multipliers);
  const newNum = num * mult;
  const answer = den * mult;

  // Build the fraction HTML using the .frac CSS classes
  const fracHTML = (n, d) =>
    `<span class="frac"><span class="frac-num">${n}</span><span class="frac-den">${d}</span></span>`;

  const mathExpr = `${fracHTML(num, den)} = ${fracHTML(newNum, '<em>c</em>')}`;

  return {
    question_number: '14',
    item_id: 'MA800767155',
    answer_type: 'short_answer',
    question_text: 'What value of <em>c</em> makes this equation true?',
    math_expression: mathExpr,
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    input_widget: 'text',
    answer_suffix: null,
    correct_answer: String(answer),
  };
}

// ─── 2022 Q15: MultiPart — Growing square-triangle pattern (4 parts) ─────────
// StepPattern stimulus only supports two fixed-ratio layouts:
//   'square_center': 1 square + 2 triangles per step  (triangles = 2 × squares)
//   'triangle_center': 1 triangle + 2 squares per step (squares = 2 × triangles)
// Generator picks between them each time for setup variation, instead of
// always doubling squares. Whichever shape is NOT doubled uses count = N;
// the doubled shape uses count = 2N.
//
// Part A (short_answer): triangles in step 4
// Part B (constructed_response): triangles in step 6
// Part C (constructed_response): squares in step 9, explain via multiplication
// Part D (constructed_response): step with N triangles → squares
//
// Generator varies the step numbers asked about:
//   Part A target step: 4-6
//   Part B target step: 5-9
//   Part C target step: 7-12
//   Part D total triangles: chosen so it maps back to a clean step number
//
function generate2022Q15() {
  const variant = pick(['square_center', 'triangle_center']);
  const perStepTri = variant === 'square_center' ? 2 : 1;
  const perStepSq  = variant === 'square_center' ? 1 : 2;
  const introText = variant === 'square_center'
    ? 'A student uses squares and triangles to make a pattern. In each step of the pattern, the student adds 1 square and 2 triangles, as shown.'
    : 'A student uses triangles and squares to make a pattern. In each step of the pattern, the student adds 1 triangle and 2 squares, as shown.';

  // Part A: total triangles in Step stepA
  const stepA = randInt(4, 8);
  const triA = stepA * perStepTri;

  // Part B: total triangles in Step stepB
  let stepB = randInt(5, 9);
  if (stepB === stepA) stepB = stepB < 9 ? stepB + 1 : stepB - 1;
  const triB = stepB * perStepTri;

  // Part C: total squares in Step stepC (uses multiplication)
  let stepC = randInt(7, 12);
  while (stepC === stepA || stepC === stepB) {
    stepC = stepC < 12 ? stepC + 1 : 7;
  }
  const sqC = stepC * perStepSq;

  // Part D: given triangles, find squares
  const stepD = pick([8, 9, 10, 11, 12, 13, 14, 15]);
  const triD = stepD * perStepTri;
  const sqD = stepD * perStepSq;

  return {
    question_number: '15',
    item_id: 'MA311579A',
    answer_type: 'multi_part',
    question_text: 'The student continues the pattern.',
    stimulus_intro: introText,
    stimulus_type: 'step_pattern',
    stimulus_params: { steps: 3, variant },
    stimulus_list: null,
    math_expression: null,
    layout: null,
    parts: [
      {
        label: 'A',
        question_text: `What is the total number of triangles in Step ${stepA} of the pattern?`,
        answer_type: 'number_with_work',
        answer_unit: 'triangles',
        correct_answer: String(triA),
      },
      {
        label: 'B',
        question_text: `What is the total number of triangles in Step ${stepB} of the pattern?`,
        answer_type: 'number_with_work',
        answer_unit: 'triangles',
        correct_answer: String(triB),
      },
      {
        label: 'C',
        question_text: `What is the total number of <strong>squares</strong> in Step ${stepC} of the pattern?`,
        answer_type: 'number_with_work',
        answer_unit: 'squares',
        work_instruction: 'Explain how you can get your answer by using multiplication.',
        correct_answer: String(sqC),
      },
      {
        label: 'D',
        question_text: `One step in the pattern will have a total of ${triD} triangles. What is the total number of squares in that step?`,
        answer_type: 'number_with_work',
        answer_unit: 'squares',
        correct_answer: String(sqD),
      },
    ],
    answer_options: null,
    select_count: null,
    correct_answer: {
      A: String(triA),
      B: String(triB),
      C: String(sqC),
      D: String(sqD),
    },
  };
}

// 2022 Q16: inline_choice — round a 6-digit number to nearest thousand,
//            ten thousand, and hundred thousand.
//
// Pedagogy: The base number is chosen so the three rounding places produce
// distinctly different answers. Distractors in the tile bank include:
//   - Truncation errors (round down when should round up) → e.g. 142,000 for thousand
//   - Wrong place rounded → e.g. 142,900 (nearest hundred instead of thousand)
//   - Over-rounding → e.g. 200,000 (nearest million)
//   - Correct values for other places used as cross-distractors
function generate2022Q16() {
  // Generate a 6-digit number in the range 100,001–899,999 where
  // the hundred-thousands digit, ten-thousands digit, and thousands digit
  // each force an interesting rounding decision (no trivial .5 cases).
  // For variety, pick a template and randomize with offsets.

  // Pick a hundreds-thousands digit (1–8) and a ten-thousands digit (0–8)
  const htd = randInt(1, 8); // hundred-thousands digit
  const ttd = randInt(0, 8); // ten-thousands digit
  const td  = randInt(1, 9); // thousands digit — non-zero so rounding is interesting

  // Hundreds, tens, ones: pick hundreds 1–9, rest small
  const hd  = randInt(1, 9); // hundreds digit — determines nearest-thousand rounding
  const tnd = randInt(0, 9); // tens digit
  const od  = randInt(0, 9); // ones digit

  const num = htd * 100000 + ttd * 10000 + td * 1000 + hd * 100 + tnd * 10 + od;

  // Correct rounded values
  // Nearest thousand: look at hundreds digit
  const nearestThousand = hd >= 5
    ? (htd * 100000 + ttd * 10000 + (td + 1) * 1000)
    : (htd * 100000 + ttd * 10000 + td * 1000);

  // Nearest ten thousand: look at thousands digit
  const nearestTenThousand = td >= 5
    ? (htd * 100000 + (ttd + 1) * 10000)
    : (htd * 100000 + ttd * 10000);

  // Nearest hundred thousand: look at ten-thousands digit
  const nearestHundredThousand = ttd >= 5
    ? (htd + 1) * 100000
    : htd * 100000;

  // Build tile set: correct answers + distractors
  // Distractors:
  //   truncThousand  — truncate at thousand (round down regardless)
  const truncThousand = htd * 100000 + ttd * 10000 + td * 1000;
  //   nearestHundred — round to nearest hundred (wrong place for row 1)
  const nearestHundred = hd >= 5
    ? htd * 100000 + ttd * 10000 + td * 1000 + (hd + 1) * 100
    : htd * 100000 + ttd * 10000 + td * 1000 + hd * 100;
  //   truncTenThousand — truncate at ten thousand (round down)
  const truncTenThousand = htd * 100000 + ttd * 10000;
  //   overRound — next hundred thousand up
  const overRound = (htd + 1) * 100000;

  // Collect unique tiles: correct answers + distractors
  const tileSet = new Set([
    nearestThousand,
    nearestTenThousand,
    nearestHundredThousand,
    truncThousand,
    truncTenThousand,
    nearestHundred,
    overRound,
  ]);

  // Ensure we have at least 6 tiles; if some collapsed (e.g. truncThousand === nearestThousand)
  // pad with the number itself rounded to nearest ten
  if (tileSet.size < 6) {
    tileSet.add(Math.round(num / 10) * 10);
  }

  // Sort tiles ascending and format with commas
  const fmt = (n) => n.toLocaleString('en-US');
  const tiles = [...tileSet].sort((a, b) => a - b).map(fmt);

  const fmtNum = num.toLocaleString('en-US');

  const options = tiles; // same 8 options for each dropdown

  return {
    question_number: '16',
    item_id: 'MA900842465',
    answer_type: 'inline_choice',
    drag_mode: true,
    question_text:
      `Round this number to the nearest thousand, the nearest ten thousand, and the nearest hundred thousand.\n\n<p style="text-align:center;">${fmtNum}</p>`,
    instruction:
      'Drag and drop the correct number into each box. Each number may be used once, more than once, or not at all.',
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    sentences: [
      `The number ${fmtNum} rounded to the nearest <strong>thousand</strong> is [RESPONSE_1].`,
      `The number ${fmtNum} rounded to the nearest <strong>ten thousand</strong> is [RESPONSE_2].`,
      `The number ${fmtNum} rounded to the nearest <strong>hundred thousand</strong> is [RESPONSE_3].`,
    ],
    dropdowns: [
      { id: 'RESPONSE_1', options },
      { id: 'RESPONSE_2', options },
      { id: 'RESPONSE_3', options },
    ],
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: `${fmt(nearestThousand)}|${fmt(nearestTenThousand)}|${fmt(nearestHundredThousand)}`,
    _params: {
      originalNumber: fmtNum,
      nearestThousand: fmt(nearestThousand),
      nearestTenThousand: fmt(nearestTenThousand),
      nearestHundredThousand: fmt(nearestHundredThousand),
    },
  };
}

// 2022 Q17 — Which two fractions are equivalent? (hotspot multi-select with fraction tiles)
// Standard: 4.NF.C.5 — Express fraction with denominator 10 as equivalent with denominator 100
function generate2022Q17() {
  // The original item fixes the 7 tiles: 4/1, 40/1, 4/10, 44/10, 4/100, 40/100, 44/100.
  // We generalize: pick a numerator n (1–9), then build the equivalent pair n/10 and (10n)/100.
  // Distractors are the other 5 fractions chosen to probe common errors:
  //   n/1  — ignores denominator entirely
  //   (10n)/1 — multiplied both numerator and denominator by 10 in the wrong direction
  //   (n*11)/10 — added n to both numerator and denominator (additive error)
  //   n/100 — kept numerator, changed denominator only (forgot to scale numerator)
  //   (n*11)/100 — scaled denominator correctly but also added n to numerator

  const n = randInt(1, 9);
  const correctA = `[${n}/10]`;       // e.g. 4/10
  const correctB = `[${n * 10}/100]`; // e.g. 40/100

  const distractors = [
    `[${n}/1]`,           // stripped denominator
    `[${n * 10}/1]`,      // wrong direction — multiplied both num and denom then lost denom
    `[${n * 11}/10]`,     // additive error: added n to both num and denom
    `[${n}/100]`,         // forgot to scale numerator when scaling denominator
    `[${n * 11}/100]`,    // scaled denom but also added n to numerator
  ];

  const rawOpts17b = shuffle([
    { text: `[${n}/1]`,         isCorrect: false },
    { text: `[${n * 10}/1]`,    isCorrect: false },
    { text: `[${n}/10]`,        isCorrect: true  },
    { text: `[${n * 11}/10]`,   isCorrect: false },
    { text: `[${n}/100]`,       isCorrect: false },
    { text: `[${n * 10}/100]`,  isCorrect: true  },
    { text: `[${n * 11}/100]`,  isCorrect: false },
  ]);
  const letters17b = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const answer_options = rawOpts17b.map((o, i) => ({ letter: letters17b[i], text: o.text }));
  const correct17b = letters17b.filter((_, i) => rawOpts17b[i].isCorrect).join(',');

  return {
    question_number: '17',
    item_id: 'MA903134963',
    answer_type: 'multiple_select',
    question_text: 'Which two fractions are equivalent?',
    select_count: 2,
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    answer_options,
    parts: null,
    correct_answer: correct17b,
  };
}

function generate2022Q18() {
  // Shape library: each entry has polygon vertices and parallel/perpendicular pair counts.
  // perpendicular refers to adjacent side pairs meeting at 90°.
  const SHAPE_LIB = {
    right_trapezoid:      { v: [[-50,-45],[50,-45],[50,45],[-70,45]],   parallel: 1, perp: 1 },
    right_trapezoid_alt:  { v: [[-50,-45],[50,-45],[20,45],[-50,45]],   parallel: 1, perp: 1 },
    rectangle:            { v: [[-55,-25],[55,-25],[55,25],[-55,25]],   parallel: 2, perp: 2 },
    tall_rectangle:       { v: [[-30,-50],[30,-50],[30,50],[-30,50]],   parallel: 2, perp: 2 },
    square_upright:       { v: [[-40,-40],[40,-40],[40,40],[-40,40]],   parallel: 2, perp: 2 },
    square_tilted:        { v: [[0,-50],[50,0],[0,50],[-50,0]],         parallel: 2, perp: 2 },
    parallelogram:        { v: [[-30,-30],[70,-30],[30,30],[-70,30]],   parallel: 2, perp: 0 },
    parallelogram_alt:    { v: [[-40,-25],[60,-25],[40,25],[-60,25]],   parallel: 2, perp: 0 },
    rhombus:              { v: [[0,-55],[45,0],[0,55],[-45,0]],         parallel: 2, perp: 0 },
    isosceles_trapezoid:  { v: [[-30,-40],[30,-40],[60,40],[-60,40]],   parallel: 1, perp: 0 },
    isosceles_trap_alt:   { v: [[-20,-35],[20,-35],[55,35],[-55,35]],   parallel: 1, perp: 0 },
    right_triangle:       { v: [[-45,-45],[-45,45],[50,45]],            parallel: 0, perp: 1 },
    general_triangle:     { v: [[-50,40],[0,-50],[60,40]],              parallel: 0, perp: 0 },
    kite:                 { v: [[0,-60],[-35,0],[0,50],[35,0]],         parallel: 0, perp: 0 },
  };

  // Clean student-facing names for the internal SHAPE_LIB keys (which use
  // snake_case disambiguation suffixes like _alt/_upright/_tilted purely to
  // pick a distinct polygon — those must never leak into the reveal verbatim).
  const SHAPE_DISPLAY_NAMES = {
    right_trapezoid: 'right trapezoid', right_trapezoid_alt: 'right trapezoid',
    rectangle: 'rectangle', tall_rectangle: 'rectangle',
    square_upright: 'square', square_tilted: 'square',
    parallelogram: 'parallelogram', parallelogram_alt: 'parallelogram',
    rhombus: 'rhombus',
    isosceles_trapezoid: 'isosceles trapezoid', isosceles_trap_alt: 'isosceles trapezoid',
    right_triangle: 'right triangle', general_triangle: 'triangle',
    kite: 'kite',
  };

  // Three question variants, each with exactly select_count correct answers among 5 options.
  const VARIANTS = [
    {
      question: 'Which of these shapes appear to have at least one pair of parallel sides <strong>and</strong> at least one pair of perpendicular sides?',
      filter: s => s.parallel >= 1 && s.perp >= 1,
      correct_names: ['right_trapezoid', 'rectangle', 'square_upright'],
      wrong_names:   ['parallelogram', 'isosceles_trapezoid'],
    },
    {
      question: 'Which of these shapes appear to have at least two pairs of parallel sides <strong>and</strong> at least two pairs of perpendicular sides?',
      filter: s => s.parallel >= 2 && s.perp >= 2,
      correct_names: ['rectangle', 'tall_rectangle'],
      wrong_names:   ['right_trapezoid', 'rhombus', 'isosceles_trapezoid'],
    },
    {
      question: 'Which of these shapes appear to have at least one pair of parallel sides but <strong>no</strong> pairs of perpendicular sides?',
      filter: s => s.parallel >= 1 && s.perp === 0,
      correct_names: ['parallelogram', 'rhombus', 'isosceles_trapezoid'],
      wrong_names:   ['rectangle', 'right_triangle'],
    },
    {
      question: 'Which of these shapes appear to have at least one pair of parallel sides <strong>and</strong> at least one pair of perpendicular sides?',
      filter: s => s.parallel >= 1 && s.perp >= 1,
      correct_names: ['right_trapezoid_alt', 'tall_rectangle', 'square_tilted'],
      wrong_names:   ['parallelogram_alt', 'isosceles_trap_alt'],
    },
  ];

  const variant = pick(VARIANTS);
  const allNames = [...variant.correct_names, ...variant.wrong_names];
  const shuffled = shuffle(allNames);
  const letters = ['A', 'B', 'C', 'D', 'E'];

  const answer_options = shuffled.map((name, i) => {
    const s = SHAPE_LIB[name];
    return {
      letter: letters[i],
      shape: { type: 'polygon', vertices: s.v },
    };
  });

  const correctLetters = variant.correct_names
    .map(name => letters[shuffled.indexOf(name)])
    .sort()
    .join(',');

  return {
    question_number: '18',
    item_id: 'MA903757124',
    answer_type: 'multiple_select',
    question_text: variant.question,
    select_count: variant.correct_names.length,
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    answer_options,
    parts: null,
    correct_answer: correctLetters,
    _params: {
      correctLetters: correctLetters.split(',').join(', '),
      correctShapeNames: variant.correct_names.map(n => SHAPE_DISPLAY_NAMES[n] ?? n.replace(/_/g, ' ')).join(', '),
      perpWanted: variant.question.includes('<strong>no</strong>') ? 'no' : 'yes',
    },
  };
}

function generate2022Q19() {
  // Vary the decimal: tenths (0.1–0.9) and common hundredths (0.25, 0.50, 0.75)
  // Standard: 4.NF.C.6 — decimal↔fraction equivalence.

  const scenarios = [
    // Tenths: n/10
    ...Array.from({ length: 9 }, (_, i) => {
      const n = i + 1;
      return {
        decimal: `0.${n}`,
        correct: `[${n}/10]`,
        distractors: n >= 2
          ? [`[1/${n}]`, `[${n}/100]`, `[1/${n * 10}]`]
          : [`[1/1]`, `[1/100]`, `[10/1]`],
      };
    }),
    // Common hundredths
    { decimal: '0.25', correct: '[25/100]', distractors: ['[1/4]', '[25/10]', '[2/5]'] },
    { decimal: '0.50', correct: '[50/100]', distractors: ['[5/10]', '[1/2]', '[50/10]'] },
    { decimal: '0.75', correct: '[75/100]', distractors: ['[3/4]', '[75/10]', '[7/5]'] },
  ];

  const { decimal, correct, distractors } = pick(scenarios);
  const picked = shuffle(distractors).slice(0, 3);
  const allOpts = shuffle([correct, ...picked]);
  const letters = ['A', 'B', 'C', 'D'];
  const answer_options = allOpts.map((text, i) => ({ letter: letters[i], text }));
  const correctLetter = letters[allOpts.indexOf(correct)];

  return {
    question_number: '19',
    item_id: 'MA286765',
    answer_type: 'multiple_choice',
    question_text: `Which of these fractions is equivalent to ${decimal}?`,
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    math_expression: null,
    answer_options,
    parts: null,
    select_count: null,
    correct_answer: correctLetter,
  };
}

// ─── 2022 Q20: Fraction model — product of whole number × unit fraction ───────
function generate2022Q20() {
  // Standard 4.NF.B.4 — Multiply a fraction by a whole number.
  // The task: show N × (1/d) as a fraction model across multiple "One Whole" rectangles.
  // The product N/d may be > 1, so we need ceil(N/d) rectangles.
  //
  // We vary the whole number N (2–5) and unit fraction denominator d (2–4).
  // Distractors for incorrect student thinking don't apply to a fraction_model question —
  // it is an open-ended construction task. The generator instead randomises the expression
  // and computes the correct shading state.
  //
  // Correct answer representation: each model specifies { numerator, denominator, label }
  // where the sum of all numerators/denominator = N/d.
  //   - Fill complete wholes first (numerator = denominator).
  //   - Last rectangle gets the remainder.

  const denominators = [2, 3, 4];
  const d = pick(denominators);
  // Choose N so product N/d is between 1 and just under 3 (to keep model count 2–3)
  // N ranges from d+1 to 2*d+1, capped so we don't get more than 3 rectangles
  const minN = d + 1;
  const maxN = Math.min(3 * d - 1, 5 * d);
  const N = randInt(minN, maxN);

  // Compute how many complete wholes and the remainder
  const totalNumerator = N;       // product = N * (1/d) = N/d
  const wholes = Math.floor(totalNumerator / d);
  const remainder = totalNumerator % d;
  const numModels = wholes + (remainder > 0 ? 1 : 0);

  const models = [];
  for (let i = 0; i < wholes; i++) {
    models.push({ numerator: d, denominator: d, label: 'One Whole' });
  }
  if (remainder > 0) {
    models.push({ numerator: remainder, denominator: d, label: 'One Whole' });
  }

  return {
    question_number: '20',
    item_id: 'MA704650142',
    answer_type: 'fraction_model',
    question_text: 'Create a fraction model to show the product of this expression.',
    math_expression: `${N} &times; [1/${d}]`,
    instruction: 'Each figure represents one whole. Shade the fraction of the model that represents the product of the expression.<br><br>Divide each figure into the correct number of equal parts by using the More and Fewer buttons. Then shade by selecting the part or parts.',
    models,
    model_params: { numerator: totalNumerator, denominator: d },
    stimulus_intro: null,
    stimulus_type: null,
    stimulus_params: null,
    stimulus_list: null,
    answer_options: null,
    parts: null,
    select_count: null,
    correct_answer: `${totalNumerator}/${d}`,
  };
}

// ─── 2025 remaining generators ───────────────────────────────────────────────

// 2025 Q4: InlineChoice + RectangleDiagram — perimeter of a rectangle room
// Standard: 4.MD.A.3
function generate2025Q4() {
  let w, h;
  do {
    w = randInt(4, 20);
    h = randInt(4, 20);
  } while (w === h);

  const perim  = 2 * w + 2 * h;
  const halfP  = w + h;        // forgot ×2 error
  const area   = w * h;        // area confusion

  // Sort options numerically for natural dropdown order
  const numOpts = [halfP, perim, area].sort((a, b) => a - b).map(String);

  return {
    question_number: '4',
    answer_type: 'inline_choice',
    stimulus_intro: `A room has a length of ${w} feet and a width of ${h} feet.`,
    stimulus_type: 'rectangle_diagram',
    stimulus_params: { width: w, height: h, width_label: `${w} feet`, height_label: `${h} feet` },
    instruction: 'Select from the drop-down menus to correctly complete the sentence.',
    sentences: ['The floor of the room has a perimeter of [RESPONSE_A1] [RESPONSE_A2].'],
    dropdowns: [
      { id: 'RESPONSE_A1', options: numOpts },
      { id: 'RESPONSE_A2', options: ['feet', 'square feet'] },
    ],
    correct_answer: `${perim}|feet`,
    // inline_choice's correct_answer is a raw pipe-joined string, not covered
    // by the generic extractor — without this the reveal has no placeholder
    // for the actual perimeter value at all.
    _params: { perimeter: String(perim) }
  };
}

// 2025 Q6: MultipleChoice — round a 6-digit number to the nearest thousand
// Standard: 4.NBT.A.3
function generate2025Q6() {
  let N, roundTH;
  do {
    N = randInt(100, 999) * 1000 + randInt(1, 999);
    roundTH = Math.round(N / 1000) * 1000;
  } while (N % 1000 === 500); // avoid exact halfway

  const d1 = roundTH - 1000;          // wrong direction
  const d2 = roundTH + 1000;          // other wrong direction
  const d3 = Math.ceil(N / 10000) * 10000; // nearest ten-thousand rounded up

  const pool = shuffle([
    { val: roundTH, isCorrect: true  },
    { val: d1,      isCorrect: false },
    { val: d2,      isCorrect: false },
    { val: d3,      isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '6',
    answer_type: 'multiple_choice',
    question_text: `Which of these numbers is ${N.toLocaleString()} rounded to the nearest <strong>thousand</strong>?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.val.toLocaleString() })),
    correct_answer: correctLetter,
  };
}

// 2025 Q8: MultipleSelect — which equations correctly find y from "N = M × y"?
// Standard: 4.OA.A.2 — multiply/divide to find unknown factor
function generate2025Q8() {
  const SCENARIOS = [
    { N: 36, M: 4, obj: 'jars of paint',  group: 'students' },
    { N: 45, M: 5, obj: 'apples',          group: 'students' },
    { N: 28, M: 4, obj: 'books',           group: 'children' },
    { N: 42, M: 6, obj: 'crayons',         group: 'students' },
    { N: 48, M: 8, obj: 'stickers',        group: 'friends'  },
    { N: 30, M: 5, obj: 'pencils',         group: 'students' },
    { N: 56, M: 7, obj: 'markers',         group: 'children' },
    { N: 35, M: 5, obj: 'cards',           group: 'students' },
    { N: 24, M: 4, obj: 'cookies',         group: 'students' },
    { N: 63, M: 9, obj: 'beads',           group: 'students' },
  ];
  const sc = pick(SCENARIOS);
  const { N, M, obj, group } = sc;

  const rawOpts = shuffle([
    { text: `${N} ÷ ${M} = y`, isCorrect: true  },
    { text: `${M} × y = ${N}`, isCorrect: true  },
    { text: `y ÷ ${M} = ${N}`, isCorrect: false }, // wrong: y = N×M
    { text: `${N} × y = ${M}`, isCorrect: false }, // wrong: y = M/N
    { text: `${N} ÷ y = ${M}`, isCorrect: true  },
  ]);
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const correct_answer = letters.filter((_, i) => rawOpts[i].isCorrect).join(',');

  return {
    question_number: '8',
    answer_type: 'multiple_select',
    stimulus_intro: `A teacher has ${N} ${obj}. The number of ${obj} is ${M} times the number of ${group} in the class.`,
    question_text: `Which of these equations can be used to find y, the number of ${group} in the class?`,
    select_count: 3,
    answer_options: rawOpts.map((o, i) => ({ letter: letters[i], text: o.text })),
    correct_answer,
  };
}

// 2025 Q9: MultipleChoice — angle measure for a fraction of a full turn
// Standard: 4.MD.C.5a (same concept as 2023 Q10, different item)
function generate2025Q9() {
  const CASES = [
    { num: 1, denom: 2, degrees: 180, distractors: [90, 120, 270]  },
    { num: 1, denom: 3, degrees: 120, distractors: [45, 90, 180]   },
    { num: 1, denom: 4, degrees: 90,  distractors: [45, 120, 180]  },
    { num: 1, denom: 6, degrees: 60,  distractors: [30, 90, 120]   },
    { num: 1, denom: 8, degrees: 45,  distractors: [30, 60, 90]    },
    { num: 3, denom: 4, degrees: 270, distractors: [90, 180, 360]  },
    { num: 2, denom: 3, degrees: 240, distractors: [120, 180, 270] },
  ];
  const SCENARIOS = [
    (frac) => `What is the measure of an angle that turns through ${frac} of a circle?`,
    (frac) => `A ceiling fan blade turns through ${frac} of a full rotation. What is the measure of that turn?`,
    (frac) => `The minute hand on a clock sweeps through ${frac} of the clock face. What is the measure of that turn?`,
    (frac) => `A spinner turns through ${frac} of a full circle. What is the measure of that turn?`,
    (frac) => `A steering wheel is turned through ${frac} of a full turn. What is the measure of that turn?`,
    (frac) => `A wheel completes ${frac} of one full turn. What is the measure of that turn?`,
  ];

  const c = pick(CASES);
  const template = pick(SCENARIOS);
  const pool = shuffle([c.degrees, ...c.distractors]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.indexOf(c.degrees)];

  return {
    question_number: '9',
    answer_type: 'multiple_choice',
    question_text: template(`[${c.num}/${c.denom}]`),
    answer_options: pool.map((v, i) => ({ letter: letters[i], text: `${v}°` })),
    correct_answer: correctLetter,
  };
}

// 2025 Q11: MultipleChoice — j jugs × n/d gallon each = total as improper fraction
// Standard: 4.NF.B.4b — multiply a fraction by a whole number
function generate2025Q11() {
  const CASES = [
    { j: 5, n: 3, d: 4, item: 'jugs',       fluid: 'gallon'  },
    { j: 5, n: 2, d: 3, item: 'bottles',    fluid: 'liter'   },
    { j: 7, n: 3, d: 4, item: 'containers', fluid: 'gallon'  },
    { j: 3, n: 5, d: 8, item: 'pails',      fluid: 'gallon'  },
    { j: 3, n: 7, d: 8, item: 'jugs',       fluid: 'gallon'  },
    { j: 4, n: 3, d: 5, item: 'jugs',       fluid: 'liter'   },
  ];
  const c = pick(CASES);
  const { j, n, d, item, fluid } = c;
  const correctNum = j * n;           // (j×n)/d

  // Distractor formulas — each matches a named misconception:
  const d1Num = j * d + n;            // treats j as j wholes: j×d/d + n/d = (j×d+n)/d
  const d2Num = n;  const d2Den = d*j; // divides denominator by j instead: n/(d×j)
  const d3Num = j*n; const d3Den = d*j; // multiplies both: (j×n)/(d×j)

  const pool = shuffle([
    { top: correctNum,  bot: d,    isCorrect: true  },
    { top: d1Num,       bot: d,    isCorrect: false },
    { top: d2Num,       bot: d2Den, isCorrect: false },
    { top: d3Num,       bot: d3Den, isCorrect: false },
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '11',
    answer_type: 'multiple_choice',
    stimulus_intro: `There are ${j} ${item} on a table. Each ${item.replace(/s$/, '')} is filled with [${n}/${d}] ${fluid} of water.`,
    question_text: `What is the total number of ${fluid}s of water in all of the ${item}?`,
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: `[${o.top}/${o.bot}]` })),
    correct_answer: correctLetter,
  };
}

// 2025 Q12: MultipleChoice — find w in a subtraction equation
// Standard: 4.NBT.B.4
function generate2025Q12() {
  const N = randInt(200, 900) * 100 + randInt(10, 99);  // 5-digit minuend
  const M = randInt(10, 99) * 100 + randInt(1, 99);     // 4-digit subtrahend
  const diff = N - M;
  const d = M % 10 === 0 ? 3 : Math.max(2, M % 9 || 3); // divisor proxy for distractor spacing

  const pool = shuffle([
    { val: diff,       isCorrect: true  },
    { val: diff + 10,  isCorrect: false }, // error in ones/tens
    { val: diff + 100, isCorrect: false }, // error in hundreds
    { val: diff + 1000, isCorrect: false }, // error in thousands
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '12',
    answer_type: 'multiple_choice',
    stimulus_intro: 'An equation is shown.',
    math_expression: `${N.toLocaleString()} − ${M.toLocaleString()} = w`,
    question_text: 'What value of w makes the equation true?',
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.val.toLocaleString() })),
    correct_answer: correctLetter,
  };
}

// 2025 Q16: MultipleSelect — identify 3 factors of a given number
// Standard: 4.OA.B.4 — find factor pairs; determine factors
function generate2025Q16() {
  const CASES = [
    { n: 64, options: [6,  8,  16, 24, 64, 128], correct: [8,  16, 64]  },
    { n: 48, options: [6,  7,  8,  12, 14, 25],  correct: [6,  8,  12]  },
    { n: 36, options: [6,  8,  9,  12, 14, 16],  correct: [6,  9,  12]  },
    { n: 60, options: [7,  10, 12, 14, 15, 16],  correct: [10, 12, 15]  },
    { n: 72, options: [7,  8,  9,  10, 12, 16],  correct: [8,  9,  12]  },
    { n: 80, options: [6,  8,  10, 12, 16, 24],  correct: [8,  10, 16]  },
    { n: 32, options: [4,  6,  8,  10, 16, 24],  correct: [4,  8,  16]  },
    { n: 24, options: [4,  5,  6,  8,  9,  16],  correct: [4,  6,  8]   },
  ];
  const c = pick(CASES);
  const sorted = [...c.options].sort((a, b) => a - b);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const correctLetters = c.correct
    .map(f => letters[sorted.indexOf(f)])
    .sort()
    .join(',');

  return {
    question_number: '16',
    answer_type: 'multiple_select',
    question_text: `Which of these numbers are factors of ${c.n}?`,
    select_count: 3,
    answer_options: sorted.map((v, i) => ({ letter: letters[i], text: String(v) })),
    correct_answer: correctLetters,
  };
}

// 2025 Q17: ShortAnswer — write a fraction equivalent to a decimal
// Standard: 4.NF.C.6 — denominators 10 or 100 only (thousandths is out of scope for 4th grade)
function generate2025Q17() {
  const denom = pick([10, 100]);
  let num, decimal;
  if (denom === 10) {
    num = randInt(1, 9);
    decimal = (num / 10).toFixed(1);
  } else {
    // Not on a tenths boundary so the equivalent fraction is unambiguously N/100
    const tens = randInt(1, 8);
    const ones = randInt(1, 9);
    num = tens * 10 + ones;
    decimal = (num / 100).toFixed(2);
  }

  return {
    question_number: '17',
    answer_type: 'short_answer',
    stimulus_intro: 'A decimal number is shown.',
    math_expression: decimal,
    question_text: 'Write a fraction that is equivalent to the decimal number.',
    input_width: '110px',
    correct_answer: `${num}/${denom}`,
  };
}

// 2025 Q18: MultipleChoice — quotient of a 4-digit ÷ 1-digit expression
// Standard: 4.NBT.B.6
function generate2025Q18() {
  const d = randInt(2, 9);
  const q = randInt(200, 999);
  const N = d * q;

  // Distractors are offsets modeled on standard long-division errors
  const pool = shuffle([
    { val: q,           isCorrect: true  },
    { val: q + 10,      isCorrect: false }, // ones/tens place error
    { val: q + 19 * d,  isCorrect: false }, // multi-step carry error
    { val: q + 27 * d,  isCorrect: false }, // larger carry accumulation
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const correctLetter = letters[pool.findIndex(o => o.isCorrect)];

  return {
    question_number: '18',
    answer_type: 'multiple_choice',
    stimulus_intro: 'An expression is shown.',
    math_expression: `${N.toLocaleString()} ÷ ${d}`,
    question_text: 'What is the quotient of this expression?',
    answer_options: pool.map((o, i) => ({ letter: letters[i], text: o.val.toLocaleString() })),
    correct_answer: correctLetter,
  };
}

// 2025 Q19: ShortAnswer — next term in a subtraction arithmetic sequence
// Standard: 4.OA.C.5 — generate and analyze a number pattern
function generate2025Q19() {
  const STEPS = [-2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12];
  const step = pick(STEPS);
  // Start high enough that all 5 terms stay positive
  const start = randInt(Math.abs(step) * 5 + 10, 400);
  const terms = [0, 1, 2, 3].map(i => start + i * step);
  const next  = start + 4 * step;

  return {
    question_number: '19',
    answer_type: 'short_answer',
    stimulus_intro: 'A student wrote this subtraction pattern.',
    math_expression: `${terms.join(', ')}, . . .`,
    question_text: "The student uses the same rule each time to find the next number in the pattern. What is the next number in the student's pattern?",
    correct_answer: String(next),
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
  // 2021
  'MA704649496': generate2021Q1,
  'MA307079':    generate2021Q2,
  'MA229063':    generate2021Q3,
  'MA297973':    generate2021Q4,
  'MA800628900': generate2021Q5,
  'MA800780932': generate2021Q6,
  'MA306940':    generate2021Q7,
  'MA800629956': generate2021Q8,
  'MA800763292': generate2021Q9,
  'MA270627':    generate2021Q10,
  'MA803730594': generate2021Q11,
  'MA736379417': generate2021Q12,
  'MA311574':    generate2021Q13,
  'MA287484':    generate2021Q14,
  'MA713629341': generate2021Q15,
  'MA714226701': generate2021Q16,
  'MA803742735': generate2021Q17,
  'MA803846674': generate2021Q18,
  'MA306993':    generate2021Q19,
  'MA803746135': generate2021Q20,
  // 2023
  'MA301798':    generate2023Q1,
  'MA297614':    generate2023Q2,
  'MA247705':    generate2023Q3,
  'MA801035466': generate2023Q4,
  'MA002128911': generate2023Q5,
  'MA002334462': generate2023Q6,
  'MA307060':    generate2023Q7,
  'MA002140372': generate2023Q12,
  'MA002145158': generate2023Q11,
  'MA002139080': generate2023Q8,
  'MA307317':    generate2023Q13,
  'MA704653374': generate2023Q18,
  'MA900846441': generate2023Q19,
  'MA002034926': generate2023Q9,
  'MA903776098': generate2023Q10,
  'MA002135528': generate2023Q14,
  'MA903571693': generate2023Q15,
  'MA001851276': generate2023Q16,
  'MA001750121': generate2023Q17,
  'MA303324':    generate2023Q20,
  // 2025
  'MA900754381': generate2025Q1,
  'MA136448521': generate2025Q2,
  'MA800780887': generate2025Q3,
  'MA010534486': generate2025Q4,
  'MA232254177': generate2025Q5,
  'MA202029218': generate2025Q6,
  'MA713677363': generate2025Q7,
  'MA900741771': generate2025Q8,
  'MA311554':    generate2025Q9,
  'MA232261850': generate2025Q10,
  'MA233051799': generate2025Q11,
  'MA307314':    generate2025Q12,
  'MA900776517': generate2025Q13,
  'MA231875780': generate2025Q14,
  'MA000732007': generate2025Q15,
  'MA900750085': generate2025Q16,
  'MA231836735': generate2025Q17,
  'MA311543':    generate2025Q18,
  'MA250533':    generate2025Q19,
  'MA002162929': generate2025Q20,
  // 2022
  'MA900845776': generate2022Q1,
  'MA307692':    generate2022Q2,
  'MA704652242': generate2022Q3,
  'MA307310':    generate2022Q4,
  'MA900775955': generate2022Q5,
  'MA307066':    generate2022Q6,
  'MA623833763': generate2022Q7,
  'MA903574399': generate2022Q8,
  'MA800633803': generate2022Q9,
  'MA900751683': generate2022Q10,
  'MA803738583': generate2022Q11,
  'MA279790':    generate2022Q12,
  'MA903537924': generate2022Q13,
  'MA800767155': generate2022Q14,
  'MA311579A':   generate2022Q15,
  'MA900842465': generate2022Q16,
  'MA903134963': generate2022Q17,
  'MA903757124': generate2022Q18,
  'MA286765':    generate2022Q19,
  'MA704650142': generate2022Q20,
};

export function generate(itemId) {
  const fn = generators[itemId];
  if (!fn) return null;
  return fn();
}
