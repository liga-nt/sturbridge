<script>
    // Read-only rendering of a single quiz question plus its correct answer —
    // shared by the teacher quiz-builder's preview panel and the saved-quiz
    // click-through preview, so both stay in sync as new answer_types are added.
    import { formatCorrectAnswer } from '$lib/utils/grading.js';

    import MultipleChoice from './questions/MultipleChoice.svelte';
    import MultiPart from './questions/MultiPart.svelte';
    import ShortAnswer from './questions/ShortAnswer.svelte';
    import MultipleSelect from './questions/MultipleSelect.svelte';
    import TrueFalseTable from './questions/TrueFalseTable.svelte';
    import InlineChoice from './questions/InlineChoice.svelte';
    import NumberLinePlot from './questions/NumberLinePlot.svelte';
    import ProtractorDragDrop from './questions/ProtractorDragDrop.svelte';
    import DragDropInequality from './questions/DragDropInequality.svelte';
    import CategorySort from './questions/CategorySort.svelte';
    import FractionModel from './questions/FractionModel.svelte';
    import DragDropMatch from './questions/DragDropMatch.svelte';
    import DragDropLinePlot from './questions/DragDropLinePlot.svelte';

    export let question;
</script>

<div class="bg-[#e9e9e9] rounded p-4">
    {#if question.kind === 'fundamentals'}
        <p class="font-mono text-lg text-gray-800 text-center py-2">{question.display} = ?</p>
    {:else if question.answer_type === 'multiple_choice'}
        <MultipleChoice
            stimulus_intro={question.stimulus_intro ?? null}
            stimulus_list={question.stimulus_list ?? null}
            stimulus_type={question.stimulus_type ?? null}
            stimulus_params={question.stimulus_params ?? null}
            question_text={question.question_text}
            math_expression={question.math_expression ?? null}
            answer_options={question.answer_options ?? []}
        />
    {:else if question.answer_type === 'multi_part'}
        <MultiPart
            question_text={question.question_text}
            stimulus_list={question.stimulus_list ?? null}
            stimulus_type={question.stimulus_type ?? null}
            stimulus_params={question.stimulus_params ?? null}
            parts={question.parts}
            layout={question.layout ?? null}
        />
    {:else if question.answer_type === 'short_answer'}
        <ShortAnswer
            stimulus_intro={question.stimulus_intro ?? null}
            stimulus_type={question.stimulus_type ?? null}
            stimulus_params={question.stimulus_params ?? null}
            math_expression={question.math_expression ?? null}
            question_text={question.question_text}
            input_widget={question.input_widget ?? 'text'}
            answer_suffix={question.answer_suffix ?? null}
        />
    {:else if question.answer_type === 'multiple_select'}
        <MultipleSelect
            stimulus_intro={question.stimulus_intro ?? null}
            stimulus_type={question.stimulus_type ?? null}
            stimulus_params={question.stimulus_params ?? null}
            question_text={question.question_text}
            math_expression={question.math_expression ?? null}
            answer_options={question.answer_options ?? []}
            select_count={question.select_count}
            layout={question.layout ?? null}
        />
    {:else if question.answer_type === 'true_false_table'}
        <TrueFalseTable
            question_text={question.question_text}
            statements={question.statements ?? []}
            column_label={question.column_label ?? 'Statement'}
            true_label={question.true_label ?? 'True'}
            false_label={question.false_label ?? 'False'}
            stimulus_intro={question.stimulus_intro ?? null}
            stimulus_type={question.stimulus_type ?? null}
            instruction={question.instruction ?? null}
        />
    {:else if question.answer_type === 'inline_choice'}
        <InlineChoice
            stimulus_intro={question.stimulus_intro ?? null}
            question_text={question.question_text}
            stimulus_type={question.stimulus_type ?? null}
            stimulus_params={question.stimulus_params ?? null}
            instruction={question.instruction ?? null}
            sentences={question.sentences ?? []}
            dropdowns={question.dropdowns ?? []}
        />
    {:else if question.answer_type === 'number_line_plot'}
        <NumberLinePlot
            question_text={question.question_text}
            stimulus_params={question.stimulus_params ?? {}}
        />
    {:else if question.answer_type === 'protractor_drag_drop'}
        <ProtractorDragDrop
            question_text={question.question_text}
            stimulus_params={question.stimulus_params}
            answer_options={question.answer_options ?? []}
        />
    {:else if question.answer_type === 'drag_drop_inequality'}
        <DragDropInequality
            question_text={question.question_text}
            instruction2={question.instruction2 ?? ''}
            tiles={question.tiles ?? []}
            rows={question.rows ?? []}
            correct_answer={question.correct_answer ?? {}}
        />
    {:else if question.answer_type === 'category_sort'}
        <CategorySort
            question_text={question.question_text}
            tiles={question.tiles ?? []}
            categories={question.categories ?? []}
        />
    {:else if question.answer_type === 'fraction_model'}
        <FractionModel
            question_text={question.question_text}
            math_expression={question.math_expression ?? null}
            instruction={question.instruction ?? null}
            numerator={question.model_params?.numerator ?? 1}
            denominator={question.model_params?.denominator ?? 4}
            models={question.models ?? null}
        />
    {:else if question.answer_type === 'drag_drop_match'}
        <DragDropMatch
            question_text={question.question_text}
            instruction={question.instruction ?? ''}
            tiles={question.tiles ?? []}
            rows={question.rows ?? []}
        />
    {:else if question.answer_type === 'drag_drop_line_plot'}
        <DragDropLinePlot
            stimulus_intro={question.stimulus_intro ?? null}
            question_text={question.question_text}
            math_expression={question.math_expression ?? null}
            stimulus_params={question.stimulus_params ?? {}}
        />
    {:else}
        <p class="text-sm text-gray-400 italic">Preview not available for: {question.answer_type}</p>
    {/if}
</div>

<div class="mt-2 px-4 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
    <span class="font-medium">Answer:</span> {formatCorrectAnswer(question)}
</div>
