# Question Review Session Prompt

## How to use this
Paste this into a new Claude Code session (or open this file as context). Then tell Claude which year to review, e.g.:

> "Review 2021 questions using this prompt."

---

## Project Context
Read `scripts/agent-brief.md` first — it has the full project context. Key points:
- SvelteKit + Svelte 5, Tailwind CSS 4, Firebase
- Goal: pixel-accurate recreation of TestNav digital exam questions
- Source of truth for each question: `data/items/<itemID>/` (PNG + HTML)
- Question JSON files: `data/g4-math_<year>_questions.json`
- Component files: `src/lib/components/questions/`
- Generator registry: `src/lib/utils/generators.js` (flat, keyed by item_id)
- Grading registry: `src/lib/utils/grading.js`
- Dev preview: `/dev/preview` (side-by-side component vs. PNG reference)

---

## Task
Review all 20 questions for the target year. For each question, work through the checklist below. Fix issues as you find them. Build must pass before moving to the next question.

---

## Per-Question Checklist

### 1. Read the source
- Read `data/items/<itemID>/<itemID>.png` — understand the visual layout
- Read `data/items/<itemID>/<itemID>.html` — extract exact question text, options, labels, instructions

### 2. Verify the JSON
Open `data/g4-math_<year>_questions.json` and check the question's entry:
- `question_text` matches HTML exactly (including line breaks, fractions in `[n/d]` notation)
- `answer_options` letters/text match HTML exactly
- `correct_answer` matches the CSV source of truth: `data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv`
- `stimulus_type`, `stimulus_params` match the visual stimulus in the PNG
- `parts` structure (for multi-part questions) matches HTML exactly
- `statements`, `sentences`, `dropdowns`, `tiles`, `rows` etc. match HTML exactly

### 3. Verify the generator
Find the generator in `src/lib/utils/generators.js` (keyed by `item_id`):
- Run it mentally or via `node -e "const {generate} = await import('./src/lib/utils/generators.js'); console.log(JSON.stringify(generate('<itemID>'), null, 2))"` a few times
- The generated `correct_answer` is always mathematically correct
- All distractors are pedagogically motivated (each = a named student misconception)
- No degenerate outputs (division by zero, negative counts, duplicate options, etc.)
- Parameter ranges are appropriate for Grade 4
- People/names vary via the PEOPLE array where applicable

### 4. Verify grading
Find the grader in `src/lib/utils/grading.js`:
- `gradeQuestion({ answer: correct_answer }, question)` returns `score === total`
- Common correct phrasings also pass (e.g. "8" and "8 dollars" for a money answer)
- Wrong answers correctly fail

### 5. Check for known bug patterns
See `memory/feedback_generator_bugs.md` for patterns to watch for:
- Duplicate-looking distractors (same shape + fraction + operator)
- Parallelogram skew too small (obtuse angle must be ≥ 105°)
- Wide labels on narrow shapes (assign by shape type, not area)

### 6. Build
After fixing any issues: `npm run build` — must pass before moving on.

---

## Output Format
After each question, note one of:
- `✓ Q<N> (<itemID>)` — no issues
- `FIXED Q<N> (<itemID>): <what was fixed>`
- `SKIP Q<N> (<itemID>): <why it was skipped, what needs follow-up>`

At the end of the session, summarize all fixes and any unresolved issues.

---

## Rules
- Never guess item_id mappings — always read from the PNG/HTML files in `data/items/`
- Do NOT use paper JSON files (`gr4-math_*_paper.json`) — wrong item_ids
- Fix one question at a time; build after each fix
- Stop after 2 failed fix attempts on the same question — report it, move on
- Do not refactor or clean up code outside the specific fix needed
