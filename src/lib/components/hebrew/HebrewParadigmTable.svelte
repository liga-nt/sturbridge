<script>
  /**
   * HebrewParadigmTable — shows paradigm for the hovered Hebrew word.
   * Props:
   *   morph:      parsed morph object { pos, stem, tense, gender, number, state, person }
   *   wordForms:  built paradigm object from wordFormsCache (same buildWordForms() as Greek)
   *   dictEntry:  string — headword to display
   */
  export let morph      = null;
  export let wordForms  = null;
  export let dictEntry  = null;

  // Verb paradigm: rows = person/gender combos, cols = sg/pl
  const VERB_ROWS = [
    { key: '3m', label: '3m' },
    { key: '3f', label: '3f' },
    { key: '2m', label: '2m' },
    { key: '2f', label: '2f' },
    { key: '1c', label: '1c' },
  ];

  // Noun paradigm: rows = state, cols = sg/pl/du
  const NOUN_STATES  = ['abs', 'cst'];
  const NOUN_NUMBERS = ['sg', 'pl', 'du'];

  function verbCell(forms, pgNum, person, gender) {
    if (!forms) return null;
    // wordForms for verbs: keyed by stem.tense, then number (sg/pl), then person+gender ('3m','3f',...)
    const tenseKey = deriveTenseKey(morph);
    const slice = forms[tenseKey];
    if (!slice) return null;
    return slice?.[pgNum]?.[`${person}${gender}`] ?? null;
  }

  function deriveTenseKey(m) {
    if (!m) return null;
    return `${m.stem ?? 'qal'}.${m.tense ?? 'perf'}`;
  }

  function nounCell(forms, state, number) {
    if (!forms) return null;
    return forms?.[number]?.[state] ?? null;
  }

  function morphLabel(m) {
    if (!m) return '';
    if (m.pos === 'verb') {
      return [m.stem, m.tense].filter(Boolean).join(' ');
    }
    if (m.pos === 'noun' || m.pos === 'adj') {
      return [m.gender === 'm' ? 'masc' : m.gender === 'f' ? 'fem' : m.gender, m.pos].filter(Boolean).join(' ');
    }
    return m.pos ?? '';
  }

  $: hasVerb = morph?.pos === 'verb' && wordForms;
  $: hasNoun = (morph?.pos === 'noun' || morph?.pos === 'adj') && wordForms;
  $: label   = morphLabel(morph);
</script>

{#if dictEntry}
  <div class="paradigm-headword" dir="rtl">{dictEntry}</div>
{/if}

{#if label}
  <div class="paradigm-label">{label}</div>
{/if}

{#if hasVerb}
  {@const tenseKey = deriveTenseKey(morph)}
  {@const slice = wordForms?.[tenseKey]}
  {#if slice}
    <table class="paradigm-table" dir="rtl">
      <thead>
        <tr>
          <th></th>
          <th>יָחִיד</th>
          <th>רַבִּים</th>
        </tr>
      </thead>
      <tbody>
        {#each VERB_ROWS as row}
          <tr>
            <td class="row-label">{row.label}</td>
            <td class:current-cell={morph?.person === row.key[0] && morph?.gender === row.key[1] && morph?.number === 'sg'}>
              {slice?.sg?.[row.key] ?? '—'}
            </td>
            <td class:current-cell={morph?.person === row.key[0] && morph?.gender === row.key[1] && morph?.number === 'pl'}>
              {slice?.pl?.[row.key] ?? '—'}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="no-data">No forms available.</p>
  {/if}

{:else if hasNoun}
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
            <td class:current-cell={morph?.state === state && morph?.number === num}>
              {nounCell(wordForms, state, num) ?? '—'}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

{:else if morph}
  <p class="no-data">No paradigm for {morph.pos ?? 'this word'}.</p>
{/if}

<style>
  .paradigm-headword {
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 20px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 4px;
    direction: rtl;
  }

  .paradigm-label {
    font-size: 11px;
    color: #6b7280;
    font-style: italic;
    margin-bottom: 10px;
  }

  .paradigm-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
    direction: rtl;
  }

  .paradigm-table th {
    font-size: 10px;
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
    font-size: 14px;
    color: #374151;
  }

  .row-label {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11px;
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

  .no-data {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
    margin: 0;
  }
</style>
