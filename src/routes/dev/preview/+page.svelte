<script>
  import questions2019 from '../../../../data/g4-math_2019_questions.json';
  import questions2021 from '../../../../data/g4-math_2021_questions.json';
  import questions2022 from '../../../../data/g4-math_2022_questions.json';
  import questions2023 from '../../../../data/g4-math_2023_questions.json';
  import questions2025 from '../../../../data/g4-math_2025_questions.json';
  import MultipleChoice from '$lib/components/questions/MultipleChoice.svelte';
  import MultiPart from '$lib/components/questions/MultiPart.svelte';
  import ShortAnswer from '$lib/components/questions/ShortAnswer.svelte';
  import MultipleSelect from '$lib/components/questions/MultipleSelect.svelte';
  import NumberLinePlot from '$lib/components/questions/NumberLinePlot.svelte';
  import InlineChoice from '$lib/components/questions/InlineChoice.svelte';
  import TrueFalseTable from '$lib/components/questions/TrueFalseTable.svelte';
  import ProtractorDragDrop from '$lib/components/questions/ProtractorDragDrop.svelte';
  import DragDropInequality from '$lib/components/questions/DragDropInequality.svelte';
  import CategorySort from '$lib/components/questions/CategorySort.svelte';
  import FractionModel from '$lib/components/questions/FractionModel.svelte';
  import DragDropMatch from '$lib/components/questions/DragDropMatch.svelte';

  const years = { '2019': questions2019, '2021': questions2021, '2022': questions2022, '2023': questions2023, '2025': questions2025 };
  let year = '2019';
  let index = 0;
  let showJson = false;

  $: questions = years[year];
  $: q = questions[index];

  // Construct fallback library URL from item_id
  function libraryUrl(item_id) {
    return `https://mcas.digitalitemlibrary.com/home?subject=Math&grades=Grade%204&view=ALL&itemUIN=${item_id}`;
  }
</script>

<div class="flex items-center gap-4 mb-4">
  <h1 class="text-2xl font-bold">Question Preview</h1>
  <select bind:value={year} on:change={() => index = 0} class="rounded border border-gray-300 px-2 py-1 text-sm">
    <option value="2019">2019</option>
    <option value="2021">2021</option>
    <option value="2022">2022</option>
    <option value="2023">2023</option>
    <option value="2025">2025</option>
  </select>
  <label class="flex items-center gap-1 text-sm text-gray-500 ml-auto cursor-pointer">
    <input type="checkbox" bind:checked={showJson} class="rounded" />
    Show JSON
  </label>
</div>

<!-- Question number strip -->
<div class="flex flex-wrap gap-1 mb-5">
  {#each questions as question, i}
    <button
      on:click={() => index = i}
      class="w-8 h-8 rounded text-sm font-medium border
        {i === index
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'}"
    >
      {question.question_number}
    </button>
  {/each}
</div>

<!-- Main comparison area -->
<div class="flex gap-4 items-stretch">

  <!-- Our component -->
  <div class="flex-1 min-w-0">
    <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
      Our Component &mdash; {q.answer_type}{q.stimulus_type ? ` · ${q.stimulus_type}` : ''}
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
          stimulus_list={q.stimulus_list ?? null}
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
          parts={q.parts}
          layout={q.layout ?? null}
        />
      {:else if q.answer_type === 'short_answer'}
        <ShortAnswer
          stimulus_intro={q.stimulus_intro ?? null}
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
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
        <NumberLinePlot
          question_text={q.question_text}
          stimulus_params={q.stimulus_params ?? {}}
        />
      {:else if q.answer_type === 'true_false_table'}
        <TrueFalseTable
          question_text={q.question_text}
          statements={q.statements ?? []}
          column_label={q.column_label ?? 'Statement'}
          true_label={q.true_label ?? 'True'}
          false_label={q.false_label ?? 'False'}
          stimulus_intro={q.stimulus_intro ?? null}
          stimulus_type={q.stimulus_type ?? null}
          instruction={q.instruction ?? null}
        />
      {:else if q.answer_type === 'inline_choice'}
        <InlineChoice
          stimulus_intro={q.stimulus_intro ?? null}
          question_text={q.question_text}
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
          instruction={q.instruction ?? null}
          sentences={q.sentences ?? []}
          dropdowns={q.dropdowns ?? []}
        />
      {:else if q.answer_type === 'protractor_drag_drop'}
        <ProtractorDragDrop
          question_text={q.question_text}
          stimulus_params={q.stimulus_params}
        />
      {:else if q.answer_type === 'drag_drop_inequality'}
        <DragDropInequality
          question_text={q.question_text}
          instruction2={q.instruction2 ?? ''}
          tiles={q.tiles ?? []}
          rows={q.rows ?? []}
          correct_answer={q.correct_answer ?? {}}
        />
      {:else if q.answer_type === 'category_sort'}
        <CategorySort
          question_text={q.question_text}
          tiles={q.tiles ?? []}
          categories={q.categories ?? []}
        />
      {:else if q.answer_type === 'fraction_model'}
        <FractionModel
          question_text={q.question_text}
          math_expression={q.math_expression ?? null}
          instruction={q.instruction ?? null}
          numerator={q.model_params?.numerator ?? 1}
          denominator={q.model_params?.denominator ?? 4}
          models={q.models ?? null}
        />
      {:else if q.answer_type === 'drag_drop_match'}
        <DragDropMatch
          question_text={q.question_text}
          instruction={q.instruction ?? ''}
          tiles={q.tiles ?? []}
          rows={q.rows ?? []}
        />
      {:else}
        <div class="bg-white p-4 text-sm text-gray-400 italic rounded">
          No component yet for: <strong>{q.answer_type}</strong>
        </div>
      {/if}
    </div>
  </div>

  <!-- Reference: TestNav iframe or screenshot -->
  <div class="flex-1 min-w-0 flex flex-col">
    <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
      Reference &mdash; {q.preview_url ? 'TestNav' : year !== '2019' ? 'Screenshot' : 'MCAS Library'}
    </div>
    {#if q.preview_url}
      <div class="rounded overflow-hidden border border-gray-200 bg-white flex flex-col flex-1">
        <iframe
          src={q.preview_url}
          title="Reference: Question {q.question_number}"
          width="100%"
          sandbox="allow-scripts allow-same-origin allow-forms"
          style="border: none; display: block; flex: 1; min-height: 0;"
        ></iframe>
      </div>
    {:else if year !== '2019' && q.item_id}
      <div class="rounded border border-gray-200 bg-white overflow-auto flex-1">
        <img
          src="/items/{q.item_id}/{q.item_id}.png"
          alt="Question {q.question_number} screenshot"
          class="w-full"
        />
      </div>
    {:else}
      <div class="rounded border border-amber-200 bg-amber-50 p-4 flex-1">
        <p class="text-sm text-amber-700 font-medium mb-2">No preview URL</p>
        <p class="text-xs text-amber-600 mb-3 font-mono">node scripts/fetch-question.mjs {q.item_id}</p>
        <a
          href={libraryUrl(q.item_id)}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-indigo-600 underline hover:text-indigo-800"
        >Open in library ↗</a>
      </div>
    {/if}
  </div>

  <!-- Optional JSON panel -->
  {#if showJson}
    <div class="w-64 shrink-0">
      <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">JSON</div>
      <pre class="bg-gray-900 text-green-300 text-xs rounded p-3 overflow-auto max-h-[520px]">{JSON.stringify(q, null, 2)}</pre>
    </div>
  {/if}

</div>
