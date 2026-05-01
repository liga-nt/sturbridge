<script>
  import { createEventDispatcher } from 'svelte';

  /**
   * GreekPassage — display-only. Parent owns audio and currentWords.
   * Props:
   *   sentences: sentence[]
   *   currentWords: [{ sentenceNum: string, sentPos: string, phase: 'full'|'fadeIn'|'fadeOut' }]
   * Events:
   *   wordHover({ word, sentence, event } | null)
   *   wordClick({ word, sentence })
   */
  export let sentences = [];
  export let currentWords = [];

  const dispatch = createEventDispatcher();

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

<div class="greek-text">
  <p class="passage">
    {#each sentences as sentence}
      {#each sentence.words ?? [] as word}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
          class="gw"
          class:highlight-full={getPhase(sentence.num, word.sentPos) === 'full'}
          class:highlight-fade-in={getPhase(sentence.num, word.sentPos) === 'fadeIn'}
          class:highlight-fade-out={getPhase(sentence.num, word.sentPos) === 'fadeOut'}
          on:click={(e) => handleClick(e, word, sentence)}
          on:mouseenter={(e) => handleEnter(e, word, sentence)}
          on:mouseleave={handleLeave}
        >{word.text}</span>
      {/each}
    {/each}
  </p>
</div>

<style>
  .greek-text {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    width: 100%;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .passage {
    font-size: 25px;
    line-height: 1.9;
    color: #1a1a1a;
    margin: 0;
    white-space: normal;
  }

  /* Inline span — no layout shift on highlight */
  .gw {
    display: inline;
    position: relative;
    margin-right: 0.2em;
    cursor: pointer;
    border-radius: 3px;
    padding: 1px 1px;
    transition: background-color 150ms ease-in-out;
    user-select: none;
    -webkit-user-select: none;
  }

  .gw:hover {
    background-color: #f3f4f6;
  }

  .gw.highlight-full {
    background-color: #fef9c3;
  }

  .gw.highlight-fade-in {
    background-color: #fef9c3;
    transition: background-color 150ms ease-in-out;
  }

  .gw.highlight-fade-out {
    background-color: transparent;
    transition: background-color 150ms ease-in-out;
  }
</style>
