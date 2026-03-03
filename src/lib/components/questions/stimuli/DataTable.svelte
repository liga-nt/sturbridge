<script>
  export let params; // { title, headers, rows }
</script>

<div class="table-wrap">
  <table>
    <caption>{params.title}</caption>
    <thead>
      <tr>
        {#each params.headers as header}
          <th>{@html header.replace('\n', '<br>')}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each params.rows as row}
        <tr>
          {#each row as cell}
            <td>{cell}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap {
    margin: 10px 0;
  }

  table {
    border-collapse: collapse;
    margin: 0 auto;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
  }

  caption {
    caption-side: top;
    text-align: center;
    font-weight: bold;
    padding-bottom: 9px;
    font-size: 16px;
    color: #333;
  }

  thead tr th {
    background-color: #d9edf7;
    padding: 8px;
    text-align: center;
    border: 1px solid #aaa;
    font-weight: bold;
  }

  tbody tr td {
    padding: 6px 12px;
    text-align: center;
    height: 28px;
    border: 1px solid #aaa;
  }
</style>
