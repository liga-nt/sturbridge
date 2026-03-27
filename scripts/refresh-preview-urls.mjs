/**
 * Refreshes expired TestNav auth tickets in preview-urls.json and all question JSON files.
 *
 * Navigates to the MCAS Digital Item Library page for each item, waits for/clicks
 * the item preview, and intercepts the TestNav network request to capture a fresh URL.
 *
 * Usage: node scripts/refresh-preview-urls.mjs [--item <item_id>]
 *   --item <item_id>  Refresh a single item (for debugging)
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const URLS_PATH  = resolve('scripts/preview-urls.json');
const JSON_FILES = [
  'data/g4-math_2019_questions.json',
  'data/g4-math_2021_questions.json',
  'data/g4-math_2022_questions.json',
  'data/g4-math_2023_questions.json',
  'data/g4-math_2025_questions.json',
].map(p => resolve(p));

// Build full item list from all JSON files, tagging each with its year
const allItems = [];
const seen = new Set();
const yearFiles = [
  ['2019', 'data/g4-math_2019_questions.json'],
  ['2021', 'data/g4-math_2021_questions.json'],
  ['2022', 'data/g4-math_2022_questions.json'],
  ['2023', 'data/g4-math_2023_questions.json'],
  ['2025', 'data/g4-math_2025_questions.json'],
];
for (const [year, rel] of yearFiles) {
  const qs = JSON.parse(readFileSync(resolve(rel), 'utf-8'));
  for (const q of qs) {
    if (q.item_id && !seen.has(q.item_id)) {
      seen.add(q.item_id);
      allItems.push({ item_id: q.item_id, year, preview_url: q.preview_url || '' });
    }
  }
}

// Build existing URL map from preview-urls.json as base
const existingMap = Object.fromEntries(
  JSON.parse(readFileSync(URLS_PATH, 'utf-8')).map(({ item_id, preview_url }) => [item_id, preview_url])
);

// Filter to only items that need refreshing (or --item override)
const singleItem = process.argv.includes('--item') && process.argv[process.argv.indexOf('--item') + 1];
const items = singleItem
  ? allItems.filter(it => it.item_id === singleItem)
  : allItems;

console.log(`Refreshing tickets for ${items.length} items...\n`);

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const urlMap = { ...existingMap };
let updated = 0, failed = 0;

for (let i = 0; i < items.length; i++) {
  const { item_id, year } = items[i];
  const pageUrl = year === '2025'
    ? `https://mcas.cognia.org/item-catalog?itemID=${item_id}&Subject=Math&Grade=4&Year=2025`
    : `https://mcas.digitalitemlibrary.com/home?subject=Math&grades=Grade%204&view=ALL&itemUIN=${item_id}`;

  process.stdout.write(`[${i + 1}/${items.length}] ${item_id} ... `);

  const page = await browser.newPage();
  let freshUrl = null;
  const allRequests = [];

  const capture = (url) => {
    if (url && url.startsWith('http')) allRequests.push(url);
    if (!freshUrl && url && url.includes('testnav.com') && url.includes('showByIdentifier')) {
      freshUrl = url;
    }
  };

  page.on('request',        req   => capture(req.url()));
  page.on('response',       resp  => capture(resp.url()));
  page.on('framenavigated', frame => capture(frame.url()));

  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Check all frame URLs
    if (!freshUrl) {
      for (const frame of page.frames()) capture(frame.url());
    }

    // Click "View all items" / "View items" if present (expands group)
    if (!freshUrl) {
      const expandTargets = [
        'a:has-text("View all items")',
        'a:has-text("View All Items")',
        'button:has-text("View all items")',
        'a:has-text("View items")',
        '[class*="view-all"]',
        '[class*="viewAll"]',
      ];
      for (const sel of expandTargets) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click().catch(() => {});
          await page.waitForTimeout(4000);
          break;
        }
      }
    }

    // Now click the item itself to trigger the preview
    if (!freshUrl) {
      const itemTargets = [
        '[class*="preview"]',
        '[class*="item-link"]',
        '[class*="item-card"]',
        'button:has-text("Preview")',
        'a:has-text("Preview")',
        '[data-item-id]',
        '[class*="item-row"]',
        `[class*="${item_id}"]`,
      ];
      for (const sel of itemTargets) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click().catch(() => {});
          await page.waitForTimeout(3000);
          if (freshUrl) break;
        }
      }
    }

    if (!freshUrl) {
      for (const frame of page.frames()) capture(frame.url());
    }

    if (freshUrl) {
      urlMap[item_id] = freshUrl;
      console.log(`OK`);
      updated++;
    } else {
      // Screenshot for diagnosis
      const screenshotPath = resolve(`scripts/debug-${item_id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const domains = [...new Set(allRequests.map(u => { try { return new URL(u).hostname; } catch { return u; } }))];
      console.log(`FAIL  → screenshot: ${screenshotPath}`);
      console.log(`       domains: ${domains.join(', ')}`);
      failed++;
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    failed++;
  } finally {
    await page.close();
  }
}

await browser.close();

// Write updated preview-urls.json (union of all items that have a URL)
const updatedList = [...seen].filter(id => urlMap[id]).map(id => ({ item_id: id, preview_url: urlMap[id] }));
writeFileSync(URLS_PATH, JSON.stringify(updatedList, null, 2), 'utf-8');
console.log(`\npreview-urls.json updated (${updated} refreshed, ${failed} failed)`);

// Update each question JSON file
for (const filePath of JSON_FILES) {
  const qs = JSON.parse(readFileSync(filePath, 'utf-8'));
  let count = 0;
  for (const q of qs) {
    if (q.item_id && urlMap[q.item_id]) {
      q.preview_url = urlMap[q.item_id];
      count++;
    }
  }
  writeFileSync(filePath, JSON.stringify(qs, null, 2), 'utf-8');
  console.log(`  ${filePath.split('/').slice(-1)[0]}: updated ${count} questions`);
}

// Update the CSV
const csvPath = resolve('data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv');
const { createReadStream } = await import('fs');
const csvText = readFileSync(csvPath, 'utf-8');
const lines = csvText.split('\n');
const header = lines[0].split(',');
const urlCol = header.indexOf('preview_url');
if (urlCol !== -1) {
  const updatedLines = lines.map((line, i) => {
    if (i === 0) return line;
    const cols = line.split(',');
    const itemId = cols[header.indexOf('item_id')]?.trim();
    if (itemId && urlMap[itemId]) {
      cols[urlCol] = urlMap[itemId];
      return cols.join(',');
    }
    return line;
  });
  writeFileSync(csvPath, updatedLines.join('\n'), 'utf-8');
  console.log('  CSV updated');
}

console.log('\nDone. Reload the dev server to pick up the new URLs.');
