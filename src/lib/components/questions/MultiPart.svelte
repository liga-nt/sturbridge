<script>
  import DataTable from './stimuli/DataTable.svelte';
  import StickerSet from './stimuli/StickerSet.svelte';
  import TriangleSet from './stimuli/TriangleSet.svelte';
  import GraduatedCylinder from './stimuli/GraduatedCylinder.svelte';
  import BucketDiagram from './stimuli/BucketDiagram.svelte';
  import ClockFace from './stimuli/ClockFace.svelte';
  import RectangleDiagram from './stimuli/RectangleDiagram.svelte';
  import ShortAnswerInput from './ShortAnswerInput.svelte';
  import NumberLinePlot from './NumberLinePlot.svelte';
  import StepPattern from './stimuli/StepPattern.svelte';
  import { renderMath } from '$lib/utils/math.js';

  // Helper: split a list of correct answers keyed to table rows
  function parseTableAnswers(correct_answer) {
    if (!correct_answer) return [];
    return String(correct_answer).split(',').map(s => s.trim());
  }


  export let question_text = null;
  export let stimulus_list = null;   // optional bullet list for left pane
  export let stimulus_type = null;
  export let stimulus_params = null;
  export let parts;
  export let layout = null;  // null | 'stacked'

  const partWords = ['one', 'two', 'three', 'four', 'five'];
  $: partWord = partWords[parts.length - 1] ?? parts.length;

  // Parse an inline_choice sentence into text/dropdown tokens.
  // "[TOKEN]" → { type: 'dropdown', id: 'TOKEN' }
  // plain text → { type: 'text', value: '...' }
  function parseSentence(sentence) {
    const tokens = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0, m;
    while ((m = re.exec(sentence)) !== null) {
      if (m.index > last) tokens.push({ type: 'text', value: sentence.slice(last, m.index) });
      tokens.push({ type: 'dropdown', id: m[1] });
      last = m.index + m[0].length;
    }
    if (last < sentence.length) tokens.push({ type: 'text', value: sentence.slice(last) });
    return tokens;
  }
</script>

<div class="question-body">
  {#if layout === 'stacked'}

    <!-- ── Stacked layout: all content in a single column ── -->
    <p class="part-header">This question has {partWord} parts.</p>
    {#if question_text}
      <p class="q-text">{@html renderMath(question_text)}</p>
    {/if}

    <!-- Top-level stimulus (shown before Part A) -->
    {#if stimulus_type === 'clock_face'}
      <div class="stimulus-wrap">
        <ClockFace params={stimulus_params} />
      </div>
    {/if}

    {#each parts as part}
      <h3 class="part-label">Part {part.label}</h3>

      <!-- Part text: split on \n\n for multiple paragraphs -->
      {#each ((part.question_text ?? part.text) ?? '').split('\n\n') as para}
        <p class="part-text">{@html renderMath(para)}</p>
      {/each}

      <!-- Per-part stimulus -->
      {#if part.stimulus_type === 'sticker_set'}
        <div class="stimulus-wrap">
          <StickerSet params={part.stimulus_params} select_count={part.select_count ?? 2} />
        </div>
      {:else if part.stimulus_type === 'triangle_set'}
        <div class="stimulus-wrap">
          <TriangleSet params={part.stimulus_params} />
        </div>
      {:else if part.stimulus_type === 'graduated_cylinder'}
        <div class="stimulus-wrap">
          <GraduatedCylinder params={part.stimulus_params} />
        </div>
      {:else if part.stimulus_type === 'bucket_diagram'}
        <div class="stimulus-wrap">
          <BucketDiagram params={part.stimulus_params} />
        </div>
      {:else if part.stimulus_type === 'rectangle_diagram'}
        <div class="stimulus-wrap">
          <RectangleDiagram params={part.stimulus_params} />
        </div>
      {:else if part.stimulus_type === 'data_table'}
        <div class="stimulus-wrap">
          <DataTable params={part.stimulus_params} />
        </div>
      {/if}

      <!-- Optional post-stimulus prompt (shown after diagram, before answer widget) -->
      {#if part.answer_prompt}
        {#each part.answer_prompt.split('\n\n') as para}
          <p class="part-text">{@html renderMath(para)}</p>
        {/each}
      {/if}

      <!-- Per-part answer widget -->
      {#if part.answer_type === 'table_fill'}
        <!-- Table with fill-in boxes in the second column -->
        {@const rowAnswers = parseTableAnswers(part.correct_answer)}
        <div class="stimulus-wrap">
          <div class="table-fill-wrap">
            <table class="table-fill">
              {#if part.table_params?.title}
                <caption>{part.table_params.title}</caption>
              {/if}
              <thead>
                <tr>
                  {#each (part.table_params?.headers ?? []) as header}
                    <th>{@html header}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each (part.table_params?.rows ?? []) as row, ri}
                  <tr>
                    {#each row as cell, ci}
                      {#if cell === ''}
                        <td class="fill-cell">
                          <input class="fill-in-box" type="text" aria-label="answer" autocomplete="off" spellcheck="false" />
                        </td>
                      {:else}
                        <td>{@html cell}</td>
                      {/if}
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else if part.answer_type === 'ordering'}
        <!-- Ordering: tiles on top, positional slots labeled least→greatest -->
        <div class="ordering-wrap">
          <div class="tile-bank">
            {#each (part.tiles ?? []) as tile}
              <div class="tile">{@html renderMath(tile)}</div>
            {/each}
          </div>
          <div class="ordering-row">
            <span class="ordering-label">least</span>
            {#each (part.correct_order ?? []) as slot}
              <div class="ordering-slot">{@html renderMath(slot)}</div>
            {/each}
            <span class="ordering-label">greatest</span>
          </div>
        </div>
      {:else if part.answer_type === 'drag_drop_match'}
        <!-- Static display: tiles on top, goal boxes with correct tile inside -->
        <div class="ddm-wrap">
          {#each part.targets as target, ti}
            {@const tileIdx = (part.correct_matches ?? []).indexOf(ti)}
            <div class="ddm-goal">
              <div class="ddm-goal-label">{target}</div>
              {#if tileIdx >= 0 && part.tiles[tileIdx]}
                <div class="ddm-tile-inside">{@html renderMath(part.tiles[tileIdx])}</div>
              {:else}
                <div class="ddm-tile-empty"></div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if part.answer_type === 'true_false_table'}
        <table class="tft-table">
          <thead>
            <tr>
              <th class="tft-stmt-header">{part.column_label ?? 'Statement'}</th>
              <th class="tft-opt-header">{part.true_label ?? 'True'}</th>
              <th class="tft-opt-header">{part.false_label ?? 'False'}</th>
            </tr>
          </thead>
          <tbody>
            {#each (part.statements ?? []) as stmt, ri}
              <tr>
                <td class="tft-stmt-cell"><p>{@html renderMath(stmt.text ?? '')}</p></td>
                <td class="tft-radio-cell">
                  <input type="radio" name="tft-{part.label}-row-{ri}" value="true" />
                </td>
                <td class="tft-radio-cell">
                  <input type="radio" name="tft-{part.label}-row-{ri}" value="false" />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if part.answer_type === 'inline_choice'}
        {#if part.math_expression}
          <p class="math-expr">{@html renderMath(part.math_expression)}</p>
        {/if}
        {#if part.instruction}
          <p class="part-text">{part.instruction}</p>
        {/if}
        {#each (part.sentences ?? (part.sentence ? [part.sentence] : [])) as sentence}
          <p class="inline-sentence">
            {#each parseSentence(sentence) as token}
              {#if token.type === 'text'}
                {token.value}
              {:else}
                {@const dd = part.dropdowns.find(d => d.id === token.id)}
                {#if dd}
                  <select class="inline-select {dd.options.length <= 4 ? 'select-sm' : 'select-md'}">
                    <option value="">Choose...</option>
                    {#each dd.options as opt}
                      <option>{opt}</option>
                    {/each}
                  </select>
                {/if}
              {/if}
            {/each}
          </p>
        {/each}
      {:else if part.answer_type === 'number_line_plot'}
        <NumberLinePlot
          question_text=""
          stimulus_params={part.stimulus_params ?? {}}
        />
      {:else if part.answer_type === 'short_answer' || part.answer_type === 'constructed_response'}
        {#if part.answer_type === 'constructed_response'}
          {#if part.answer_instruction}
            {#each part.answer_instruction.split('\n\n') as para}
              <p class="answer-instruction">{@html renderMath(para)}</p>
            {/each}
          {:else}
            <p class="answer-instruction">Enter your answer and your work or explanation in the space provided.</p>
          {/if}
          <ShortAnswerInput />
        {:else if part.input_widget === 'math'}
          <!-- Math-equation-only input (no rich-text toolbar) -->
          <div class="math-eq-box" tabindex="0">
            <span class="math-eq-placeholder">Click here to enter your answer.</span>
          </div>
        {:else if part.answer_suffix}
          <p class="answer-instruction">Enter your answer in the box.</p>
          <p class="fill-in-row">
            <input class="fill-in-box" type="text" aria-label="answer" autocomplete="off" spellcheck="false" />
            <span class="fill-in-suffix">{part.answer_suffix}</span>
          </p>
        {:else if part.math_expression_prefix}
          <p class="answer-instruction">Enter your answer in the box.</p>
          <p class="fill-in-row">
            <span class="fill-in-prefix">{@html renderMath(part.math_expression_prefix)}</span>
            <input class="fill-in-box" type="text" aria-label="answer" autocomplete="off" spellcheck="false" />
          </p>
        {:else}
          <p class="answer-instruction">Enter your answer in the space provided.</p>
          <ShortAnswerInput />
        {/if}
      {/if}
    {/each}

  {:else}

    <!-- ── Two-pane layout (default): stimulus left, parts right ── -->
    <div class="two-pane">

      <div class="left-pane">
        <p class="part-header">This question has {partWord} parts.</p>
        {#if question_text}
          <p class="q-text">{@html renderMath(question_text)}</p>
        {/if}
        {#if stimulus_list}
          <ul class="q-list">
            {#each stimulus_list as item}
              <li>{@html renderMath(item)}</li>
            {/each}
          </ul>
        {/if}

        {#if stimulus_type === 'data_table'}
          <DataTable params={stimulus_params} />
        {:else if stimulus_type === 'graduated_cylinder'}
          <div class="stimulus-wrap">
            <GraduatedCylinder params={stimulus_params} />
          </div>
        {:else if stimulus_type === 'step_pattern'}
          <div class="stimulus-wrap">
            <StepPattern params={stimulus_params} />
          </div>
        {/if}
      </div>

      <div class="right-pane">
        {#each parts as part}
          <div class="part-section">
            <h3 class="part-label">Part {part.label}</h3>

            <!-- Part text: split on \n\n for multiple paragraphs -->
            {#each ((part.question_text ?? part.text) ?? '').split('\n\n') as para}
              <p class="part-text">{@html renderMath(para)}</p>
            {/each}

            {#if part.math_expression}
              <p class="math-expr">{@html renderMath(part.math_expression)}</p>
            {/if}

            {#if part.answer_type === 'multiple_choice'}
              <div class="part-mc" role="group">
                {#each (part.answer_options ?? []) as opt, i}
                  {#if i > 0}<div class="mc-spacer"></div>{/if}
                  <div class="mc-option" role="checkbox" aria-checked="false" tabindex="0">
                    <span class="mc-bubble"><span>{opt.letter}</span></span>
                    <div class="mc-content">
                      <p>{@html renderMath(opt.text)}</p>
                    </div>
                  </div>
                {/each}
              </div>
            {:else if part.answer_type === 'constructed_response'}
              <p class="answer-instruction">Enter your answer and your work or explanation in the space provided.</p>
              <ShortAnswerInput />
            {:else}
              <p class="answer-instruction">Enter your answer in the space provided.</p>
              <ShortAnswerInput />
            {/if}
          </div>
        {/each}
      </div>

    </div>

  {/if}
</div>

<style>
  .question-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
    background: #fff;
  }

  /* ── Two-pane ── */
  .two-pane {
    display: flex;
  }

  .left-pane {
    width: 50%;
    padding: 16px 20px 8px 10px;
    box-sizing: border-box;
  }

  .right-pane {
    width: 50%;
    padding: 16px 10px 8px 20px;
    box-sizing: border-box;
    border-left: 1px solid #ddd;
  }

  .part-section {
    margin-bottom: 24px;
  }

  /* ── Stacked ── */
  .question-body:not(:has(.two-pane)) {
    padding: 16px 16px 8px;
    max-width: 580px;
  }

  .stimulus-wrap {
    margin: 8px 0 12px;
  }

  .inline-sentence {
    margin: 8px 0 4px;
    line-height: 2;
  }

  .inline-select {
    display: inline-block;
    vertical-align: baseline;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #333;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 1px 4px;
    margin: 0 2px;
    cursor: pointer;
  }

  .select-sm { width: 80px; }
  .select-md { width: 170px; }

  /* ── Shared ── */
  .part-header {
    font-weight: bold;
    margin: 0 0 10px;
  }

  .q-text {
    margin: 0 0 10px;
  }

  .part-label {
    font-weight: bold;
    font-size: 16px;
    font-family: inherit;
    margin: 10px 0;
  }

  .part-text {
    margin: 0 0 6px;
  }

  .answer-instruction {
    margin: 0 0 6px;
  }

  .q-list {
    list-style-type: disc;
    margin: 0 0 10px 0;
    padding-left: 28px;
    font-size: 16px;
    line-height: 24px;
  }

  .q-list li {
    margin-bottom: 2px;
  }

  .math-expr {
    text-align: center;
    margin: 6px 0 14px;
    font-size: 18px;
    line-height: 2;
  }

  /* ── Fill-in-blank style answer (short_answer with suffix) ── */
  .fill-in-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0 8px;
  }

  .fill-in-box {
    width: 80px;
    height: 22px;
    padding: 0 4px;
    border: 2px solid #77aacc;
    border-radius: 4px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 22px;
    color: #333;
    background: #fff;
    outline: none;
  }
  .fill-in-box:focus {
    border-color: #3a7fc1;
    box-shadow: 0 0 0 1px #3a7fc1;
  }

  .fill-in-suffix {
    font-size: 16px;
    color: #333;
  }

  .fill-in-prefix {
    font-size: 16px;
    color: #333;
    margin-right: 4px;
  }

  /* Math-equation-only input box (TestNav style dashed border) */
  .math-eq-box {
    width: 260px;
    min-height: 80px;
    border: 2px dashed #aaa;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8px 0 12px;
    cursor: text;
    background: #fff;
  }

  .math-eq-placeholder {
    font-style: italic;
    color: #999;
    font-size: 15px;
    text-align: center;
    pointer-events: none;
  }

  /* ── In-part multiple choice ── */
  .part-mc {
    display: flex;
    flex-direction: column;
    margin-top: 4px;
  }

  .mc-spacer {
    height: 16px;
  }

  .mc-option {
    display: flex;
    align-items: flex-start;
    border-radius: 5px;
    cursor: pointer;
  }

  .mc-bubble {
    flex: 0 0 auto;
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    border: 1px solid #3b81c9;
    color: #3b81c9;
    background-color: transparent;
    margin: 5px 10px 5px 10px;
    font-size: 13px;
    line-height: 20px;
    text-align: center;
  }

  .mc-bubble span {
    display: block;
    width: 100%;
    text-align: center;
    line-height: inherit;
  }

  .mc-content {
    flex: 0 1 auto;
    padding: 5px 7px;
  }

  .mc-content p {
    margin: 0;
    font-size: 16px;
    line-height: 24px;
  }

  /* ── Drag-drop match (static display) ── */
  .ddm-wrap {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 8px 0 12px;
  }

  .ddm-goal {
    border: 2px solid #333;
    border-radius: 2px;
    min-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ddm-goal-label {
    width: 100%;
    text-align: center;
    font-weight: bold;
    font-size: 16px;
    padding: 8px 12px 6px;
    border-bottom: 1px solid #bbb;
    box-sizing: border-box;
  }

  .ddm-tile-inside {
    width: 100%;
    text-align: center;
    font-size: 16px;
    padding: 10px 12px;
    box-sizing: border-box;
    background: #f8f8f8;
    border: 1px dashed #999;
    border-radius: 2px;
    margin: 8px 12px;
    width: calc(100% - 24px);
  }

  .ddm-tile-empty {
    width: calc(100% - 24px);
    min-height: 36px;
    margin: 8px 12px;
    border: 1px dashed #ccc;
    border-radius: 2px;
    background: transparent;
  }

  /* ── In-part TrueFalseTable ── */
  .tft-table {
    border-collapse: collapse;
    width: 100%;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
    margin: 8px 0 12px;
  }

  .tft-stmt-header {
    background-color: #d9edf7;
    padding: 8px;
    text-align: left;
    border: 1px solid #aaa;
    font-weight: bold;
  }

  .tft-opt-header {
    background-color: #d9edf7;
    padding: 8px;
    text-align: center;
    border: 1px solid #aaa;
    font-weight: bold;
    white-space: nowrap;
    min-width: 110px;
  }

  .tft-stmt-cell {
    padding: 8px;
    border: 1px solid #aaa;
    text-align: left;
  }

  .tft-stmt-cell p {
    margin: 0;
  }

  .tft-radio-cell {
    padding: 8px;
    text-align: center;
    border: 1px solid #aaa;
    vertical-align: middle;
  }

  .tft-radio-cell input[type="radio"] {
    appearance: none;
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border: 1px solid #333;
    border-radius: 50%;
    cursor: pointer;
    display: inline-block;
    vertical-align: middle;
    background: white;
  }

  .tft-radio-cell input[type="radio"]:checked {
    background: radial-gradient(circle, #333 40%, white 40%);
  }

  .tft-radio-cell input[type="radio"]:hover {
    border-color: #000;
    border-width: 2px;
  }

  /* ── Table fill (Part A style: table with input boxes) ── */
  .table-fill-wrap {
    margin: 10px 0;
  }

  .table-fill {
    border-collapse: collapse;
    margin: 0 auto;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
  }

  .table-fill caption {
    caption-side: top;
    text-align: center;
    font-weight: bold;
    padding-bottom: 9px;
    font-size: 16px;
    color: #333;
  }

  .table-fill thead tr th {
    background-color: #d9edf7;
    padding: 8px;
    text-align: center;
    border: 1px solid #aaa;
    font-weight: bold;
  }

  .table-fill tbody tr td {
    padding: 6px 12px;
    text-align: center;
    height: 28px;
    border: 1px solid #aaa;
  }

  .fill-cell {
    text-align: center;
    vertical-align: middle;
  }

  /* ── Ordering (Part B style: tiles + least→greatest slots) ── */
  .ordering-wrap {
    margin: 8px 0 12px;
  }

  .tile-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 60px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid #3b81c9;
    border-radius: 3px;
    background: #fff;
    font-size: 14px;
    color: #3b81c9;
    cursor: default;
    user-select: none;
  }

  .ordering-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .ordering-label {
    font-size: 15px;
    color: #333;
    padding: 0 4px;
  }

  .ordering-slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 90px;
    height: 28px;
    padding: 0 8px;
    border: 2px solid #aaa;
    border-radius: 3px;
    background: #f8f8f8;
    font-size: 14px;
    color: #333;
  }
</style>
