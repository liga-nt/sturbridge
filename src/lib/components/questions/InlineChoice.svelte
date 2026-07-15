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
  export let drag_mode = false;   // true → tile bank + droppable boxes instead of selects

  let selections = {};            // { [dropdownId]: string }
  export let value = null;
  $: value = dropdowns.map(dd => selections[dd.id] ?? '').join('|');

  // ── Drag-and-drop (drag_mode only) ────────────────────────────────────────

  // Unique tile values from the first dropdown (tiles are reusable across slots)
  $: dragTiles = drag_mode
    ? [...new Set(dropdowns[0]?.options ?? [])]
    : [];

  // What's being dragged: { tile, fromId: string|null } (null = from bank)
  let dragging = null;

  function bankDragStart(e, tile) {
    dragging = { tile, fromId: null };
    e.dataTransfer.setData('text', tile);
    e.dataTransfer.effectAllowed = 'move';
  }

  function slotDragStart(e, id) {
    const tile = selections[id];
    if (!tile) { e.preventDefault(); return; }
    dragging = { tile, fromId: id };
    e.dataTransfer.setData('text', tile);
    e.dataTransfer.effectAllowed = 'move';
  }

  function slotDrop(e, id) {
    e.preventDefault();
    const tile = e.dataTransfer.getData('text');
    if (!tile) return;
    // Clear source slot if dragging between slots
    if (dragging?.fromId && dragging.fromId !== id) {
      selections[dragging.fromId] = '';
    }
    selections[id] = tile;
    selections = { ...selections };
    dragging = null;
  }

  function bankDrop(e) {
    e.preventDefault();
    if (dragging?.fromId) {
      selections[dragging.fromId] = '';
      selections = { ...selections };
    }
    dragging = null;
  }

  // ── Sentence parser ────────────────────────────────────────────────────────

  function parseSentence(sentence) {
    const tokens = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0, m;
    while ((m = re.exec(sentence)) !== null) {
      if (m.index > last) tokens.push({ type: 'text', value: sentence.slice(last, m.index) });
      tokens.push({ type: 'slot', id: m[1] });
      last = m.index + m[0].length;
    }
    if (last < sentence.length) tokens.push({ type: 'text', value: sentence.slice(last) });
    return tokens;
  }
</script>

<div class="question-body">
  {#if stimulus_intro}
    <div class="q-text">{@html renderMath(stimulus_intro)}</div>
  {/if}

  {#if stimulus_type === 'symmetry_figure'}
    <div class="stimulus-wrap"><SymmetryFigure params={stimulus_params} /></div>
  {:else if stimulus_type === 'protractor_image'}
    <div class="stimulus-wrap"><ProtractorImage params={stimulus_params} /></div>
  {/if}

  <p class="q-text">{@html renderMath(question_text)}</p>

  {#if instruction}
    <p class="instruction">{instruction}</p>
  {/if}

  {#if drag_mode}
    <!-- Tile bank (reusable) -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="tile-bank" on:dragover|preventDefault on:drop={bankDrop}>
      {#each dragTiles as tile}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="tile" draggable="true" on:dragstart={(e) => bankDragStart(e, tile)}>{tile}</div>
      {/each}
    </div>
  {/if}

  {#each sentences as sentence}
    <p class="inline-sentence">
      {#each parseSentence(sentence) as token}
        {#if token.type === 'text'}
          {@html renderMath(token.value)}
        {:else}
          {@const dd = dropdowns.find(d => d.id === token.id)}
          {#if dd}
            {#if drag_mode}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <span
                class="drag-slot"
                class:drag-slot--filled={!!selections[token.id]}
                on:dragover|preventDefault
                on:drop={(e) => slotDrop(e, token.id)}
              >
                {#if selections[token.id]}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <span
                    class="slot-tile"
                    draggable="true"
                    on:dragstart={(e) => slotDragStart(e, token.id)}
                  >{selections[token.id]}</span>
                {/if}
              </span>
            {:else}
              <select class="inline-select" style="width: {dd.options.length <= 3 ? 90 : 110}px" bind:value={selections[token.id]}>
                <option value="">Choose...</option>
                {#each dd.options as opt}
                  <option>{opt}</option>
                {/each}
              </select>
            {/if}
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

  .q-text     { margin: 0 0 10px; }
  .stimulus-wrap { margin: 4px 0 10px; text-align: center; }
  .instruction   { margin: 0 0 6px; }

  /* Spacing for {#html} stimulus_intro content (Tailwind resets these) */
  :global(.question-body .q-text p)  { margin: 0 0 8px; }
  :global(.question-body .q-text ul) { margin: 0 0 8px; padding-left: 20px; }
  :global(.question-body .q-text li) { margin-bottom: 6px; }

  .inline-sentence {
    margin: 4px 0 16px;
    line-height: 2;
  }

  /* Tile bank */
  .tile-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    margin: 8px 0 20px;
    min-height: 36px;
  }

  .tile {
    border: 1px solid #4a90d9;
    color: #4a90d9;
    padding: 4px 10px;
    font-size: 16px;
    min-width: 32px;
    text-align: center;
    background: #fff;
    cursor: grab;
    user-select: none;
    border-radius: 2px;
    margin-right: 4px;
    margin-bottom: 4px;
    font-family: inherit;
  }

  /* Droppable slot in a sentence */
  .drag-slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 90px;
    height: 28px;
    border: 1.5px solid #555;
    background: #f7f7f7;
    vertical-align: middle;
    margin: 0 4px;
  }

  .drag-slot--filled {
    background: #e8f0fb;
    border-color: #4a90d9;
  }

  .slot-tile {
    color: #1a5fa8;
    font-weight: 500;
    cursor: grab;
    user-select: none;
    font-size: 15px;
  }

  /* Dropdown select (non-drag mode) */
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
