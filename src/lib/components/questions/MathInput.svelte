<script>
  export let answer_suffix = null;
  export let keepKeyboardOpen = false;
  export let value = '';

  let el;
  let wrapper;
  let keyboardOpen = false;
  let redoStack = [];

  // Extract a canonical text value from the contenteditable DOM.
  // Plain text → as-is. Fraction widget → "num/den". Mixed → "whole num/den".
  function extractValue() {
    if (!el) return '';
    const parts = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.replace(/\u200B/g, '').trim();
        if (t) parts.push(t);
      } else if (node.classList?.contains('frac-rendered')) {
        // Widget in render mode — read from rendered spans
        const whole = node.querySelector('.frac-r-whole')?.textContent?.trim();
        const num   = node.querySelector('.frac-r-num')?.textContent?.trim();
        const den   = node.querySelector('.frac-r-den')?.textContent?.trim();
        if (num && den) parts.push(whole ? `${whole} ${num}/${den}` : `${num}/${den}`);
      } else if (node.classList?.contains('frac-widget')) {
        // Widget still in edit mode — read directly from inputs
        const whole = node.querySelector('.frac-whole')?.value?.trim();
        const num   = node.querySelector('.frac-num')?.value?.trim();
        const den   = node.querySelector('.frac-den')?.value?.trim();
        if (num && den) parts.push(whole ? `${whole} ${num}/${den}` : `${num}/${den}`);
      }
    }
    value = parts.join(' ');
  }

  // ── Public API (used by ShortAnswerInput popout) ───────────────
  export function getHTML()     { return el ? el.innerHTML : ''; }
  export function reset()       { if (el) { el.innerHTML = ''; } }
  export function showKeyboard(){ keyboardOpen = true; if (el) el.focus(); }

  // ── Math keyboard layout (same as ShortAnswerInput) ────────────
  const keyboardRows = [
    [
      {sym:'7'}, {sym:'8'}, {sym:'9'},
      {sym:'÷'}, {sym:'('}, {sym:')'},
      {sym:'°'}, {sym:'?'},
      {id:'backspace', label:'backspace', wide:true},
    ],
    [
      {sym:'4'}, {sym:'5'}, {sym:'6'},
      {sym:'×'}, {sym:'['}, {sym:']'},
      {sym:'⊥'}, {sym:'∥'},
      {id:'enter', label:'enter', wide:true},
    ],
    [
      {sym:'1'}, {sym:'2'}, {sym:'3'},
      {sym:'−'}, {sym:'<'}, {sym:'>'},
      {id:'frac'}, {id:'blank'}, {id:'up', label:'↑'}, {id:'blank'},
    ],
    [
      {sym:'0'}, {sym:'.'}, {sym:'='}, {sym:'+'},
      {id:'blank'}, {id:'power'}, {id:'mixed'},
      {id:'left', label:'⇐'}, {id:'down', label:'↓'}, {id:'right', label:'⇒'},
    ],
  ];

  // ── Math keyboard handler ──────────────────────────────────────
  function handleMathKey(sym) {
    if (sym.id === 'blank')     { return; }
    if (sym.id === 'frac')      { insertFrac('frac'); return; }
    if (sym.id === 'mixed')     { insertFrac('mixed'); return; }
    if (sym.id === 'power')     { insertPower(); return; }
    if (sym.id === 'backspace') { undo(); return; }
    if (sym.id === 'enter')     { el.focus(); document.execCommand('insertParagraph'); return; }
    if (sym.id === 'left')      { moveCursorInArea('left'); return; }
    if (sym.id === 'right')     { moveCursorInArea('right'); return; }
    if (sym.id === 'up')        { moveCursorInArea('up'); return; }
    if (sym.id === 'down')      { moveCursorInArea('down'); return; }
    insertSym(sym.sym);
  }

  function moveCursorInArea(dir) {
    el.focus();
    const s = window.getSelection();
    if (!s) return;
    if (dir === 'left')  s.modify?.('move', 'backward', 'character');
    if (dir === 'right') s.modify?.('move', 'forward',  'character');
    if (dir === 'up')    s.modify?.('move', 'backward', 'line');
    if (dir === 'down')  s.modify?.('move', 'forward',  'line');
  }

  // ── Focus / blur for keyboard open/close ───────────────────────
  let _observer;
  function mountObserver(node) {
    _observer = new MutationObserver(extractValue);
    _observer.observe(node, { childList: true, subtree: true, characterData: true });
    return { destroy() { _observer?.disconnect(); } };
  }

  function handleFocus() {
    keyboardOpen = true;
  }

  function handleWrapperFocusout(e) {
    if (!keepKeyboardOpen && !wrapper.contains(e.relatedTarget)) {
      keyboardOpen = false;
    }
  }

  // ── Toolbar actions ────────────────────────────────────────────
  function charBeforeCaret() {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || !s.isCollapsed) return null;
    const { startContainer, startOffset } = s.getRangeAt(0);
    if (startContainer.nodeType === Node.TEXT_NODE && startOffset > 0) {
      const ch = startContainer.textContent[startOffset - 1];
      return ch === '\u200B' ? null : ch;
    }
    return null;
  }

  function renderedFracBeforeCaret() {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return null;
    const { startContainer, startOffset } = s.getRangeAt(0);
    let candidate = null;
    if (startContainer === el && startOffset > 0) {
      candidate = el.childNodes[startOffset - 1];
    } else if (startContainer.nodeType === Node.TEXT_NODE) {
      if (startOffset === 0) {
        candidate = startContainer.previousSibling;
      } else if (startOffset === 1 && startContainer.textContent === '\u200B') {
        candidate = startContainer.previousSibling;
      }
    }
    return candidate?.classList?.contains('frac-rendered') ? candidate : null;
  }

  function undo() {
    const active = document.activeElement;
    if (active?.classList.contains('frac-input')) {
      active.selectionStart = active.selectionEnd = active.value.length;
      if (active.value.length > 0) redoStack.push(active.value[active.value.length - 1]);
      deleteInInput(active, 'back');
    } else {
      el.focus();
      const frac = renderedFracBeforeCaret();
      if (frac) {
        frac.dispatchEvent(new CustomEvent('reopen-edit'));
      } else {
        const ch = charBeforeCaret();
        if (ch !== null) redoStack.push(ch);
        document.execCommand('delete', false);
      }
    }
  }

  function redo() {
    if (redoStack.length === 0) return;
    el.focus();
    const ch = redoStack.pop();
    document.execCommand('insertText', false, ch);
  }

  function deleteInInput(inp, dir) {
    const s = inp.selectionStart, e = inp.selectionEnd;
    if (s !== e) {
      inp.value = inp.value.slice(0, s) + inp.value.slice(e);
      inp.selectionStart = inp.selectionEnd = s;
    } else if (dir === 'back' && s > 0) {
      inp.value = inp.value.slice(0, s - 1) + inp.value.slice(s);
      inp.selectionStart = inp.selectionEnd = s - 1;
    } else if (dir === 'forward' && s < inp.value.length) {
      inp.value = inp.value.slice(0, s) + inp.value.slice(s + 1);
      inp.selectionStart = inp.selectionEnd = s;
    }
    inp.style.borderColor = inp.value.length > 0 ? 'transparent' : '';
  }

  // ── Symbol / fraction insertion ────────────────────────────────
  function insertSym(sym) {
    redoStack = [];
    const active = document.activeElement;
    if (active && active.classList.contains('frac-input')) {
      const s = active.selectionStart, e = active.selectionEnd;
      active.value = active.value.slice(0, s) + sym + active.value.slice(e);
      active.selectionStart = active.selectionEnd = s + sym.length;
    } else {
      el.focus();
      document.execCommand('insertText', false, sym);
    }
  }

  function insertFrac(type) {
    redoStack = [];
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return;
    const range = s.getRangeAt(0);
    range.deleteContents();
    const widget = buildWidget(type);
    range.insertNode(widget);
    widget.after(document.createTextNode('\u200B'));
    widget.querySelector('input')?.focus();
  }

  function insertPower() {
    redoStack = [];
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return;
    const range = s.getRangeAt(0);
    range.deleteContents();
    const widget = buildPowerWidget();
    range.insertNode(widget);
    widget.after(document.createTextNode('\u200B'));
    widget.querySelector('input')?.focus();
  }

  // ── Fraction widget builder ────────────────────────────────────
  function buildWidget(type, { initialVals = [], initialRendered = false } = {}) {
    const wrapEl = document.createElement('span');
    wrapEl.className = 'frac-widget' + (type === 'mixed' ? ' mixed-widget' : '');
    wrapEl.contentEditable = 'false';

    let currentInputs = [];
    let isRendered = false;
    let lastVals = [];

    function enterEditMode(restored = []) {
      isRendered = false;
      wrapEl.innerHTML = '';
      currentInputs = [];

      if (type === 'mixed') {
        const whole = makeInput('frac-whole');
        restoreBox(whole, restored[0]);
        wrapEl.appendChild(whole);
        currentInputs.push(whole);
      }

      const stack = document.createElement('span');
      stack.className = 'frac-stack';
      const num = makeInput('frac-num');
      const bar = document.createElement('span');
      bar.className = 'frac-bar';
      const den = makeInput('frac-den');

      const numIdx = type === 'mixed' ? 1 : 0;
      const denIdx = type === 'mixed' ? 2 : 1;
      restoreBox(num, restored[numIdx]);
      restoreBox(den, restored[denIdx]);

      stack.append(num, bar, den);
      wrapEl.appendChild(stack);
      currentInputs.push(num, den);

      currentInputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.style.borderColor = inp.value.length > 0 ? 'transparent' : '';
          extractValue();
        });
        inp.addEventListener('keydown', (e) => {
          const atStart = inp.selectionStart === 0;
          const atEnd   = inp.selectionStart === inp.value.length;
          const goNext  = (e.key === 'ArrowRight' && atEnd)   || (e.key === 'Tab' && !e.shiftKey);
          const goPrev  = (e.key === 'ArrowLeft'  && atStart) || (e.key === 'Tab' && e.shiftKey);

          if (goNext) {
            e.preventDefault();
            if (i < currentInputs.length - 1) {
              const next = currentInputs[i + 1];
              next.focus();
              next.selectionStart = next.selectionEnd = next.value.length;
            } else { moveCaret('after'); }
          } else if (goPrev) {
            e.preventDefault();
            if (i > 0) {
              const prev = currentInputs[i - 1];
              prev.focus();
              prev.selectionStart = prev.selectionEnd = prev.value.length;
            } else {
              currentInputs.every(b => b.value === '') ? removeWidget() : moveCaret('before');
            }
          } else if (e.key === 'Backspace' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
            e.preventDefault();
            if (i === 0) {
              inp.value === '' ? removeWidget() : moveCaret('before');
            } else {
              const prev = currentInputs[i - 1];
              prev.focus();
              prev.selectionStart = prev.selectionEnd = prev.value.length;
            }
          } else if (e.key === 'Backspace') {
            const s = inp.selectionStart, en = inp.selectionEnd;
            if (s === en && s > 0) redoStack.push(inp.value[s - 1]);
            else redoStack = [];
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            redoStack = [];
          }
        });
      });
    }

    function restoreBox(inp, val) {
      if (val) { inp.value = val; inp.style.borderColor = 'transparent'; }
    }

    function removeWidget() {
      const r = document.createRange();
      r.setStartBefore(wrapEl);
      r.collapse(true);
      const next = wrapEl.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u200B') next.remove();
      wrapEl.remove();
      el.focus();
      sel().removeAllRanges();
      sel().addRange(r);
    }

    function enterRenderMode(vals) {
      lastVals = vals;
      isRendered = true;
      wrapEl.innerHTML = '';
      wrapEl.classList.add('frac-rendered');

      if (type === 'mixed') {
        const whole = document.createElement('span');
        whole.className = 'frac-r-whole';
        whole.textContent = vals[0];
        wrapEl.appendChild(whole);
        wrapEl.appendChild(buildRenderedStack(vals[1], vals[2]));
      } else {
        wrapEl.appendChild(buildRenderedStack(vals[0], vals[1]));
      }
    }

    function buildRenderedStack(num, den) {
      const stack = document.createElement('span');
      stack.className = 'frac-r-stack';
      const n = document.createElement('span');
      n.className = 'frac-r-num';
      n.textContent = num;
      const bar = document.createElement('span');
      bar.className = 'frac-r-bar';
      const d = document.createElement('span');
      d.className = 'frac-r-den';
      d.textContent = den;
      stack.append(n, bar, d);
      return stack;
    }

    function moveCaret(dir) {
      const r = document.createRange();
      if (dir === 'after') {
        const after = wrapEl.nextSibling;
        if (after) { r.setStart(after, Math.min(1, after.length ?? 0)); }
        else { r.setStartAfter(wrapEl); }
      } else {
        r.setStartBefore(wrapEl);
      }
      r.collapse(true);
      sel().removeAllRanges();
      sel().addRange(r);
      el.focus();
    }

    wrapEl.addEventListener('focusout', (e) => {
      if (!isRendered && !wrapEl.contains(e.relatedTarget)) {
        const vals = currentInputs.map(inp => inp.value.trim());
        if (vals.every(v => v.length > 0)) enterRenderMode(vals);
      }
    });

    wrapEl.addEventListener('click', (e) => {
      if (isRendered) {
        e.stopPropagation();
        enterEditMode(lastVals);
        const first = currentInputs[0];
        if (first) { first.focus(); first.selectionStart = first.selectionEnd = first.value.length; }
      }
    });

    wrapEl.addEventListener('reopen-edit', () => {
      if (isRendered) {
        enterEditMode(lastVals);
        const last = currentInputs[currentInputs.length - 1];
        if (last) { last.focus(); last.selectionStart = last.selectionEnd = last.value.length; }
      }
    });

    if (initialRendered && initialVals.every(v => v)) {
      enterRenderMode(initialVals);
    } else {
      enterEditMode(initialVals);
    }

    return wrapEl;
  }

  // ── Power (exponent) widget builder ───────────────────────────
  function buildPowerWidget({ initialVals = [], initialRendered = false } = {}) {
    const wrapEl = document.createElement('span');
    wrapEl.className = 'power-widget';
    wrapEl.contentEditable = 'false';

    let currentInputs = [];
    let isRendered = false;
    let lastVals = [];

    function enterEditMode(restored = []) {
      isRendered = false;
      wrapEl.classList.remove('frac-rendered');
      wrapEl.innerHTML = '';
      currentInputs = [];

      const baseInp = makeInput('power-base-inp');
      if (restored[0]) { baseInp.value = restored[0]; baseInp.style.borderColor = 'transparent'; }

      const expWrap = document.createElement('span');
      expWrap.className = 'power-exp-wrap';
      const expInp = makeInput('power-exp-inp');
      if (restored[1]) { expInp.value = restored[1]; expInp.style.borderColor = 'transparent'; }
      expWrap.appendChild(expInp);

      wrapEl.appendChild(baseInp);
      wrapEl.appendChild(expWrap);
      currentInputs = [baseInp, expInp];

      currentInputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.style.borderColor = inp.value.length > 0 ? 'transparent' : '';
        });
        inp.addEventListener('keydown', (e) => {
          const atStart = inp.selectionStart === 0;
          const atEnd   = inp.selectionStart === inp.value.length;
          const goNext  = (e.key === 'ArrowRight' && atEnd)   || (e.key === 'Tab' && !e.shiftKey);
          const goPrev  = (e.key === 'ArrowLeft'  && atStart) || (e.key === 'Tab' && e.shiftKey);

          if (goNext) {
            e.preventDefault();
            if (i < currentInputs.length - 1) {
              const next = currentInputs[i + 1];
              next.focus();
              next.selectionStart = next.selectionEnd = next.value.length;
            } else { moveCaret('after'); }
          } else if (goPrev) {
            e.preventDefault();
            if (i > 0) {
              const prev = currentInputs[i - 1];
              prev.focus();
              prev.selectionStart = prev.selectionEnd = prev.value.length;
            } else {
              currentInputs.every(b => b.value === '') ? removeWidget() : moveCaret('before');
            }
          } else if (e.key === 'Backspace' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
            e.preventDefault();
            if (i === 0) {
              inp.value === '' ? removeWidget() : moveCaret('before');
            } else {
              const prev = currentInputs[i - 1];
              prev.focus();
              prev.selectionStart = prev.selectionEnd = prev.value.length;
            }
          } else if (e.key === 'Backspace') {
            const s = inp.selectionStart, en = inp.selectionEnd;
            if (s === en && s > 0) redoStack.push(inp.value[s - 1]);
            else redoStack = [];
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            redoStack = [];
          }
        });
      });
    }

    function removeWidget() {
      const r = document.createRange();
      r.setStartBefore(wrapEl);
      r.collapse(true);
      const next = wrapEl.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u200B') next.remove();
      wrapEl.remove();
      el.focus();
      sel().removeAllRanges();
      sel().addRange(r);
    }

    function enterRenderMode(vals) {
      lastVals = vals;
      isRendered = true;
      wrapEl.innerHTML = '';
      wrapEl.classList.add('frac-rendered');

      const base = document.createElement('span');
      base.className = 'power-r-base';
      base.textContent = vals[0];
      const exp = document.createElement('sup');
      exp.className = 'power-r-exp';
      exp.textContent = vals[1];
      wrapEl.appendChild(base);
      wrapEl.appendChild(exp);
    }

    function moveCaret(dir) {
      const r = document.createRange();
      if (dir === 'after') {
        const after = wrapEl.nextSibling;
        if (after) { r.setStart(after, Math.min(1, after.length ?? 0)); }
        else { r.setStartAfter(wrapEl); }
      } else {
        r.setStartBefore(wrapEl);
      }
      r.collapse(true);
      sel().removeAllRanges();
      sel().addRange(r);
      el.focus();
    }

    wrapEl.addEventListener('focusout', (e) => {
      if (!isRendered && !wrapEl.contains(e.relatedTarget)) {
        const vals = currentInputs.map(inp => inp.value.trim());
        if (vals.every(v => v.length > 0)) enterRenderMode(vals);
      }
    });

    wrapEl.addEventListener('click', (e) => {
      if (isRendered) {
        e.stopPropagation();
        enterEditMode(lastVals);
        const first = currentInputs[0];
        if (first) { first.focus(); first.selectionStart = first.selectionEnd = first.value.length; }
      }
    });

    wrapEl.addEventListener('reopen-edit', () => {
      if (isRendered) {
        enterEditMode(lastVals);
        const last = currentInputs[currentInputs.length - 1];
        if (last) { last.focus(); last.selectionStart = last.selectionEnd = last.value.length; }
      }
    });

    if (initialRendered && initialVals.every(v => v)) {
      enterRenderMode(initialVals);
    } else {
      enterEditMode(initialVals);
    }

    return wrapEl;
  }

  function makeInput(cls) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'frac-input ' + cls;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    return inp;
  }

  function sel() { return window.getSelection(); }

  function handleKeydown(e) {
    if (e.key === 'Backspace') {
      const frac = renderedFracBeforeCaret();
      if (frac) {
        e.preventDefault();
        frac.dispatchEvent(new CustomEvent('reopen-edit'));
      } else {
        const s = window.getSelection();
        if (s?.isCollapsed) {
          const ch = charBeforeCaret();
          if (ch !== null) redoStack.push(ch);
        } else {
          redoStack = [];
        }
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      redoStack = [];
    }
  }
</script>

<div class="math-input-wrapper" bind:this={wrapper} on:focusout={handleWrapperFocusout}>
  <div class="input-row">
    <div
      bind:this={el}
      class="math-input-area"
      contenteditable="true"
      role="textbox"
      aria-multiline="false"
      tabindex="0"
      spellcheck="false"
      use:mountObserver
      on:focus={handleFocus}
      on:input={extractValue}
      on:keydown={handleKeydown}
    ></div>
    {#if answer_suffix}
      <span class="suffix-label">{answer_suffix}</span>
    {/if}
  </div>

  {#if keyboardOpen}
  <div class="math-keyboard">
    {#each keyboardRows as row}
      {#each row as sym}
        <button class="math-key" class:wide={sym.wide} class:blank={sym.id === 'blank'}
          on:mousedown|preventDefault
          on:click={() => handleMathKey(sym)}>
          {#if sym.id === 'blank'}
            &nbsp;
          {:else if sym.id === 'frac'}
            <span class="key-frac">
              <span class="kf-num">x</span>
              <span class="kf-bar"></span>
              <span class="kf-den">y</span>
            </span>
          {:else if sym.id === 'mixed'}
            <span class="key-mixed">
              <span class="kf-whole">z</span>
              <span class="key-frac">
                <span class="kf-num">x</span>
                <span class="kf-bar"></span>
                <span class="kf-den">y</span>
              </span>
            </span>
          {:else if sym.id === 'power'}
            <span>x<sup>a</sup></span>
          {:else if sym.wide}
            <em>{sym.label}</em>
          {:else if sym.label}
            {sym.label}
          {:else}
            {sym.sym}
          {/if}
        </button>
      {/each}
    {/each}
  </div>
  {/if}
</div>

<style>
  .math-input-wrapper {
    display: flex;
    flex-direction: column;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .math-input-area {
    min-height: 36px;
    padding: 4px 8px;
    border: 1px dotted #888;
    border-radius: 2px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    outline: none;
    cursor: text;
    background: #fff;
    flex: 1;
  }
  .math-input-area:focus {
    border-color: #66afe9;
    border-style: solid;
    box-shadow: 0 0 0 2px rgba(102,175,233,.35);
  }

  .suffix-label {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    color: #333;
    white-space: nowrap;
  }

  /* ── Math keyboard ── */
  .math-keyboard {
    display: grid;
    grid-template-columns: repeat(10, 40px);
    gap: 3px;
    background: linear-gradient(to bottom, rgba(234,244,247,1) 0%, rgba(255,255,255,1) 73%);
    border: 1px solid #ddd;
    border-top: none;
    padding: 10px 12px 12px;
  }

  .math-key {
    grid-column: span 1;
    border: 1px solid #e7e7e7;
    background: linear-gradient(to top, #f7f7f7 20%, #fff 96%);
    height: 34px;
    padding: 2px 4px;
    text-align: center;
    cursor: pointer;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    color: #333;
  }
  .math-key:hover  { border-color: #ccc; background: #fff; }
  .math-key:active { background: #eee; }
  .math-key.wide   { grid-column: span 2; font-style: italic; }
  .math-key.blank  { background: transparent; border-color: transparent; cursor: default; pointer-events: none; }

  /* ── Special key labels (fraction / mixed / power) ── */
  .key-frac {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
    font-style: normal;
  }
  .kf-num, .kf-den { font-size: 9px; line-height: 1; }
  .kf-bar {
    width: 10px;
    border-top: 1px solid currentColor;
    margin: 1px 0;
  }
  .key-mixed {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-style: normal;
  }
  .kf-whole { font-size: 12px; }

  /* ═══════════════════════════════════════════════════════════════
     FRACTION WIDGETS (JS-inserted nodes, require :global)
     ═══════════════════════════════════════════════════════════════ */
  .math-input-area :global(.frac-widget) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: middle;
    margin: 0 2px;
  }
  .math-input-area :global(.frac-stack) {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
  }
  .math-input-area :global(.frac-bar) {
    display: block;
    border-top: 1px solid #000;
    margin: 1px 0;
  }
  .math-input-area :global(.frac-input) {
    width: 36px;
    height: 24px;
    padding: 0 2px;
    border: 1px dotted #000;
    text-align: center;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1;
    box-sizing: border-box;
    outline: none;
    background: #fff;
    border-radius: 0;
  }
  .math-input-area :global(.frac-input:focus) { background: #ddeeff; }
  .math-input-area :global(.frac-whole) {
    width: 36px;
    height: 51px;
  }
  .math-input-area :global(.frac-r-stack) {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    vertical-align: middle;
    line-height: 1.1;
  }
  .math-input-area :global(.frac-r-num),
  .math-input-area :global(.frac-r-den) {
    font-size: 0.72em;
    padding: 0 1px;
    text-align: center;
  }
  .math-input-area :global(.frac-r-bar) {
    display: block;
    width: 100%;
    border-top: 1px solid currentColor;
    margin: 1px 0;
  }
  .math-input-area :global(.frac-r-whole) {
    vertical-align: middle;
    margin-right: 2px;
  }
  .math-input-area :global(.frac-widget.frac-rendered) { cursor: pointer; }
  .math-input-area :global(.frac-widget.frac-rendered:hover) {
    outline: 1px dashed #aaa;
    border-radius: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════
     POWER (EXPONENT) WIDGET (JS-inserted nodes, require :global)
     ═══════════════════════════════════════════════════════════════ */
  .math-input-area :global(.power-widget) {
    display: inline;
    margin: 0 2px;
  }
  .math-input-area :global(.power-exp-wrap) {
    display: inline-block;
    vertical-align: super;
    line-height: 1;
    margin-left: 1px;
  }
  .math-input-area :global(.frac-input.power-base-inp) {
    width: 36px;
    height: 24px;
  }
  .math-input-area :global(.frac-input.power-exp-inp) {
    width: 18px;
    height: 14px;
    font-size: 10px;
    padding: 0 1px;
  }
  .math-input-area :global(.power-widget.frac-rendered) { cursor: pointer; }
  .math-input-area :global(.power-widget.frac-rendered:hover) {
    outline: 1px dashed #aaa;
    border-radius: 2px;
  }
</style>
