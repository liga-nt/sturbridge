<script>
  import { buildHighlightTokens } from '$lib/utils/audioAlign.js';

  // Same rich text a plain {@html renderMath(text)} would show — [n/d]
  // fractions, {?} blanks, <strong>, <em> — rendered token-by-token instead
  // so the currently-spoken token can be highlighted in place.
  export let text;
  export let alignment = null;   // audioSegments/{hash}.alignment, or null (no audio piloted for this field)
  export let active = false;     // true while THIS field is the segment currently playing
  export let currentTime = 0;    // seconds into the currently-playing segment
  export let wordOffset = 0;     // spoken words to skip first — for text split across multiple AudioText instances

  // Each token's highlight window is extended to end exactly where the NEXT
  // token starts (rather than its own natural end) — otherwise the small gap
  // ElevenLabs leaves between words (end-of-word to start-of-next-word) reads
  // as a flicker where nothing is highlighted. The very last token keeps its
  // own natural end since there's no next token to extend into.
  $: tokens = withExtendedWindows(buildHighlightTokens(text, alignment, wordOffset));

  function withExtendedWindows(toks) {
    return toks.map((tok, i) => {
      if (tok.start == null) return tok;
      const next = toks[i + 1];
      const end = (next && next.start != null) ? next.start : tok.end;
      return { ...tok, end };
    });
  }

  function isHighlighted(tok) {
    return active && tok.start != null && currentTime >= tok.start && currentTime < tok.end;
  }
</script>

{#each tokens as tok, i}
  {#if tok.type === 'html'}
    {@html tok.html}
  {:else if tok.type === 'fraction'}
    <span class="frac hl-word" class:hl-active={isHighlighted(tok)}><span class="frac-num">{@html tok.numHtml ?? tok.num}</span><span class="frac-den">{@html tok.denHtml ?? tok.den}</span></span>
  {:else if tok.type === 'blank'}
    <span class="box-q hl-word" class:hl-active={isHighlighted(tok)}>?</span>
  {:else if tok.bold && tok.italic}
    <strong class="hl-word" class:hl-active={isHighlighted(tok)}><em>{tok.text}</em></strong>
  {:else if tok.bold}
    <strong class="hl-word" class:hl-active={isHighlighted(tok)}>{tok.text}</strong>
  {:else if tok.italic}
    <em class="hl-word" class:hl-active={isHighlighted(tok)}>{tok.text}</em>
  {:else}
    <span class="hl-word" class:hl-active={isHighlighted(tok)}>{tok.text}</span>
  {/if}{' '}
{/each}

<style>
  .hl-word {
    border-radius: 3px;
    transition: background-color 0.1s ease;
  }
  .hl-active {
    background-color: #fde68a;
  }
</style>
