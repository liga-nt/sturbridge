# Sturbridge Agent Brief

Read this file before doing anything else. It contains everything you need.

## Project
SvelteKit (Svelte 5, Tailwind 4, Firebase) MCAS 4th-grade math exam prep app.
**Goal:** Pixel-accurate recreation of how questions appear in the actual TestNav digital test.

## Core Principle
**Always start from the real thing.**
1. Read the PNG → understand visual layout
2. Read the HTML → extract exact text, options, structure
3. Fix/create the JSON entry to match exactly
4. Build or extend components to render it correctly
5. Run `npm run build` — must pass before you're done

## Key Paths
```
data/g4-math_2019_questions.json     — 20 questions, complete
data/g4-math_2021_questions.json     — your target (create if it doesn't exist)
data/g4-math_2022_questions.json     — your target (create if it doesn't exist)
data/g4-math_2023_questions.json     — 20 questions, complete
data/g4-math_2025_questions.json     — 20 questions, complete
data/items/<itemID>/                 — PNG + HTML source files for each item
src/lib/components/questions/        — question type components
src/lib/components/questions/stimuli/ — parametric SVG stimulus components
src/lib/utils/math.js                — renderMath()
src/lib/utils/generators.js          — all generators, flat registry keyed by item_id
src/routes/dev/preview/+page.svelte  — preview page (wire new answer_types here)
src/routes/dev/algo-check/+page.svelte — algo-check page
```

## JSON Schema

### Common fields (all types)
```json
{
  "item_id": "MA123456",
  "question_number": "1",
  "answer_type": "multiple_choice",
  "question_text": "...",
  "correct_answer": "B",
  "_stub": true,
  "_needs": "description of what's missing"
}
```

### By answer_type

**multiple_choice**
```json
{
  "stimulus_intro": "...",
  "stimulus_type": "data_table",
  "stimulus_params": { ... },
  "stimulus_list": ["bullet 1", "bullet 2"],
  "math_expression": "[3/4]",
  "question_text": "...",
  "answer_options": [{ "letter": "A", "text": "..." }]
}
```
Answer options can use `shape` instead of `text` for SVG shapes:
`{ "letter": "A", "shape": { "type": "circle", "r": 55 } }`

**multiple_select** — same as multiple_choice + `"select_count": 2`

**short_answer**
```json
{
  "stimulus_intro": "...",
  "stimulus_type": "...",
  "stimulus_params": { ... },
  "math_expression": "...",
  "question_text": "...",
  "input_widget": "text",
  "answer_suffix": "miles"
}
```

**multi_part**
```json
{
  "question_text": "...",
  "layout": "stacked",
  "stimulus_type": "...",
  "stimulus_params": { ... },
  "stimulus_list": ["..."],
  "parts": [
    {
      "label": "A",
      "question_text": "...",
      "answer_type": "multiple_choice",
      "answer_options": [...],
      "math_expression": "...",
      "correct_answer": "B"
    }
  ]
}
```
Part answer_types: `multiple_choice`, `multiple_select`, `short_answer`, `constructed_response`, `inline_choice`, `true_false_table`, `drag_drop_match`

**true_false_table**
```json
{
  "question_text": "...",
  "column_label": "Equation",
  "true_label": "True",
  "false_label": "False",
  "statements": [{ "text": "..." }, { "shape": { "type": "circle", "r": 55 } }]
}
```
correct_answer encoding: row N → True = letter(2N-1), False = letter(2N).
3 rows: A=T1, B=F1, C=T2, D=F2, E=T3, F=F3. Example: "B,C,E" = False/True/True.

**inline_choice**
```json
{
  "stimulus_intro": "...",
  "stimulus_type": "...",
  "stimulus_params": { ... },
  "question_text": "...",
  "instruction": "...",
  "sentences": ["The number [RESPONSE_1] is..."],
  "dropdowns": [{ "id": "RESPONSE_1", "options": ["5", "6", "30"] }]
}
```

**number_line_plot** — `stimulus_params: { min, max, small_intervals }`
**protractor_drag_drop** — `stimulus_params: { angles, choices }`
**drag_drop_inequality** — `question_text, instruction2, tiles, rows:[{left,op,id}], correct_answer`
**category_sort** — `question_text, tiles:[string], categories:[{label, correct_tiles:[string]}]`
**fraction_model** — `question_text, model_params: { numerator, denominator }`

## renderMath() Notation
- `[n/d]` → stacked fraction
- `{?}` → inline boxed placeholder
- Always use `{@html renderMath(text)}` in components

## Stimulus Types Available
| stimulus_type | Component | Key params |
|---|---|---|
| `number_box` | NumberBox | `rows: [[n,n],...]` |
| `data_table` | DataTable | `title, headers[], rows[][]` |
| `line_plot` | LinePlot | `title, axis_label, data_points:[{label,count}]` |
| `dot_plot` | DotPlot | `title, axis_label, data_points:[{label,count}]` |
| `angle_diagram` | AngleDiagram | `center, rays:[{label,angle}], arc_labels` |
| `symmetry_figure` | SymmetryFigure | `shape, line?` |
| `fraction_comparison` | FractionComparison | `type, numerator, denominator` |
| `rectangle_diagram` | RectangleDiagram | `width, height, width_label, height_label` |
| `item_array` | ItemArray | `rows, cols, item, item_size?` |
| `decimal_grid` | DecimalGrid | `shaded, show_whole?` |
| `graduated_cylinder` | GraduatedCylinder | `min, max, interval, value, unit` |
| `protractor_image` | ProtractorImage | `rays:[{label,angle}]` |
| `bucket_diagram` | BucketDiagram | (see component) |

## SymmetryFigure Shape Types
`circle`, `square`, `rect`, `semicircle`, `star`, `triangle` (kind: equilateral/isosceles/right), `polygon` (explicit vertices)

## Components and Key Props

**MultipleChoice.svelte** — `stimulus_intro, stimulus_list, stimulus_type, stimulus_params, math_expression, question_text, answer_options`
**MultipleSelect.svelte** — same + `select_count`. Supports `opt.shape` and `opt.model`.
**MultiPart.svelte** — `question_text, layout, stimulus_type, stimulus_params, stimulus_list, parts[]`. Supports N parts.
**ShortAnswer.svelte** — `stimulus_intro, stimulus_type, stimulus_params, math_expression, question_text, input_widget, answer_suffix`
**InlineChoice.svelte** — `stimulus_intro, stimulus_type, stimulus_params, question_text, instruction, sentences[], dropdowns[]`
**TrueFalseTable.svelte** — `question_text, column_label, true_label, false_label, statements[]`. Statements support `shape` field for SVG figures.
**NumberLinePlot.svelte** — `question_text, stimulus_params`
**ProtractorDragDrop.svelte** — `question_text, stimulus_params`
**DragDropInequality.svelte** — `question_text, instruction2, tiles, rows, correct_answer`
**CategorySort.svelte** — `question_text, tiles, categories`
**FractionModel.svelte** — `question_text, numerator, denominator`

## TestNav Styles
- Font: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- Question text: 16px, line-height 24px, color #333
- Background: #e9e9e9 outer, white question area
- Max-width: 640px

## Generator Pattern

Every question needs a generator registered in `src/lib/utils/generators.js`:

```js
// Helper functions available: shuffle(arr), randInt(min, max), pick(arr)
// PEOPLE array: [{ name, pronoun, poss }, ...]

function generateYYYYQN() {
  // 1. Randomize the math (numbers, scenario)
  // 2. Build answer options with PEDAGOGICALLY MOTIVATED distractors
  //    — each wrong answer must represent a named, specific student error
  // 3. Return a complete question object matching the JSON schema

  return {
    question_number: 'N',
    answer_type: 'multiple_choice',
    question_text: '...',
    answer_options: [...],
    correct_answer: 'B'
  };
}

// In the generators registry:
export const generators = {
  // ...existing entries...
  'MA123456': generateYYYYQN,
};
```

## Preview + Algo-check Pages

When adding a new `answer_type`, wire it in both:
- `src/routes/dev/preview/+page.svelte`
- `src/routes/dev/algo-check/+page.svelte`

Both pages already handle: `multiple_choice, multiple_select, multi_part, short_answer, true_false_table, inline_choice, number_line_plot, protractor_drag_drop`

## Interactive Components — Static Approximation Rule

For drag-drop and interactive widgets (drag_drop_inequality, category_sort, fraction_model, etc.):
- Build a **static visual display** showing the structure — tiles visible, boxes labeled, correct state shown
- Do NOT attempt real drag-and-drop — it's out of scope
- The generator can still vary the math and correct answer

## Failure Protocol

If you encounter an error you cannot resolve in 2 attempts:
- **Stop immediately**
- Report what you tried and what failed
- Do NOT keep retrying the same approach
- Do NOT spin in a loop

## Build Verification

Always end with:
```bash
cd /Users/npresnall/sturbridge && npm run build
```
Build must pass. Fix any errors before returning. Report whether build passed or failed.
