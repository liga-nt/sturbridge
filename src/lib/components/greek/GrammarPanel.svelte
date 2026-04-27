<script>
  import ConjugationTable from './ConjugationTable.svelte';
  import SyntaxCard from './SyntaxCard.svelte';

  /**
   * GrammarPanel — right panel showing paradigm + syntax for the hovered word.
   * Props:
   *   hoveredWord:   full word object or null
   *   allSentences:  sentence[] (for context, not currently used for display)
   *   standards:     { [standardId]: standardDoc } map
   */
  export let hoveredWord = null;
  export const allSentences = [];   // reserved for future context-aware features
  export let standards = {};

  $: paradigmKey = hoveredWord?.paradigmKey ?? null;
  $: highlightMorph = hoveredWord?.morph ?? '';
  $: syntaxStandards = hoveredWord?.syntax_standard_refs ?? [];
</script>

<div class="grammar-panel">
  <div class="panel-title">Grammar</div>

  {#if !hoveredWord}
    <p class="placeholder">Hover a word to see grammar.</p>
  {:else}
    <div class="word-header">
      <span class="dict-entry">{hoveredWord.dictEntry ?? hoveredWord.text}</span>
      {#if hoveredWord.morph}
        <span class="morph-tag">{hoveredWord.morph}</span>
      {/if}
      {#if hoveredWord.shortDef}
        <span class="def-text">{hoveredWord.shortDef}</span>
      {/if}
    </div>

    {#if paradigmKey}
      <div class="card paradigm-card">
        <div class="card-label">Paradigm</div>
        <ConjugationTable {paradigmKey} {highlightMorph} />
      </div>
    {/if}

    {#if syntaxStandards.length > 0}
      <div class="card syntax-card-wrap">
        <div class="card-label">Syntax</div>
        <SyntaxCard standardIds={syntaxStandards} {standards} />
      </div>
    {/if}

    {#if !paradigmKey && syntaxStandards.length === 0}
      <p class="no-grammar">No grammar data for this word.</p>
    {/if}
  {/if}
</div>

<style>
  .grammar-panel {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #333;
    height: 100%;
    overflow-y: auto;
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }

  .placeholder {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }

  .word-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f3f4f6;
  }

  .dict-entry {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }

  .morph-tag {
    font-size: 11px;
    color: #6b7280;
    font-style: italic;
  }

  .def-text {
    font-size: 13px;
    color: #374151;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
  }

  .card-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 8px;
  }

  .no-grammar {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }
</style>
