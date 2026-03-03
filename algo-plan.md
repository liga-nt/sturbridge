# Algorithmic Generator Plan — 2019 G4 Math

Each entry covers: question type, display components, what varies, generator status, and any gotchas.

---

## Q1 — MA227383 — MultipleChoice + NumberBox
**Concept:** GCD / "which number could be Sonya's number?" given a box of multiples.
**Display:** `MultipleChoice.svelte` + `stimuli/NumberBox.svelte`
**Varies:** base number (3–8), 5 random multiples of base, 3 distractors that divide some but not all.
**Status:** ✅ Done

---

## Q2 — MA311551 — MultipleChoice, fraction addition
**Concept:** [a/100] + [b/10] = ?
**Display:** `MultipleChoice.svelte` (math_expression field, no stimulus)
**Varies:** a and b (1–9), correct answer is (a + b×10)/100, distractors use wrong denominators.
**Status:** ✅ Done

---

## Q3 — MA311583 — MultiPart + DataTable, decimal ordering
**Concept:** Trail lengths table, order decimals, find closest to Blue.
**Display:** `MultiPart.svelte` + `stimuli/DataTable.svelte` + `ShortAnswerInput.svelte` (per part)
**Varies:** Blue (1dp, 1.2–1.8), 2 short trails (1dp, 0.5–0.9), 2 close trails (2dp, ±0.02–0.09 from Blue).
**Answers:** A = shortest trail name, B = sorted order, C = trail closest to Blue.
**Status:** ✅ Done

---

## Q4 — MA303319 — MultipleChoice, "which is NOT equal"
**Concept:** Given wholeA + wholeB + [numA/denom] + [numB/denom], pick the non-equivalent form.
**Display:** `MultipleChoice.svelte` (stimulus_intro + math_expression, no stimulus component)
**Varies:** wholeA, wholeB (1–3), denom (3/4/5/6), numA, numB.
**Options:** 3 correct rewrites (commuted, regrouped, decomposed) + 1 wrong (extra 1/denom).
**Status:** ✅ Done
**Note:** Option text uses [n/d] notation rendered via renderMath().

---

## Q5 — MA714225971 — NumberLinePlot, place a decimal
**Concept:** Click to place a point on a 0–1 number line (tenths major, hundredths zoom).
**Display:** `NumberLinePlot.svelte` (self-contained interactive component)
**Varies:** target value = tenths (1–8) + hundredths (1–9), e.g. 0.37.
**correct_answer:** the decimal string (e.g. "0.37") — display only in algo-check badge.
**Status:** ✅ Done

---

## Q6 — MA713939739 — MultiPart, word problem
**Concept:** Sandbox is X feet. Basketball court is N times longer. Part A: write equation. Part B: solve.
**Display:** `MultiPart.svelte` + `ShortAnswerInput.svelte` (Part A) + `ShortAnswerInput.svelte` (Part B, constructed_response)
**Varies:** sandbox length (10–25 feet), multiplier (3–8).
**Answers:** A = equation string like "b = 18 × 5", B = null (constructed_response).
**Status:** ✅ Done
**Note:** Template question_text and part texts with generated values.

---

## Q7 — MA704647848 — MultipleSelect + FractionComparison models
**Concept:** Which pairs of fraction models correctly compare [a/b] and [c/d]?
**Display:** `MultipleSelect.svelte` (layout="split") + `stimuli/FractionComparison.svelte` (per option)
**Varies:** fraction pair from curated list, 2 correct options (rect+circle with true operator), 4 wrong.
**correct_answer:** always 2 letters.
**Status:** ✅ Done

---

## Q8 — MA303329 — MultipleChoice + LinePlot, sum of pieces
**Concept:** Line plot of wood piece counts at 8ths lengths. Sum pieces at the target length.
**Display:** `MultipleChoice.svelte` + `stimuli/LinePlot.svelte`
**Varies:** base whole (7–12), counts per label (1–4), target label index (2–4).
**Correct answer:** targetCount × (base + frac) as mixed number in 8ths.
**Status:** ✅ Done
**Note:** Fraction arithmetic in 8ths; simplify remainder (e.g. 4/8 → [1/2]).

---

## Q9 — MA714233266 — MultiPart, shape catalog
**Concept:** Part A: hotspot click on correct shape. Part B: dropdown sentences about triangles.
**Display:** `MultiPart.svelte` + custom hotspot component (Part A) + `InlineChoice.svelte`-style dropdowns (Part B)
**Status:** ⏭ Skip — fixed visual content, not meaningfully generatable.

---

## Q10 — MA222213 — MultipleChoice, unit conversion
**Concept:** N yards/feet → how many feet/inches?
**Display:** `MultipleChoice.svelte` (plain text, no stimulus)
**Varies:** unit pair (yards→feet, feet→inches), quantity (2–10).
**Status:** ✅ Done

---

## Q11 — MA222213 — ShortAnswer, place value × 10
**Concept:** Same digit in thousands and hundreds place — thousands value is 10× hundreds value.
**Display:** `ShortAnswer.svelte` (compact equation editor, math_expression for the number)
**Varies:** digit D (2–8), surrounding digits random.
**correct_answer:** always "10"
**Status:** ✅ Done

---

## Q12 — MA307037 — ShortAnswer, word form → standard form
**Concept:** Given a number in words, write the standard form.
**Display:** `ShortAnswer.svelte` (compact equation editor)
**Varies:** random 5-digit number (no zeros in middle), converted to English words.
**Status:** ✅ Done

---

## Q13 — MA714111699 — InlineChoice + SymmetryFigure
**Concept:** Two dropdown sentences about lines of symmetry on a shape.
**Display:** `InlineChoice.svelte` + `stimuli/SymmetryFigure.svelte`
**Varies:** shape type and line of symmetry from a curated table (square, rectangle, circle, triangle, star).
**Answers:** dropdown selections per shape's symmetry properties.
**Status:** ✅ Done
**Note:** Curated table of 10 shape+line variants with precomputed correct answers.

---

## Q14 — MA306994 — MultipleChoice + AngleDiagram
**Concept:** Total angle HGL known, two arc measures labeled, find the unknown arc.
**Display:** `MultipleChoice.svelte` + `stimuli/AngleDiagram.svelte`
**Varies:** total (120–170°), arc1 (30–60°), arc2 (30–60°), unknown = total − arc1 − arc2.
**Status:** ✅ Done

---

## Q15 — MA279791 — ShortAnswer, division word problem
**Concept:** (boxA + boxB) items ÷ items_per_unit = how many units?
**Display:** `ShortAnswer.svelte` (compact editor with answer_suffix)
**Varies:** boxA (10–20), boxB (10–20), divisor (3, 4, or 5). Total must divide evenly.
**correct_answer:** quotient as string. answer_suffix: "posters" (or similar).
**Status:** ✅ Done
**Note:** Retry until (boxA + boxB) % divisor === 0. 4 scenario templates (Abe, Mia, Tom, Lin).

---

## Q16 — MA713680384 — TrueFalseTable, rounding
**Concept:** 3 rounding statements about a 5-digit number — True or False.
**Display:** `TrueFalseTable.svelte`
**Varies:** the number; statements round to nearest ten, hundred, thousand.
**correct_answer:** comma-separated letters: A=row1True, B=row1False, C=row2True, D=row2False, E=row3True, F=row3False.
**Status:** ✅ Done
**Note:** Uses nearest-thousand as common target T; rejects all-True cases. Row 3 always True.

---

## Q17 — MA704650539 — ProtractorDragDrop
**Concept:** Drag angle values onto a dual-scale protractor.
**Display:** `ProtractorDragDrop.svelte` (self-contained)
**Status:** ⏭ Skip — complex interactive component, limited generative value.

---

## Q18 — MA304988 — ShortAnswer, fraction × whole number
**Concept:** N × [a/b] = total cups — express as mixed number.
**Display:** `ShortAnswer.svelte` (compact equation editor, fraction in question_text via renderMath)
**Varies:** N (3–8), fraction [a/b] where b ∈ {3,4,5,6,8}.
**correct_answer:** mixed number string using [n/d] notation.
**Status:** ✅ Done
**Note:** 4 scenario templates (Meghan, Carlos, Priya, Jordan). Mixed number encoded as "[rem/denom]".

---

## Q19 — MA286777 — MultipleChoice, subtraction with {?}
**Concept:** minuend − subtrahend = {?}, pick the correct difference.
**Display:** `MultipleChoice.svelte` (stimulus_intro + math_expression with {?} notation)
**Varies:** minuend (10000/25000/50000/100000), subtrahend random.
**Status:** ✅ Done

---

## Q20 — MA247745 — MultipleChoice + RectangleDiagram, area
**Concept:** Room dimensions given, find area in square feet.
**Display:** `MultipleChoice.svelte` + `stimuli/RectangleDiagram.svelte`
**Varies:** width and height (6–18 ft, not equal), distractors = perimeter, w², h².
**Status:** ✅ Done

---

## Summary

| Q  | Concept | Display Components | Status |
|----|---------|--------------------|--------|
| 1  | Multiples / GCD | MultipleChoice + NumberBox | ✅ |
| 2  | Fraction addition | MultipleChoice | ✅ |
| 3  | Decimal ordering | MultiPart + DataTable + ShortAnswerInput | ✅ |
| 4  | NOT equal expression | MultipleChoice | ✅ |
| 5  | Plot decimal on number line | NumberLinePlot | ✅ |
| 6  | Word problem, write equation | MultiPart + ShortAnswerInput | ✅ |
| 7  | Fraction model comparison | MultipleSelect + FractionComparison | ✅ |
| 8  | Line plot, sum fractions | MultipleChoice + LinePlot | ✅ |
| 9  | Shape catalog hotspot | MultiPart + custom | ⏭ skip |
| 10 | Unit conversion | MultipleChoice | ✅ |
| 11 | Place value ×10 | ShortAnswer | ✅ |
| 12 | Word form → standard | ShortAnswer | ✅ |
| 13 | Lines of symmetry | InlineChoice + SymmetryFigure | ✅ |
| 14 | Unknown angle | MultipleChoice + AngleDiagram | ✅ |
| 15 | Division word problem | ShortAnswer (with suffix) | ✅ |
| 16 | Rounding True/False | TrueFalseTable | ✅ |
| 17 | Protractor drag-drop | ProtractorDragDrop | ⏭ skip |
| 18 | Fraction × whole | ShortAnswer | ✅ |
| 19 | Subtraction with {?} | MultipleChoice | ✅ |
| 20 | Rectangle area | MultipleChoice + RectangleDiagram | ✅ |

**Done: 17 | Skip: 2 (Q9, Q17)**
