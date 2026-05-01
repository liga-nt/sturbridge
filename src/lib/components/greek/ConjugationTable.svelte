<script>
  import { paradigms } from '$lib/data/greek/paradigms.js';

  /**
   * Fully data-driven paradigm table.
   *
   * Primary path: wordForms (nested actual forms) drives table structure and cells.
   * Fallback path: paradigmKey looked up in paradigms.js when wordForms is absent.
   * paradigmKey is still used for: label/note text, and abstract-ending fill-in for empty cells.
   *
   * Props:
   *   wordForms     — nested forms object from buildWordForms (pre-filtered for verbs)
   *   highlightMorph — structured morph of the hovered word { pos, case, gender, number, person, tense, mood, voice }
   *   dictEntry     — headword string for display
   *   paradigmKey   — optional; fallback template + notes
   */
  export let wordForms    = null;
  export let highlightMorph = null;
  export let dictEntry    = null;
  export let paradigmKey  = null;

  // ── Canonical orderings ───────────────────────────────────────────────────
  const CASE_ORDER   = ['nom','gen','dat','acc','voc'];
  const PERSON_ORDER = ['1','2','3'];
  const GENDER_ORDER = ['masc','fem','neut'];
  const NUMBER_ORDER = ['sg','pl'];

  const CASE_LABELS   = { nom:'Nom', gen:'Gen', dat:'Dat', acc:'Acc', voc:'Voc' };
  const PERSON_LABELS = { '1':'1st', '2':'2nd', '3':'3rd' };
  const NUMBER_LABELS = { sg:'Singular', pl:'Plural' };
  const GENDER_SHORT  = { masc:'M.', fem:'F.', neut:'N.' };

  const TENSE_L = { pres:'Present', imperf:'Imperfect', aor:'Aorist', fut:'Future', perf:'Perfect', plup:'Pluperfect' };
  const MOOD_L  = { indic:'Indicative', subj:'Subjunctive', opt:'Optative', imper:'Imperative', inf:'Infinitive' };
  const VOICE_L = { act:'Active', mid:'Middle', pass:'Passive', mp:'Mid./Pass.' };

  // ── Paradigm fallback ─────────────────────────────────────────────────────
  $: paradigm = paradigmKey ? paradigms[paradigmKey] : null;

  // ── Label ─────────────────────────────────────────────────────────────────
  function deriveLabel(m, de, p) {
    if (!m && p?.label) return p.label;
    if (!m) return de ?? '';
    const { pos, tense, mood, voice, gender } = m;
    if (pos === 'verb') {
      return [TENSE_L[tense], MOOD_L[mood], VOICE_L[voice]].filter(Boolean).join(' ');
    }
    if (pos === 'art') return p?.label ?? 'Definite Article';
    if (pos === 'adj') return p?.label ?? 'Adjective';
    if (pos === 'pron') return p?.label ?? `${de ?? ''} Pronoun`.trim();
    if (pos === 'noun') {
      if (p?.label) return p.label;
      const gL = { masc:'Masculine', fem:'Feminine', neut:'Neuter' }[gender];
      return gL ? `Noun (${gL})` : 'Noun';
    }
    return p?.label ?? de ?? pos ?? '';
  }

  $: label = deriveLabel(highlightMorph, dictEntry, paradigm);

  // ── Structure detection from wordForms ────────────────────────────────────
  /**
   * Returns one of:
   *   { type:'verb',       persons, numbers }
   *   { type:'noun',       cases, numbers }
   *   { type:'multi-gender', genders, numbers, cases }
   * or null if structure can't be determined.
   */
  function detectStructure(wf) {
    if (!wf) return null;
    const topKeys = Object.keys(wf);
    const genders = GENDER_ORDER.filter(g => topKeys.includes(g));
    const numbers = NUMBER_ORDER.filter(n => topKeys.includes(n));

    if (genders.length > 0) {
      const allNums = NUMBER_ORDER.filter(n =>
        genders.some(g => n in (wf[g] ?? {}))
      );
      const casesPresent = new Set();
      for (const g of genders) {
        for (const n of allNums) {
          Object.keys(wf[g]?.[n] ?? {}).forEach(c => casesPresent.add(c));
        }
      }
      const cases = CASE_ORDER.filter(c => casesPresent.has(c));
      return { type:'multi-gender', genders, numbers: allNums, cases };
    }

    if (numbers.length > 0) {
      const subKeys = new Set();
      numbers.forEach(n => Object.keys(wf[n] ?? {}).forEach(k => subKeys.add(k)));
      if ([...subKeys].some(k => PERSON_ORDER.includes(k))) {
        return { type:'verb', persons: PERSON_ORDER, numbers };
      }
      const cases = CASE_ORDER.filter(c => subKeys.has(c));
      return { type:'noun', cases, numbers };
    }
    return null;
  }

  // ── Table builder ─────────────────────────────────────────────────────────
  function buildTable(wf, p) {
    const struct = detectStructure(wf);
    const abs = p?.forms ?? null; // abstract endings as fallback for empty cells

    function cell(actual, abstract) { return actual ?? abstract ?? '—'; }

    if (struct?.type === 'verb') {
      const headers  = struct.numbers.map(n => NUMBER_LABELS[n] ?? n);
      const colNums  = struct.numbers; // ['sg','pl']
      const rows = struct.persons.map(person => ({
        label:  PERSON_LABELS[person] ?? person,
        rowKey: person,
        cells:  colNums.map(n => cell(wf?.[n]?.[person], abs?.[n]?.[person]))
      }));
      return { headers, rows, colNums, struct };
    }

    if (struct?.type === 'noun') {
      const headers = struct.numbers.map(n => NUMBER_LABELS[n] ?? n);
      const colNums = struct.numbers;
      const rows = struct.cases.map(c => ({
        label:  CASE_LABELS[c] ?? c,
        rowKey: c,
        cells:  colNums.map(n => cell(wf?.[n]?.[c], abs?.[n]?.[c]))
      }));
      return { headers, rows, colNums, struct };
    }

    if (struct?.type === 'multi-gender') {
      // Columns ordered: for each number, for each gender  (M.Sg F.Sg N.Sg M.Pl F.Pl N.Pl)
      const colSpecs = [];
      for (const n of struct.numbers) {
        for (const g of struct.genders) {
          colSpecs.push({ gender: g, number: n });
        }
      }
      const headers = colSpecs.map(({ gender, number }) =>
        `${GENDER_SHORT[gender] ?? gender} ${NUMBER_LABELS[number] ?? number}`
      );
      const rows = struct.cases.map(c => ({
        label:  CASE_LABELS[c] ?? c,
        rowKey: c,
        cells:  colSpecs.map(({ gender, number }) =>
          cell(wf?.[gender]?.[number]?.[c], abs?.[gender]?.[number]?.[c])
        )
      }));
      return { headers, rows, colSpecs, struct };
    }

    // No wordForms structure — fall back entirely to paradigm template
    if (p) return buildFromParadigm(p);
    return null;
  }

  // Pure-paradigm fallback (no actual forms available)
  function buildFromParadigm(p) {
    const { forms, labels, pos } = p;

    if (forms && 'masc' in forms) {
      const genders  = GENDER_ORDER.filter(g => g in forms);
      const numbers  = NUMBER_ORDER;
      const caseKeys = labels?.rows?.map(r => r.toLowerCase()) ?? CASE_ORDER;
      const caseLabels = labels?.rows ?? caseKeys.map(c => CASE_LABELS[c] ?? c);
      const colSpecs = [];
      for (const n of numbers) for (const g of genders) colSpecs.push({ gender: g, number: n });
      const headers = colSpecs.map(({ gender, number }) =>
        `${GENDER_SHORT[gender] ?? gender} ${NUMBER_LABELS[number] ?? number}`
      );
      const rows = caseKeys.map((c, i) => ({
        label:  caseLabels[i] ?? CASE_LABELS[c] ?? c,
        rowKey: c,
        cells:  colSpecs.map(({ gender, number }) => forms[gender]?.[number]?.[c] ?? '—')
      }));
      return { headers, rows, colSpecs, struct: { type:'multi-gender', genders, numbers, cases: caseKeys } };
    }

    if (pos === 'verb') {
      const headers   = labels?.cols ?? ['Singular','Plural'];
      const rowLabels = labels?.rows ?? ['1st','2nd','3rd'];
      const rows = rowLabels.map((lbl, i) => {
        const key = PERSON_ORDER[i] ?? String(i + 1);
        return { label: lbl, rowKey: key, cells: ['sg','pl'].map(n => forms?.[n]?.[key] ?? '—') };
      });
      return { headers, rows, colNums: ['sg','pl'], struct: { type:'verb' } };
    }

    // noun / pronoun
    const caseKeys   = ['nom','gen','dat','acc','voc'];
    const headers    = labels?.cols ?? ['Singular','Plural'];
    const rowLabels  = labels?.rows ?? caseKeys.map(c => CASE_LABELS[c]);
    const rows = rowLabels.map((lbl, i) => {
      const c = caseKeys[i];
      return { label: lbl, rowKey: c, cells: ['sg','pl'].map(n => forms?.[n]?.[c] ?? '—') };
    });
    return { headers, rows, colNums: ['sg','pl'], struct: { type:'noun' } };
  }

  $: tableData = wordForms
    ? buildTable(wordForms, paradigm)
    : (paradigm ? buildFromParadigm(paradigm) : null);

  // ── Highlight ─────────────────────────────────────────────────────────────
  function isHighlighted(rowKey, colIdx) {
    if (!highlightMorph || !tableData) return false;
    const m = highlightMorph;
    const { struct } = tableData;

    if (struct?.type === 'multi-gender') {
      const spec = tableData.colSpecs?.[colIdx];
      if (!spec) return false;
      return m.case === rowKey && m.gender === spec.gender && m.number === spec.number;
    }

    if (struct?.type === 'verb') {
      const n = tableData.colNums?.[colIdx];
      return m.person === rowKey && m.number === n;
    }

    // noun
    const n = tableData.colNums?.[colIdx];
    return m.case === rowKey && m.number === n;
  }
</script>

{#if tableData}
  <div class="paradigm-wrap">
    <div class="paradigm-label">{label}</div>
    {#if dictEntry}
      <div class="paradigm-headword">{dictEntry}</div>
    {/if}
    {#if paradigm?.note}
      <div class="paradigm-note">{paradigm.note}</div>
    {/if}
    {#if paradigm?.example}
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
            {#each row.cells as cellVal, ci}
              <td class:highlighted={isHighlighted(row.rowKey, ci)}>
                {cellVal ?? '—'}
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
    font-size: 16px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 2px;
  }

  .paradigm-headword {
    font-size: 18px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .paradigm-note {
    font-size: 14px;
    color: #9ca3af;
    margin-bottom: 6px;
    font-style: italic;
  }

  .paradigm-table {
    border-collapse: collapse;
    font-size: 16px;
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
    font-size: 13px;
    white-space: nowrap;
  }

  .row-header {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
    text-align: right !important;
    font-size: 13px;
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
    font-size: 15px;
    color: #9ca3af;
    font-style: italic;
  }
</style>
