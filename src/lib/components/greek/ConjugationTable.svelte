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

  const CASE_LABELS   = { nom:'Nominative', gen:'Genitive', dat:'Dative', acc:'Accusative', voc:'Vocative' };
  const PERSON_LABELS = { '1':'1st', '2':'2nd', '3':'3rd' };
  const NUMBER_LABELS = { sg:'Singular', pl:'Plural' };
  const GENDER_LABELS = { masc:'Masculine', fem:'Feminine', neut:'Neuter' };

  const TENSE_L = { pres:'Present', imperf:'Imperfect', aor:'Aorist', fut:'Future', perf:'Perfect', plup:'Pluperfect' };
  const MOOD_L  = { indic:'Indicative', subj:'Subjunctive', opt:'Optative', imper:'Imperative', inf:'Infinitive' };
  const VOICE_L = { act:'Active', mid:'Middle', pass:'Passive', mp:'Mid./Pass.' };

  // ── Grammatical descriptions ──────────────────────────────────────────────
  const CASE_DESC = {
    nom: 'The <strong>nominative</strong> is the subject — the person or thing doing the action. Ask yourself: <em>Who</em> or <em>what</em> is doing it?',
    gen: 'The <strong>genitive</strong> shows belonging or connection. It often translates as <em>of</em> or the English possessive <em>\'s</em> — like "the sword <em>of the soldier</em>" or "the soldier\'s sword."',
    dat: 'The <strong>dative</strong> is the indirect object — the person who receives something or benefits from it. Ask yourself: <em>To whom</em> or <em>for whom</em>?',
    acc: 'The <strong>accusative</strong> is the direct object — the person or thing directly receiving the action. Ask yourself: <em>What</em> is being acted on?',
    voc: 'The <strong>vocative</strong> is used when speaking directly to someone. It\'s how you call out to a person by name or title — like saying "O Phoebe!" or "O teacher!"',
  };

  const NUMBER_DESC = {
    sg: 'The <strong>singular</strong> refers to just one person or thing.',
    pl: 'The <strong>plural</strong> refers to more than one. Greek tip: neuter plural subjects take a singular verb.',
  };

  const PERSON_DESC = {
    '1': '<strong>First person</strong> is the speaker. Singular: <em>I</em> — Plural: <em>we</em>',
    '2': '<strong>Second person</strong> is the person being spoken to. Singular and plural: <em>you</em>',
    '3': '<strong>Third person</strong> is everyone else. Singular: <em>he / she / it</em> — Plural: <em>they</em>',
  };

  $: morphDesc = (() => {
    if (!highlightMorph) return null;
    const { pos, case: c, number: n, person } = highlightMorph;
    const parts = [];
    if (pos === 'verb') {
      if (person) parts.push(PERSON_DESC[person]);
      if (n)      parts.push(NUMBER_DESC[n]);
    } else {
      if (c) parts.push(CASE_DESC[c]);
      if (n) parts.push(NUMBER_DESC[n]);
    }
    return parts.length ? parts : null;
  })();

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
      // Columns ordered: for each gender, for each number (Masc Sg/Pl, Fem Sg/Pl, Neut Sg/Pl)
      const colSpecs = [];
      for (const g of struct.genders) {
        for (const n of struct.numbers) {
          colSpecs.push({ gender: g, number: n });
        }
      }
      const headers = colSpecs.map(({ number }) => NUMBER_LABELS[number] ?? number);
      const genderHeaders = struct.genders.map(g => ({
        label: GENDER_LABELS[g] ?? g,
        span: struct.numbers.length,
      }));
      const rows = struct.cases.map(c => ({
        label:  CASE_LABELS[c] ?? c,
        rowKey: c,
        cells:  colSpecs.map(({ gender, number }) =>
          cell(wf?.[gender]?.[number]?.[c], abs?.[gender]?.[number]?.[c])
        )
      }));
      return { headers, genderHeaders, rows, colSpecs, struct };
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
      for (const g of genders) for (const n of numbers) colSpecs.push({ gender: g, number: n });
      const headers = colSpecs.map(({ number }) => NUMBER_LABELS[number] ?? number);
      const genderHeaders = genders.map(g => ({
        label: GENDER_LABELS[g] ?? g,
        span: numbers.length,
      }));
      const rows = caseKeys.map((c, i) => ({
        label:  caseLabels[i] ?? CASE_LABELS[c] ?? c,
        rowKey: c,
        cells:  colSpecs.map(({ gender, number }) => forms[gender]?.[number]?.[c] ?? '—')
      }));
      return { headers, genderHeaders, rows, colSpecs, struct: { type:'multi-gender', genders, numbers, cases: caseKeys } };
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

  // ── Movable nu display ────────────────────────────────────────────────────
  // Appends (ν) for display only; does not affect stored forms or lookups.
  // Rule: all -σι endings (verb 3pl, 3rd-decl dat pl) and verb -ε endings (3sg aor/imperf).
  function movNu(form, structType) {
    if (!form || form === '—') return form;
    const bare = form.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (bare.endsWith('σι')) return form + '(ν)';
    if (structType === 'verb' && bare.endsWith('ε')) return form + '(ν)';
    return form;
  }

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
        {#if tableData.genderHeaders}
          <tr>
            <th class="corner-cell" rowspan="2"></th>
            {#each tableData.genderHeaders as gh}
              <th colspan={gh.span} class="gender-header">{gh.label}</th>
            {/each}
          </tr>
          <tr>
            {#each tableData.headers as header}
              <th>{header}</th>
            {/each}
          </tr>
        {:else}
          <tr>
            <th class="corner-cell"></th>
            {#each tableData.headers as header}
              <th>{header}</th>
            {/each}
          </tr>
        {/if}
      </thead>
      <tbody>
        {#each tableData.rows as row}
          <tr>
            <th class="row-header">{row.label}</th>
            {#each row.cells as cellVal, ci}
              <td class:highlighted={isHighlighted(row.rowKey, ci)}>
                {movNu(cellVal ?? '—', tableData.struct?.type)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>

    {#if morphDesc}
      <div class="morph-desc">
        {#each morphDesc as html}
          <p>{@html html}</p>
        {/each}
      </div>
    {/if}
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

  .gender-header {
    border-bottom: 1px solid #d1d5db;
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

  .morph-desc {
    margin-top: 10px;
    padding: 10px 12px;
    background: #f8f9ff;
    border-left: 3px solid #c7d2fe;
    border-radius: 0 6px 6px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .morph-desc p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
  }
</style>
