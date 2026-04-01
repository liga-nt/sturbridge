# New Course Design Brief

Read this file before doing anything else. It is the full context you need to help design and add a new course to the Sturbridge platform.

## What This Brief Is For

The dev wants to add a new course — a grade level + subject combination (e.g., "5th Grade Math," "7th Grade ELA"). Your job is to help them define the course structure, write the Firestore seed data, and (if content exists) build the question bank.

---

## Platform Architecture

**Stack:** SvelteKit, Tailwind CSS 4, Firebase (Firestore + Auth + Cloud Functions)
**Multi-tenancy:** Every school uses the same Firebase project. All documents carry `schoolId`. Firestore rules enforce isolation.
**Roles:** `dev`, `admin`, `teacher`, `student` — stored as Firebase custom claims.

---

## How Courses Work

### Firestore Collections Involved

```
courses/{courseId}
  - id: string (same as doc key)
  - label: string          e.g. "4th Grade Math"
  - grade: string          e.g. "4"
  - subject: string        e.g. "math"
  - progressionType: 'mastery' | 'linear' | 'none'
  - contentKey: string | null   maps to code-side generator registry key

standards/{standardId}
  - id: string
  - label: string          e.g. "4.OA.A.1"
  - description: string
  - courseId: string       foreign key → courses/{courseId}
  - order: number          controls progression order within the course
  - (optional) tip1/tip2/tip3: strings for student hints
```

### Key Code Files

```
src/lib/utils/studentStore.js
  - loadCourses()                  → { [courseId]: { id, label, ... } }
  - loadCourse(courseId)           → single course doc or null
  - loadStandardsByCourse(courseId)→ standards[] sorted by order
  - loadAllStandards()             → all standards (cached)

src/lib/utils/generators.js        flat registry keyed by item_id
src/lib/utils/grading.js           graders registry + gradeQuestion()
src/lib/utils/questionBank.js      ITEM_STANDARD map, byStandard, pickQuestion()
```

### contentKey

`contentKey` links a course to its code-side question bank.
- The 4th grade math course uses `contentKey: "mcas-grade4-math"`.
- A course with no question bank yet uses `contentKey: null`.
- When you build generators, the registry key in `generators.js` should match `contentKey`.

---

## Step-by-Step: Adding a New Course

### Step 1 — Define the course

Ask the dev:
1. **Grade** (number as string, e.g. `"5"`)
2. **Subject** (e.g. `"math"`, `"ela"`, `"science"`)
3. **Label** (display name, e.g. `"5th Grade Math Fundamentals"`)
4. **Progression type** — `mastery` (default for math), `linear`, or `none`
5. **Content source** — Do they have MCAS item files (PNG + HTML) to build a question bank? Or will teachers author questions in Firestore directly?

Derive `courseId` as a slug: `grade${grade}-${subject}` or something more specific if needed (e.g. `grade5-math`, `grade7-greek`).

### Step 2 — Define the standards

Ask the dev for the list of standards this course covers. For each standard you need:
- `id` — short identifier (e.g. `"5.NBT.A.1"` or a custom slug like `"g5-place-value-1"`)
- `label` — the standard code shown to teachers/students
- `description` — one sentence explaining what students learn
- `order` — integer, controls the mastery progression sequence

If the course tracks MCAS standards, consult the official MA frameworks or the dev's reference CSV (`data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv` for grade 4 as reference format).

### Step 3 — Write the seed script

Create `scripts/seed-<courseId>.mjs` that:
1. Writes `courses/{courseId}` doc
2. Writes each `standards/{standardId}` doc with `courseId` field set

Pattern to follow: `scripts/seed-firestore.mjs` (existing example for grade4-math).

Run it: `node scripts/seed-<courseId>.mjs`

Verify in Firestore console or via `getDocs(collection(db, 'courses'))`.

### Step 4 — (If content exists) Build the question bank

If the dev has MCAS items (PNG + HTML in `data/items/<itemID>/`):

1. **Fetch items** if not already present:
   ```
   node scripts/fetch-one-item.mjs <itemID>
   ```

2. **Create a questions JSON file** at `data/<courseId>_questions.json`
   Follow the same structure as `data/g4-math_2019_questions.json`.
   For each question:
   - Read the PNG → understand visual layout
   - Read the HTML → extract exact text, options, structure
   - Set `item_id`, `question_number`, `answer_type`, `correct_answer`
   - Match the standard via the reference CSV

3. **Register questions** in `src/lib/utils/questionBank.js`:
   - Add item→standard mappings to `ITEM_STANDARD`
   - Add entries to `byStandard`

4. **Write generators** in `src/lib/utils/generators.js`:
   - One generator per question, keyed by `item_id`
   - Each generator returns a variant with fresh numbers/context and updated `correct_answer`
   - Distractors must be pedagogically motivated (each wrong answer = a named student error type)
   - See existing generators for patterns (avoid known bugs in `feedback_generator_bugs.md`)

5. **Write graders** in `src/lib/utils/grading.js`:
   - Add entries to the `graders` registry for any non-standard grading logic
   - `gradeQuestion(answers, question)` is the main entry point

6. **Verify** at `/dev/preview` — green dot = approved, indigo dot = has generator

### Step 5 — Create a class (optional, if demoing)

Admin can create a class via `/admin/classes`. The new course will appear in the Course dropdown automatically once the Firestore doc exists.

---

## File Reference

```
data/items/<itemID>/          PNG + HTML for each item
data/<courseId>_questions.json question bank for this course
scripts/seed-<courseId>.mjs   Firestore seed script for this course
src/lib/utils/studentStore.js loadCourses / loadStandardsByCourse
src/lib/utils/generators.js   generator registry (keyed by item_id)
src/lib/utils/grading.js      graders registry + gradeQuestion
src/lib/utils/questionBank.js ITEM_STANDARD, byStandard, pickQuestion
src/routes/dev/preview/       verify question rendering
```

---

## What To Do First

Ask the dev these questions (you may ask them all at once):

1. What grade and subject is this course?
2. What should the display label be?
3. What is the progression type? (mastery is default for math)
4. Do you have MCAS items (PNG + HTML) to build a question bank, or will this be teacher-authored content?
5. Do you have a list of standards for this course, or do we need to derive them from state frameworks?

Once you have answers, start with Step 1 (course doc definition) and work sequentially.
