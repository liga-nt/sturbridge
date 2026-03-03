<script>
  export let params; // { rows: [[16, 32], [24], [20, 12]] }
</script>

<div class="number-box">
  {#each params.rows as row}
    <div class="number-row">
      {#each row as num}
        <span>{num}</span>
      {/each}
    </div>
  {/each}
</div>

<style>
  .number-box {
    display: inline-block;
    border: 1px solid #000;
    padding: 10px 18px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 18px;
    line-height: 26px;
    color: #333;
    text-align: center;
  }

  .number-row {
    display: flex;
    justify-content: center;
    gap: 26px;
  }
</style>
