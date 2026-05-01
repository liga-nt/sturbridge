<script>
  import { paradigms } from '$lib/data/hebrew/paradigms.js';

  /**
   * HebrewParadigmTable — shows paradigm for a hovered Hebrew word.
   * Props:
   *   morph:       parsed morph object { pos, stem, tense, gender, number, state, person }
   *   wordForms:   nested actual forms from buildWordForms()
   *   dictEntry:   headword string
   *   paradigmKey: key into paradigms.js for template fallback
   */
  export let morph       = null;
  export let wordForms   = null;
  export let dictEntry   = null;
  export let paradigmKey = null;
  export let surfaceForm = null;
  export let definition  = null;

  function stripAll(s) { return (s ?? '').replace(/[֑-ׇ]/g, ''); }
  $: showSurface = surfaceForm && dictEntry && stripAll(surfaceForm) !== stripAll(dictEntry);

  $: paradigm = paradigmKey ? (paradigms[paradigmKey] ?? null) : null;

  const VERB_ROWS = [
    { key: '3m', label: '3m' },
    { key: '3f', label: '3f' },
    { key: '2m', label: '2m' },
    { key: '2f', label: '2f' },
    { key: '1c', label: '1c' },
  ];

  const NOUN_STATES  = ['abs', 'cst'];
  const NOUN_NUMBERS = ['sg', 'pl', 'du'];

  // Returns { form, isTemplate } or null. Checks actual forms first, then template.
  function verbCell(tenseKey, number, rowKey) {
    const slice    = wordForms?.[tenseKey];
    const person   = rowKey[0]; // "3", "2", "1"
    // actual: try exact key, then 3c common fallback for 3rd person
    const actual   = slice?.[number]?.[rowKey]
      ?? (person === '3' ? slice?.[number]?.['3c'] : null)
      ?? null;
    if (actual) return { form: actual, isTemplate: false };
    // template fallback
    const tpl      = paradigm?.forms;
    const tplForm  = tpl?.[number]?.[rowKey]
      ?? (person === '3' ? tpl?.[number]?.['3c'] : null)
      ?? null;
    if (tplForm) return { form: tplForm, isTemplate: true };
    return null;
  }

  function nounCell(state, number) {
    const actual = wordForms?.[number]?.[state] ?? null;
    if (actual) return { form: actual, isTemplate: false };
    const tpl = paradigm?.forms?.[number]?.[state] ?? null;
    if (tpl) return { form: tpl, isTemplate: true };
    return null;
  }

  function isCurrentVerb(number, rowKey) {
    if (!morph) return false;
    const person = rowKey[0], gender = rowKey[1];
    if (morph.person !== person) return false;
    if (morph.number !== number) return false;
    // "3c" row matches gender "c"; "3m"/"3f" match their respective genders
    return morph.gender === gender || (gender === 'm' && morph.gender === 'c') || (gender === 'f' && morph.gender === 'c');
  }

  function morphLabel(m, p) {
    if (!m) return p?.label ?? '';
    const { pos, stem, tense, gender, number } = m;
    if (pos === 'verb') {
      const label = p?.label ?? [stem, tense].filter(Boolean).join(' ');
      return label;
    }
    if (pos === 'noun' || pos === 'adj') {
      return p?.label ?? [gender === 'f' ? 'fem' : gender === 'm' ? 'masc' : gender, pos].filter(Boolean).join(' ');
    }
    return p?.label ?? pos ?? '';
  }

  $: isVerb = morph?.pos === 'verb';
  $: isNoun = morph?.pos === 'noun' || morph?.pos === 'adj';
  $: label  = morphLabel(morph, paradigm);
  $: tenseKey = morph?.stem && morph?.tense ? `${morph.stem}.${morph.tense}` : null;

  // Participle: wordForms keyed by "ms"/"fs"/"mp"/"fp"
  $: isParticiple = morph?.tense === 'participle';
  $: PARTICIPLE_KEYS = ['ms', 'fs', 'mp', 'fp'];
</script>

{#if showSurface}
  <div class="paradigm-surface" dir="rtl">{surfaceForm}</div>
{/if}
{#if dictEntry}
  <div class="paradigm-headword" class:is-sub={showSurface} dir="rtl">{dictEntry}</div>
{/if}

{#if label}
  <div class="paradigm-label">{label}</div>
{/if}

{#if isVerb && isParticiple}
  <!-- Participle grid: gender × number -->
  <table class="paradigm-table" dir="rtl">
    <thead>
      <tr><th></th><th>Sg</th><th>Pl</th></tr>
    </thead>
    <tbody>
      {#each [['m','masc'],['f','fem']] as [g, gl]}
        <tr>
          <td class="row-label">{gl}</td>
          {#each ['s','p'] as np}
            {@const pgKey = g + np}
            {@const actual = wordForms?.[pgKey]}
            {@const tplForm = paradigm?.forms?.[pgKey]}
            {@const cell = actual ?? tplForm}
            {@const isTpl = !actual && !!tplForm}
            <td
              class:current-cell={morph?.gender === g && morph?.number === (np === 's' ? 'sg' : 'pl')}
              class:template-cell={isTpl}
            >{cell ?? '—'}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

{:else if isVerb && tenseKey}
  <!-- Finite verb grid: person/gender × number -->
  {@const hasPlForms = VERB_ROWS.some(r => verbCell(tenseKey, 'pl', r.key) !== null)}
  <table class="paradigm-table" dir="rtl">
    <thead>
      <tr>
        <th></th>
        <th>יָחִיד</th>
        {#if hasPlForms}<th>רַבִּים</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each VERB_ROWS as row}
        {@const sgCell = verbCell(tenseKey, 'sg', row.key)}
        {@const plCell = verbCell(tenseKey, 'pl', row.key)}
        {#if sgCell || plCell}
          <tr>
            <td class="row-label">{row.label}</td>
            <td
              class:current-cell={isCurrentVerb('sg', row.key)}
              class:template-cell={sgCell?.isTemplate}
            >{sgCell?.form ?? '—'}</td>
            {#if hasPlForms}
              <td
                class:current-cell={isCurrentVerb('pl', row.key)}
                class:template-cell={plCell?.isTemplate}
              >{plCell?.form ?? '—'}</td>
            {/if}
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>

{:else if isNoun}
  <!-- Noun grid: state × number -->
  {@const hasAnyForm = NOUN_NUMBERS.some(n => NOUN_STATES.some(s => nounCell(s, n) !== null))}
  {#if hasAnyForm}
    <table class="paradigm-table" dir="rtl">
      <thead>
        <tr>
          <th></th>
          {#each NOUN_NUMBERS as num}
            <th>{num}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each NOUN_STATES as state}
          <tr>
            <td class="row-label">{state}</td>
            {#each NOUN_NUMBERS as num}
              {@const cell = nounCell(state, num)}
              <td
                class:current-cell={morph?.state === state && morph?.number === num}
                class:template-cell={cell?.isTemplate}
              >{cell?.form ?? '—'}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if paradigm}
    <p class="no-data">Forms appear as the text is read.</p>
  {:else}
    <p class="no-data">No paradigm available.</p>
  {/if}

{:else if morph && morph.pos !== 'unknown'}
  <p class="no-data">No paradigm for {morph.pos}.</p>
{/if}

{#if morph}
  <p class="paradigm-legend"><span class="legend-template">italic</span> = √קטל model · black = attested form</p>
{/if}

{#if definition}
  <p class="full-definition">{definition}</p>
{/if}

<style>
  .paradigm-surface {
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 28px;
    font-weight: 700;
    color: #111827;
    direction: rtl;
  }

  .paradigm-headword {
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 25px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 4px;
    direction: rtl;
  }

  .paradigm-headword.is-sub {
    font-size: 16px;
    font-weight: 400;
    color: #9ca3af;
    margin-bottom: 4px;
  }

  .paradigm-label {
    font-size: 15px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 2px;
  }

.paradigm-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 16px;
    direction: rtl;
  }

  .paradigm-table th {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 4px 6px;
    border-bottom: 1px solid #e5e7eb;
    text-align: center;
  }

  .paradigm-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #f3f4f6;
    text-align: center;
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 18px;
    color: #374151;
  }

  .row-label {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #9ca3af;
    text-align: left;
    min-width: 28px;
  }

  .current-cell {
    background-color: #fef9c3;
    font-weight: 700;
    color: #111827;
    border-radius: 3px;
  }

  .template-cell {
    color: #9ca3af;
    font-style: italic;
  }

  .template-cell.current-cell {
    background-color: #fef9c3;
    color: #6b7280;
    font-weight: 600;
  }

  .no-data {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
    margin: 0;
  }

  .paradigm-legend {
    font-size: 11px;
    color: #d1d5db;
    margin: 8px 0 0;
  }

  .legend-template {
    color: #9ca3af;
    font-style: italic;
  }

  .full-definition {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.5;
    margin: 10px 0 0;
    padding-top: 8px;
    border-top: 1px solid #f3f4f6;
  }
</style>
