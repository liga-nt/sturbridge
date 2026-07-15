# Question Review Session Prompt

## How to use this
Paste this into a new Claude Code session (or open this file as context). Then tell Claude which year to review, e.g.:

> "Debug 2019 questions using this prompt."

---

## Project Context
- SvelteKit + Svelte 5, Tailwind CSS 4, Firebase
- Goal: pixel-accurate recreation of TestNav digital exam questions
- Question JSON files: `data/g4-math_<year>_questions.json`
- Component files: `src/lib/components/questions/`
- Generator registry: `src/lib/utils/generators.js` (flat, keyed by item_id)
- Grading registry: `src/lib/utils/grading.js`
- Dev preview: `/dev/preview` (side-by-side component vs. reference; year dropdown + question strip)

**Status: All questions and generators are built. This is a debugging session.**

---

## What to debug

All the questions, generators, and graders are already implemented. The task is to find and fix bugs — things that look wrong in the dev preview or misbehave during student interaction. Do NOT rebuild or refactor unless a fix genuinely requires it.

Common bug categories:
- Generator produces wrong correct_answer (math error, fraction simplification mistake)
- Distractor is degenerate (same value as correct, or unreachable)
- Grader accepts wrong answers or rejects correct ones
- Component renders wrong initial state (e.g. pre-filled answer, wrong pre-placed marks)
- Component doesn't reset when parent clears `answer` (add `$: if (value === null) { ... }`)
- Missing `stimulus_intro` or wrong `question_text` vs. what the digital item shows
- Label mismatch between JSON data and component tick labels (e.g. "1[1/2]" vs "1[2/4]")

---

## Per-Question Debug Checklist

### 1. Open the dev preview
Navigate to `/dev/preview`, select the year, click the question. Observe:
- Does the component render correctly (layout, text, stimulus)?
- Does interaction work (drag, click, type)?
- Does the generated variant look correct?
- Does grading produce the right result after submitting?

If something looks wrong, read the relevant source files to diagnose.

### 2. Quick source check (only if needed)
- `data/items/<itemID>/<itemID>.png` — visual reference
- `data/items/<itemID>/<itemID>.html` — exact text from digital item
- `data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv` — correct_answer source of truth

### 3. Check the generator
```
node -e "const {generate} = await import('./src/lib/utils/generators.js'); console.log(JSON.stringify(generate('<itemID>'), null, 2))"
```
Run a few times to verify correct_answer is always right, no degenerate outputs.

### 4. Check the grader
```
node -e "
const {gradeQuestion} = await import('./src/lib/utils/grading.js');
const {generate} = await import('./src/lib/utils/generators.js');
const q = generate('<itemID>');
console.log(gradeQuestion({answer: q.correct_answer}, q));
"
```

### 5. Build
After any fix: `npm run build` — must pass before moving on.

---

## Output Format
After each question, note one of:
- `✓ Q<N> (<itemID>)` — no issues found
- `FIXED Q<N> (<itemID>): <what was fixed>`
- `SKIP Q<N> (<itemID>): <reason, what needs follow-up>`

At the end of the session, summarize all fixes and any unresolved issues.

---

## Rules
- Fix one question at a time; build after each fix
- Stop after 2 failed fix attempts on the same question — report it, move on
- Do not refactor or clean up code outside the specific fix needed
- Never guess item_id — verify from `data/items/` directory listing if unsure
