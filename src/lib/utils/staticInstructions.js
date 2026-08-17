/**
 * Fixed UI instruction strings shown by answer-widget components — e.g.
 * "Enter your answer in the box." These are NOT part of any item's variant
 * data, so they were outside renderSpokenFields()'s scope and never got
 * audio. Since the text is identical across every item using a given
 * widget, it's synthesized once (content-hash caching) and reused
 * everywhere — kept here, single source of truth, so the component that
 * DISPLAYS a string and the code that builds its audio segment can never
 * drift out of sync (drift = broken hash lookup = silent no-audio).
 */

export const STATIC_INSTRUCTIONS = {
  shortAnswerBox: 'Enter your answer in the box.',
  shortAnswerEquation: 'Enter your answer in the space provided. Enter <strong>only</strong> your answer.',
  numberLinePlot: 'Select a place on the number line to plot the point.',

  multiPartEnterBox: 'Enter your answer in the box.',
  multiPartEnterSpaceProvided: 'Enter your answer in the space provided.',
  multiPartEnterWorkOrExplanation: 'Enter your answer and your work or explanation in the space provided.',
  multiPartEnterExplanation: 'Enter your answer and your explanation in the space provided.',
  multiPartYesNo: 'Enter your answer.',
  multiPartExplainReasoning: 'Explain your reasoning in the space provided.',
  multiPartDimensionPair: 'Enter the length and width.',
  multiPartShowWorkDimension: 'Show your work or explain how you know your answer is correct.',
  multiPartShowWorkDefault: 'Show or explain how you got your answer.',
};

// select_count only ranges 1-5 across the corpus today.
export const COUNT_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

export function selectCountInstruction(select_count) {
  const word = COUNT_WORDS[select_count] ?? select_count;
  return `Select the <strong>${word}</strong> correct answers.`;
}

// ── Instruction selection ───────────────────────────────────────────────────
// Single source of truth for "which fixed string does this question/part
// show" — used by the Svelte components (to display + know what to look up)
// AND by renderSpokenFields (to know what to synthesize). Must stay the only
// place this decision is made, or a component and the audio pipeline can
// silently disagree about which string goes with which item.

/** Single-part question (student/mcas) — returns text or null. */
export function instructionTextForQuestion(q) {
  switch (q.answer_type) {
    case 'short_answer':
      return q.input_widget === 'equation_editor'
        ? STATIC_INSTRUCTIONS.shortAnswerEquation
        : STATIC_INSTRUCTIONS.shortAnswerBox;
    case 'multiple_select':
      return selectCountInstruction(q.select_count);
    case 'number_line_plot':
      return STATIC_INSTRUCTIONS.numberLinePlot;
    default:
      return null;
  }
}

/**
 * Multi-part part — returns [[fieldKey, text], ...] (0-2 entries). Per-item
 * DYNAMIC instructions (part.answer_instruction, part.work_instruction) are
 * real item content, not static UI text — deliberately excluded here; narrate
 * those by adding them as their own renderSpokenFields fields, not this list.
 */
export function instructionSegmentsForPart(part) {
  switch (part.answer_type) {
    case 'number_line_plot':
      return [['answer_instruction', STATIC_INSTRUCTIONS.numberLinePlot]];
    case 'short_answer':
      return [['answer_instruction',
        (part.math_expression_prefix || part.answer_suffix)
          ? STATIC_INSTRUCTIONS.multiPartEnterBox
          : STATIC_INSTRUCTIONS.multiPartEnterSpaceProvided]];
    case 'constructed_response':
      return part.answer_instruction
        ? []
        : [['answer_instruction', STATIC_INSTRUCTIONS.multiPartEnterWorkOrExplanation]];
    case 'number_with_work':
      return [
        ['answer_instruction', STATIC_INSTRUCTIONS.multiPartEnterBox],
        ...(part.work_instruction ? [] : [['work_instruction', STATIC_INSTRUCTIONS.multiPartShowWorkDefault]])
      ];
    case 'yes_no_explanation':
      return [
        ['answer_instruction', STATIC_INSTRUCTIONS.multiPartYesNo],
        ['work_instruction', STATIC_INSTRUCTIONS.multiPartExplainReasoning]
      ];
    case 'dimension_pair':
      return [
        ['answer_instruction', STATIC_INSTRUCTIONS.multiPartDimensionPair],
        ['work_instruction', STATIC_INSTRUCTIONS.multiPartShowWorkDimension]
      ];
    default:
      return [];
  }
}
