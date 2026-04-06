<script>
  import { paradigms } from '$lib/data/greek/paradigms.js';

  export let paradigmKey = '';
  export let highlightMorph = '';

  $: paradigm = paradigmKey ? paradigms[paradigmKey] : null;

  /**
   * Parse a morph tag string and return { person, number, case_, gender }
   * Handles both verb morph (e.g. "verb.pres.indic.act.3sg") and
   * noun morph (e.g. "noun.masc.sg.gen").
   */
  function parseMorph(morph) {
    if (!morph) return {};
    const parts = morph.toLowerCase().split('.');
    const result = {};

    for (const p of parts) {
      if (p === '1sg' || p === '1st.sg') { result.person = '1'; result.number = 'sg'; }
      else if (p === '2sg' || p === '2nd.sg') { result.person = '2'; result.number = 'sg'; }
      else if (p === '3sg' || p === '3rd.sg') { result.person = '3'; result.number = 'sg'; }
      else if (p === '1pl' || p === '1st.pl') { result.person = '1'; result.number = 'pl'; }
      else if (p === '2pl' || p === '2nd.pl') { result.person = '2'; result.number = 'pl'; }
      else if (p === '3pl' || p === '3rd.pl') { result.person = '3'; result.number = 'pl'; }
      else if (p === 'sg') result.number = 'sg';
      else if (p === 'pl') result.number = 'pl';
      else if (p === 'nom') result.case_ = 'nom';
      else if (p === 'gen') result.case_ = 'gen';
      else if (p === 'dat') result.case_ = 'dat';
      else if (p === 'acc') result.case_ = 'acc';
      else if (p === 'voc') result.case_ = 'voc';
      else if (p === 'masc' || p === 'm') result.gender = 'masc';
      else if (p === 'fem' || p === 'f') result.gender = 'fem';
      else if (p === 'neut' || p === 'n') result.gender = 'neut';
      // Also handle combined like "3sg" inline
      else if (/^[123](sg|pl)$/.test(p)) {
        result.person = p[0];
        result.number = p.slice(1);
      }
    }
    return result;
  }

  $: parsed = parseMorph(highlightMorph);

  /**
   * Determine if a given cell (rowKey, colKey) should be highlighted.
   * For verbs: rowKey = person ('1','2','3'), colKey = number ('sg','pl')
   * For nouns/pronouns: rowKey = case_, colKey = number ('sg','pl') or gender+number
   * For adjectives/articles: rowKey = case_, colKey = gender+number combo
   */
  function isHighlighted(rowKey, colKey) {
    if (!highlightMorph || !parsed) return false;
    const p = paradigm;
    if (!p) return false;

    if (p.pos === 'verb') {
      return parsed.person === rowKey && parsed.number === colKey;
    }

    // For multi-gender paradigms (adjective, article, pronoun with gender)
    if (p.forms && ('masc' in p.forms || 'fem' in p.forms)) {
      // colKey is like "M. Sg" or "masc-sg"
      // We match gender + number
      const genderMap = { 'm': 'masc', 'f': 'fem', 'n': 'neut' };
      const colLower = colKey.toLowerCase();
      const colGender = colLower.includes('m.') || colLower.startsWith('masc') ? 'masc'
                      : colLower.includes('f.') || colLower.startsWith('fem') ? 'fem'
                      : colLower.includes('n.') || colLower.startsWith('neut') ? 'neut'
                      : null;
      const colNumber = colLower.includes('sg') ? 'sg' : colLower.includes('pl') ? 'pl' : null;
      return parsed.case_ === rowKey.toLowerCase() && parsed.gender === colGender && parsed.number === colNumber;
    }

    // Simple noun/pronoun: rowKey = case name, colKey = 'Singular' or 'Plural'
    const colNumber = colKey.toLowerCase().startsWith('s') ? 'sg' : 'pl';
    return parsed.case_ === rowKey.toLowerCase() && parsed.number === colNumber;
  }

  /**
   * Build a flat table representation from the paradigm.
   * Returns { headers: string[], rows: { label, cells: string[] }[] }
   */
  function buildTable(p) {
    if (!p) return null;
    const { forms, labels } = p;

    // Detect multi-gender paradigm (adjective, article, pronouns with gender)
    if (forms && ('masc' in forms)) {
      // 6-column layout: M.Sg, F.Sg, N.Sg, M.Pl, F.Pl, N.Pl
      const genders = ['masc', 'fem', 'neut'].filter(g => g in forms);
      const numbers = ['sg', 'pl'];
      const cases = labels?.rows ?? ['Nom', 'Gen', 'Dat', 'Acc', 'Voc'];
      const headers = labels?.cols ?? genders.flatMap(g => numbers.map(n => `${g[0].toUpperCase()}. ${n[0].toUpperCase()}${n.slice(1)}`));

      const rows = cases.map(caseLabel => {
        const caseKey = caseLabel.toLowerCase();
        const cells = [];
        for (const num of numbers) {
          for (const g of genders) {
            const val = forms[g]?.[num]?.[caseKey] ?? forms[g]?.[caseKey] ?? '—';
            cells.push(val ?? '—');
          }
        }
        // Reorder: M.Sg, F.Sg, N.Sg, M.Pl, F.Pl, N.Pl
        // Current order above produces M.Sg, F.Sg, N.Sg for sg, then M.Pl, F.Pl, N.Pl for pl
        // That's already correct since we iterate numbers outer, genders inner
        // Actually we want sg block then pl block: iterate num outer → M.sg, F.sg, N.sg, M.pl, F.pl, N.pl
        return { label: caseLabel, cells, caseKey };
      });

      // Fix ordering: we want M.Sg, F.Sg, N.Sg, M.Pl, F.Pl, N.Pl
      // Rebuild with correct ordering
      const orderedRows = cases.map(caseLabel => {
        const caseKey = caseLabel.toLowerCase();
        const cells = [];
        for (const num of numbers) {
          for (const g of genders) {
            const val = forms[g]?.[num]?.[caseKey];
            cells.push(val ?? '—');
          }
        }
        return { label: caseLabel, cells, caseKey };
      });

      return { headers, rows: orderedRows, multiGender: true, genders, numbers };
    }

    // Simple 2-column: rows = persons (verb) or cases (noun)
    const cols = ['sg', 'pl'];
    const headers = labels?.cols ?? ['Singular', 'Plural'];
    const rowLabels = labels?.rows ?? [];

    let rows;
    if (p.pos === 'verb') {
      const personKeys = ['1', '2', '3'];
      rows = rowLabels.map((label, i) => {
        const key = personKeys[i] ?? String(i + 1);
        const cells = cols.map(c => forms[c]?.[key] ?? '—');
        return { label, cells, rowKey: key };
      });
    } else {
      // noun / pronoun with sg/pl
      const caseKeys = ['nom', 'gen', 'dat', 'acc', 'voc'];
      rows = rowLabels.map((label, i) => {
        const caseKey = caseKeys[i] ?? label.toLowerCase();
        const cells = cols.map(c => forms[c]?.[caseKey] ?? '—');
        return { label, cells, caseKey };
      });
    }

    return { headers, rows };
  }

  $: tableData = paradigm ? buildTable(paradigm) : null;
</script>

{#if paradigm && tableData}
  <div class="paradigm-wrap">
    <div class="paradigm-label">{paradigm.label}</div>
    {#if paradigm.headword}
      <div class="paradigm-headword">{paradigm.headword}</div>
    {/if}
    {#if paradigm.note}
      <div class="paradigm-note">{paradigm.note}</div>
    {/if}
    {#if paradigm.example}
      <div class="paradigm-note">{paradigm.example}</div>
    {/if}
    <table class="paradigm-table">
      <thead>
        <tr>
          <th class="corner-cell"></th>
          {#each tableData.headers as header}
            <th>{header}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each tableData.rows as row}
          <tr>
            <th class="row-header">{row.label}</th>
            {#each row.cells as cell, ci}
              {@const colKey = tableData.headers[ci] ?? ''}
              {@const rowKey = row.rowKey ?? row.caseKey ?? row.label.toLowerCase()}
              <td class:highlighted={isHighlighted(rowKey, colKey)}>
                {cell ?? '—'}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if paradigmKey}
  <div class="paradigm-missing">Paradigm "{paradigmKey}" not found.</div>
{/if}

<style>
  .paradigm-wrap {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .paradigm-label {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 2px;
  }

  .paradigm-headword {
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .paradigm-note {
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 6px;
    font-style: italic;
  }

  .paradigm-table {
    border-collapse: collapse;
    font-size: 13px;
    width: 100%;
  }

  .paradigm-table th,
  .paradigm-table td {
    border: 1px solid #e5e7eb;
    padding: 4px 8px;
    text-align: center;
  }

  .paradigm-table thead th {
    background: #f3f4f6;
    font-weight: 600;
    color: #374151;
    font-size: 11px;
    white-space: nowrap;
  }

  .row-header {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
    text-align: right !important;
    font-size: 11px;
    white-space: nowrap;
  }

  .corner-cell {
    background: #f3f4f6;
  }

  .highlighted {
    background: #fef9c3;
    font-weight: 700;
    color: #92400e;
  }

  .paradigm-missing {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
  }
</style>
