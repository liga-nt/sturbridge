// fundamentals.js — problem generator and grader for the 'fundamentals-math' content pack
// Generates pages of randomized arithmetic drill problems for Level C and D standards.

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gcd(a, b) {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

// ---------------------------------------------------------------------------
// Problem builders — each returns { display, answer, type }
// display: string shown to student (e.g. "47 × 3")
// answer:  correct answer as a string (normalized form used for grading)
// type:    'number' | 'remainder' | 'fraction'
// ---------------------------------------------------------------------------

function multProblem(aMin, aMax, bMin, bMax, digitInput = false) {
  const a = randInt(aMin, aMax);
  const b = randInt(bMin, bMax);
  const answer = a * b;
  const prob = { display: `${a} × ${b}`, answer: String(answer), type: 'number' };
  if (digitInput) prob.factors = [a, b];
  return prob;
}

function divNoRemainder(dividendMin, dividendMax, divisorMin, divisorMax) {
  // Build a clean division problem: pick divisor, pick quotient, derive dividend
  const b = randInt(divisorMin, divisorMax);
  const maxQ = Math.floor(dividendMax / b);
  const minQ = Math.max(1, Math.ceil(dividendMin / b));
  if (minQ > maxQ) return divNoRemainder(dividendMin, dividendMax, divisorMin, divisorMax);
  const q = randInt(minQ, maxQ);
  const a = b * q;
  return { display: `${a} ÷ ${b}`, answer: String(q), type: 'number' };
}

function divWithRemainder(dividendMin, dividendMax, divisorMin, divisorMax) {
  const b = randInt(divisorMin, divisorMax);
  const a = randInt(dividendMin, dividendMax);
  const q = Math.floor(a / b);
  const r = a % b;
  // Ensure there actually is a remainder; retry if not
  if (r === 0) return divWithRemainder(dividendMin, dividendMax, divisorMin, divisorMax);
  return { display: `${a} ÷ ${b}`, answer: `${q} R ${r}`, type: 'remainder' };
}

function addProblem(aMin, aMax, bMin, bMax) {
  const a = randInt(aMin, aMax);
  const b = randInt(bMin, bMax);
  return { display: `${a} + ${b}`, answer: String(a + b), type: 'number' };
}

function subProblem(aMin, aMax, bMin, bMax) {
  let a = randInt(aMin, aMax);
  let b = randInt(bMin, bMax);
  if (b > a) [a, b] = [b, a]; // keep positive
  return { display: `${a} − ${b}`, answer: String(a - b), type: 'number' };
}

function fractionAddSub(denomMin, denomMax) {
  const d = randInt(denomMin, denomMax);
  const a = randInt(1, d - 1);
  const b = randInt(1, d - 1);
  const op = pick(['+', '−']);
  if (op === '+') {
    const sum = a + b;
    // Keep as improper fraction if > 1; student just writes the fraction
    return { display: `${a}/${d} + ${b}/${d}`, answer: reduceFraction(sum, d), type: 'fraction' };
  } else {
    const [big, small] = a >= b ? [a, b] : [b, a];
    const diff = big - small;
    if (diff === 0) return fractionAddSub(denomMin, denomMax); // retry
    return { display: `${big}/${d} − ${small}/${d}`, answer: reduceFraction(diff, d), type: 'fraction' };
  }
}

function reductionProblem() {
  // Generate an unreduced fraction and ask student to reduce it
  const d = pick([4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24]);
  const factors = [];
  for (let i = 2; i < d; i++) {
    if (d % i === 0) factors.push(i);
  }
  if (factors.length === 0) return reductionProblem();
  const factor = pick(factors);
  const n = factor * randInt(1, Math.floor((d / factor) - 1));
  if (n === 0 || gcd(n, d) === 1) return reductionProblem(); // already reduced
  return { display: `${n}/${d}`, answer: reduceFraction(n, d), type: 'fraction' };
}

function reduceFraction(n, d) {
  const g = gcd(n, d);
  const rn = n / g;
  const rd = d / g;
  if (rd === 1) return String(rn);
  return `${rn}/${rd}`;
}

// ---------------------------------------------------------------------------
// Standard configs — keyed by standard ID
// Each entry is a function () => problem object
// ---------------------------------------------------------------------------

const CONFIGS = {
  'fund-c-mult-3':      () => multProblem(1, 9, 1, 3),
  'fund-c-mult-5':      () => multProblem(1, 9, 1, 5),
  'fund-c-mult-7':      () => multProblem(1, 9, 1, 7),
  'fund-c-mult-9':      () => multProblem(1, 9, 1, 9),
  'fund-c-mult-2x1':    () => multProblem(10, 99, 1, 9, true),
  'fund-c-mult-34x1':   () => pick([
                                () => multProblem(100, 999, 1, 9, true),
                                () => multProblem(1000, 9999, 1, 9, true)
                              ])(),
  'fund-c-div-intro':   () => divNoRemainder(1, 81, 1, 9),
  'fund-c-div-rem':     () => divWithRemainder(10, 99, 2, 9),
  'fund-c-div-2x1':     () => pick([
                                () => divNoRemainder(10, 99, 1, 9),
                                () => divWithRemainder(10, 99, 2, 9)
                              ])(),
  'fund-c-div-3x1':     () => pick([
                                () => divNoRemainder(100, 999, 1, 9),
                                () => divWithRemainder(100, 999, 2, 9)
                              ])(),
  'fund-d-mult-2x2':    () => multProblem(10, 99, 10, 99),
  'fund-d-mult-3x2':    () => multProblem(100, 999, 10, 99),
  'fund-d-addsub':      () => pick([
                                () => addProblem(100, 9999, 100, 9999),
                                () => subProblem(100, 9999, 100, 9999)
                              ])(),
  'fund-d-multdiv':     () => pick([
                                () => multProblem(10, 99, 10, 99),
                                () => divNoRemainder(100, 9999, 10, 99),
                                () => divWithRemainder(100, 9999, 10, 99)
                              ])(),
  'fund-d-div-2digit':  () => pick([
                                () => divNoRemainder(100, 9999, 10, 99),
                                () => divWithRemainder(100, 9999, 10, 99)
                              ])(),
  'fund-d-div-quotients': () => {
                              // Ensure quotient is at least 10
                              const b = randInt(10, 99);
                              const q = randInt(10, 99);
                              const r = pick([0, 0, randInt(1, b - 1)]); // sometimes remainder
                              const a = b * q + r;
                              if (r === 0) {
                                return { display: `${a} ÷ ${b}`, answer: String(q), type: 'number' };
                              }
                              return { display: `${a} ÷ ${b}`, answer: `${q} R ${r}`, type: 'remainder' };
                            },
  'fund-d-fractions':   () => fractionAddSub(2, 12),
  'fund-d-reduction':   () => reductionProblem(),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a page of N problems for a given standard.
 * Returns an array of { id, display, answer, type }.
 */
export function generatePage(standardId, count = 8) {
  const gen = CONFIGS[standardId];
  if (!gen) throw new Error(`No fundamentals config for standard: ${standardId}`);
  return Array.from({ length: count }, (_, i) => ({ id: i, ...gen() }));
}

/**
 * Grade a single problem answer.
 * studentAnswer: string typed by student
 * problem: object from generatePage()
 * Returns true/false.
 */
export function gradeProblem(problem, studentAnswer) {
  const raw = String(studentAnswer ?? '').trim();

  if (problem.type === 'number') {
    return raw === problem.answer;
  }

  if (problem.type === 'remainder') {
    // Accept "3 R 2", "3r2", "3 r 2", "3R2"
    const normalized = raw.toUpperCase().replace(/\s+/g, ' ').replace(/\s*R\s*/, ' R ');
    return normalized === problem.answer;
  }

  if (problem.type === 'fraction') {
    // Accept "3/4" or "3 / 4" — normalize spacing around slash
    const normalized = raw.replace(/\s*\/\s*/, '/');
    return normalized === problem.answer;
  }

  return false;
}

/**
 * Grade a full page.
 * answers: array of student answer strings, same length as problems.
 * Returns { results: boolean[], correct: number, total: number, allCorrect: boolean }.
 */
export function gradePage(problems, answers) {
  const results = problems.map((p, i) => gradeProblem(p, answers[i] ?? ''));
  const correct = results.filter(Boolean).length;
  return { results, correct, total: problems.length, allCorrect: correct === problems.length };
}

/** Returns true if this content pack has a config for the given standard. */
export function hasFundamentalsConfig(standardId) {
  return standardId in CONFIGS;
}
