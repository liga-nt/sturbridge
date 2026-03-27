# Sturbridge — Project Outline

## Project Overview
A mastery-based, individualized math curriculum app for K-12 classrooms. Students progress at their own pace through standards-aligned questions. Teachers monitor progress and assign questions in real time. Administrators oversee all classes in their purview.

The question bank is built by reverse-engineering official MCAS TestNav items — not by generating questions with AI. Each question type is implemented as a parametric Svelte component driven by an algorithmic generator. The generator produces a mathematically valid, pedagogically sound question instance (numbers, distractors, stimuli) by sampling from a constrained parameter space. The goal is pixel-accurate fidelity to the real TestNav interface so students are prepared for the actual digital exam.

## Starting Point
SvelteKit (Svelte 5) + Firebase Authentication, deployed to Firebase Hosting.

---

## Tech Stack
- **Frontend:** SvelteKit (Svelte 5, Tailwind CSS 4) — PWA, no native wrapper, targets Chromebook
- **Auth:** Firebase Authentication (Google Sign-In)
- **Database:** Firestore
- **Hosting:** Firebase Hosting

---

## User Roles
Stored as Firebase custom claims on the user token:
- `student`
- `teacher`
- `admin`
- `dev` (single developer account — full access)

Firestore security rules enforce role-based access. Teachers access only their own class data. Admins access all classes in their purview. Dev has write access to the question bank.

---

## Question System

### Source of Truth
Each official MCAS item lives in `data/items/<itemID>/`:
- `<itemID>.png` — screenshot of the item as it appears in TestNav
- `<itemID>.html` — raw HTML from the TestNav preview

The canonical item registry is:
`data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv`
Columns: Year, Item No., item_id, Item Type, Item Description, Correct Answer, Standard.

### JSON Question Files
Structured question definitions live in `data/`:
- `g4-math_2019_questions.json` — 20 questions, all complete
- `g4-math_2021_questions.json` — 20 questions, all complete
- `g4-math_2022_questions.json` — 20 questions, all complete
- `g4-math_2023_questions.json` — 20 questions, all complete
- `g4-math_2025_questions.json` — 20 questions, all complete

Each question entry includes: `item_id`, `question_type`, `standard`, `question_text`, `answer_options` (or part definitions for multi-part), `correct_answer`, `stimulus_type`/`stimulus_params`, and `generator_id`.

### Algorithmic Generators
Every question has a generator in `src/lib/utils/generators.js` — a flat registry keyed by `item_id`. Each generator:
- Samples numbers, scenarios, people from constrained parameter spaces
- Computes the correct answer algorithmically
- Produces pedagogically motivated distractors (each wrong answer = a named student error/misconception)
- Returns a complete question object that the corresponding Svelte component can render directly

Generators do not call any external API. All logic is local.

### renderMath() Notation (`src/lib/utils/math.js`)
- `[n/d]` → stacked fraction
- `{?}` → inline boxed question mark
- `[Save]` → blue rounded pill button
- Use `{@html renderMath(text)}` in components

---

## Question Type Components (`src/lib/components/questions/`)

| Component | Description |
|---|---|
| `MultipleChoice.svelte` | Standard 4-option MC with optional stimulus |
| `MultipleSelect.svelte` | Select N correct answers |
| `MultiPart.svelte` | N-part questions; supports inline_choice and true_false_table part types |
| `ShortAnswer.svelte` | Text/numeric input |
| `ShortAnswerInput.svelte` | Math editor used inside MultiPart |
| `InlineChoice.svelte` | Dropdown-in-sentence fill-in |
| `TrueFalseTable.svelte` | Grid of true/false row choices |
| `NumberLinePlot.svelte` | Plot points on a number line |
| `ProtractorDragDrop.svelte` | Drag angle choices onto a protractor |
| `DragDropInequality.svelte` | Drag tiles into inequality slots |
| `CategorySort.svelte` | Sort tiles into labeled categories |
| `FractionModel.svelte` | Interactive shaded fraction strip models |
| `DragDropMatch.svelte` | Match tiles into a division table |

### Stimulus Components (`src/lib/components/questions/stimuli/`)

| Component | Key params |
|---|---|
| `NumberBox.svelte` | rows of number pairs |
| `DataTable.svelte` | title, headers, rows |
| `LinePlot.svelte` | X marks above number line |
| `DotPlot.svelte` | Filled dots above number line |
| `AngleDiagram.svelte` | center, rays, arc_labels |
| `SymmetryFigure.svelte` | shape types: star, square, rect, circle, semicircle, triangle, polygon |
| `FractionComparison.svelte` | Circle or rect fraction models |
| `RectangleDiagram.svelte` | Labeled rectangle |
| `ItemArray.svelte` | N×M grid of SVG items |
| `DecimalGrid.svelte` | Shaded 10×10 grid |
| `GraduatedCylinder.svelte` | Measurement cylinder |
| `ProtractorImage.svelte` | Static protractor SVG |
| `BucketDiagram.svelte` | Fraction-filled buckets |
| `ClockFace.svelte` | Analog clock, params: { hour, minute } |
| `StepPattern.svelte` | Growing square-triangle pattern, params: { steps } |

---

## TestNav Visual Style
All question components replicate TestNav exactly:
- Font: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- Question text: 16px, line-height 24px, color #333
- Body background: #e9e9e9, question area: white, max-width 640px

---

## Application Routes

### Student-Facing
- `/` — redirects based on role
- `/student` — current question, answer UI, feedback display

### Teacher-Facing
- `/teacher` — class overview, mastery grid per student per standard
- `/teacher/assign` — real-time question assignment UI
- `/teacher/standards` — configure standard progression order
- `/teacher/student/[studentId]` — individual student detail

### Admin-Facing
- `/admin` — overview of all classes and teachers
- `/admin/class/[classId]` — drill into a specific class

### Developer-Facing (dev role only)
- `/dev` — dev dashboard home
- `/dev/preview` — side-by-side: our rendered component (left) vs. PNG screenshot (right); year dropdown + question strip; JSON toggle
- `/dev/algo-check` — run any generator repeatedly, inspect output distribution, verify correctness

---

## Firestore Data Model

### `users/{userId}`
```
{
  email: string,
  displayName: string,
  role: "student" | "teacher" | "admin" | "dev",
  classIds: string[]
}
```

### `classes/{classId}`
```
{
  teacherId: string,
  grade: string,
  subject: "math" | "ela",
  studentIds: string[],
  standardProgression: string[]  // ordered standard IDs, teacher-configurable
}
```

### `standards/{standardId}`
```
{
  id: string,           // e.g. "4.NBT.B.4"
  description: string,
  grade: string,
  subject: string,
  order: number
}
```

### `questions/{questionId}`
```
{
  item_id: string,           // e.g. "MA704649496"
  standardId: string,
  question_type: string,     // matches component name pattern
  generator_id: string,      // key into generators.js registry
  status: "active" | "retired",
  year: number,
  question_number: number
}
```
Question content is not stored in Firestore — it is generated at runtime by the generator. Firestore holds only the item registry and routing metadata.

### `studentProgress/{studentId}/standards/{standardId}`
```
{
  mastered: boolean,
  streak: number,
  lastAnsweredDate: string,    // YYYY-MM-DD
  attempts: number,
  assistedAttempts: number,
  questionsSeenIds: string[],
  masteryThreshold: number     // default 3
}
```

### `responses/{responseId}`
```
{
  studentId: string,
  questionId: string,
  standardId: string,
  classId: string,
  selectedOption: string,
  isCorrect: boolean,
  assisted: boolean,
  assignedByTeacher: boolean,
  timestamp: timestamp
}
```

### `assignments/{classId}`
```
{
  active: boolean,
  questionId: string | null,
  standardId: string | null,
  assignedAt: timestamp | null,
  assignedBy: string
}
```

---

## Mastery Algorithm

- Mastery = `streak >= masteryThreshold` (default 3)
- Streak counts consecutive correct answers on separate calendar days, unassisted
- Any assisted or incorrect answer resets streak to 0
- On mastery, student advances to next standard in their progression
- Diagnostic mode: one question per standard to establish baseline before mastery-building begins

**Question selection per student turn:**
1. Active teacher assignment → serve that question
2. Otherwise find current unmastered standard in progression
3. Call that standard's generator to produce a fresh question instance
4. Track `questionsSeenIds` to ensure variation (generators produce novel instances, not fixed pools)

---

## Real-Time Teacher Assignment

- Teacher selects a standard in `/teacher/assign`; a question is generated and previewed
- Write to `assignments/{classId}`
- Students have a Firestore real-time listener; when `active: true`, screen transitions to assigned question
- After all students submit, teacher sees live results: % correct unassisted, % correct after hint, % unable
- Teacher deactivates; students return to individual progression

---

## Audio Feedback
- Teacher-toggleable per class
- Web Speech API (`speechSynthesis`) — no Storage files needed
- Reads option-specific feedback aloud after selection
- Falls back silently if unsupported

---

## Dev Workflow (Reverse-Engineering New Items)

For each new item:
1. Fetch: `node scripts/fetch-one-item.mjs <itemID>` → writes PNG + HTML to `data/items/<itemID>/`
2. Read PNG screenshot → understand visual layout
3. Read HTML → extract exact text, options, structure
4. Update JSON file to match exactly
5. Build or extend the matching Svelte component
6. Write generator in `generators.js` (flat registry, keyed by `item_id`)
7. Verify in `/dev/preview` (component vs. screenshot side-by-side)
8. Verify generator in `/dev/algo-check` (run N times, check distribution and correctness)
9. `npm run build` — must pass before work is considered complete

### Fetch Scripts
- `node scripts/fetch-one-item.mjs <itemID>` — fetch one item
- `node scripts/fetch-all-items.mjs` — fetch all items in `scripts/preview-urls.json`
- `node scripts/fetch-all-items.mjs --skip-existing` — skip already-fetched items

### Agent Workflow (for batched question work)
- `scripts/agent-brief.md` — full context brief passed to spawned agents
- One agent per question — prevents context drift
- Failure protocol: stop after 2 failed attempts, report what failed, do not loop
- Build must pass before agent returns

---

## Current Phase: Generator Fine-Tuning

All 100 questions across 2019/2021/2022/2023/2025 have components and generators. The current focus is:
- Verifying each generator's parameter space matches the source model's intent
- Ensuring distractors are pedagogically valid and cover the key misconceptions
- Confirming component rendering is pixel-accurate against PNG screenshots
- Catching and fixing any edge cases that produce invalid or degenerate question instances

---

## Build Order (Remaining)

### Phase 1 — Question Bank (COMPLETE)
- All 100 released MCAS items have components and generators across 5 test years

### Phase 2 — Generator Fine-Tuning (IN PROGRESS)
- Audit each generator against source item
- Fix parameter ranges, distractor logic, edge cases
- Validate in `/dev/algo-check`

### Phase 3 — Student Experience
- Student route and role guard
- Question selection + mastery algorithm
- Question display (call generator, pass output to component)
- Answer selection and feedback display
- Audio feedback via Web Speech API
- Progress tracking writes to Firestore
- Real-time listener for teacher assignments

### Phase 4 — Teacher Dashboard
- Role guard (class-scoped data)
- Class mastery overview grid
- Individual student detail view
- Standard progression configuration
- Real-time assignment UI and live results

### Phase 5 — Admin Dashboard
- Multi-class overview
- Drill-down to class and student views

### Phase 6 — Polish & Pilot Prep
- PWA configuration (manifest, service worker)
- Firestore security rules audit
- Diagnostic mode
- Performance and offline handling
- Pilot deployment

---

## Firestore Security Rules (Summary)
- `questions`: read by authenticated users; write by dev only
- `studentProgress`: read/write by owning student; read by teacher (scoped to class); read by admin; read by dev
- `responses`: write by student; read by teacher/admin (class-scoped)
- `assignments`: write by teacher (own classes); read by students in that class
- `classes`: read by teacher/admin/dev; write by admin/dev
- `users`: read by self; scoped read by teacher/admin; write by dev/admin

---

## Notes for Development
- Question content is never stored in Firestore — generators run client-side at render time
- Role checks use Firebase custom claims (`getIdTokenResult()`) — enforce the same rules in Firestore security rules, never trust client alone
- All visual components receive only parameters and render SVG themselves
- The `assignments/{classId}` document is the real-time bridge between teacher and student — keep it simple and flat
- Do not use paper JSON files (`gr4-math_*_paper.json`) — they have incorrect item_id mappings
- Always start from the PNG + HTML in `data/items/` as ground truth
