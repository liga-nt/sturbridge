<script>
  import { renderMath } from '$lib/utils/math.js';
  import SymmetryFigure from '$lib/components/questions/stimuli/SymmetryFigure.svelte';

  export let question_text;
  export let statements; // array of { text?: string, shape?: object }
  export let column_label = 'Statement'; // first column header, e.g. "Equation", "Figure"
  export let true_label = 'True';   // second column header
  export let false_label = 'False'; // third column header
  export let stimulus_intro = null; // optional HTML shown above question text
  export let stimulus_type = null;  // reserved for future stimulus components
  export let instruction = null;    // optional instruction line shown below question_text

  let answers = statements.map(() => null);
</script>

<div class="question-body">
  {#if stimulus_intro}
    <div class="stimulus-intro">{@html stimulus_intro}</div>
  {/if}
  <p class="q-text">{@html renderMath(question_text)}</p>
  {#if instruction}
    <p class="q-instruction">{@html renderMath(instruction)}</p>
  {/if}

  <table class="tf-table">
    <thead>
      <tr>
        <th class="stmt-header">{column_label}</th>
        <th class="tf-header">{true_label}</th>
        <th class="tf-header">{false_label}</th>
      </tr>
    </thead>
    <tbody>
      {#each statements as stmt, i}
        <tr>
          <td class="stmt-cell {stmt.shape ? 'figure-cell' : ''}">
            {#if stmt.shape}
              <SymmetryFigure params={stmt.shape} />
            {:else}
              <p>{@html renderMath(stmt.text ?? '')}</p>
            {/if}
          </td>
          <td class="radio-cell">
            <input type="radio" name="row-{i}" bind:group={answers[i]} value="true" />
          </td>
          <td class="radio-cell">
            <input type="radio" name="row-{i}" bind:group={answers[i]} value="false" />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
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

  .stimulus-intro {
    margin: 0 0 12px;
  }

  .q-text {
    margin: 0 0 6px;
  }

  .q-instruction {
    margin: 0 0 10px;
  }

  .tf-table {
    border-collapse: collapse;
    width: 100%;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
  }

  .stmt-header {
    background-color: #d9edf7;
    padding: 8px;
    text-align: left;
    border: 1px solid #aaa;
    font-weight: bold;
  }

  .tf-header {
    background-color: #d9edf7;
    padding: 8px;
    text-align: center;
    border: 1px solid #aaa;
    border-left: 1px solid #cccccc;
    font-weight: bold;
    width: 50px;
  }

  .stmt-cell {
    padding: 8px;
    border: 1px solid #aaa;
    text-align: left;
  }

  .stmt-cell p {
    margin: 0;
  }

  .figure-cell {
    text-align: center;
    padding: 12px 8px;
  }

  .radio-cell {
    padding: 8px;
    text-align: center;
    border: 1px solid #aaa;
    vertical-align: middle;
    width: 50px;
  }

  /* Custom radio styled like TestNav prettyradio black */
  input[type="radio"] {
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

  input[type="radio"]:checked {
    background: radial-gradient(circle, #333 40%, white 40%);
  }

  input[type="radio"]:hover {
    border-color: #000;
    border-width: 2px;
  }
</style>
