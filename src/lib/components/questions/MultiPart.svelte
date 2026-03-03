<script>
  import DataTable from './stimuli/DataTable.svelte';
  import StickerSet from './stimuli/StickerSet.svelte';
  import TriangleSet from './stimuli/TriangleSet.svelte';
  import ShortAnswerInput from './ShortAnswerInput.svelte';

  export let question_text;
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
      <p class="q-text">{question_text}</p>
    {/if}

    {#each parts as part}
      <h3 class="part-label">Part {part.label}</h3>

      <!-- Part text: split on \n\n for multiple paragraphs -->
      {#each (part.text ?? '').split('\n\n') as para}
        <p class="part-text">{@html para}</p>
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
      {/if}

      <!-- Per-part answer widget -->
      {#if part.answer_type === 'inline_choice'}
        {#if part.instruction}
          <p class="part-text">{part.instruction}</p>
        {/if}
        <p class="inline-sentence">
          {#each parseSentence(part.sentence) as token}
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
      {:else if part.answer_type === 'short_answer' || part.answer_type === 'constructed_response'}
        <p class="answer-instruction">Enter your answer in the space provided.</p>
        <ShortAnswerInput />
      {/if}
    {/each}

  {:else}

    <!-- ── Two-pane layout (default): stimulus left, parts right ── -->
    <div class="two-pane">

      <div class="left-pane">
        <p class="part-header">This question has {partWord} parts.</p>
        <p class="q-text">{question_text}</p>

        {#if stimulus_type === 'data_table'}
          <DataTable params={stimulus_params} />
        {/if}
      </div>

      <div class="right-pane">
        {#each parts as part}
          <div class="part-section">
            <h3 class="part-label">Part {part.label}</h3>
            <p class="part-text">{part.text}</p>
            <p class="answer-instruction">Enter your answer in the space provided.</p>
            <ShortAnswerInput />
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
</style>
