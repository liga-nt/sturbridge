# New Items Component Analysis

Analysis of 40 new Grade 4 Math items — whether they can be built with existing components or need new ones.

## Legend
- ✅ **Existing** — fits current components with no changes
- 🔧 **Near-existing** — minor prop/param extension to existing component
- 🟡 **Moderate** — new stimulus type or moderate extension to existing component
- 🔴 **New** — requires a new interaction/component type
- ⭐ **Same standard as a 2019 question** (noted on ✅ Existing items)

---

## Batch 1 (items 1–5)

| ID | Assessment | Category |
|----|-----------|---------|
| MA000732007 | Protractor image + 2 inline-choice dropdowns (measure angle PLM and KLP). Similar to Q17 but read-only protractor + InlineChoice pattern. Needs new **ProtractorImage** stimulus (static SVG) + InlineChoice. | 🟡 Moderate |
| MA001750121 | MultipleChoice with bulleted list in stimulus_intro. "Which could be the total cost?" Fits MultipleChoice with HTML in stimulus_intro. ⭐ 4.OA.B.4 (same as Q1 2019) | ✅ Existing |
| MA001851276 | TrueFalseTable, rounding to nearest hundred/thousand/ten thousand. Identical to Q16. ⭐ 4.NBT.A.3 (same as Q16 2019) | ✅ Existing |
| MA002034926 | MultipleChoice, subtraction expression as math_expression. Identical pattern to Q19. ⭐ 4.NBT.B.4 (same as Q19 2019) | ✅ Existing |
| MA002128911 | ShortAnswer with a triangle stimulus (count acute angles). SymmetryFigure supports triangles but ShortAnswer has no stimulus slot. Needs **ShortAnswer+Stimulus** extension or wrapper. | 🟡 Moderate |

## Batch 2 (items 6–10)

| ID | Assessment | Category |
|----|-----------|---------|
| MA002135528 | MultipleChoice, unit conversion (kg → grams, bold word). ⭐ 4.MD.A.1 (same as Q10 2019) | ✅ Existing |
| MA002139080 | MultipleChoice + dot plot (filled circles above a fractional number line). Like LinePlot but dots not X marks. LinePlot extended with `mark_style` param, or new **DotPlot** stimulus. | 🔧 Near-existing |
| MA002140372 | MultipleChoice + AngleDiagram (rays Q/R/S/T from vertex V, 3 labeled arcs, find QVT). Identical pattern to Q14. ⭐ 4.MD.C.7 (same as Q14 2019) | ✅ Existing |
| MA002145158 | Drag-and-drop inequality: tiles [0.65][0.52][0.78] dragged into three inequality statements. New interaction type. | 🔴 New — DragDropInequality |
| MA002162929 | TrueFalseTable with multiplication equations (column header "Equation" not "Statement"). Minor prop extension. | 🔧 Near-existing |

## Batch 3 (items 11–15)

| ID | Assessment | Category |
|----|-----------|---------|
| MA002334462 | NumberLinePlot, plot 91/100 on a 0–1 line. Simpler than Q5 (no zoom). Existing NumberLinePlot with different params. ⭐ 4.NF.C.6 (same as Q5 2019) | ✅ Existing |
| MA010534486 | InlineChoice, two dropdowns in one sentence ("perimeter of [#] [units]"). No visual. ⭐ 4.MD.A.3 (same as Q20 2019) | ✅ Existing |
| MA136448521 | Drag-and-drop categorize: tiles [4][7][18][25][43] dragged into Composite/Prime boxes. New interaction. | 🔴 New — CategorySort |
| MA202029218 | MultipleChoice, rounding to nearest thousand. ⭐ 4.NBT.A.3 (same as Q16 2019) | ✅ Existing |
| MA231836735 | ShortAnswer with centered math_expression (0.49), large dashed answer box. ⭐ 4.NF.C.6 (same as Q5 2019) | ✅ Existing |

## Batch 4 (items 16–20)

| ID | Assessment | Category |
|----|-----------|---------|
| MA231875780 | 4-part question: Part A has a graduated cylinder image + numeric answer; Parts B/C/D are constructed response with full rich-text+math toolbar. Needs MultiPart extended to 4 parts + new **GraduatedCylinder** stimulus. | 🔴 New — High complexity |
| MA232254177 | MultipleSelect (3 correct) with polygon shape SVGs as answer options (5 irregular quadrilaterals). Like Q7 but geometry shapes. Needs MultipleSelect extended to render polygon shapes (vertices-defined SVG). | 🟡 Moderate |
| MA232261850 | TrueFalseTable variant: first column has inline SVG figures (shapes with dashed symmetry lines), columns are "Line of Symmetry" / "Not a Line of Symmetry". New **FigureSymmetryTable** or extend TrueFalseTable to support SVG rows. | 🟡 Moderate |
| MA233051799 | MultipleChoice with fraction in question_text + fraction answer options via renderMath. ⭐ 4.NF.B.4 (same as Q18 2019) | ✅ Existing |
| MA247705 | MultipleChoice with polygon/shape SVGs as answer options (triangle, semicircle, parallelogram, circle). Needs shape SVG support in answer options. | 🟡 Moderate |

## Batch 5 (items 21–25)

| ID | Assessment | Category |
|----|-----------|---------|
| MA250533 | ShortAnswer with math_expression (number sequence "234, 225, ..."), plain numeric answer box. — 4.OA.C.5 (new standard) | ✅ Existing |
| MA297614 | MultipleChoice with bulleted list in stimulus (arithmetic sequence word problem). — 4.OA.C.5 (new standard) | ✅ Existing |
| MA301798 | MultipleChoice with a grid of repeated images (4×6 cookie array). Needs new **ItemArray** stimulus (parametric N×M grid of a simple SVG shape). | 🟡 Moderate |
| MA303324 | MultipleChoice, fraction in question_text + mixed-number answer options via renderMath. ⭐ 4.NF.B.4 (same as Q18 2019) | ✅ Existing |
| MA307060 | MultipleChoice with polygon shape SVGs as answer options (parallelogram, rectangle, house, kite). Same as MA247705/MA232254177 — shape SVG in answer options. | 🟡 Moderate |

## Batch 6 (items 26–30)

| ID | Assessment | Category |
|----|-----------|---------|
| MA307314 | MultipleChoice with variable equation as math_expression. ⭐ 4.NBT.B.4 (same as Q19 2019) | ✅ Existing |
| MA307317 | 3-part constructed response (no visual stimulus, all 3 parts use rich-text+MATH editor). MultiPart needs extension to support 3+ parts. | 🔧 Near-existing |
| MA311543 | MultipleChoice with division expression as math_expression. — 4.NBT.B.6 (new standard) | ✅ Existing |
| MA311554 | MultipleChoice, fraction 1/4 in question_text via renderMath. — 4.MD.C.5 (new standard) | ✅ Existing |
| MA704653374 | MultiPart (2 parts): Part A = dashed-box ShortAnswer; Part B = math_expression displayed + InlineChoice dropdowns. Mixed part types (short_answer + inline_choice). Precedent in Q9. | 🔧 Near-existing |

## Batch 7 (items 31–40)

| ID | Assessment | Category |
|----|-----------|---------|
| MA713677363 | Two-part: Part A = drag-drop match (expanded form → word form, 3 tiles into 3 GoalBox targets); Part B = TrueFalseTable variant with "Less Than / Greater Than 13,084" columns (3 rows). Part A needs new **DragDropMatch** component. Part B is near-existing TrueFalseTable. | 🔴 New (Part A) / 🔧 Near-existing (Part B) |
| MA800780887 | 4-part constructed response: Part A = MultipleChoice (fraction addition equation); Parts B/C/D = short answer with show-work text editor. Mostly a large MultiPart extension. | 🔧 Near-existing (MultiPart 4-part) |
| MA801035466 | 4-part constructed response with fraction bar/circle diagrams: Part A–D involve comparing, writing, and explaining fraction quantities for rainwater in buckets. Visual fraction diagrams needed as stimulus for each part. | 🔴 New — FractionDiagram stimulus + 4-part MultiPart |
| MA900741771 | MultipleSelect (3 of 5), paint jars word problem. Equation answer options. ⭐ 4.OA.A.2 (same as Q6 2019) | ✅ Existing |
| MA900750085 | MultipleSelect (3 of 6), factors of 64. Plain number answers. ⭐ 4.OA.B.4 (same as Q1 2019) | ✅ Existing |
| MA900754381 | MultipleChoice, fraction comparison with {?} boxed notation. `{?} > 5/2`. Identical to Q19 pattern. ⭐ 4.NF.A.2 (same as Q7 2019) | ✅ Existing |
| MA900776517 | ShortAnswer with a decimal grid shading model as stimulus (base-10 grid showing a decimal < 1). Student writes a decimal that is less. Needs **DecimalGrid** or **ShadedGridModel** stimulus + ShortAnswer+Stimulus extension. | 🟡 Moderate |
| MA900846441 | Interactive fraction model: student uses More/Fewer buttons to divide a rectangle into N parts, then clicks to shade. Entirely new interaction widget. | 🔴 New — InteractiveFractionModel |
| MA903571693 | MultipleChoice, rectangle perimeter equation (5×4 rectangle, pick correct formula). No visual. ⭐ 4.MD.A.3 (same as Q20 2019) | ✅ Existing |
| MA903776098 | MultipleChoice, angle = fraction of circle (1/3 of 360°). No visual. — 4.MD.C.5 (new standard) | ✅ Existing |

---

## Complete Summary (all 40 items)

| Category | Count | Items |
|---------|-------|-------|
| ✅ Existing | 21 | MA001750121, MA001851276, MA002034926, MA002135528, MA002140372, MA002334462, MA010534486, MA202029218, MA231836735, MA233051799, MA250533, MA297614, MA303324, MA307314, MA311543, MA311554, MA900741771, MA900750085, MA900754381, MA903571693, MA903776098 |
| 🔧 Near-existing | 6 | MA002139080, MA002162929, MA307317, MA704653374, MA713677363 (Part B), MA800780887 |
| 🟡 Moderate | 8 | MA000732007, MA002128911, MA232254177, MA232261850, MA247705, MA301798, MA307060, MA900776517 |
| 🔴 New | 5 | MA002145158, MA136448521, MA231875780, MA713677363 (Part A), MA801035466, MA900846441 |

## New Components Needed (all 40 items)

### Minor extensions to existing components
1. **MultiPart 3–4 parts** — extend to support 3 or 4 parts (MA307317, MA800780887, MA801035466, MA231875780)
2. **ShortAnswer+Stimulus** — add stimulus slot to ShortAnswer (MA002128911, MA900776517)
3. **TrueFalseTable column labels** — already near-trivial (MA002162929, MA713677363 Part B)
4. **LinePlot `mark_style`** — add dot/circle variant to LinePlot (MA002139080)

### New stimulus types
5. **ProtractorImage** — static read-only protractor SVG (MA000732007)
6. **DotPlot** — filled circles above fractional number line; or extend LinePlot (MA002139080)
7. **PolygonShapes** — MultipleChoice/Select with SVG polygon answer options (MA232254177, MA247705, MA307060)
8. **FigureSymmetryTable** — TrueFalseTable with SVG figures in first column (MA232261850)
9. **ItemArray** — parametric N×M grid of a repeated SVG shape (MA301798)
10. **DecimalGrid / ShadedGridModel** — base-10 shaded grid as stimulus (MA900776517)
11. **FractionDiagram** — fraction bar or circle diagram stimulus (MA801035466)

### New interaction types
12. **DragDropInequality** — drag decimal tiles into inequality blanks (MA002145158)
13. **CategorySort** — drag tiles into labeled category boxes (MA136448521)
14. **DragDropMatch** — drag expression tiles to matching goal boxes (MA713677363 Part A)
15. **GraduatedCylinder** — reading a measurement cylinder stimulus (MA231875780)
16. **InteractiveFractionModel** — More/Fewer buttons to divide + click-to-shade rectangle (MA900846441)
