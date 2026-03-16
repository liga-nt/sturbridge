<script>
  import NumberBox from './stimuli/NumberBox.svelte';
  import LinePlot from './stimuli/LinePlot.svelte';
  import DotPlot from './stimuli/DotPlot.svelte';
  import AngleDiagram from './stimuli/AngleDiagram.svelte';
  import RectangleDiagram from './stimuli/RectangleDiagram.svelte';
  import ItemArray from './stimuli/ItemArray.svelte';
  import SymmetryFigure from './stimuli/SymmetryFigure.svelte';
  import FractionComparison from './stimuli/FractionComparison.svelte';
  import { renderMath } from '$lib/utils/math.js';

  export let stimulus_intro = null;
  export let stimulus_list = null;   // optional bullet list after stimulus_intro
  export let stimulus_type = null;
  export let stimulus_params = null;
  export let question_text;
  export let math_expression = null;
  export let answer_options;

  let selected = null;
</script>

<div class="question-body">
  {#if stimulus_intro}
    <p class="q-text">{@html renderMath(stimulus_intro)}</p>
  {/if}

  {#if stimulus_list}
    <ul class="q-list">
      {#each stimulus_list as item}
        <li>{item}</li>
      {/each}
    </ul>
  {/if}

  {#if stimulus_type === 'number_box'}
    <div class="stimulus">
      <NumberBox params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'line_plot'}
    <div class="stimulus">
      <LinePlot params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'dot_plot'}
    <div class="stimulus">
      <DotPlot params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'angle_diagram'}
    <div class="stimulus">
      <AngleDiagram params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'rectangle_diagram'}
    <div class="stimulus">
      <RectangleDiagram params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'item_array'}
    <div class="stimulus">
      <ItemArray params={stimulus_params} />
    </div>
  {:else if stimulus_type === 'fraction_comparison'}
    <div class="stimulus">
      <FractionComparison
        left={{ type: stimulus_params.type, numerator: stimulus_params.left_numerator, denominator: stimulus_params.left_denominator }}
        operator={stimulus_params.operator ?? ''}
        right={{ type: stimulus_params.type, numerator: stimulus_params.right_numerator, denominator: stimulus_params.right_denominator }}
      />
    </div>
  {/if}

  {#if math_expression}
    <p class="math-expr">{@html renderMath(math_expression)}</p>
  {/if}

  {#if question_text}
    <p class="q-text">{@html renderMath(question_text)}</p>
  {/if}

  <div class="distractors" role="group">
    {#each answer_options as opt, i}
      {#if i > 0}
        <div class="spacer"></div>
      {/if}
      <div
        class="distractor"
        class:selected={selected === opt.letter}
        role="checkbox"
        aria-checked={selected === opt.letter}
        tabindex="0"
        on:click={() => selected = opt.letter}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selected = opt.letter)}
      >
        <span class="bubble"><span>{opt.letter}</span></span>
        <div class="distractorContent">
          {#if opt.shape}
            <SymmetryFigure params={{ shape: opt.shape, line: null }} />
          {:else if opt.model}
            <FractionComparison left={opt.model.left} operator={opt.model.operator} right={opt.model.right} />
          {:else}
            <p>{@html renderMath(opt.text)}</p>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .question-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333333;
    background: #fff;
    padding: 16px;
    max-width: 640px;
  }

  .q-text {
    margin: 0 0 10px;
  }

  .q-list {
    list-style-type: disc;
    margin: 0 0 10px 0;
    padding-left: 28px;
    font-size: 16px;
    line-height: 24px;
    color: #333333;
  }

  .q-list li {
    margin-bottom: 2px;
  }

  .stimulus {
    margin: 10px 0 14px;
    text-align: center;
  }

  .math-expr {
    text-align: center;
    margin: 6px 0 14px;
    font-size: 18px;
    line-height: 2;
  }

  /* Distractor list */
  .distractors {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .spacer {
    width: 100%;
    height: 20px;
  }

  .distractor {
    display: flex;
    align-items: flex-start;
    position: relative;
    z-index: 0;
    border-radius: 5px;
    cursor: pointer;
    max-width: 939px;
  }

  /* light-blue overlay on selected row */
  .distractor.selected {
    background-size: cover;
    background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2010%2010%27%3E%3Crect%20width%3D%2710%27%20height%3D%2710%27%20fill%3D%27rgba(57%2C171%2C255%2C0.3)%27%20%2F%3E%3C%2Fsvg%3E");
  }

  .bubble {
    flex: 0 0 auto;
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    border: 1px solid #3b81c9;
    color: #3b81c9;
    background-color: transparent;
    margin-left: 10px;
    margin-right: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    font-size: 13px;
    line-height: 20px;
    text-align: center;
  }

  .bubble span {
    display: block;
    width: 100%;
    text-align: center;
    line-height: inherit;
  }

  .distractor.selected .bubble {
    background-color: #3b81c9;
    color: white;
  }

  .distractorContent {
    flex: 0 1 auto;
    display: block;
    width: 85%;
    padding: 5px 7px;
    position: relative;
  }

  .distractorContent p {
    margin: 0;
    font-size: 16px;
    line-height: 24px;
  }
</style>
