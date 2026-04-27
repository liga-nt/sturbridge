<script>
  import { createEventDispatcher } from 'svelte';

  /**
   * HebrewPassage — RTL passage renderer, mirrors GreekPassage.svelte.
   * Props:
   *   sentences: sentence[]  — each has .words[], .num
   *   currentWords: [{ sentenceNum: string, sentPos: string, phase: 'full'|'fadeIn'|'fadeOut' }]
   * Events:
   *   wordHover({ word, sentence, event } | null)
   *   wordClick({ word, sentence })
   */
  export let sentences   = [];
  export let currentWords = [];

  const dispatch = createEventDispatcher();

  // Sof pasuq ׃ and paseq ׀ are display-only punctuation — not interactive
  const PUNCT_ONLY = /^[׃׀,.\-–—]+$/;

  function getPhase(sentenceNum, sentPos) {
    const sn = String(sentenceNum), sp = String(sentPos);
    for (const w of currentWords) {
      if (w.sentenceNum === sn && w.sentPos === sp) return w.phase;
    }
    return null;
  }

  function handleEnter(e, word, sentence) {
    dispatch('wordHover', { word, sentence, event: e });
  }

  function handleLeave() {
    dispatch('wordHover', null);
  }

  function handleClick(e, word, sentence) {
    e.stopPropagation();
    dispatch('wordClick', { word, sentence });
  }
</script>

<div class="hebrew-text" dir="rtl">
  <p class="passage">
    {#each sentences as sentence}
      {#each sentence.words ?? [] as word}
        {#if PUNCT_ONLY.test(word.text)}
          <span class="hw punct">{word.text}</span>
        {:else}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <span
            class="hw"
            class:highlight-full={getPhase(sentence.num, word.sentPos) === 'full'}
            class:highlight-fade-in={getPhase(sentence.num, word.sentPos) === 'fadeIn'}
            class:highlight-fade-out={getPhase(sentence.num, word.sentPos) === 'fadeOut'}
            on:click={(e) => handleClick(e, word, sentence)}
            on:mouseenter={(e) => handleEnter(e, word, sentence)}
            on:mouseleave={handleLeave}
          >{word.text}</span>
        {/if}
      {/each}
      <span class="sentence-gap"> </span>
    {/each}
  </p>
</div>

<style>
  .hebrew-text {
    font-family: "Frank Ruhl Libre", "Times New Roman", "David", serif;
    font-feature-settings: "kern" 1;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    width: 100%;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .passage {
    font-size: 22px;
    line-height: 2.1;
    color: #1a1a1a;
    margin: 0;
    white-space: normal;
  }

  .hw {
    display: inline;
    position: relative;
    margin-left: 0.2em;
    cursor: pointer;
    border-radius: 3px;
    padding: 1px 2px;
    transition: background-color 150ms ease-in-out;
    user-select: none;
    -webkit-user-select: none;
  }

  .hw.punct {
    cursor: default;
    color: #9ca3af;
    margin-left: 0;
    padding: 0;
  }

  .hw:not(.punct):hover {
    background-color: #f3f4f6;
  }

  .hw.highlight-full {
    background-color: #fef9c3;
  }

  .hw.highlight-fade-in {
    background-color: #fef9c3;
    transition: background-color 150ms ease-in-out;
  }

  .hw.highlight-fade-out {
    background-color: transparent;
    transition: background-color 150ms ease-in-out;
  }

  .sentence-gap {
    display: inline-block;
    width: 1em;
  }
</style>
