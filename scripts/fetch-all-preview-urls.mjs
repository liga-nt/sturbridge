/**
 * fetch-all-preview-urls.mjs
 *
 * Item IDs extracted from the 2021, 2022, and 2023 MCAS Grade 4 Math
 * released-item PDFs. For each ID, loads the MCAS digital item library page
 * and extracts the TestNav preview URL from the itemPreviewFrame iframe.
 *
 * Output: scripts/preview-urls.json  — [{item_id, preview_url}]
 *
 * Usage: node scripts/fetch-all-preview-urls.mjs
 *
 * Note: 2021 Q14 ID is unknown (booklet pages 18-19 were not in the PDF
 * read). Add it manually to ITEM_IDS below once identified.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, 'preview-urls.json');

const BASE_URL = 'https://mcas.digitalitemlibrary.com/home?subject=Math&grades=Grade%204&view=ALL';

// ── Item IDs by year ─────────────────────────────────────────────────────────
// Strip _PA suffix (paper-admin variant marker) — it's not part of the item ID.
// IDs sourced from the released-item PDFs; each row = one question.

const ITEM_IDS_2021 = [
    'MA704649496', // Q1
    'MA307079',    // Q2
    'MA229063',    // Q3
    'MA297973',    // Q4
    'MA800628900', // Q5
    'MA800780932', // Q6
    'MA306940',    // Q7
    'MA800629956', // Q8
    'MA800763292', // Q9
    'MA270627',    // Q10
    'MA803730594', // Q11
    'MA736379417', // Q12
    'MA311574',    // Q13 (Session 2)
    'MA287484',    // Q14
    'MA713629341', // Q15
    'MA714226701', // Q16
    'MA803742735', // Q17
    'MA803846674', // Q18
    'MA306993',    // Q19
    'MA803746135', // Q20
];

const ITEM_IDS_2022 = [
    'MA900845776', // Q1
    'MA307692',    // Q2
    'MA704652242', // Q3
    'MA307310',    // Q4
    'MA900775955', // Q5
    'MA307066',    // Q6
    'MA623833763', // Q7
    'MA903574399', // Q8
    'MA800633803', // Q9
    'MA900751683', // Q10
    'MA803738583', // Q11
    'MA279790',    // Q12
    'MA903537924', // Q13
    'MA800767155', // Q14
    'MA311579A',   // Q15 (note: letter suffix is part of ID)
    'MA900842465', // Q16
    'MA903134963', // Q17
    'MA903757124', // Q18
    'MA286765',    // Q19
    'MA704650142', // Q20
];

const ITEM_IDS_2023 = [
    'MA301798',    // Q1
    'MA297614',    // Q2
    'MA247705',    // Q3
    'MA801035466', // Q4
    'MA002128911', // Q5
    'MA002334462', // Q6
    'MA307060',    // Q7
    'MA002139080', // Q8
    'MA002034926', // Q9
    'MA903776098', // Q10
    'MA002145158', // Q11
    'MA002140372', // Q12
    'MA307317',    // Q13
    'MA002135528', // Q14
    'MA903571693', // Q15
    'MA001851276', // Q16
    'MA001750121', // Q17
    'MA704653374', // Q18
    'MA900846441', // Q19
    'MA303324',    // Q20
];

// Deduplicate across years (some items appear in multiple years)
const ALL_IDS = [...new Set([...ITEM_IDS_2021, ...ITEM_IDS_2022, ...ITEM_IDS_2023])];

// ── Main ─────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];

console.log(`Fetching preview URLs for ${ALL_IDS.length} items...\n`);

for (let i = 0; i < ALL_IDS.length; i++) {
    const id = ALL_IDS[i];
    const url = `${BASE_URL}&itemUIN=${id}`;
    console.log(`[${i + 1}/${ALL_IDS.length}] ${id}`);

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(8000);

        const previewUrl = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[name="itemPreviewFrame"]');
            return iframe ? iframe.src : null;
        });

        await page.close();

        if (previewUrl) {
            results.push({ item_id: id, preview_url: previewUrl });
            console.log(`  ✓ ${previewUrl}`);
        } else {
            console.warn(`  ✗ itemPreviewFrame not found`);
            results.push({ item_id: id, preview_url: null });
        }
    } catch (err) {
        console.error(`  ✗ Error: ${err.message}`);
        results.push({ item_id: id, preview_url: null });
    }
}

await browser.close();

writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
console.log(`\nDone. ${results.filter(r => r.preview_url).length}/${results.length} URLs fetched.`);
console.log(`Output: ${OUT_PATH}`);
