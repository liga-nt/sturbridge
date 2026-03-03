<script>
  import { renderMath } from '$lib/utils/math.js';

  export let question_text;
  export let statements; // array of { text: string }

  let answers = statements.map(() => null);
</script>

<div class="question-body">
  <p class="q-text">{@html renderMath(question_text)}</p>

  <table class="tf-table">
    <thead>
      <tr>
        <th class="stmt-header">Statement</th>
        <th class="tf-header">True</th>
        <th class="tf-header">False</th>
      </tr>
    </thead>
    <tbody>
      {#each statements as stmt, i}
        <tr>
          <td class="stmt-cell"><p>{@html renderMath(stmt.text)}</p></td>
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

  .q-text {
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
