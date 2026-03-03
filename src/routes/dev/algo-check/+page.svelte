<script>
  import questions2019 from '../../../../data/g4-math_2019_questions.json';
  import questions2023 from '../../../../data/g4-math_2023_questions.json';
  import questions2025 from '../../../../data/g4-math_2025_questions.json';
  import { generators, generate } from '$lib/utils/generators.js';
  import MultipleChoice from '$lib/components/questions/MultipleChoice.svelte';
  import MultiPart from '$lib/components/questions/MultiPart.svelte';
  import ShortAnswer from '$lib/components/questions/ShortAnswer.svelte';
  import MultipleSelect from '$lib/components/questions/MultipleSelect.svelte';
  import NumberLinePlot from '$lib/components/questions/NumberLinePlot.svelte';
  import InlineChoice from '$lib/components/questions/InlineChoice.svelte';
  import TrueFalseTable from '$lib/components/questions/TrueFalseTable.svelte';
  import ProtractorDragDrop from '$lib/components/questions/ProtractorDragDrop.svelte';

  const allQuestions = { '2019': questions2019, '2023': questions2023, '2025': questions2025 };

  let year = '2019';
  let index = 0;
  let generated = null;

  $: questions = allQuestions[year];
  $: q = questions[index];
  $: hasGenerator = !!generators[q?.item_id];

  // Reset index + generated when year changes
  $: if (year) { index = 0; generated = null; }
  // Reset generated when question changes
  $: if (index !== undefined) generated = null;

  function doGenerate() {
    generated = generate(q.item_id);
  }
</script>

<div class="flex items-center gap-4 mb-4">
  <h1 class="text-2xl font-bold">Algo Check</h1>
</div>

<!-- Year selector -->
<div class="flex gap-2 mb-4">
  {#each ['2019', '2023', '2025'] as y}
    <button
      on:click={() => year = y}
      class="px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
        {year === y
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}"
    >
      {y}
    </button>
  {/each}
</div>

<!-- Question number strip -->
<div class="flex flex-wrap gap-1 mb-5">
  {#each questions as question, i}
    <button
      on:click={() => { index = i; }}
      class="w-8 h-8 rounded text-sm font-medium border relative
        {i === index
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'}"
    >
      {question.question_number}
      {#if generators[question.item_id]}
        <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-400"></span>
      {/if}
    </button>
  {/each}
</div>
<p class="text-xs text-gray-400 mb-5">Green dot = generator available</p>

<!-- Main area -->
<div class="flex gap-4 items-stretch">

  <!-- Left: base question -->
  <div class="flex-1 min-w-0">
    <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
      Base Question &mdash; Q{q.question_number} · {q.answer_type}
    </div>
    <div class="bg-[#e9e9e9] p-4 rounded">
      {#if q.answer_type === 'multiple_choice'}
        <MultipleChoice
          stimulus_intro={q.stimulus_intro ?? null}
          stimulus_list={q.stimulus_list ?? null}
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
          question_text={q.question_text}
          math_expression={q.math_expression ?? null}
          answer_options={q.answer_options}
        />
      {:else if q.answer_type === 'multi_part'}
        <MultiPart
          question_text={q.question_text}
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
          parts={q.parts}
          layout={q.layout ?? null}
        />
      {:else if q.answer_type === 'short_answer'}
        <ShortAnswer
          stimulus_intro={q.stimulus_intro ?? null}
          math_expression={q.math_expression ?? null}
          question_text={q.question_text}
          input_widget={q.input_widget ?? 'text'}
          answer_suffix={q.answer_suffix ?? null}
        />
      {:else if q.answer_type === 'multiple_select'}
        <MultipleSelect
          stimulus_intro={q.stimulus_intro ?? null}
          question_text={q.question_text}
          math_expression={q.math_expression ?? null}
          answer_options={q.answer_options}
          select_count={q.select_count}
          layout={q.layout ?? null}
        />
      {:else if q.answer_type === 'number_line_plot'}
        <NumberLinePlot question_text={q.question_text} stimulus_params={q.stimulus_params ?? {}} />
      {:else if q.answer_type === 'true_false_table'}
        <TrueFalseTable question_text={q.question_text} statements={q.statements ?? []} />
      {:else if q.answer_type === 'inline_choice'}
        <InlineChoice
          question_text={q.question_text}
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
          instruction={q.instruction ?? null}
          sentences={q.sentences ?? []}
          dropdowns={q.dropdowns ?? []}
        />
      {:else if q.answer_type === 'protractor_drag_drop'}
        <ProtractorDragDrop question_text={q.question_text} stimulus_params={q.stimulus_params} />
      {:else}
        <div class="bg-white p-4 text-sm text-gray-400 italic rounded">
          No component for: <strong>{q.answer_type}</strong>
        </div>
      {/if}
    </div>

    <!-- Base correct answer -->
    {#if q.correct_answer !== null && q.correct_answer !== undefined}
      <div class="mt-2 flex items-center gap-2">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Answer:</span>
        <span class="font-mono text-sm bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded">
          {typeof q.correct_answer === 'object' ? JSON.stringify(q.correct_answer) : q.correct_answer}
        </span>
      </div>
    {/if}
  </div>

  <!-- Right: generated variant -->
  <div class="flex-1 min-w-0 flex flex-col">
    <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
      Generated Variant
    </div>

    {#if !hasGenerator}
      <div class="rounded border border-amber-200 bg-amber-50 p-4 flex-1 flex items-center justify-center">
        <p class="text-sm text-amber-700">No generator yet for Q{q.question_number} ({q.answer_type})</p>
      </div>
    {:else if !generated}
      <div class="rounded border border-gray-200 bg-white p-4 flex-1 flex items-center justify-center">
        <button
          on:click={doGenerate}
          class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors"
        >
          Generate
        </button>
      </div>
    {:else}
      <div class="bg-[#e9e9e9] p-4 rounded">
        {#key generated}
        {#if generated.answer_type === 'multiple_choice'}
          <MultipleChoice
            stimulus_intro={generated.stimulus_intro ?? null}
            stimulus_list={generated.stimulus_list ?? null}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            question_text={generated.question_text}
            math_expression={generated.math_expression ?? null}
            answer_options={generated.answer_options}
            correct_answer={generated.correct_answer}
          />
        {:else if generated.answer_type === 'multi_part'}
          <MultiPart
            question_text={generated.question_text}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            parts={generated.parts}
            layout={generated.layout ?? null}
          />
        {:else if generated.answer_type === 'short_answer'}
          <ShortAnswer
            stimulus_intro={generated.stimulus_intro ?? null}
            math_expression={generated.math_expression ?? null}
            question_text={generated.question_text}
            input_widget={generated.input_widget ?? 'text'}
            answer_suffix={generated.answer_suffix ?? null}
          />
        {:else if generated.answer_type === 'multiple_select'}
          <MultipleSelect
            stimulus_intro={generated.stimulus_intro ?? null}
            question_text={generated.question_text}
            math_expression={generated.math_expression ?? null}
            answer_options={generated.answer_options}
            select_count={generated.select_count}
            layout={generated.layout ?? null}
          />
        {:else if generated.answer_type === 'number_line_plot'}
          <NumberLinePlot question_text={generated.question_text} stimulus_params={generated.stimulus_params ?? {}} />
        {:else if generated.answer_type === 'true_false_table'}
          <TrueFalseTable question_text={generated.question_text} statements={generated.statements ?? []} />
        {:else if generated.answer_type === 'inline_choice'}
          <InlineChoice
            question_text={generated.question_text}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            instruction={generated.instruction ?? null}
            sentences={generated.sentences ?? []}
            dropdowns={generated.dropdowns ?? []}
          />
        {:else if generated.answer_type === 'protractor_drag_drop'}
          <ProtractorDragDrop question_text={generated.question_text} stimulus_params={generated.stimulus_params} />
        {:else}
          <div class="bg-white p-4 text-sm text-gray-400 italic rounded">
            No component for: <strong>{generated.answer_type}</strong>
          </div>
        {/if}
        {/key}
      </div>

      <!-- Generated correct answer + regenerate -->
      <div class="mt-2 flex items-center gap-3">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Answer:</span>
        <span class="font-mono text-sm bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded">
          {typeof generated.correct_answer === 'object' ? JSON.stringify(generated.correct_answer) : generated.correct_answer}
        </span>
        <button
          on:click={doGenerate}
          class="ml-auto text-xs px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded transition-colors"
        >
          Regenerate
        </button>
      </div>
    {/if}
  </div>

</div>
