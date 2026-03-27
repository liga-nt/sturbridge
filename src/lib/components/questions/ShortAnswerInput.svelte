<script>
  import { tick } from 'svelte';
  import MathInput from '$lib/components/questions/MathInput.svelte';

  let el;
  let redoStack = [];
  export let value = '';
  let boldActive = false, italicActive = false, underlineActive = false;

  // ── Math popout state ──────────────────────────────────────────
  let mathPopoutOpen = false;
  let savedRange = null;
  let mathInputComp;

  function openMathPopout() {
    const s = window.getSelection();
    if (s && s.rangeCount > 0) {
      try { savedRange = s.getRangeAt(0).cloneRange(); } catch(e) {}
    }
    mathPopoutOpen = true;
    tick().then(() => mathInputComp?.showKeyboard());
  }

  async function saveMath() {
    const html = mathInputComp?.getHTML() ?? '';
    const range = savedRange;
    savedRange = null;
    mathPopoutOpen = false;
    mathInputComp?.reset();
    await tick();

    const cleanHtml = html.replace(/\u200B/g, '');
    if (!cleanHtml.trim()) { el.focus(); return; }

    el.focus();

    const sel = window.getSelection();
    let r;
    if (range) {
      try {
        sel.removeAllRanges();
        sel.addRange(range);
        r = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      } catch(e) {}
    }
    if (!r) {
      r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
    }

    r.deleteContents();
    const frag = r.createContextualFragment(cleanHtml);
    const lastNode = frag.lastChild;
    r.insertNode(frag);
    if (lastNode) {
      r.setStartAfter(lastNode);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  async function cancelMath() {
    const range = savedRange;
    savedRange = null;
    mathPopoutOpen = false;
    mathInputComp?.reset();
    await tick();
    el.focus();
    if (range) {
      try { window.getSelection().removeAllRanges(); window.getSelection().addRange(range); } catch(e) {}
    }
  }

  // ── Formatting functions ───────────────────────────────────────
  function bold()               { el.focus(); document.execCommand('bold');                            updateFormatState(); }
  function italic()             { el.focus(); document.execCommand('italic');                          updateFormatState(); }
  function underline()          { el.focus(); document.execCommand('underline');                       updateFormatState(); }
  function insertBulletList()   { el.focus(); document.execCommand('insertUnorderedList'); }
  function insertNumberedList() { el.focus(); document.execCommand('insertOrderedList'); }
  function indentText()         { el.focus(); document.execCommand('indent'); }
  function outdentText()        { el.focus(); document.execCommand('outdent'); }
  function lineIndent()         { el.focus(); document.execCommand('insertHTML', false, '\u00A0\u00A0\u00A0\u00A0'); }
  function updateFormatState() {
    boldActive      = document.queryCommandState('bold');
    italicActive    = document.queryCommandState('italic');
    underlineActive = document.queryCommandState('underline');
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

  function clear() {
    el.innerHTML = '';
    el.focus();
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

  function insertGeo(symbol) {
    redoStack = [];
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return;
    const range = s.getRangeAt(0);
    range.deleteContents();
    const widget = buildGeoWidget(symbol);
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
    const wrapper = document.createElement('span');
    wrapper.className = 'frac-widget' + (type === 'mixed' ? ' mixed-widget' : '');
    wrapper.contentEditable = 'false';

    let currentInputs = [];
    let isRendered = false;
    let lastVals = [];

    function enterEditMode(restored = []) {
      isRendered = false;
      wrapper.innerHTML = '';
      currentInputs = [];

      if (type === 'mixed') {
        const whole = makeInput('frac-whole');
        restoreBox(whole, restored[0]);
        wrapper.appendChild(whole);
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
      wrapper.appendChild(stack);
      currentInputs.push(num, den);

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

    function restoreBox(inp, val) {
      if (val) { inp.value = val; inp.style.borderColor = 'transparent'; }
    }

    function removeWidget() {
      const r = document.createRange();
      r.setStartBefore(wrapper);
      r.collapse(true);
      const next = wrapper.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u200B') next.remove();
      wrapper.remove();
      el.focus();
      sel().removeAllRanges();
      sel().addRange(r);
    }

    function enterRenderMode(vals) {
      lastVals = vals;
      isRendered = true;
      wrapper.innerHTML = '';
      wrapper.classList.add('frac-rendered');

      if (type === 'mixed') {
        const whole = document.createElement('span');
        whole.className = 'frac-r-whole';
        whole.textContent = vals[0];
        wrapper.appendChild(whole);
        wrapper.appendChild(buildRenderedStack(vals[1], vals[2]));
      } else {
        wrapper.appendChild(buildRenderedStack(vals[0], vals[1]));
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
        const after = wrapper.nextSibling;
        if (after) { r.setStart(after, Math.min(1, after.length ?? 0)); }
        else { r.setStartAfter(wrapper); }
      } else {
        r.setStartBefore(wrapper);
      }
      r.collapse(true);
      sel().removeAllRanges();
      sel().addRange(r);
      el.focus();
    }

    wrapper.addEventListener('focusout', (e) => {
      if (!isRendered && !wrapper.contains(e.relatedTarget)) {
        const vals = currentInputs.map(inp => inp.value.trim());
        if (vals.every(v => v.length > 0)) enterRenderMode(vals);
      }
    });

    wrapper.addEventListener('click', (e) => {
      if (isRendered) {
        e.stopPropagation();
        enterEditMode(lastVals);
        const first = currentInputs[0];
        if (first) { first.focus(); first.selectionStart = first.selectionEnd = first.value.length; }
      }
    });

    wrapper.addEventListener('reopen-edit', () => {
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

    return wrapper;
  }

  // ── Geometry (ray/line/segment) widget builder ────────────────
  function buildGeoWidget(symbol) {
    const wrapper = document.createElement('span');
    wrapper.className = 'geo-widget';
    wrapper.contentEditable = 'false';

    let currentInput = null;
    let isRendered = false;
    let lastVal = '';

    function enterEditMode(restored = '') {
      isRendered = false;
      wrapper.classList.remove('frac-rendered');
      wrapper.innerHTML = '';

      const symSpan = document.createElement('span');
      symSpan.className = 'geo-sym-label';
      symSpan.textContent = symbol;

      const inp = makeInput('geo-inp');
      if (restored) { inp.value = restored; inp.style.borderColor = 'transparent'; }

      wrapper.appendChild(symSpan);
      wrapper.appendChild(inp);
      currentInput = inp;

      inp.addEventListener('input', () => {
        inp.style.borderColor = inp.value.length > 0 ? 'transparent' : '';
      });
      inp.addEventListener('keydown', (e) => {
        const atStart = inp.selectionStart === 0;
        const atEnd   = inp.selectionStart === inp.value.length;

        if ((e.key === 'ArrowRight' && atEnd) || (e.key === 'Tab' && !e.shiftKey)) {
          e.preventDefault();
          moveCaret('after');
        } else if ((e.key === 'ArrowLeft' && atStart) || (e.key === 'Tab' && e.shiftKey)) {
          e.preventDefault();
          inp.value === '' ? removeWidget() : moveCaret('before');
        } else if (e.key === 'Backspace' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
          e.preventDefault();
          removeWidget();
        } else if (e.key === 'Backspace') {
          const s = inp.selectionStart, en = inp.selectionEnd;
          if (s === en && s > 0) redoStack.push(inp.value[s - 1]);
          else redoStack = [];
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          redoStack = [];
        }
      });
    }

    function removeWidget() {
      const r = document.createRange();
      r.setStartBefore(wrapper);
      r.collapse(true);
      const next = wrapper.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u200B') next.remove();
      wrapper.remove();
      el.focus();
      sel().removeAllRanges();
      sel().addRange(r);
    }

    function enterRenderMode(val) {
      lastVal = val;
      isRendered = true;
      wrapper.innerHTML = '';
      wrapper.classList.add('frac-rendered');

      const symSpan = document.createElement('span');
      symSpan.className = 'geo-r-sym';
      symSpan.textContent = symbol;

      const textSpan = document.createElement('span');
      textSpan.className = 'geo-r-text';
      textSpan.textContent = val;

      wrapper.appendChild(symSpan);
      wrapper.appendChild(textSpan);
    }

    function moveCaret(dir) {
      const r = document.createRange();
      if (dir === 'after') {
        const after = wrapper.nextSibling;
        if (after) { r.setStart(after, Math.min(1, after.length ?? 0)); }
        else { r.setStartAfter(wrapper); }
      } else {
        r.setStartBefore(wrapper);
      }
      r.collapse(true);
      sel().removeAllRanges();
      sel().addRange(r);
      el.focus();
    }

    wrapper.addEventListener('focusout', (e) => {
      if (!isRendered && !wrapper.contains(e.relatedTarget)) {
        const val = currentInput?.value.trim() ?? '';
        if (val.length > 0) enterRenderMode(val);
      }
    });

    wrapper.addEventListener('click', (e) => {
      if (isRendered) {
        e.stopPropagation();
        enterEditMode(lastVal);
        if (currentInput) { currentInput.focus(); currentInput.selectionStart = currentInput.selectionEnd = currentInput.value.length; }
      }
    });

    wrapper.addEventListener('reopen-edit', () => {
      if (isRendered) {
        enterEditMode(lastVal);
        if (currentInput) { currentInput.focus(); currentInput.selectionStart = currentInput.selectionEnd = currentInput.value.length; }
      }
    });

    enterEditMode();
    return wrapper;
  }

  // ── Power (exponent) widget builder ───────────────────────────
  function buildPowerWidget({ initialVals = [], initialRendered = false } = {}) {
    const wrapper = document.createElement('span');
    wrapper.className = 'power-widget';
    wrapper.contentEditable = 'false';

    let currentInputs = [];
    let isRendered = false;
    let lastVals = [];

    function enterEditMode(restored = []) {
      isRendered = false;
      wrapper.classList.remove('frac-rendered');
      wrapper.innerHTML = '';
      currentInputs = [];

      const baseInp = makeInput('power-base-inp');
      if (restored[0]) { baseInp.value = restored[0]; baseInp.style.borderColor = 'transparent'; }

      const expWrap = document.createElement('span');
      expWrap.className = 'power-exp-wrap';
      const expInp = makeInput('power-exp-inp');
      if (restored[1]) { expInp.value = restored[1]; expInp.style.borderColor = 'transparent'; }
      expWrap.appendChild(expInp);

      wrapper.appendChild(baseInp);
      wrapper.appendChild(expWrap);
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
      r.setStartBefore(wrapper);
      r.collapse(true);
      const next = wrapper.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u200B') next.remove();
      wrapper.remove();
      el.focus();
      sel().removeAllRanges();
      sel().addRange(r);
    }

    function enterRenderMode(vals) {
      lastVals = vals;
      isRendered = true;
      wrapper.innerHTML = '';
      wrapper.classList.add('frac-rendered');

      const base = document.createElement('span');
      base.className = 'power-r-base';
      base.textContent = vals[0];
      const exp = document.createElement('sup');
      exp.className = 'power-r-exp';
      exp.textContent = vals[1];
      wrapper.appendChild(base);
      wrapper.appendChild(exp);
    }

    function moveCaret(dir) {
      const r = document.createRange();
      if (dir === 'after') {
        const after = wrapper.nextSibling;
        if (after) { r.setStart(after, Math.min(1, after.length ?? 0)); }
        else { r.setStartAfter(wrapper); }
      } else {
        r.setStartBefore(wrapper);
      }
      r.collapse(true);
      sel().removeAllRanges();
      sel().addRange(r);
      el.focus();
    }

    wrapper.addEventListener('focusout', (e) => {
      if (!isRendered && !wrapper.contains(e.relatedTarget)) {
        const vals = currentInputs.map(inp => inp.value.trim());
        if (vals.every(v => v.length > 0)) enterRenderMode(vals);
      }
    });

    wrapper.addEventListener('click', (e) => {
      if (isRendered) {
        e.stopPropagation();
        enterEditMode(lastVals);
        const first = currentInputs[0];
        if (first) { first.focus(); first.selectionStart = first.selectionEnd = first.value.length; }
      }
    });

    wrapper.addEventListener('reopen-edit', () => {
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

    return wrapper;
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

  // ── Shared keydown handler for the contenteditable ─────────────
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

<!-- ═══════════════════════════════════════════════════════════════
     2025 TESTNAV STYLE — flat toolbar + below-area math keyboard
     ═══════════════════════════════════════════════════════════════ -->
<div class="input-widget">

  <!-- Toolbar -->
  <div class="toolbar">
    <button class="tool-btn" title="Undo (Ctrl+Z)" aria-label="Undo"
      on:mousedown|preventDefault on:click={undo}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true" style="transform:scaleX(-1)">
        <path d="M371.8 82.4C359.8 87.4 352 99 352 112L352 192L240 192C142.8 192 64 270.8 64 368C64 481.3 145.5 531.9 164.2 542.1C166.7 543.5 169.5 544 172.3 544C183.2 544 192 535.1 192 524.3C192 516.8 187.7 509.9 182.2 504.8C172.8 496 160 478.4 160 448.1C160 395.1 203 352.1 256 352.1L352 352.1L352 432.1C352 445 359.8 456.7 371.8 461.7C383.8 466.7 397.5 463.9 406.7 454.8L566.7 294.8C579.2 282.3 579.2 262 566.7 249.5L406.7 89.5C397.5 80.3 383.8 77.6 371.8 82.6z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Redo (Ctrl+Y)" aria-label="Redo"
      on:mousedown|preventDefault on:click={redo}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M371.8 82.4C359.8 87.4 352 99 352 112L352 192L240 192C142.8 192 64 270.8 64 368C64 481.3 145.5 531.9 164.2 542.1C166.7 543.5 169.5 544 172.3 544C183.2 544 192 535.1 192 524.3C192 516.8 187.7 509.9 182.2 504.8C172.8 496 160 478.4 160 448.1C160 395.1 203 352.1 256 352.1L352 352.1L352 432.1C352 445 359.8 456.7 371.8 461.7C383.8 466.7 397.5 463.9 406.7 454.8L566.7 294.8C579.2 282.3 579.2 262 566.7 249.5L406.7 89.5C397.5 80.3 383.8 77.6 371.8 82.6z" fill="currentColor"/>
      </svg>
    </button>

    <div class="toolbar-sep"></div>

    <button class="tool-btn" title="Bold (Ctrl+B)" aria-label="Bold"
      class:active={boldActive}
      on:mousedown|preventDefault on:click={bold}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M160 96C142.3 96 128 110.3 128 128C128 145.7 142.3 160 160 160L192 160L192 480L160 480C142.3 480 128 494.3 128 512C128 529.7 142.3 544 160 544L384 544C454.7 544 512 486.7 512 416C512 369.5 487.2 328.7 450 306.3C468.7 284 480 255.3 480 224C480 153.3 422.7 96 352 96L160 96zM416 224C416 259.3 387.3 288 352 288L256 288L256 160L352 160C387.3 160 416 188.7 416 224zM256 480L256 352L384 352C419.3 352 448 380.7 448 416C448 451.3 419.3 480 384 480L256 480z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Italic (Ctrl+I)" aria-label="Italic"
      class:active={italicActive}
      on:mousedown|preventDefault on:click={italic}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M256 128C256 110.3 270.3 96 288 96L480 96C497.7 96 512 110.3 512 128C512 145.7 497.7 160 480 160L421.3 160L288 480L352 480C369.7 480 384 494.3 384 512C384 529.7 369.7 544 352 544L160 544C142.3 544 128 529.7 128 512C128 494.3 142.3 480 160 480L218.7 480L352 160L288 160C270.3 160 256 145.7 256 128z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Underline (Ctrl+U)" aria-label="Underline"
      class:active={underlineActive}
      on:mousedown|preventDefault on:click={underline}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M128 96C128 78.3 142.3 64 160 64L224 64C241.7 64 256 78.3 256 96C256 113.7 241.7 128 224 128L224 288C224 341 267 384 320 384C373 384 416 341 416 288L416 128C398.3 128 384 113.7 384 96C384 78.3 398.3 64 416 64L480 64C497.7 64 512 78.3 512 96C512 113.7 497.7 128 480 128L480 288C480 376.4 408.4 448 320 448C231.6 448 160 376.4 160 288L160 128C142.3 128 128 113.7 128 96zM128 544C128 526.3 142.3 512 160 512L480 512C497.7 512 512 526.3 512 544C512 561.7 497.7 576 480 576L160 576C142.3 576 128 561.7 128 544z" fill="currentColor"/>
      </svg>
    </button>

    <div class="toolbar-sep"></div>

    <button class="tool-btn" title="Bullet List" aria-label="Bullet list"
      on:mousedown|preventDefault on:click={insertBulletList}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M112 208C138.5 208 160 186.5 160 160C160 133.5 138.5 112 112 112C85.5 112 64 133.5 64 160C64 186.5 85.5 208 112 208zM256 128C238.3 128 224 142.3 224 160C224 177.7 238.3 192 256 192L544 192C561.7 192 576 177.7 576 160C576 142.3 561.7 128 544 128L256 128zM256 288C238.3 288 224 302.3 224 320C224 337.7 238.3 352 256 352L544 352C561.7 352 576 337.7 576 320C576 302.3 561.7 288 544 288L256 288zM256 448C238.3 448 224 462.3 224 480C224 497.7 238.3 512 256 512L544 512C561.7 512 576 497.7 576 480C576 462.3 561.7 448 544 448L256 448zM112 528C138.5 528 160 506.5 160 480C160 453.5 138.5 432 112 432C85.5 432 64 453.5 64 480C64 506.5 85.5 528 112 528zM160 320C160 293.5 138.5 272 112 272C85.5 272 64 293.5 64 320C64 346.5 85.5 368 112 368C138.5 368 160 346.5 160 320z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Numbered List" aria-label="Numbered list"
      on:mousedown|preventDefault on:click={insertNumberedList}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M64 136C64 122.8 74.7 112 88 112L136 112C149.3 112 160 122.7 160 136L160 240L184 240C197.3 240 208 250.7 208 264C208 277.3 197.3 288 184 288L88 288C74.7 288 64 277.3 64 264C64 250.7 74.7 240 88 240L112 240L112 160L88 160C74.7 160 64 149.3 64 136zM94.4 365.2C105.8 356.6 119.7 352 134 352L138.9 352C172.6 352 200 379.4 200 413.1C200 432.7 190.6 451 174.8 462.5L150.8 480L184 480C197.3 480 208 490.7 208 504C208 517.3 197.3 528 184 528L93.3 528C77.1 528 64 514.9 64 498.7C64 489.3 68.5 480.5 76.1 475L146.6 423.7C150 421.2 152 417.3 152 413.1C152 405.9 146.1 400 138.9 400L134 400C130.1 400 126.3 401.3 123.2 403.6L102.4 419.2C91.8 427.2 76.8 425 68.8 414.4C60.8 403.8 63 388.8 73.6 380.8L94.4 365.2zM288 128L544 128C561.7 128 576 142.3 576 160C576 177.7 561.7 192 544 192L288 192C270.3 192 256 177.7 256 160C256 142.3 270.3 128 288 128zM288 288L544 288C561.7 288 576 302.3 576 320C576 337.7 561.7 352 544 352L288 352C270.3 352 256 337.7 256 320C256 302.3 270.3 288 288 288zM288 448L544 448C561.7 448 576 462.3 576 480C576 497.7 561.7 512 544 512L288 512C270.3 512 256 497.7 256 480C256 462.3 270.3 448 288 448z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Increase Indent" aria-label="Increase indent"
      on:mousedown|preventDefault on:click={indentText}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M96 128C96 110.3 110.3 96 128 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L128 160C110.3 160 96 145.7 96 128zM288 256C288 238.3 302.3 224 320 224L512 224C529.7 224 544 238.3 544 256C544 273.7 529.7 288 512 288L320 288C302.3 288 288 273.7 288 256zM320 352L512 352C529.7 352 544 366.3 544 384C544 401.7 529.7 416 512 416L320 416C302.3 416 288 401.7 288 384C288 366.3 302.3 352 320 352zM96 512C96 494.3 110.3 480 128 480L512 480C529.7 480 544 494.3 544 512C544 529.7 529.7 544 512 544L128 544C110.3 544 96 529.7 96 512zM223.8 332.6L121.8 411.9C111.3 420.1 96 412.6 96 399.3L96 240.7C96 227.4 111.3 219.9 121.8 228.1L223.7 307.4C231.9 313.8 231.9 326.3 223.7 332.7z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Decrease Indent" aria-label="Decrease indent"
      on:mousedown|preventDefault on:click={outdentText}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M96.4 128C96.4 110.3 110.7 96 128.4 96L512.4 96C530.1 96 544.4 110.3 544.4 128C544.4 145.7 530.1 160 512.4 160L128.4 160C110.8 160 96.4 145.7 96.4 128zM288.4 256C288.4 238.3 302.7 224 320.4 224L512.4 224C530.1 224 544.4 238.3 544.4 256C544.4 273.7 530.1 288 512.4 288L320.4 288C302.7 288 288.4 273.7 288.4 256zM320.4 352L512.4 352C530.1 352 544.4 366.3 544.4 384C544.4 401.7 530.1 416 512.4 416L320.4 416C302.7 416 288.4 401.7 288.4 384C288.4 366.3 302.7 352 320.4 352zM96.4 512C96.4 494.3 110.7 480 128.4 480L512.4 480C530.1 480 544.4 494.3 544.4 512C544.4 529.7 530.1 544 512.4 544L128.4 544C110.7 544 96.4 529.7 96.4 512zM96.7 332.6C88.5 326.2 88.5 313.7 96.7 307.3L198.6 228C209.1 219.8 224.4 227.3 224.4 240.6L224.4 399.2C224.4 412.5 209.1 420 198.6 411.8L96.7 332.6z" fill="currentColor"/>
      </svg>
    </button>
    <button class="tool-btn" title="Line Indent" aria-label="Line indent"
      on:mousedown|preventDefault on:click={lineIndent}>
      <svg width="16" height="16" viewBox="0 0 640 640" aria-hidden="true">
        <path d="M96 96 L184 128 L96 160 Z" fill="currentColor"/>
        <path d="M224 128C224 110.3 238.3 96 256 96L512 96C529.7 96 544 110.3 544 128C544 145.7 529.7 160 512 160L256 160C238.3 160 224 145.7 224 128z" fill="currentColor"/>
        <path d="M96 256C96 238.3 110.3 224 128 224L512 224C529.7 224 544 238.3 544 256C544 273.7 529.7 288 512 288L128 288C110.3 288 96 273.7 96 256zM128 352L512 352C529.7 352 544 366.3 544 384C544 401.7 529.7 416 512 416L128 416C110.3 416 96 401.7 96 384C96 366.3 110.3 352 128 352zM96 512C96 494.3 110.3 480 128 480L512 480C529.7 480 544 494.3 544 512C544 529.7 529.7 544 512 544L128 544C110.3 544 96 529.7 96 512z" fill="currentColor"/>
      </svg>
    </button>

    <div class="toolbar-sep"></div>

    <button class="tool-btn math-toggle" title="Insert Math Equation" aria-label="Insert math equation"
      class:active={mathPopoutOpen}
      on:mousedown|preventDefault on:click={openMathPopout}>
      MATH
    </button>
  </div>

  <!-- Answer area (always in DOM so savedRange stays valid) -->
  <div
    bind:this={el}
    class="answer-area"
    class:area-hidden={mathPopoutOpen}
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    tabindex="0"
    spellcheck="false"
    on:keydown={handleKeydown}
    on:keyup={updateFormatState}
    on:mouseup={updateFormatState}
    on:input={() => value = el?.textContent?.trim() ?? ''}
  ></div>

  <!-- Math equation popout (always in DOM to preserve mathInputComp ref) -->
  <div class="math-popout" class:popout-hidden={!mathPopoutOpen}>
    <p class="popout-label">Enter Your Answer Below:</p>
    <MathInput bind:this={mathInputComp} keepKeyboardOpen={true} />
    <div class="popout-actions">
      <button class="btn-save" on:mousedown|preventDefault on:click={saveMath}>Save</button>
      <button class="btn-cancel" on:mousedown|preventDefault on:click={cancelMath}>Cancel</button>
    </div>
  </div>

</div>

<style>
  .input-widget {
    display: flex;
    flex-direction: column;
    width: 100%;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    border: 1px solid #d0d0d0;
    background: white;
    position: relative;
    overflow: visible;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: #f0f0f0;
    border-bottom: 1px solid #d0d0d0;
    flex-wrap: wrap;
  }

  .toolbar-sep {
    width: 1px;
    height: 20px;
    background: #ccc;
    margin: 0 3px;
  }

  .tool-btn {
    background: transparent;
    border: none;
    border-radius: 2px;
    padding: 3px;
    min-width: 30px;
    height: 30px;
    color: #333;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .tool-btn:hover  { background: #e0e0e0; }
  .tool-btn.active { background: #d0d0d0; }
  .tool-btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

  .math-toggle {
    font-weight: 600;
    font-size: 11px;
  }

  /* ── Answer area ── */
  .answer-area {
    min-height: 160px;
    padding: 8px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    outline: none;
    cursor: text;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
  }

  /* ── Visibility helpers ── */
  .area-hidden   { visibility: hidden; pointer-events: none; }
  .popout-hidden { display: none; }

  /* ── Math equation popout ── */
  .math-popout {
    position: absolute;
    top: 60px;
    left: 30px;
    width: max-content;
    z-index: 50;
    background: white;
    border: 1px solid #aac4dc;
    border-radius: 4px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.18);
    padding: 12px;
  }

  .popout-label {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #333;
    margin: 0 0 6px;
  }

  .popout-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .btn-save {
    padding: 5px 16px;
    background: #5bc0de;
    border: 1px solid #46b8da;
    border-radius: 12px;
    color: white;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    cursor: pointer;
  }
  .btn-save:hover { background: #46b8da; }

  .btn-cancel {
    padding: 5px 16px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 12px;
    color: #333;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    cursor: pointer;
  }
  .btn-cancel:hover { background: #f5f5f5; }

  /* Restore list styles stripped by Tailwind preflight */
  .answer-area :global(ul) { list-style: disc;    padding-left: 1.5em; margin: 0.4em 0; }
  .answer-area :global(ol) { list-style: decimal; padding-left: 1.5em; margin: 0.4em 0; }
  .answer-area :global(li) { margin: 0.1em 0; }

  /* ═══════════════════════════════════════════════════════════════
     FRACTION WIDGETS (JS-inserted nodes, require :global)
     ═══════════════════════════════════════════════════════════════ */
  .answer-area :global(.frac-widget) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: middle;
    margin: 0 2px;
  }
  .answer-area :global(.frac-stack) {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
  }
  .answer-area :global(.frac-bar) {
    display: block;
    border-top: 1px solid #000;
    margin: 1px 0;
  }
  .answer-area :global(.frac-input) {
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
  .answer-area :global(.frac-input:focus) { background: #ddeeff; }
  .answer-area :global(.frac-whole) {
    width: 36px;
    height: 51px;
  }
  .answer-area :global(.frac-r-stack) {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    vertical-align: middle;
    line-height: 1.1;
  }
  .answer-area :global(.frac-r-num),
  .answer-area :global(.frac-r-den) {
    font-size: 0.72em;
    padding: 0 1px;
    text-align: center;
  }
  .answer-area :global(.frac-r-bar) {
    display: block;
    width: 100%;
    border-top: 1px solid currentColor;
    margin: 1px 0;
  }
  .answer-area :global(.frac-r-whole) {
    vertical-align: middle;
    margin-right: 2px;
  }
  .answer-area :global(.frac-widget.frac-rendered) { cursor: pointer; }
  .answer-area :global(.frac-widget.frac-rendered:hover) {
    outline: 1px dashed #aaa;
    border-radius: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════
     POWER (EXPONENT) WIDGET (JS-inserted nodes, require :global)
     ═══════════════════════════════════════════════════════════════ */
  .answer-area :global(.power-widget) {
    display: inline;
    margin: 0 2px;
  }
  .answer-area :global(.power-exp-wrap) {
    display: inline-block;
    vertical-align: super;
    line-height: 1;
    margin-left: 1px;
  }
  .answer-area :global(.frac-input.power-base-inp) {
    width: 36px;
    height: 24px;
  }
  .answer-area :global(.frac-input.power-exp-inp) {
    width: 18px;
    height: 14px;
    font-size: 10px;
    padding: 0 1px;
  }
  .answer-area :global(.power-widget.frac-rendered) {
    cursor: pointer;
  }
  .answer-area :global(.power-widget.frac-rendered:hover) {
    outline: 1px dashed #aaa;
    border-radius: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════
     GEO (RAY / LINE / SEGMENT) WIDGET (JS-inserted nodes, require :global)
     ═══════════════════════════════════════════════════════════════ */
  .answer-area :global(.geo-widget) {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    vertical-align: middle;
    margin: 0 2px;
  }
  .answer-area :global(.geo-sym-label) {
    font-size: 18px;
    line-height: 1;
    margin-bottom: 1px;
  }
  .answer-area :global(.frac-input.geo-inp) {
    width: 40px;
    height: 24px;
    text-align: center;
    border: 1px dotted #000;
    border-radius: 0;
  }
  .answer-area :global(.geo-r-sym) {
    font-size: 18px;
    line-height: 1;
    text-align: center;
  }
  .answer-area :global(.geo-r-text) {
    font-size: inherit;
    text-align: center;
    line-height: 1.3;
  }
  .answer-area :global(.geo-widget.frac-rendered) { cursor: pointer; }
  .answer-area :global(.geo-widget.frac-rendered:hover) {
    outline: 1px dashed #aaa;
    border-radius: 2px;
  }
</style>
