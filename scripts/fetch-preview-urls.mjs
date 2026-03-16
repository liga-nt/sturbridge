// fetch-preview-urls.mjs
// For each item ID, navigate to the cognia catalog page, grab the TestNav
// iframe URL, and save it to preview-urls.json.
//
// Usage: node scripts/fetch-preview-urls.mjs [item_id ...]
//   - If item IDs are passed as args, only fetch those.
//   - If no args, reads item_ids from data/2023_2025_comp_items.csv.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

// ── Determine which item IDs to fetch ────────────────────────────────────────

let itemIds;

if (process.argv.length > 2) {
  itemIds = process.argv.slice(2);
} else {
  const csv = readFileSync('data/2023_2025_comp_items.csv', 'utf8').trim().split('\n');
  itemIds = csv.slice(1).map(l => l.split(',')[0].trim()).filter(Boolean);
}

console.log(`Fetching preview URLs for ${itemIds.length} items...\n`);

// ── Load existing preview-urls.json ──────────────────────────────────────────

const PREVIEW_PATH = 'scripts/preview-urls.json';
const existing = JSON.parse(readFileSync(PREVIEW_PATH, 'utf8'));
const urlMap = {};
existing.forEach(({ item_id, preview_url }) => { urlMap[item_id] = preview_url; });

// ── Browser loop ──────────────────────────────────────────────────────────────

const browser = await chromium.launch({ channel: 'chrome', headless: false });

for (const itemId of itemIds) {
  if (urlMap[itemId]) {
    console.log(`SKIP  ${itemId} (already have URL)`);
    continue;
  }

  const url = `https://mcas.cognia.org/item-catalog/?itemID=${itemId}&Subject=Math&Grade=4`;
  console.log(`FETCH ${itemId}`);

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const iframeLocator = page.locator('#itemPreviewIFrame').first();
    if (await iframeLocator.count() === 0) {
      console.warn(`  WARN: no iframe found for ${itemId}`);
      await page.close();
      continue;
    }

    const iframeHandle = await iframeLocator.elementHandle();
    const frame = await iframeHandle.contentFrame();
    await frame.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    const previewUrl = frame.url();
    if (!previewUrl || previewUrl === 'about:blank') {
      console.warn(`  WARN: blank iframe URL for ${itemId}`);
      await page.close();
      continue;
    }

    urlMap[itemId] = previewUrl;
    console.log(`  OK  ${previewUrl}`);
    await page.close();
  } catch (e) {
    console.error(`  ERR ${itemId}: ${e.message}`);
  }
}

await browser.close();

// ── Write updated preview-urls.json ──────────────────────────────────────────

const updated = Object.entries(urlMap).map(([item_id, preview_url]) => ({ item_id, preview_url }));
writeFileSync(PREVIEW_PATH, JSON.stringify(updated, null, 2) + '\n');
console.log(`\nSaved ${updated.length} entries to ${PREVIEW_PATH}`);
