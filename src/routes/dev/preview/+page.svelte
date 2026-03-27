<script>
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase/client';
  import questions2019 from '../../../../data/g4-math_2019_questions.json';
  import questions2021 from '../../../../data/g4-math_2021_questions.json';
  import questions2022 from '../../../../data/g4-math_2022_questions.json';
  import questions2023 from '../../../../data/g4-math_2023_questions.json';
  import questions2025 from '../../../../data/g4-math_2025_questions.json';
  import { generators, generate } from '$lib/utils/generators.js';
  import { graders, gradeQuestion } from '$lib/utils/grading.js';
  import { fillTemplate, extractParams, loadFeedbackTemplate } from '$lib/utils/feedback.js';
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
  import DragDropLinePlot from '$lib/components/questions/DragDropLinePlot.svelte';

  const years = { '2019': questions2019, '2021': questions2021, '2022': questions2022, '2023': questions2023, '2025': questions2025 };
  let year = '2019';
  let index = 0;
  let showJson = false;
  let approvedMap = {};

  onMount(async () => {
    // Load approval state from Firestore tips collection
    try {
      const allItemIds = Object.values(years).flat().map(q => q.item_id);
      const snaps = await Promise.all(allItemIds.map(id => getDoc(doc(db, 'tips', id))));
      const map = {};
      snaps.forEach((snap, i) => {
        if (snap.exists() && snap.data()._approved) map[allItemIds[i]] = true;
      });
      approvedMap = map;
    } catch (e) {
      console.warn('Could not load approvals from Firestore:', e);
    }
  });

  $: questions = years[year];
  $: q = years[year][index];
  $: hasGenerator = !!generators[q?.item_id];
  $: isApproved = approvedMap[q?.item_id] ?? false;

  $: if (year) { index = 0; generated = null; }
  $: if (index !== undefined) { generated = null; resetTest(); }

  async function toggleApproved() {
    const newVal = !approvedMap[q.item_id];
    approvedMap = { ...approvedMap, [q.item_id]: newVal };
    await setDoc(doc(db, 'tips', q.item_id), { _approved: newVal }, { merge: true });
  }

  // ── Student UI tester ─────────────────────────────────────────────────────
  let generated = null;
  let testAnswer = null;
  let testAttempt = 0;       // wrong answer count
  let testAssisted = false;  // Learn clicked
  let testTip = null;        // tip text currently shown
  let testRevealed = false;

  function resetTest() {
    testAnswer = null;
    testAttempt = 0;
    testAssisted = false;
    testTip = null;
    testRevealed = false;
  }

  function doGenerate() {
    const variant = generate(q.item_id);
    generated = variant ? { ...variant, item_id: q.item_id } : null;
    resetTest();
  }

  function handleLearn() {
    testAssisted = true;
    testTip = getFilledTip('tip1');
  }

  function handleSubmit() {
    if (!generated || testAnswer === null || testAnswer === '' || testRevealed) return;
    const answers = generated.answer_type === 'multi_part' ? testAnswer : { answer: testAnswer };
    const result = gradeQuestion(answers, generated);
    const correct = result.score === result.total;

    if (correct) {
      testTip = '✓ Correct! Generating next variant...';
      setTimeout(() => { doGenerate(); }, 1200);
      return;
    }

    testAttempt++;
    testTip = testAttempt === 1
      ? getFilledTip(testAssisted ? 'tip2' : 'tip1')
      : null;

    if (testAttempt >= 2) {
      testRevealed = true;
      testTip = null;
    }
  }

  function getFilledTip(key) {
    if (!feedbackTemplate) return null;
    return fillTemplate(feedbackTemplate[key], extractParams(generated));
  }

  // ── Feedback template from Firestore ─────────────────────────────────────
  let feedbackTemplate = null;
  let templateLoading = false;

  async function loadTemplate(item_id) {
    templateLoading = true;
    feedbackTemplate = null;
    feedbackTemplate = await loadFeedbackTemplate(item_id);
    templateLoading = false;
  }

  $: if (q?.item_id) loadTemplate(q.item_id);
</script>

<!-- Header -->
<div class="flex items-center gap-4 mb-4">
  <h1 class="text-2xl font-bold">Preview</h1>
  <select bind:value={year} on:change={() => index = 0} class="rounded border border-gray-300 px-2 py-1 text-sm">
    <option value="2019">2019</option>
    <option value="2021">2021</option>
    <option value="2022">2022</option>
    <option value="2023">2023</option>
    <option value="2025">2025</option>
  </select>
  <label class="flex items-center gap-1.5 ml-auto cursor-pointer select-none
    {isApproved ? 'text-green-700 font-semibold' : 'text-gray-400'} text-sm">
    <input type="checkbox" checked={isApproved} on:change={toggleApproved} class="rounded" />
    Approved
  </label>
  <label class="flex items-center gap-1 text-sm text-gray-500 cursor-pointer">
    <input type="checkbox" bind:checked={showJson} class="rounded" />
    JSON
  </label>
</div>

<!-- Question strip -->
<div class="flex flex-wrap gap-1 mb-5">
  {#each questions as question, i}
    <button
      on:click={() => index = i}
      class="w-8 h-8 rounded text-sm font-medium border relative
        {i === index
          ? 'bg-indigo-600 text-white border-indigo-600'
          : approvedMap[question.item_id]
            ? 'bg-green-100 text-green-800 border-green-400 hover:border-green-600'
            : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'}"
    >
      {question.question_number}
      {#if generators[question.item_id]}
        <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400"></span>
      {/if}
    </button>
  {/each}
</div>

<!-- ── SECTION 1: Component vs Reference ───────────────────────────────────── -->
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
          stimulus_type={q.stimulus_type ?? null}
          stimulus_params={q.stimulus_params ?? null}
          question_text={q.question_text}
          math_expression={q.math_expression ?? null}
          answer_options={q.answer_options}
          select_count={q.select_count}
          layout={q.layout ?? null}
        />
      {:else if q.answer_type === 'number_line_plot'}
        <NumberLinePlot question_text={q.question_text} stimulus_params={q.stimulus_params ?? {}} />
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
        <ProtractorDragDrop question_text={q.question_text} stimulus_params={q.stimulus_params} />
      {:else if q.answer_type === 'drag_drop_inequality'}
        <DragDropInequality
          question_text={q.question_text}
          instruction2={q.instruction2 ?? ''}
          tiles={q.tiles ?? []}
          rows={q.rows ?? []}
          correct_answer={q.correct_answer ?? {}}
        />
      {:else if q.answer_type === 'category_sort'}
        <CategorySort question_text={q.question_text} tiles={q.tiles ?? []} categories={q.categories ?? []} />
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
      {:else if q.answer_type === 'drag_drop_line_plot'}
        <DragDropLinePlot
          stimulus_intro={q.stimulus_intro ?? null}
          question_text={q.question_text}
          math_expression={q.math_expression ?? null}
          stimulus_params={q.stimulus_params ?? {}}
        />
      {:else}
        <div class="bg-white p-4 text-sm text-gray-400 italic rounded">
          No component yet for: <strong>{q.answer_type}</strong>
        </div>
      {/if}
    </div>
  </div>

  <!-- Reference -->
  <div class="flex-1 min-w-0 flex flex-col">
    <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-3">
      <span>Reference &mdash; {year === '2025' ? 'Screenshot' : q.preview_url ? 'MCAS Library' : 'Screenshot'}</span>
      {#if q.preview_url}
        <a href={q.preview_url} target="_blank" rel="noopener noreferrer"
          class="text-indigo-500 hover:text-indigo-700 text-xs normal-case tracking-normal">Open source ↗</a>
      {/if}
    </div>
    {#if year !== '2025' && q.preview_url}
      <div class="rounded overflow-hidden border border-gray-200 bg-white flex flex-col flex-1">
        <iframe
          src={q.preview_url}
          title="Reference: Question {q.question_number}"
          width="100%"
          sandbox="allow-scripts allow-same-origin allow-forms"
          style="border: none; display: block; flex: 1; min-height: 0;"
        ></iframe>
      </div>
    {:else if q.item_id}
      <div class="rounded border border-gray-200 bg-white overflow-auto flex-1">
        <img src="/items/{q.item_id}/{q.item_id}.png" alt="Question {q.question_number} screenshot" class="w-full" />
      </div>
    {:else}
      <div class="rounded border border-amber-200 bg-amber-50 p-4 flex-1">
        <p class="text-sm text-amber-700 font-medium">No screenshot available</p>
      </div>
    {/if}
  </div>

  <!-- JSON panel -->
  {#if showJson}
    <div class="w-64 shrink-0">
      <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">JSON</div>
      <pre class="bg-gray-900 text-green-300 text-xs rounded p-3 overflow-auto max-h-[520px]">{JSON.stringify(q, null, 2)}</pre>
    </div>
  {/if}

</div>

<!-- ── SECTION 2: Student UI Tester ────────────────────────────────────────── -->
<div class="mt-8 pt-6 border-t border-gray-200">
<div class="max-w-xl">

    <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-3">
      <span>Generated Variant</span>
      {#if !hasGenerator}
        <span class="text-amber-500 normal-case tracking-normal font-normal">no generator</span>
      {:else if feedbackTemplate}
        <span class="text-green-600 normal-case tracking-normal font-normal">tips loaded</span>
      {:else if generated}
        <span class="text-amber-500 normal-case tracking-normal font-normal">no tips</span>
      {/if}
    </div>

    {#if !hasGenerator}
      <div class="rounded border border-amber-200 bg-amber-50 p-4 flex items-center justify-center">
        <p class="text-sm text-amber-700">No generator for Q{q.question_number} ({q.answer_type})</p>
      </div>
    {:else if !generated}
      <div class="rounded border border-gray-200 bg-white p-8 flex items-center justify-center">
        <button on:click={doGenerate}
          class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors">
          Generate
        </button>
      </div>
    {:else}

      <div class="bg-[#e9e9e9] rounded overflow-hidden">
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
            bind:value={testAnswer}
          />
        {:else if generated.answer_type === 'multi_part'}
          <MultiPart
            question_text={generated.question_text}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            parts={generated.parts}
            layout={generated.layout ?? null}
            {feedbackTemplate}
            question={generated}
            bind:value={testAnswer}
            on:complete={doGenerate}
          />
        {:else if generated.answer_type === 'short_answer'}
          <ShortAnswer
            stimulus_intro={generated.stimulus_intro ?? null}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            math_expression={generated.math_expression ?? null}
            question_text={generated.question_text}
            input_widget={generated.input_widget ?? 'text'}
            answer_suffix={generated.answer_suffix ?? null}
            bind:value={testAnswer}
          />
        {:else if generated.answer_type === 'multiple_select'}
          <MultipleSelect
            stimulus_intro={generated.stimulus_intro ?? null}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            question_text={generated.question_text}
            math_expression={generated.math_expression ?? null}
            answer_options={generated.answer_options}
            select_count={generated.select_count}
            layout={generated.layout ?? null}
            bind:value={testAnswer}
          />
        {:else if generated.answer_type === 'number_line_plot'}
          <NumberLinePlot question_text={generated.question_text} stimulus_params={generated.stimulus_params ?? {}} bind:value={testAnswer} />
        {:else if generated.answer_type === 'true_false_table'}
          <TrueFalseTable question_text={generated.question_text} statements={generated.statements ?? []} bind:value={testAnswer} />
        {:else if generated.answer_type === 'inline_choice'}
          <InlineChoice
            question_text={generated.question_text}
            stimulus_type={generated.stimulus_type ?? null}
            stimulus_params={generated.stimulus_params ?? null}
            instruction={generated.instruction ?? null}
            sentences={generated.sentences ?? []}
            dropdowns={generated.dropdowns ?? []}
            bind:value={testAnswer}
          />
        {:else if generated.answer_type === 'protractor_drag_drop'}
          <ProtractorDragDrop question_text={generated.question_text} stimulus_params={generated.stimulus_params} bind:value={testAnswer} />
        {:else if generated.answer_type === 'drag_drop_match'}
          <DragDropMatch question_text={generated.question_text} instruction={generated.instruction ?? ''} tiles={generated.tiles ?? []} rows={generated.rows ?? []} />
        {:else if generated.answer_type === 'fraction_model'}
          <FractionModel
            question_text={generated.question_text}
            math_expression={generated.math_expression ?? null}
            instruction={generated.instruction ?? null}
            numerator={generated.model_params?.numerator ?? 1}
            denominator={generated.model_params?.denominator ?? 4}
            models={generated.models ?? null}
            bind:value={testAnswer}
          />
        {:else if generated.answer_type === 'category_sort'}
          <CategorySort question_text={generated.question_text} tiles={generated.tiles ?? []} categories={generated.categories ?? []} />
        {:else if generated.answer_type === 'drag_drop_inequality'}
          <DragDropInequality
            question_text={generated.question_text}
            instruction2={generated.instruction2 ?? ''}
            tiles={generated.tiles ?? []}
            rows={generated.rows ?? []}
            correct_answer={generated.correct_answer ?? {}}
            bind:value={testAnswer}
          />
        {:else if generated.answer_type === 'drag_drop_line_plot'}
          <DragDropLinePlot
            stimulus_intro={generated.stimulus_intro ?? null}
            question_text={generated.question_text}
            math_expression={generated.math_expression ?? null}
            stimulus_params={generated.stimulus_params ?? {}}
            bind:value={testAnswer}
          />
        {:else}
          <div class="bg-white p-4 text-sm text-gray-400 italic rounded">No component for: <strong>{generated.answer_type}</strong></div>
        {/if}
        {/key}

      <!-- ── TestNav-style submit bar (hidden for multi_part — handled per-part) ── -->
      {#if generated.answer_type !== 'multi_part'}
      <div class="bg-[#d4d4d4] border-t border-gray-400 px-4 py-2 flex items-center gap-3">
        {#if !testRevealed}
          {#if !testAssisted}
            <button on:click={handleLearn}
              class="px-4 py-1.5 bg-white border border-gray-400 text-gray-700 text-sm font-medium rounded transition-colors hover:bg-gray-100">
              Learn
            </button>
          {:else}
            <span class="text-xs text-indigo-600 italic">Learn clicked</span>
          {/if}
          <span class="flex-1"></span>
          <button on:click={handleSubmit}
            class="px-5 py-1.5 bg-[#3b81c9] hover:bg-[#2d6bac] text-white text-sm font-semibold rounded transition-colors">
            Submit
          </button>
        {:else}
          <span class="text-sm text-gray-500 italic flex-1">Revealed after 2 wrong answers</span>
          <button on:click={doGenerate}
            class="px-4 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-medium rounded transition-colors">
            New Variant
          </button>
        {/if}
      </div>
      {/if}<!-- end {#if not multi_part} -->

      </div><!-- end bg-[#e9e9e9] -->

      <!-- Feedback display -->
      {#if testTip}
        <div class="mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 leading-relaxed">
          {testTip}
        </div>
      {/if}
      {#if testRevealed && feedbackTemplate}
        {@const rParams = extractParams(generated)}
        <div class="mt-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 leading-relaxed">
          {fillTemplate(feedbackTemplate.reveal, rParams ?? {})}
        </div>
      {/if}

      <!-- Answer badge + Regenerate -->
      <div class="mt-2 flex items-center gap-3">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Answer:</span>
        <span class="font-mono text-sm bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded">
          {typeof generated.correct_answer === 'object' ? JSON.stringify(generated.correct_answer) : generated.correct_answer}
        </span>
        <button on:click={doGenerate}
          class="ml-auto text-xs px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded transition-colors">
          Regenerate
        </button>
      </div>

    {/if}<!-- end {:else} generated -->

</div><!-- end max-w-xl -->
</div><!-- end section 2 -->
