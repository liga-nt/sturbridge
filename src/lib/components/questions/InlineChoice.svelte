<script>
  import SymmetryFigure from './stimuli/SymmetryFigure.svelte';
  import ProtractorImage from './stimuli/ProtractorImage.svelte';
  import { renderMath } from '$lib/utils/math.js';

  export let stimulus_intro = null;
  export let question_text;
  export let stimulus_type = null;
  export let stimulus_params = null;
  export let instruction = null;
  export let sentences = [];
  export let dropdowns = [];

  // Parse a sentence string into text/dropdown tokens.
  // "[TOKEN_ID]" → { type: 'dropdown', id: 'TOKEN_ID' }
  // plain text   → { type: 'text', value: '...' }
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
  {#if stimulus_intro}
    <p class="q-text">{@html renderMath(stimulus_intro)}</p>
  {/if}

  {#if stimulus_type === 'symmetry_figure'}
    <div class="stimulus-wrap">
      <SymmetryFigure params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'protractor_image'}
    <div class="stimulus-wrap">
      <ProtractorImage params={stimulus_params} />
    </div>
  {/if}

  <p class="q-text">{@html renderMath(question_text)}</p>

  {#if instruction}
    <p class="instruction">{instruction}</p>
  {/if}

  {#each sentences as sentence}
    <p class="inline-sentence">
      {#each parseSentence(sentence) as token}
        {#if token.type === 'text'}
          {@html renderMath(token.value)}
        {:else}
          {@const dd = dropdowns.find(d => d.id === token.id)}
          {#if dd}
            <select class="inline-select" style="width: {dd.options.length <= 3 ? 90 : 110}px">
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
</div>

<style>
  .question-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
    background: #fff;
    padding: 16px 16px 8px;
    max-width: 580px;
  }

  .q-text {
    margin: 0 0 10px;
  }

  .stimulus-wrap {
    margin: 4px 0 10px;
    text-align: center;
  }

  .instruction {
    margin: 0 0 6px;
  }

  .inline-sentence {
    margin: 4px 0 8px;
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
</style>
