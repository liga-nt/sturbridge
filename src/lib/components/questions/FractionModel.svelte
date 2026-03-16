<script>
  // FractionModel — interactive approximation of the TestNav InteractiveFractionModel widget.
  //
  // Students can:
  //   • Click More/Fewer to change the number of equal parts
  //   • Click individual strips to shade/unshade them
  //   • Click Reset to clear back to the starting state
  //
  // Props
  //   question_text  — HTML string, rendered with {@html}
  //   math_expression — HTML string, rendered centred between paragraphs
  //   instruction    — secondary instruction text (HTML string)
  //   numerator      — correct answer numerator (for reference only)
  //   denominator    — starting division count
  //   models         — array of { numerator, denominator, label? } for multi-model layout
  //                    When provided, each model has independent interactive state.

  import { renderMath } from '$lib/utils/math.js';

  export let question_text = '';
  export let math_expression = null;
  export let instruction = null;
  export let numerator = 1;     // eslint-disable-line no-unused-vars (correct answer ref)
  export let denominator = 1;   // starting division count
  export let models = null;

  // ── Geometry (match the real widget) ──────────────────────────────────────
  const SVG_W   = 260;
  const SVG_H   = 340;
  const RECT_X  = 14;
  const RECT_Y  = 44;
  const RECT_W  = 232;
  const RECT_H  = 232;

  const BTN_Y      = 292;
  const BTN_H      = 28;
  const BTN_R      = 5;
  const BTN_TEXT_Y = 306;

  const FEWER_X  = 8;
  const MORE_X   = 92;
  const RESET_X  = 176;
  const BTN_W    = 76;

  const SHADED_FILL       = '#a8d0f0';
  const UNSHADED_FILL     = '#ffffff';
  const STROKE_COLOR      = '#000000';
  const BTN_ACTIVE_FILL   = '#dddddd';
  const BTN_ACTIVE_STROKE = '#888888';
  const BTN_INACTIVE_FILL   = '#d3d3d3';
  const BTN_INACTIVE_STROKE = '#d3d3d3';
  const BTN_ACTIVE_TEXT   = '#000000';
  const BTN_INACTIVE_TEXT = '#899499';

  const MIN_DEN = 1;
  const MAX_DEN = 24;

  // ── Per-model interactive state ────────────────────────────────────────────
  // Build an array of model state objects (one per model).
  // Each has: { label, den, shaded: Set<number> }

  function makeState(m) {
    return { label: m.label ?? 'One Whole', den: m.denominator ?? denominator, shaded: new Set() };
  }

  $: baseModels = models && models.length > 0
    ? models
    : [{ numerator, denominator, label: null }];

  // Initialise state array reactively when baseModels changes.
  // We intentionally avoid reinitialising on every render — only when the
  // identity of baseModels changes (i.e. a new question is loaded).
  let states = baseModels.map(makeState);
  let prevBaseModels = baseModels;
  $: if (baseModels !== prevBaseModels) {
    states = baseModels.map(makeState);
    prevBaseModels = baseModels;
  }

  function more(i) {
    if (states[i].den >= MAX_DEN) return;
    states[i] = { ...states[i], den: states[i].den + 1, shaded: new Set() };
    states = [...states];
  }

  function fewer(i) {
    if (states[i].den <= MIN_DEN) return;
    states[i] = { ...states[i], den: states[i].den - 1, shaded: new Set() };
    states = [...states];
  }

  function reset(i) {
    states[i] = { ...states[i], den: baseModels[i].denominator ?? denominator, shaded: new Set() };
    states = [...states];
  }

  function toggleStrip(modelIdx, stripIdx) {
    const s = new Set(states[modelIdx].shaded);
    if (s.has(stripIdx)) s.delete(stripIdx);
    else s.add(stripIdx);
    states[modelIdx] = { ...states[modelIdx], shaded: s };
    states = [...states];
  }
</script>

<div class="fraction-model-widget">
  <!-- Question text -->
  {#if question_text}
    <div class="question-body">{@html renderMath(question_text)}</div>
  {/if}

  <!-- Optional centred math expression -->
  {#if math_expression}
    <div class="math-expr">{@html renderMath(math_expression)}</div>
  {/if}

  <!-- Optional secondary instruction -->
  {#if instruction}
    <div class="instruction">{@html renderMath(instruction)}</div>
  {/if}

  <!-- Models (one SVG per model, side-by-side) -->
  <div class="models-row">
    {#each states as st, mi}
      {@const stripW = RECT_W / st.den}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox="0 0 {SVG_W} {SVG_H}"
        style="display: block; max-width: 100%; height: auto; cursor: default;"
        aria-label="Fraction model"
        role="img"
      >
        <!-- "One Whole" label -->
        <text
          x={SVG_W / 2} y="26"
          text-anchor="middle"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="16"
          font-weight="bold"
          fill="#333"
        >{st.label}</text>

        <!-- Strips (clickable) -->
        {#each Array(st.den) as _, i}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <rect
            x={RECT_X + i * stripW}
            y={RECT_Y}
            width={stripW}
            height={RECT_H}
            fill={st.shaded.has(i) ? SHADED_FILL : UNSHADED_FILL}
            stroke={STROKE_COLOR}
            stroke-width="1"
            style="cursor: pointer;"
            on:click={() => toggleStrip(mi, i)}
          />
        {/each}

        <!-- Outer border -->
        <rect
          x={RECT_X} y={RECT_Y}
          width={RECT_W} height={RECT_H}
          fill="none"
          stroke={STROKE_COLOR}
          stroke-width="3"
        />

        <!-- Fewer button -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <g style="cursor: pointer;" on:click={() => fewer(mi)}>
          <rect x={FEWER_X} y={BTN_Y} width={BTN_W} height={BTN_H} rx={BTN_R} ry={BTN_R}
            fill={st.den > MIN_DEN ? BTN_ACTIVE_FILL : BTN_INACTIVE_FILL}
            stroke={st.den > MIN_DEN ? BTN_ACTIVE_STROKE : BTN_INACTIVE_STROKE}
            stroke-width="2" />
          <text
            x={FEWER_X + BTN_W / 2} y={BTN_TEXT_Y}
            text-anchor="middle" dominant-baseline="middle"
            font-family="Arial, sans-serif" font-size="14"
            fill={st.den > MIN_DEN ? BTN_ACTIVE_TEXT : BTN_INACTIVE_TEXT}
          >Fewer</text>
        </g>

        <!-- More button -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <g style="cursor: pointer;" on:click={() => more(mi)}>
          <rect x={MORE_X} y={BTN_Y} width={BTN_W} height={BTN_H} rx={BTN_R} ry={BTN_R}
            fill={st.den < MAX_DEN ? BTN_ACTIVE_FILL : BTN_INACTIVE_FILL}
            stroke={st.den < MAX_DEN ? BTN_ACTIVE_STROKE : BTN_INACTIVE_STROKE}
            stroke-width="2" />
          <text
            x={MORE_X + BTN_W / 2} y={BTN_TEXT_Y}
            text-anchor="middle" dominant-baseline="middle"
            font-family="Arial, sans-serif" font-size="14"
            fill={st.den < MAX_DEN ? BTN_ACTIVE_TEXT : BTN_INACTIVE_TEXT}
          >More</text>
        </g>

        <!-- Reset button -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <g style="cursor: pointer;" on:click={() => reset(mi)}>
          <rect x={RESET_X} y={BTN_Y} width={BTN_W} height={BTN_H} rx={BTN_R} ry={BTN_R}
            fill={BTN_ACTIVE_FILL} stroke={BTN_ACTIVE_STROKE} stroke-width="2" />
          <text
            x={RESET_X + BTN_W / 2} y={BTN_TEXT_Y}
            text-anchor="middle" dominant-baseline="middle"
            font-family="Arial, sans-serif" font-size="14"
            fill={BTN_ACTIVE_TEXT}
          >Reset</text>
        </g>
      </svg>
    {/each}
  </div>
</div>

<style>
  .fraction-model-widget {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    color: #333;
    background: #fff;
    padding: 16px;
    max-width: 640px;
  }

  .question-body {
    margin-bottom: 8px;
    line-height: 24px;
  }

  /* Restore bullet list styles (Tailwind preflight resets them) */
  .question-body :global(ul) {
    list-style: disc;
    margin: 6px 0 10px 0;
    padding-left: 28px;
  }

  .question-body :global(li) {
    margin-bottom: 2px;
    line-height: 24px;
  }

  .math-expr {
    text-align: center;
    margin-bottom: 8px;
  }

  .instruction {
    margin-bottom: 12px;
    line-height: 24px;
  }

  .models-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }
</style>
