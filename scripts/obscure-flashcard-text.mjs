/**
 * Rewrites flashcard description + detail for history/myth standards so they
 * don't reveal the subject's name.  Uses Claude Opus with a per-category
 * few-shot example (already manually edited by the user).
 *
 * Usage: node scripts/obscure-flashcard-text.mjs [--dry-run]
 *
 * Safe to re-run: already-obscured items are skipped (their IDs are listed
 * in ALREADY_DONE below).  Each item is saved to the file immediately after
 * Opus returns, so interrupting mid-run is safe.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(__dirname, '../data/Greek/standards_coverage.json');
const DRY_RUN = process.argv.includes('--dry-run');

const client = new Anthropic();

// ── Categories to process and their few-shot example IDs ────────────────────
const CATEGORY_EXAMPLES = {
  'hist.period': 'hist.period.persian_wars',
  'hist.figure': 'hist.figure.darius',
  'hist.battle': 'hist.battle.marathon',
  'hist.author': 'hist.author.plato',
  'myth.deity':  'myth.deity.zeus',
  'myth.story':  'myth.story.theseus_minotaur',
};

// Items the user has already edited — skip them.
const ALREADY_DONE = new Set(Object.values(CATEGORY_EXAMPLES));

// ── JSONC helpers ────────────────────────────────────────────────────────────

function stripJsonComments(text) {
  // Remove // line comments (not inside strings)
  return text.replace(/\/\/[^\n]*/g, '');
}

// Return the inner content of a JSON string as it appears in the source file.
// JSON.stringify escapes only `"`, `\`, and control chars — everything else
// (em dashes, Greek letters, etc.) is left as-is, matching the file content.
function jsonInner(s) {
  return JSON.stringify(s).slice(1, -1);
}

// ── File replacement ─────────────────────────────────────────────────────────

/**
 * Replace a specific JSON string field value in the file text.
 * Finds `"field": "oldValue"` (exact match) and replaces with `"field": "newValue"`.
 * Returns the updated file text, or throws if not found.
 */
function replaceFieldInText(fileText, field, oldValue, newValue) {
  const oldSnippet = `"${field}": "${jsonInner(oldValue)}"`;
  const newSnippet = `"${field}": "${jsonInner(newValue)}"`;
  if (!fileText.includes(oldSnippet)) {
    throw new Error(`Could not find in file: ${oldSnippet.slice(0, 80)}…`);
  }
  return fileText.replace(oldSnippet, newSnippet);
}

// ── Opus call ────────────────────────────────────────────────────────────────

async function rewriteItem(item, exampleItem) {
  const systemPrompt = `You are editing history and mythology flashcard text for a 7th grade curriculum. Students see the subject's name on the FRONT of the flashcard and read the description and detail on the BACK.

Your task: rewrite the description and the detail so they do NOT reveal the subject's name anywhere. Replace every occurrence of the subject's name — including partial names (e.g. just the first name), titles that uniquely identify the subject, and distinctive epithets — with general nouns ("this king", "the general", "this philosopher", "the goddess", "this hero", "the playwright", "this battle", "this war", etc.) and pronouns (he/she/they/his/her/their/it/its).

Rules:
- Keep all historical facts and dates exactly intact.
- The text must still read naturally and be appropriate for 7th graders.
- Do NOT replace names of OTHER people or places mentioned in the text — only the subject whose name is the flashcard answer.
- Return ONLY valid JSON with exactly two string fields: "description" and "detail". No markdown, no explanation.`;

  const exampleBlock = exampleItem
    ? `EXAMPLE (already correctly edited — note how the name is nowhere in the text):
Name: ${exampleItem.name}
Edited description: ${exampleItem.description}
Edited detail: ${exampleItem.detail}

---

`
    : '';

  const userMessage = `${exampleBlock}Now rewrite this item. Replace every occurrence of the name (including partial forms) with general nouns/pronouns.

Name: ${item.name}
Current description: ${item.description}
Current detail: ${item.detail}

Return JSON: {"description": "...", "detail": "..."}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Opus response:\n${text}`);
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.description || !parsed.detail) {
    throw new Error(`Missing fields in response:\n${text}`);
  }
  return parsed;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No file changes will be written.\n');

  let fileText = fs.readFileSync(FILE_PATH, 'utf8');
  const data = JSON.parse(stripJsonComments(fileText));

  // Index items by ID
  const byId = {};
  for (const item of data.standards) byId[item.id] = item;

  // Collect few-shot examples
  const examples = {};
  for (const [cat, exId] of Object.entries(CATEGORY_EXAMPLES)) {
    examples[cat] = byId[exId] ?? null;
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of data.standards) {
    if (!item.name || !item.description || !item.detail) continue;

    const parts = item.id.split('.');
    if (parts.length < 3) continue;
    const cat = parts.slice(0, 2).join('.');
    if (!(cat in CATEGORY_EXAMPLES)) continue;
    if (ALREADY_DONE.has(item.id)) {
      console.log(`skip  ${item.id}  (already done)`);
      skipped++;
      continue;
    }

    console.log(`\nprocess  ${item.id}  "${item.name}"`);

    if (DRY_RUN) {
      console.log(`  [dry-run] would call Opus`);
      processed++;
      continue;
    }

    try {
      const result = await rewriteItem(item, examples[cat]);

      console.log(`  desc : ${result.description.slice(0, 90)}${result.description.length > 90 ? '…' : ''}`);
      console.log(`  detail: ${result.detail.slice(0, 90)}${result.detail.length > 90 ? '…' : ''}`);

      // Replace in file text and save immediately
      fileText = replaceFieldInText(fileText, 'description', item.description, result.description);
      fileText = replaceFieldInText(fileText, 'detail', item.detail, result.detail);
      fs.writeFileSync(FILE_PATH, fileText, 'utf8');
      console.log(`  saved.`);
      processed++;
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`processed: ${processed}  skipped: ${skipped}  errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
