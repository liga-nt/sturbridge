<script>
  /**
   * WordTooltip — small floating tooltip shown near the hovered word.
   * Props:
   *   word:     word object or null
   *   position: { x: number, y: number } in viewport coords
   */
  export let word = null;
  export let position = { x: 0, y: 0 };
</script>

{#if word}
  <div
    class="tooltip"
    style="left: {position.x}px; top: {position.y - 8}px;"
    role="tooltip"
  >
    <div class="tooltip-entry">{word.dict_entry ?? word.text}</div>
    {#if word.morph}
      <div class="tooltip-morph">{word.morph}</div>
    {/if}
    {#if word.short_def}
      <div class="tooltip-def">{word.short_def}</div>
    {/if}
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: #1f2937;
    color: #f9fafb;
    border-radius: 6px;
    padding: 6px 10px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    pointer-events: none;
    z-index: 1000;
    max-width: 220px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    white-space: normal;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: #1f2937;
  }

  .tooltip-entry {
    font-weight: 700;
    font-size: 14px;
    color: #fbbf24;
    margin-bottom: 2px;
  }

  .tooltip-morph {
    font-size: 11px;
    color: #9ca3af;
    font-style: italic;
    margin-bottom: 2px;
  }

  .tooltip-def {
    font-size: 13px;
    color: #e5e7eb;
  }
</style>
