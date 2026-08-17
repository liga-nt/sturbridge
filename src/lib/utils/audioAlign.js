/**
 * Maps ElevenLabs' character-level alignment data onto the RICH displayed
 * text (with [n/d] fraction brackets, {?} blanks, <strong> tags) so a word
 * can be highlighted in place, exactly as rendered — not on a separate plain
 * transcript.
 *
 * The hard part: the audio was synthesized from renderForSpeech(rawText)
 * (feedbackTemplates.js), which EXPANDS some displayed tokens into multiple
 * spoken words (e.g. the single glyph [3/4] becomes the two spoken words
 * "three quarters"). tokenizeForHighlight() walks the same rawText and, for
 * each displayed token, computes exactly how many spoken words it expanded
 * into (via the same spokenFraction() used by renderForSpeech), so timings
 * can be assigned by consuming that many entries from the word-timing list —
 * keeping this file's notion of "a word" byte-for-byte consistent with what
 * was actually sent to TTS.
 */

import { spokenFraction } from './feedbackTemplates.js';

// Character-level alignment only tells us per-character timing — group
// consecutive non-whitespace characters into words, splitting on whitespace.
export function alignmentToWords(alignment) {
  if (!alignment?.characters) return [];
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const words = [];
  let cur = null;
  for (let i = 0; i < characters.length; i++) {
    if (/\s/.test(characters[i])) {
      if (cur) { words.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { start: starts[i], end: ends[i] };
    else cur.end = ends[i];
  }
  if (cur) words.push(cur);
  return words;
}

// Walks the raw displayed text and produces one token per displayed unit —
// a plain word, a [n/d] fraction (rendered as a single glyph), a {?} blank,
// or &times; — tagging each with how many renderForSpeech() words it expands
// into, and whether it falls inside a <strong> span.
export function tokenizeForHighlight(rawText, bold = false, italic = false) {
  if (!rawText) return [];
  const s = String(rawText);
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('<strong>', i)) { bold = true; i += 8; continue; }
    if (s.startsWith('</strong>', i)) { bold = false; i += 9; continue; }
    if (s.startsWith('<em>', i)) { italic = true; i += 4; continue; }
    if (s.startsWith('</em>', i)) { italic = false; i += 5; continue; }

    // Hand-rolled fraction HTML (span markup matching renderMath()'s own
    // .frac/.frac-num/.frac-den output) — how generators represent a
    // fraction whose numerator/denominator isn't plain digits (e.g. an
    // unknown variable like <em>c</em>), since [n/d] bracket notation
    // requires digits on both sides. Parsed into the same 'fraction' token
    // shape as bracket notation so it renders as a stacked glyph instead of
    // literal tag text; numHtml/denHtml keep any nested tags (e.g. <em>)
    // for display, while the tag-stripped num/den feed spokenFraction().
    const rawFracMatch = /^<span class="frac"><span class="frac-num">([\s\S]*?)<\/span><span class="frac-den">([\s\S]*?)<\/span><\/span>/.exec(s.slice(i));
    if (rawFracMatch) {
      const [full, numHtml, denHtml] = rawFracMatch;
      const stripTags = (h) => h.replace(/<[^>]+>/g, '');
      const num = stripTags(numHtml);
      const den = stripTags(denHtml);
      tokens.push({ type: 'fraction', num, den, numHtml, denHtml, bold, italic, spokenWordCount: spokenFraction(num, den).split(' ').length });
      i += full.length;
      continue;
    }

    // Any other HTML tag — e.g. the <br><br><p><svg>...</svg></p> diagram
    // wrapper some generators embed directly in stimulus_intro / part text.
    // Passed through untouched as one opaque display-only chunk (rendered
    // via {@html}) instead of being torn into literal-text word tokens at
    // each internal space. spokenWordCount is 0, which undercounts
    // wordOffset for any AudioText field that follows one of these blocks
    // IF it contains real narrated prose (renderForSpeech() only strips the
    // tags, not their text) — acceptable for genuinely opaque content like
    // an <svg> diagram, which is never narrated. <ul>/<ol> are handled
    // below instead, since their <li> text IS narrated (renderForSpeech
    // strips just the tags) and must count toward word offsets.
    if (s[i] === '<') {
      const tagMatch = /^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/)?>/.exec(s.slice(i));
      if (tagMatch) {
        const [full, tagName, selfClosed] = tagMatch;
        if (selfClosed || tagName.toLowerCase() === 'br') {
          tokens.push({ type: 'html', html: full, bold, italic, spokenWordCount: 0 });
          i += full.length;
          continue;
        }
        const lower = tagName.toLowerCase();
        const closeTag = `</${tagName}>`;
        const closeIdx = s.indexOf(closeTag, i + full.length);
        if (closeIdx !== -1) {
          const end = closeIdx + closeTag.length;
          if (lower === 'ul' || lower === 'ol') {
            // Recurse into each <li>'s text so its words get real timings
            // (and count toward any wordOffset after this list) instead of
            // vanishing into one opaque, non-highlightable chunk — the tag
            // structure itself (<ul>, <li>, </li>, </ul>) still renders as
            // plain passthrough html tokens so list styling is unaffected.
            tokens.push({ type: 'html', html: full, bold, italic, spokenWordCount: 0 });
            const inner = s.slice(i + full.length, closeIdx);
            const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
            let m;
            while ((m = liRe.exec(inner))) {
              tokens.push({ type: 'html', html: m[0].slice(0, m[0].indexOf('>') + 1), bold, italic, spokenWordCount: 0 });
              tokens.push(...tokenizeForHighlight(m[1], bold, italic));
              tokens.push({ type: 'html', html: '</li>', bold, italic, spokenWordCount: 0 });
            }
            tokens.push({ type: 'html', html: closeTag, bold, italic, spokenWordCount: 0 });
          } else {
            tokens.push({ type: 'html', html: s.slice(i, end), bold, italic, spokenWordCount: 0 });
          }
          i = end;
          continue;
        }
      }
    }

    if (/\s/.test(s[i])) { i++; continue; }

    const fracMatch = /^\[(\d+)\/(\d+)\]/.exec(s.slice(i));
    if (fracMatch) {
      const [full, num, den] = fracMatch;
      tokens.push({ type: 'fraction', num, den, bold, italic, spokenWordCount: spokenFraction(num, den).split(' ').length });
      i += full.length;
      continue;
    }
    if (s.slice(i, i + 3) === '{?}') {
      tokens.push({ type: 'blank', bold, italic, spokenWordCount: 1 });
      i += 3;
      continue;
    }
    if (s.slice(i).startsWith('&times;')) {
      tokens.push({ type: 'word', text: '×', bold, italic, spokenWordCount: 1 });
      i += 7;
      continue;
    }

    let j = i;
    while (
      j < s.length && !/\s/.test(s[j]) &&
      // Only stop at '<' when it actually opens a tag (a letter or '/letter'
      // follows) — a bare '<' used as prose (e.g. "using >, <, or =") isn't
      // recognized as markup above either, so it must stay part of the word
      // or it silently vanishes into the infinite-loop safety net below.
      !/^<\/?[a-zA-Z]/.test(s.slice(j)) &&
      !/^\[\d+\/\d+\]/.test(s.slice(j)) && s.slice(j, j + 3) !== '{?}' &&
      !s.slice(j).startsWith('&times;')
    ) j++;

    if (j > i) {
      tokens.push({ type: 'word', text: s.slice(i, j), bold, italic, spokenWordCount: 1 });
      i = j;
    } else {
      // j === i means the character at i looked like a tag/construct start
      // (e.g. '<' followed by a letter) but didn't resolve into one above —
      // an incomplete or malformed tag. Emit it as a one-character word
      // instead of silently dropping it; a dropped '<' is how "using >, <,
      // or =" lost its less-than sign.
      tokens.push({ type: 'word', text: s[i], bold, italic, spokenWordCount: 1 });
      i++;
    }
  }
  return tokens;
}

// Consumes word-timing entries in order, `spokenWordCount` at a time per
// token, so a fraction token gets the timing span covering all the spoken
// words it expanded into. A count mismatch (tokenizer/alignment drift) just
// leaves trailing tokens with no timing — they display normally, never highlight.
//
// wordOffset: how many spoken words to skip before this token list's own
// words start — needed when a single audio clip's text was split into
// several displayed pieces (e.g. a multi-part item's part text rendered as
// multiple \n\n-separated <p> tags, each its own AudioText instance) so each
// piece picks up where the previous one's word count left off.
export function assignTokenTimings(tokens, alignment, wordOffset = 0) {
  const words = alignmentToWords(alignment);
  let wi = wordOffset;
  return tokens.map((tok) => {
    const slice = words.slice(wi, wi + tok.spokenWordCount);
    wi += tok.spokenWordCount;
    return {
      ...tok,
      start: slice.length ? slice[0].start : null,
      end: slice.length ? slice[slice.length - 1].end : null,
    };
  });
}

/** Convenience: tokenize + assign timings in one call. */
export function buildHighlightTokens(rawText, alignment, wordOffset = 0) {
  return assignTokenTimings(tokenizeForHighlight(rawText), alignment, wordOffset);
}

/** How many renderForSpeech() words rawText expands into — used to compute wordOffset for split text. */
export function countSpokenWords(rawText) {
  return tokenizeForHighlight(rawText).reduce((sum, t) => sum + t.spokenWordCount, 0);
}
