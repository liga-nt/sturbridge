# Style Audit — Cross-Year Component Review

## Goal

Walk through all 20 questions from the 2019 test and identify where any component needs to be updated to match styles observed in 2023 or 2025 TestNav captures. The 2019 build is the baseline — this audit flags divergences or improvements found in newer item captures that should be backported to our components.

## Process

1. Review each 2019 question in `/dev/preview`
2. Note any visual differences from the actual TestNav reference (iframe on right)
3. If a fix requires checking 2023/2025 behavior, inspect the relevant CSS files below
4. File findings in the **Findings** section at the bottom of this document

## Reference CSS Files

All extracted TestNav CSS lives in `data/css/` and applies across all years and items:

| File | Description |
|------|-------------|
| `data/css/lighthouse-editor.css` | Main TestNav item renderer — layout, choice interactions, bubbles, stimuli |
| `data/css/mathkeyboard.css` | Math symbol keyboard / equation editor panel |
| `data/css/mathquill.css` | MathQuill input field styles (used in short answer / equation editor) |
| `data/css/previewModal.css` | Preview modal chrome (less relevant to question content) |

Key selectors to reference when investigating a component:

- **Radio bubbles:** `.multiplechoice--s1 .bubble span`, `.multiplechoice--circle .bubble span`, `.MultipleChoice .bubble span`
- **Choice layout:** `.distractor`, `.distractorContent`, `.int-choice-label`, `.choice-widget`
- **Stimuli / tables:** `.int-table`, `.table-stimulus`, `.data-table`
- **Math keyboard:** `data/css/mathkeyboard.css` — symbol panel layout, button sizes, section headers
- **Equation editor input:** `data/css/mathquill.css` — input field, fraction rendering

## Question Components Map

| Q  | Component(s) |
|----|-------------|
| 1  | `MultipleChoice.svelte` + `stimuli/NumberBox.svelte` |
| 2  | `MultipleChoice.svelte` |
| 3  | `MultiPart.svelte` + `stimuli/DataTable.svelte` + `ShortAnswerInput.svelte` |
| 4  | `MultipleChoice.svelte` |
| 5  | `NumberLinePlot.svelte` |
| 6  | `MultiPart.svelte` + `ShortAnswerInput.svelte` |
| 7  | `MultipleSelect.svelte` + `stimuli/FractionComparison.svelte` |
| 8  | `MultipleChoice.svelte` + `stimuli/LinePlot.svelte` |
| 9  | `MultiPart.svelte` (custom) |
| 10 | `MultipleChoice.svelte` |
| 11 | `ShortAnswer.svelte` |
| 12 | `ShortAnswer.svelte` |
| 13 | `InlineChoice.svelte` + `stimuli/SymmetryFigure.svelte` |
| 14 | `MultipleChoice.svelte` + `stimuli/AngleDiagram.svelte` |
| 15 | `ShortAnswer.svelte` |
| 16 | `TrueFalseTable.svelte` |
| 17 | `ProtractorDragDrop.svelte` |
| 18 | `ShortAnswer.svelte` |
| 19 | `MultipleChoice.svelte` |
| 20 | `MultipleChoice.svelte` + `stimuli/RectangleDiagram.svelte` |

## Findings

_Add entries here as you review each question. Format:_

**Q[N] — [Component] — [Issue]**
> Description of what's wrong and what the correct behavior should be, with reference to the CSS file/selector if known.

---

