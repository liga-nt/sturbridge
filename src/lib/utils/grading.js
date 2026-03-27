// grading.js — frontend grading system for all 100 MCAS questions

// ─── Generic Utilities ──────────────────────────────────────────────────────

export function normalize(str) {
  if (str == null) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const STOP_WORDS = new Set(['the', 'and', 'trail', 'path', 'route', 'course']);

function stripStopWords(str) {
  return str.split(' ').filter(w => !STOP_WORDS.has(w)).join(' ').trim();
}

export function fuzzyMatch(student, expected) {
  const s = stripStopWords(normalize(student));
  const e = stripStopWords(normalize(expected));
  if (s === e) return true;
  const threshold = Math.max(2, Math.floor(e.length * 0.25)) + 1;
  return editDistance(s, e) <= threshold;
}

export function fuzzyContains(text, target) {
  const normText = normalize(text);
  const normTarget = normalize(target);
  if (normText === normTarget) return true;
  if (normText.includes(normTarget)) return true;
  const words = normText.split(' ');
  return words.some(w => fuzzyMatch(w, normTarget));
}

// Convert any numeric expression to a decimal rounded to hundredths.
// Handles: "3 1/3", "10/3", "3", "1.67", whole+fraction tool ("1 2/3").
// Returns null if the string cannot be interpreted as a number.
function toDecimal(str) {
  const s = String(str ?? '').trim();
  // Mixed number: "3 1/3"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, w, n, d] = mixed.map(Number);
    if (d === 0) return null;
    return Math.round(((w * d + n) / d) * 100) / 100;
  }
  // Fraction: "10/3"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const [, n, d] = frac.map(Number);
    if (d === 0) return null;
    return Math.round((n / d) * 100) / 100;
  }
  // Decimal or whole: "3.33", "3"
  const num = parseFloat(s);
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(s)) {
    return Math.round(num * 100) / 100;
  }
  return null;
}

// Keep parseFractionValue for the gradePart short_answer trigger check
function parseFractionValue(str) {
  return toDecimal(str) !== null;
}

function fractionsEqual(a, b) {
  const da = toDecimal(a);
  const db = toDecimal(b);
  if (da === null || db === null) return false;
  return da === db;
}

export function gradeOrderedList(studentAnswer, correctAnswer) {
  function tokenize(str) {
    return normalize(str).split(/\s+/).filter(w => w && !STOP_WORDS.has(w));
  }
  const expected = tokenize(correctAnswer);
  const student = tokenize(studentAnswer);
  if (student.length < expected.length) return false;
  return expected.every((exp, i) => fuzzyMatch(student[i], exp));
}

// ─── Main Grading Function ───────────────────────────────────────────────────

export function gradePart(studentAnswer, correctAnswer, answerType) {
  const s = studentAnswer ?? '';
  const c = correctAnswer ?? '';

  switch (answerType) {
    case 'multiple_choice': {
      return { correct: normalize(s) === normalize(String(c)) };
    }

    case 'multiple_select': {
      const sSet = new Set(String(s).split(',').map(x => normalize(x.trim())).filter(Boolean));
      const cSet = new Set(String(c).split(',').map(x => normalize(x.trim())).filter(Boolean));
      if (sSet.size !== cSet.size) return { correct: false };
      for (const v of cSet) if (!sSet.has(v)) return { correct: false };
      return { correct: true };
    }

    case 'short_answer': {
      const cStr = String(c);
      if (cStr.includes(',')) {
        return { correct: gradeOrderedList(s, cStr) };
      }
      if (parseFractionValue(cStr)) {
        return { correct: fractionsEqual(String(s), cStr) };
      }
      return { correct: fuzzyMatch(String(s), cStr) };
    }

    case 'constructed_response': {
      const cStr = String(c).trim();
      // Comparison operator only (>, <, =): check if student's answer contains it
      if (/^[<>=]$/.test(cStr)) {
        return { correct: String(s).includes(cStr) };
      }
      // Expanded form: correct answer is digits, spaces, and + signs with at least one +
      if (/^[\d\s+]+$/.test(cStr) && cStr.includes('+')) {
        const extractNums = str => (String(str).replace(/,/g, '').match(/\d+/g) || []).map(Number);
        const cNums = extractNums(cStr);
        const sNums = extractNums(String(s));
        return { correct: cNums.length > 0 && cNums.length === sNums.length && cNums.every((n, i) => n === sNums[i]) };
      }
      // Plain integer (possibly with commas): strip commas and compare
      const cDigits = cStr.replace(/,/g, '');
      if (/^\d+$/.test(cDigits)) {
        return { correct: String(s).replace(/,/g, '').trim() === cDigits };
      }
      if (parseFractionValue(cStr)) {
        return { correct: fractionsEqual(String(s), cStr) };
      }
      return { correct: fuzzyMatch(String(s), cStr) };
    }

    case 'number_line_plot': {
      // Student places a decimal point; compare as rounded decimals (±0.01 tolerance)
      const sv = Math.round(parseFloat(String(s)) * 100) / 100;
      const cv = Math.round(parseFloat(String(c)) * 100) / 100;
      return { correct: !isNaN(sv) && !isNaN(cv) && Math.abs(sv - cv) < 0.005 };
    }

    case 'drag_drop_line_plot': {
      // Answer is the exact tick label string (e.g. "2[3/4]") — normalize and compare
      return { correct: normalize(String(s)) === normalize(String(c)) };
    }

    case 'inline_choice': {
      // correctAnswer may be comma-separated selections like "C,D" (option indices)
      // or pipe-separated like "143,000|140,000|100,000"
      // or just a simple value
      // For inline_choice we compare normalized sets when pipe-separated
      if (String(c).includes('|')) {
        const cParts = String(c).split('|').map(x => normalize(x.trim()));
        const sParts = String(s).split('|').map(x => normalize(x.trim()));
        if (cParts.length !== sParts.length) return { correct: false };
        return { correct: cParts.every((cp, i) => fuzzyMatch(sParts[i] ?? '', cp)) };
      }
      return { correct: normalize(s) === normalize(String(c)) };
    }

    case 'true_false_table': {
      // correctAnswer is comma-separated "True,False,True" matching row order
      const sVals = String(s).split(',').map(x => normalize(x.trim()));
      const cVals = String(c).split(',').map(x => normalize(x.trim()));
      if (sVals.length !== cVals.length) return { correct: false };
      return { correct: sVals.every((v, i) => v === cVals[i]) };
    }

    case 'number_line_plot': {
      const sv = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
      const cv = parseFloat(String(c).replace(/[^0-9.\-]/g, ''));
      if (isNaN(sv) || isNaN(cv)) return { correct: false };
      return { correct: Math.abs(sv - cv) <= 0.05 };
    }

    case 'protractor_drag_drop': {
      // correctAnswer is a letter like "D"; compare normalized
      return { correct: normalize(s) === normalize(String(c)) };
    }

    case 'fraction_model': {
      // Student value: "shaded/den" per model, comma-joined for multi-model.
      // Correct answer: "[n/d]" notation (brackets stripped before comparing).
      // Each model is graded as a fraction equality check.
      const sModels = String(s).split(',').map(x => x.trim()).filter(Boolean);
      const cModels = String(c).replace(/\[|\]/g, '').split(',').map(x => x.trim()).filter(Boolean);
      if (sModels.length === 0 || sModels.length !== cModels.length) return { correct: false };
      return { correct: sModels.every((sv, i) => fractionsEqual(sv, cModels[i])) };
    }

    case 'category_sort': {
      // Student answer: JSON string of { [categoryLabel]: [tile, ...] }
      // Correct answer: same format — compare each category as an unordered set
      try {
        const parsed = typeof s === 'string' ? JSON.parse(s) : s;
        const cparsed = typeof c === 'string' ? JSON.parse(c) : c;
        if (typeof parsed !== 'object' || typeof cparsed !== 'object') return { correct: false };
        const cKeys = Object.keys(cparsed);
        const pKeys = Object.keys(parsed);
        if (cKeys.length !== pKeys.length) return { correct: false };
        for (const key of cKeys) {
          const cTiles = (cparsed[key] || []).map(String).sort();
          const pTiles = (parsed[key] || []).map(String).sort();
          if (cTiles.length !== pTiles.length) return { correct: false };
          if (cTiles.some((t, i) => t !== pTiles[i])) return { correct: false };
        }
        return { correct: true };
      } catch {
        return { correct: fuzzyMatch(String(s), String(c)) };
      }
    }

    case 'drag_drop_match':
    case 'drag_drop_inequality':
    case 'ordering': {
      // Student answer will be a JSON string or plain text of their arrangement
      // Try JSON parse first, else fuzzy compare to correct
      try {
        const parsed = typeof s === 'string' ? JSON.parse(s) : s;
        const cparsed = typeof c === 'string' ? JSON.parse(c) : c;
        return { correct: JSON.stringify(parsed) === JSON.stringify(cparsed) };
      } catch {
        return { correct: fuzzyMatch(String(s), String(c)) };
      }
    }

    case 'table_fill': {
      // correctAnswer is comma-separated numbers: "180,279,617"
      return { correct: gradeOrderedList(s, String(c)) };
    }

    case 'hotspot': {
      const norm = str => String(str).split(',').map(x => x.trim()).filter(Boolean).sort().join(',');
      return { correct: !!s && norm(s) === norm(c) };
    }

    default:
      return { correct: fuzzyMatch(String(s), String(c)) };
  }
}

// ─── Generic question grader (uses live question data) ───────────────────────
// Use this instead of graders[id].grade() so generated variants are graded
// against their own correct_answer, not the hardcoded base JSON answer.

export function gradeQuestion(answers, question) {
  if (!question) return { parts: [], score: 0, total: 0 };

  if (question.answer_type === 'multi_part' && question.parts) {
    const topCA = typeof question.correct_answer === 'object' ? question.correct_answer : {};
    const parts = question.parts.map(p => ({
      label: p.label,
      correct: gradePart(answers[p.label] ?? '', p.correct_answer ?? topCA[p.label], p.answer_type).correct,
    }));
    const score = parts.filter(p => p.correct).length;
    return { parts, score, total: parts.length };
  }

  const correct = gradePart(answers.answer ?? '', question.correct_answer, question.answer_type).correct;
  return { parts: [{ label: null, correct }], score: correct ? 1 : 0, total: 1 };
}

// ─── Grader Registry ─────────────────────────────────────────────────────────
// answers: { answer } for single-part, { A, B, C, ... } for multi-part
// returns: { parts: [{ label, correct }], score, total }

function single(itemId, correctAnswer, answerType, describe) {
  return {
    grade(answers) {
      const correct = gradePart(answers.answer, correctAnswer, answerType).correct;
      return { parts: [{ label: null, correct }], score: correct ? 1 : 0, total: 1 };
    },
    describe
  };
}

function multi(itemId, parts, describe) {
  return {
    grade(answers) {
      const partResults = parts.map(({ label, correctAnswer, answerType }) => {
        const correct = gradePart(answers[label], correctAnswer, answerType).correct;
        return { label, correct };
      });
      const score = partResults.filter(p => p.correct).length;
      return { parts: partResults, score, total: parts.length };
    },
    describe
  };
}

export const graders = {

  // ── 2019 ──────────────────────────────────────────────────────────────────

  'MA227383': single('MA227383', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA311551': single('MA311551', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA311583': multi('MA311583', [
    { label: 'A', correctAnswer: 'Red', answerType: 'short_answer' },
    { label: 'B', correctAnswer: 'Red, Green, Purple, Blue, White', answerType: 'short_answer' },
    { label: 'C', correctAnswer: 'Purple', answerType: 'constructed_response' },
  ], 'A: shortest trail name (fuzzy). B: five trail names in order shortest→longest. C: "Purple" mentioned with explanation (3+ words).'),

  'MA303319': single('MA303319', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA714225971': single('MA714225971', '0.27', 'number_line_plot',
    'Enter the decimal value (e.g. 0.27). Tolerance ±0.05.'),

  'MA713939739': multi('MA713939739', [
    { label: 'A', correctAnswer: 'b=5x18', answerType: 'short_answer' },
    { label: 'B', correctAnswer: '90', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: '216', answerType: 'constructed_response' },
  ], 'A: equation for basketball court length (any form with 5 and 18). B: 90 feet. C: 216 feet.'),

  'MA704647848': single('MA704647848', 'B,E', 'multiple_select',
    'Select exactly two correct letters (B and E). Both required, order does not matter.'),

  'MA303329': single('MA303329', 'D', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA714233266': {
    grade(answers) {
      // Part A: stickers 1 (pentagon) and 4 (quadrilateral) have obtuse angles
      const aCorrect = gradePart(answers.A, '1,4', 'hotspot').correct;
      // Part B: "Great!" sticker is the right triangle
      const bCorrect = gradePart(answers.B, 'Great!,one right angle', 'inline_choice').correct;
      const parts = [
        { label: 'A', correct: aCorrect },
        { label: 'B', correct: bCorrect },
      ];
      return { parts, score: parts.filter(p => p.correct).length, total: 2 };
    },
    describe: 'A: select stickers 1 and 4 (pentagon and quadrilateral). B: "Great!" + "one right angle".'
  },

  'MA222213': single('MA222213', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA307033': single('MA307033', '10', 'short_answer',
    'Enter the number 10. Fuzzy match.'),

  'MA307037': single('MA307037', '14205', 'short_answer',
    'Enter 14205 in standard form. Fuzzy match.'),

  'MA714111699': single('MA714111699', 'is,4 lines', 'inline_choice',
    'Correct selections: "is" (RESPONSE_A1) and "4 lines" (RESPONSE_A2).'),

  'MA306994': single('MA306994', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA279791': single('MA279791', '8', 'short_answer',
    'Enter the number 8 (total posters). Fuzzy match.'),

  'MA713680384': single('MA713680384', 'False,True,True', 'true_false_table',
    'Correct pattern: False, True, True.'),

  'MA704650539': single('MA704650539', 'D', 'multiple_choice',
    'Select the letter of the correct answer (D: angle A=140°, angle B=60°). Exact match.'),

  'MA304988': single('MA304988', '3 1/3', 'short_answer',
    'Enter 3 1/3 (mixed number). Fuzzy match.'),

  'MA286777': single('MA286777', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA247745': single('MA247745', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  // ── 2021 ──────────────────────────────────────────────────────────────────

  'MA704649496': single('MA704649496', '[8/10]', 'fraction_model',
    'Create a model showing 8/10 shaded. Graded as fraction equality: student value "8/10" must equal correct answer 8/10.'),

  'MA307079': single('MA307079', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA229063': single('MA229063', 'A,E', 'multiple_select',
    'Select exactly two letters (A and E). Both required, order does not matter.'),

  'MA297973': single('MA297973', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA800628900': single('MA800628900', 'B,D', 'multiple_select',
    'Select exactly two prime numbers (B=43, D=67). Both required, order does not matter.'),

  'MA800780932': multi('MA800780932', [
    { label: 'A', correctAnswer: '168021', answerType: 'constructed_response' },
    { label: 'B', correctAnswer: '100000 + 60000 + 8000 + 200 + 1', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: '<', answerType: 'constructed_response' },
    { label: 'D', correctAnswer: '170201', answerType: 'constructed_response' },
  ], 'A: 168,021 in standard form. B: expanded form of 168,201 (100000+60000+8000+200+1). C: operator < (168,021 < 168,201). D: 170,201 (1,000 more than 169,201).'),

  'MA306940': single('MA306940', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA800629956': single('MA800629956', '{"0 lines of symmetry": ["parallelogram", "trapezoid"], "1 line of symmetry": [], "2 lines of symmetry": ["rectangle"], "4 lines of symmetry": ["square"]}', 'category_sort',
    'Category sort: 0 lines=parallelogram+trapezoid, 1 line=none, 2 lines=rectangle, 4 lines=square.'),

  'MA800763292': single('MA800763292', '2[3/4]', 'drag_drop_line_plot',
    'Drag the X to the 2¾ column: the missing snowfall amount. Exact label match.'),

  'MA270627': single('MA270627', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA803730594': single('MA803730594', '162', 'short_answer',
    'Enter 162 (the 5th number in the pattern multiply-by-3 starting at 2). Fuzzy match.'),

  'MA736379417': single('MA736379417', '70', 'short_answer',
    'Enter 70 (value of x). Fuzzy match.'),

  'MA311574': single('MA311574', 'B,E', 'multiple_select',
    'Select exactly two letters (B and E). Both required, order does not matter.'),

  'MA287484': multi('MA287484', [
    { label: 'A', correctAnswer: '7 00 am', answerType: 'constructed_response' },
    { label: 'B', correctAnswer: '8 15 am', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: '11 40 am', answerType: 'constructed_response' },
    { label: 'D', correctAnswer: '4 45 pm', answerType: 'constructed_response' },
  ], 'A: 7:00 a.m. B: 8:15 a.m. C: 11:40 a.m. D: 4:45 p.m.'),

  'MA713629341': single('MA713629341', '32,7', 'inline_choice',
    'Correct: 32 pretzels total (RESPONSE_A1) and 7 bags (RESPONSE_A2). Enter as "32,7" (actual text selections).'),

  'MA714226701': multi('MA714226701', [
    { label: 'A', correctAnswer: '0.54', answerType: 'short_answer' },
    { label: 'B', correctAnswer: '0.62', answerType: 'number_line_plot' },
  ], 'A: decimal equivalent of 54/100 = 0.54. B: plot 0.62 on number line (tolerance ±0.05).'),

  'MA803742735': single('MA803742735', 'D', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA803846674': single('MA803846674', 'True,False,False,True', 'true_false_table',
    'Round to nearest ten thousand: row1=30,000 (True), row2=40,000 (False), row3=40,000 (False), row4=30,000 (True).'),

  'MA306993': single('MA306993', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA803746135': single('MA803746135', '>', 'short_answer',
    'Enter the comparison symbol > (3/6 > 4/12). Fuzzy match.'),

  // ── 2022 ──────────────────────────────────────────────────────────────────

  'MA900845776': single('MA900845776', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA307692': single('MA307692', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA704652242': single('MA704652242', 'False,True,True,False', 'true_false_table',
    'Yes/No for 4 line segments/angles. B=No (PR not used), C=Yes (PQ used), E=Yes (SPQ used), H=No (SQR not used). Enter letters.'),

  'MA307310': single('MA307310', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA900775955': single('MA900775955', '0.29 < 0.8', 'short_answer',
    'Enter the comparison: 0.29 < 0.8 (or equivalent). Fuzzy match.'),

  'MA307066': single('MA307066', '1', 'short_answer',
    'Enter 1 (one line of symmetry). Fuzzy match.'),

  'MA623833763': {
    grade(answers, question) {
      // answers is the JSON string from DragDropMatch: { "0": ["p","4","36"], ... }
      // question.rows[i].slots holds the correct answer for each row
      if (!answers || String(answers).trim() === '') return { correct: false };
      try {
        const placed = typeof answers === 'string' ? JSON.parse(answers) : answers;
        const rows = question?.rows ?? [];
        if (rows.length === 0) return { correct: !!answers };
        const allCorrect = rows.every((row, i) => {
          const studentSlots = placed[String(i)] ?? [];
          return row.slots.every((expected, j) => String(studentSlots[j] ?? '').trim() === String(expected).trim());
        });
        return { correct: allCorrect };
      } catch {
        return { correct: !!answers && String(answers).trim().length > 0 };
      }
    }
  },

  'MA903574399': multi('MA903574399', [
    { label: 'A', correctAnswer: '32', answerType: 'short_answer' },
    { label: 'B', correctAnswer: '7', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: 'yes equal', answerType: 'constructed_response' },
    { label: 'D', correctAnswer: '24', answerType: 'constructed_response' },
  ], 'A: area of garden = 32 sq ft. B: width of patio = 7 ft. C: yes, perimeters are equal (both 24 ft). D: perimeter 24, area less than 32 (e.g. length/width summing to 12).'),

  'MA800633803': single('MA800633803', '8/5', 'short_answer',
    'Enter 8/5 or 1 3/5 liters. Fuzzy match.'),

  'MA900751683': single('MA900751683', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA803738583': multi('MA803738583', [
    { label: 'A', correctAnswer: '180,279,617', answerType: 'table_fill' },
    { label: 'B', correctAnswer: '8 feet, 100 inches, 3 yards, 120 inches', answerType: 'ordering' },
  ], 'A: convert finish times to seconds (180, 279, 617). B: order distances from least to greatest.'),

  'MA279790': single('MA279790', '2800', 'short_answer',
    'Enter 2800. Fuzzy match.'),

  'MA800767155': single('MA800767155', '12', 'short_answer',
    'Enter 12 (value of c). Fuzzy match.'),

  'MA903537924': single('MA903537924', '45', 'short_answer',
    'Enter 45 (degrees). Fuzzy match.'),

  'MA311579A': multi('MA311579A', [
    { label: 'A', correctAnswer: '8', answerType: 'short_answer' },
    { label: 'B', correctAnswer: '6', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: '18', answerType: 'constructed_response' },
    { label: 'D', correctAnswer: '32', answerType: 'constructed_response' },
  ], 'A: 8 triangles in Step 4. B: 6 squares in Step 6. C: 18 triangles in Step 9. D: 32 squares when 64 triangles.'),

  'MA900842465': single('MA900842465', '143,000|140,000|100,000', 'inline_choice',
    'Rounding 142,839: nearest thousand=143,000, ten-thousand=140,000, hundred-thousand=100,000. Enter as "143,000|140,000|100,000".'),

  'MA903134963': single('MA903134963', 'C,F', 'multiple_select',
    'Select exactly two equivalent fractions (C=4/10, F=40/100). Both required.'),

  'MA903757124': single('MA903757124', 'A,C,D', 'multiple_select',
    'Select exactly three letters (A, C, D). All required.'),

  'MA286765': single('MA286765', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA704650142': single('MA704650142', '4/3', 'fraction_model',
    'Create fraction model showing 4/3 (4 × 1/3). Any non-empty answer accepted.'),

  // ── 2023 ──────────────────────────────────────────────────────────────────

  'MA301798': single('MA301798', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA297614': single('MA297614', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA247705': single('MA247705', 'D', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA801035466': {
    grade(answers) {
      // All parts are constructed_response with no fixed correct answer (open-ended)
      const parts = ['A', 'B', 'C', 'D'].map(label => ({
        label,
        correct: !!(answers[label] && String(answers[label]).trim().split(/\s+/).length >= 3)
      }));
      return { parts, score: parts.filter(p => p.correct).length, total: 4 };
    },
    describe: 'All four parts are open-ended constructed response. Any response with 3+ words is accepted for each part.'
  },

  'MA002128911': single('MA002128911', '2', 'short_answer',
    'Enter 2 (number of acute angles). Fuzzy match.'),

  'MA002334462': single('MA002334462', '0.91', 'number_line_plot',
    'Plot 91/100 = 0.91 on number line. Enter 0.91. Tolerance ±0.05.'),

  'MA307060': single('MA307060', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA002139080': single('MA002139080', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA002034926': single('MA002034926', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA903776098': single('MA903776098', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA002145158': {
    grade(answers) {
      // drag_drop_inequality: correct_answer is {slot1:"0.52", slot2:"0.65", slot3:"0.78"}
      const correctSlots = { slot1: '0.52', slot2: '0.65', slot3: '0.78' };
      let parsed;
      try { parsed = JSON.parse(answers.answer ?? '{}'); } catch { parsed = {}; }
      const parts = Object.entries(correctSlots).map(([slot, cv]) => ({
        label: slot,
        correct: fuzzyMatch(String(parsed[slot] ?? ''), cv)
      }));
      return { parts, score: parts.filter(p => p.correct).length, total: 3 };
    },
    describe: 'Drag-drop inequality: slot1=0.52, slot2=0.65, slot3=0.78. Enter JSON: {"slot1":"0.52","slot2":"0.65","slot3":"0.78"}.'
  },

  'MA002140372': single('MA002140372', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA307317': {
    grade(answers) {
      const parts = [
        { label: 'A', correct: gradePart(answers.A, '95', 'constructed_response').correct },
        { label: 'B', correct: gradePart(answers.B, '4560', 'constructed_response').correct },
        { label: 'C', correct: gradePart(answers.C, '31920', 'constructed_response').correct },
      ];
      return { parts, score: parts.filter(p => p.correct).length, total: 3 };
    },
    describe: 'A: 95 miles/week. B: 4,560 miles/year. C: 31,920 miles over 7 years.'
  },

  'MA002135528': single('MA002135528', 'C', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA903571693': single('MA903571693', 'D', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA001851276': single('MA001851276', 'False,True,True', 'true_false_table',
    'Rounding 44,285: row1=False, row2=True, row3=True.'),

  'MA001750121': single('MA001750121', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA704653374': {
    grade(answers) {
      // Part A: short_answer equation like "14 = 7 × 2"
      const aCorrect = gradePart(answers.A, '14 7 2', 'short_answer').correct ||
        (String(answers.A ?? '').includes('14') && String(answers.A ?? '').includes('7') && String(answers.A ?? '').includes('2'));
      // Part B: inline_choice RESPONSE_B1=30, RESPONSE_B2=5
      const bCorrect = gradePart(answers.B, '30 5', 'short_answer').correct ||
        (String(answers.B ?? '').includes('30') && String(answers.B ?? '').includes('5'));
      const parts = [
        { label: 'A', correct: aCorrect },
        { label: 'B', correct: bCorrect },
      ];
      return { parts, score: parts.filter(p => p.correct).length, total: 2 };
    },
    describe: 'A: multiplication equation with 14, 7, 2 (e.g. "14 = 7 × 2"). B: inline choice — 30 is 6 times as many as 5.'
  },

  'MA900846441': single('MA900846441', '[5/8]', 'fraction_model',
    'Create model showing 5/8 remaining. Any non-empty answer accepted.'),

  'MA303324': single('MA303324', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  // ── 2025 ──────────────────────────────────────────────────────────────────

  'MA900754381': single('MA900754381', 'D', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA136448521': single('MA136448521', '{"Composite": ["18", "25", "4"], "Prime": ["43", "7"]}', 'category_sort',
    'Category sort: Composite = 4, 18, 25; Prime = 7, 43.'),

  'MA800780887': multi('MA800780887', [
    { label: 'A', correctAnswer: 'D', answerType: 'multiple_choice' },
    { label: 'B', correctAnswer: '2/8', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: 'no 11/12', answerType: 'constructed_response' },
    { label: 'D', correctAnswer: '3 6/8', answerType: 'constructed_response' },
  ], 'A: D (5/8+1/8=6/8). B: 2/8 or 1/4 cookies. C: No, equation is incorrect (3/4+1/6=11/12). D: 3 6/8 pies sold.'),

  'MA010534486': single('MA010534486', '54 feet', 'inline_choice',
    'Perimeter = 54 feet. Enter "54 feet" or just "54". Fuzzy match.'),

  'MA232254177': single('MA232254177', 'A,D,E', 'multiple_select',
    'Select exactly three letters (A, D, E — shapes with parallel sides). All required.'),

  'MA202029218': single('MA202029218', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA713677363': {
    grade(answers) {
      // Part A: drag_drop_match
      const aCorrect = !!(answers.A && String(answers.A).trim().length > 0);
      // Part B: true_false_table correct_answer "False,True,False"
      const bCorrect = gradePart(answers.B, 'False,True,False', 'true_false_table').correct;
      const parts = [
        { label: 'A', correct: aCorrect },
        { label: 'B', correct: bCorrect },
      ];
      return { parts, score: parts.filter(p => p.correct).length, total: 2 };
    },
    describe: 'A: match expanded-form numbers to word form (any response). B: true_false_table — B=Greater(13831>13084), C=Less(13007<13084), F=Greater(13106>13084). Enter letters B,C,F.'
  },

  'MA900741771': single('MA900741771', 'A,B,E', 'multiple_select',
    'Select exactly three letters (A, B, E). All required.'),

  'MA311554': single('MA311554', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA232261850': single('MA232261850', 'True,False,True', 'true_false_table',
    'Line of symmetry: kite=Yes (True), parallelogram=No (False), hexagon=Yes (True).'),

  'MA233051799': single('MA233051799', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA307314': single('MA307314', 'B', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA900776517': {
    grade(answers) {
      // Any decimal less than 0.71
      const val = parseFloat(String(answers.answer ?? '').replace(/[^0-9.\-]/g, ''));
      const correct = !isNaN(val) && val < 0.71;
      return { parts: [{ label: null, correct }], score: correct ? 1 : 0, total: 1 };
    },
    describe: 'Enter any decimal number less than 0.71.'
  },

  'MA231875780': multi('MA231875780', [
    { label: 'A', correctAnswer: '8', answerType: 'short_answer' },
    { label: 'B', correctAnswer: '2000', answerType: 'constructed_response' },
    { label: 'C', correctAnswer: '225', answerType: 'constructed_response' },
    { label: 'D', correctAnswer: '7950', answerType: 'constructed_response' },
  ], 'A: 8 liters remaining. B: 2,000 mL. C: 225 minutes (3h45m). D: any value between 7,900 and 8,000 grams.'),

  'MA000732007': single('MA000732007', 'B,C', 'inline_choice',
    'PLM = 70° (B), KLP = 145° (C). Enter as "B,C".'),

  'MA900750085': single('MA900750085', 'B,C,E', 'multiple_select',
    'Select exactly three factors of 64 (B=8, C=16, E=64). All required.'),

  'MA231836735': single('MA231836735', '49/100', 'short_answer',
    'Enter 49/100 as equivalent fraction to 0.49. Fuzzy match.'),

  'MA311543': single('MA311543', 'A', 'multiple_choice',
    'Select the letter of the correct answer. Exact match.'),

  'MA250533': single('MA250533', '198', 'short_answer',
    'Enter 198 (next in pattern 234,225,216,207,...). Fuzzy match.'),

  'MA002162929': single('MA002162929', 'False,True,True', 'true_false_table',
    'Multiplication equations: row1=False, row2=True, row3=True.'),

};
