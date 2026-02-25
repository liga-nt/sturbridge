# MathMastery App — Claude Code Project Outline

## Project Overview
A mastery-based, individualized math curriculum app for K-12 classrooms. Students progress at their own pace through standards-aligned questions. Teachers monitor progress and assign questions in real time. Administrators oversee all classes in their purview. A developer dashboard manages the question bank and AI generation pipeline.

## Starting Point
A SvelteKit template with Firebase Authentication already integrated and linked to a new Firebase project. Google Sign-In is the primary auth method (students, teachers, and admins use their school Google accounts).

---

## Tech Stack
- **Frontend:** SvelteKit (PWA — no native wrapper needed, deployed as a web app for Chromebook use)
- **Auth:** Firebase Authentication (Google Sign-In)
- **Database:** Firestore
- **Storage:** Firebase Storage (audio files if pre-recorded; potentially SVG assets)
- **Functions:** Firebase Cloud Functions (AI generation pipeline, server-side Anthropic API calls)
- **AI:** Anthropic API (Claude Sonnet) called server-side via Cloud Functions
- **Hosting:** TBD (Vercel or Firebase Hosting)

---

## User Roles
Roles are stored as Firebase custom claims on the user token:
- `student`
- `teacher`
- `admin`
- `dev` (single user — developer only)

Firestore security rules enforce role-based access throughout. Teachers can only access data for students enrolled in their classes. Admins can access all classes under their purview. Dev role has write access to the question bank and prompt collections.

---

## Firestore Data Model

### `users/{userId}`
```
{
  email: string,
  displayName: string,
  role: "student" | "teacher" | "admin" | "dev",
  classIds: string[]  // for students and teachers
}
```

### `classes/{classId}`
```
{
  teacherId: string,
  grade: string,
  subject: "math" | "ela",
  studentIds: string[],
  standardProgression: string[]  // ordered array of standard IDs, teacher-configurable
}
```

### `standards/{standardId}`
```
{
  id: string,           // e.g. "C1b"
  parentId: string,     // null if top-level standard
  description: string,
  grade: string,
  subject: string,
  order: number         // default curriculum order
}
```

### `questions/{questionId}`
```
{
  standardId: string,
  questionText: string,
  visual: {
    type: "numberLine" | "coordinateGrid" | "geometricFigure" | "fractionModel" | etc,
    params: {}          // type-specific parameters for dynamic SVG rendering
  } | null,
  options: [
    {
      id: "A" | "B" | "C" | "D",
      text: string,
      isCorrect: boolean,
      feedback: string  // misconception-targeted feedback for this specific option
    }
  ],
  difficulty: "diagnostic" | "standard" | "advanced",
  status: "pending" | "approved" | "rejected",
  generatedAt: timestamp,
  reviewedAt: timestamp | null,
  promptVersion: string
}
```

### `studentProgress/{studentId}/standards/{standardId}`
```
{
  studentId: string,
  standardId: string,
  mastered: boolean,
  streak: number,               // consecutive correct answers without assistance
  lastAnsweredDate: string,     // YYYY-MM-DD
  attempts: number,
  assistedAttempts: number,
  questionsSeenIds: string[],   // to avoid repetition
  masteryThreshold: number      // configurable, e.g. 2 or 3
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
  // Real-time document teachers write to, students listen to
  active: boolean,
  questionId: string | null,
  standardId: string | null,
  assignedAt: timestamp | null,
  assignedBy: string            // teacherId
}
```

### `prompts/{standardId}`
```
{
  standardId: string,
  systemPrompt: string,
  fewShotExamples: string,
  schemaInstructions: string,
  visualType: string | null,
  version: string,
  updatedAt: timestamp
}
```

---

## Application Routes

### Student-Facing
- `/` — redirects based on role
- `/student` — main student experience: current question, answer UI, feedback display

### Teacher-Facing
- `/teacher` — dashboard: class overview, mastery grid per student per standard
- `/teacher/assign` — real-time question assignment UI
- `/teacher/standards` — configure standard progression order (drag to reorder)
- `/teacher/student/[studentId]` — individual student detail view

### Admin-Facing
- `/admin` — overview of all classes and teachers in purview
- `/admin/class/[classId]` — drill into a specific class

### Developer-Facing (protected, dev role only)
- `/dev` — dev dashboard home: bank status grid (questions per standard, flagged thin standards)
- `/dev/review` — review queue: pending questions with accept/reject/edit/regenerate actions
- `/dev/generate` — trigger generation for a specific standard (calls Cloud Function)
- `/dev/prompts` — view and edit prompts per standard without redeployment
- `/dev/standards` — manage standards list and metadata

---

## Visual Question System

~10 visual template types have been identified. Each is implemented as a dedicated Svelte component that accepts structured parameters. No raw SVG is stored in Firestore.

**Known types (expand as needed):**
- `NumberLine` — params: min, max, marked[], labeled[]
- `CoordinateGrid` — params: points[], lines[], polygons[]
- `GeometricFigure` — params: shape, dimensions, labels[]
- `FractionModel` — params: type (bar/circle), numerator, denominator, shaded
- `TableOrChart` — params: headers[], rows[][]
- `AreaModel` — params: dimensions, sections[]
- `PlaceValueChart` — params: digits{}
- `PatternSequence` — params: items[], missingIndex

AI generation pipeline outputs JSON parameters for the relevant type. The Svelte component renders the SVG dynamically from those parameters. Editing a visual means changing a few parameter values, not manipulating markup.

---

## AI Question Generation Pipeline

1. Dev triggers generation for a standard from `/dev/generate`
2. SvelteKit calls a Firebase Cloud Function (`generateQuestions`)
3. Cloud Function:
   - Fetches the prompt document for that standard from Firestore
   - Calls Anthropic API (Claude Sonnet) with structured JSON schema output instructions
   - Receives batch of 10 questions in JSON format
   - Writes each to `questions` collection with `status: "pending"`
4. Dev reviews in `/dev/review`:
   - Questions rendered exactly as students will see them (including visuals)
   - Accept → sets `status: "approved"`
   - Reject → sets `status: "rejected"`
   - Edit → inline edit before approving
   - Regenerate → triggers single question regeneration
5. Only `status: "approved"` questions are served to students

**Question JSON schema** (what Claude returns per question):
```json
{
  "questionText": "string",
  "visual": { "type": "string", "params": {} } | null,
  "options": [
    { "id": "A", "text": "string", "isCorrect": false, "feedback": "string" },
    { "id": "B", "text": "string", "isCorrect": true, "feedback": "string" },
    { "id": "C", "text": "string", "isCorrect": false, "feedback": "string" },
    { "id": "D", "text": "string", "isCorrect": false, "feedback": "string" }
  ],
  "difficulty": "standard"
}
```

---

## Mastery Algorithm

- Mastery = `streak >= masteryThreshold` (default 2-3) where streak counts consecutive correct answers on separate calendar days, unassisted
- Any assisted answer resets streak to 0
- Any incorrect answer resets streak to 0
- Once mastered, standard moves to "mastered" status in studentProgress; student advances to next standard in their progression
- Diagnostic mode: rapid sweep through all standards (one question each) to establish baseline before mastery-building begins

**Question selection logic (per student turn):**
1. Check for active teacher assignment → serve that question
2. Otherwise find current standard in student's progression that is not yet mastered
3. Select an approved question for that standard not in `questionsSeenIds`
4. If all questions seen, allow repeats (oldest first)

---

## Real-Time Teacher Assignment

- Teacher selects a standard and question in `/teacher/assign`
- Writes to `assignments/{classId}` document
- All students in that class have a Firestore real-time listener on this document
- When `active: true` and `questionId` changes, student screen transitions to assigned question
- After all students submit, teacher sees live results: % correct unassisted, % correct after feedback, % unable to answer
- Teacher deactivates assignment; students return to their individual progression

---

## Audio Feedback
- Teacher-toggleable per class (stored on class document)
- Implementation: Web Speech API (`speechSynthesis`) for simplicity — no Storage files needed, no audio pipeline
- Reads the option-specific feedback text aloud after answer selection
- Falls back silently if browser doesn't support it

---

## Build Order

### Phase 1 — Dev Dashboard & Question Bank (START HERE)
1. Add `dev` custom claim to developer account
2. Build `/dev` route gated by dev role check
3. Build standards management (`/dev/standards`)
4. Build prompt management (`/dev/prompts`) — Firestore-backed, editable in UI
5. Build Cloud Function for question generation (Anthropic API integration)
6. Build generation trigger UI (`/dev/generate`)
7. Build visual component library (one Svelte component per visual type)
8. Build review queue (`/dev/review`) — renders questions as students will see them
9. Build bank status grid (`/dev`) — questions per standard, highlight thin standards
10. Populate question bank to ~30 approved questions per standard

### Phase 2 — Student Experience
11. Student route and role guard
12. Question selection logic and mastery algorithm
13. Question display component (text + visual rendering)
14. Answer selection and feedback display
15. Audio feedback via Web Speech API
16. Progress tracking writes to Firestore
17. Real-time listener for teacher assignments

### Phase 3 — Teacher Dashboard
18. Teacher route and role guard (class-scoped data only)
19. Class mastery overview grid
20. Individual student detail view
21. Standard progression configuration (drag to reorder)
22. Real-time assignment UI and live results view

### Phase 4 — Admin Dashboard
23. Admin route and role guard
24. Multi-class overview
25. Drill-down to class and student views

### Phase 5 — Polish & Pilot Prep
26. PWA configuration (manifest, service worker)
27. Firestore security rules audit and lockdown
28. Diagnostic mode implementation
29. Performance and offline handling
30. Pilot deployment and monitoring setup

---

## Firestore Security Rules (Summary)
- `questions`: read by authenticated users (approved only for non-dev), write by dev only
- `studentProgress`: read/write by owning student; read by teacher (if student in their class); read by admin (if class in their purview); read by dev
- `responses`: write by student; read by teacher/admin with same class scope
- `assignments`: write by teacher (own classes only); read by students in that class
- `classes`: read by teacher/admin/dev; write by admin/dev
- `prompts`: read/write by dev only
- `users`: read by self; read by teacher/admin for scoped users; write by dev/admin for role assignment

---

## Notes for Claude Code
- Always check user role from Firebase custom claims (`getIdTokenResult()`) on the client, and enforce the same rules server-side in Firestore rules and Cloud Functions — never trust client-side role checks alone
- Prompts are stored in Firestore and fetched at generation time — do not hardcode prompts in Cloud Functions
- Visual components receive only parameters and render SVG themselves — never store raw SVG in Firestore
- The `assignments/{classId}` document is the real-time bridge between teacher and student screens — keep it simple and flat
- Generate 10 questions per Cloud Function call to stay within reasonable timeout limits
- All Anthropic API calls happen server-side in Cloud Functions — API key never touches the client
