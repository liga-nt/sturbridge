<script>
  // params: { rows, cols, item, item_size? }
  // item: named key in the svgMap registry
  export let params;

  $: ({ rows, cols, item, item_size = 48 } = params);

  const svgMap = {
    cupcake: '/cupcake-svgrepo-com.svg',
    cookie: '/cookie-twemoji.svg',
    donut: '/donut-twemoji.svg',
  };

  $: src = svgMap[item] ?? null;
</script>

{#if src}
  <div class="item-array">
    {#each Array(rows) as _, r}
      <div class="item-row">
        {#each Array(cols) as _, c}
          <img {src} width={item_size} height={item_size} alt="" />
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .item-array {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .item-row {
    display: flex;
    gap: 6px;
  }
</style>
