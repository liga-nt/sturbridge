<script>
  import { renderMath } from '$lib/utils/math.js';
  import MathInput from './MathInput.svelte';

  export let stimulus_intro = null;
  export let math_expression = null;
  export let question_text;
  export let input_widget = 'text';   // 'text' | 'equation_editor'
  export let answer_suffix = null;

  let answer = '';
</script>

<div class="question-body">
  {#if stimulus_intro}
    <p class="q-text">{@html renderMath(stimulus_intro)}</p>
  {/if}

  {#if math_expression}
    <p class="math-expr">{@html renderMath(math_expression)}</p>
  {/if}

  {#if question_text}
    <p class="q-text">{@html renderMath(question_text)}</p>
  {/if}

  {#if input_widget === 'equation_editor'}
    <p class="q-text">Enter your answer in the space provided. Enter <strong>only</strong> your answer.</p>
    <MathInput answer_suffix={answer_suffix} />
  {:else}
    <p class="q-text">Enter your answer in the box.</p>
    <input
      type="text"
      bind:value={answer}
      class="answer-box"
      spellcheck="false"
      autocomplete="off"
    />
  {/if}
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

  .math-expr {
    text-align: center;
    margin: 6px 0 14px;
    font-size: 18px;
    line-height: 2;
  }

  .answer-box {
    display: block;
    width: 60px;
    height: 30px;
    padding: 3px 6px;
    border: 1px solid #999;
    border-radius: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    color: #333;
    background: #fff;
    box-sizing: border-box;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    box-shadow: none;
  }

  .answer-box:focus {
    border-color: #66afe9;
    box-shadow: 0 0 0 2px rgba(102, 175, 233, 0.35);
  }
</style>
