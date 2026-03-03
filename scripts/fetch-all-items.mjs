import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const CSV_PATH = resolve('data/2023_2025_comp_items.csv');
const OUTPUT_DIR = resolve('scripts/items');

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSV(content) {
    const lines = content.trim().split('\n');
    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
}

function parseLine(line) {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            fields.push(field);
            field = '';
        } else {
            field += ch;
        }
    }
    fields.push(field);
    return fields;
}

function serializeCSV(headers, rows) {
    const escape = (val) => {
        val = String(val ?? '');
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
    };
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) lines.push(row.map(escape).join(','));
    return lines.join('\n') + '\n';
}

// ── Load CSV ──────────────────────────────────────────────────────────────────

const csvContent = readFileSync(CSV_PATH, 'utf-8');
const { headers, rows } = parseCSV(csvContent);

// Add columns if not already present
const COLS = { screenshot_path: null, html_path: null };
for (const col of Object.keys(COLS)) {
    if (!headers.includes(col)) headers.push(col);
    COLS[col] = headers.indexOf(col);
}

// ── Browser ───────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ channel: 'chrome', headless: false });

for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Ensure row has enough slots
    while (row.length < headers.length) row.push('');

    const itemId = row[0].trim();
    if (!itemId) continue;

    // Skip if already fetched successfully
    if (row[COLS.screenshot_path] && row[COLS.screenshot_path] !== 'ERROR') {
        console.log(`[${i + 1}/${rows.length}] ${itemId} — already fetched, skipping.`);
        continue;
    }

    console.log(`\n[${i + 1}/${rows.length}] ${itemId}`);

    const itemDir = join(OUTPUT_DIR, itemId);
    mkdirSync(itemDir, { recursive: true });

    const screenshotPath = join(itemDir, `${itemId}.png`);
    const htmlPath = join(itemDir, `${itemId}.html`);
    const url = `https://mcas.cognia.org/item-catalog/?itemID=${itemId}&Subject=Math&Grade=4`;

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 4000 });
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(5000);

        // Get into the modal iframe
        const iframeLocator = page.locator('#itemPreviewIFrame').first();
        const iframeHandle = await iframeLocator.elementHandle();
        const frame = await iframeHandle.contentFrame();
        await frame.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(2000);

        // Expand scroll containers inside the iframe
        await frame.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                const cs = window.getComputedStyle(el);
                if (['auto', 'scroll'].includes(cs.overflow) ||
                    ['auto', 'scroll'].includes(cs.overflowY)) {
                    el.style.overflow = 'visible';
                    el.style.overflowY = 'visible';
                    el.style.maxHeight = 'none';
                    el.style.height = 'auto';
                }
            });
        });
        await page.waitForTimeout(500);

        // Resize iframe element to its full content height
        const contentHeight = await frame.evaluate(() => document.body.scrollHeight);
        await page.evaluate((h) => {
            const iframe = document.querySelector('#itemPreviewIFrame');
            if (iframe) {
                iframe.style.height = h + 'px';
                iframe.style.maxHeight = 'none';
                iframe.style.minHeight = '0';
            }
        }, contentHeight);
        await page.waitForTimeout(300);

        await iframeLocator.screenshot({ path: screenshotPath });
        console.log(`  Screenshot: ${screenshotPath}`);

        // HTML from inside the iframe
        let html;
        let htmlSource;
        if (frame) {
            html = await frame.evaluate(() => document.documentElement.outerHTML);
            htmlSource = 'iframe';
        } else {
            html = await page.evaluate(() => document.documentElement.outerHTML);
            htmlSource = 'page (no iframe found)';
        }

        writeFileSync(htmlPath, html, 'utf-8');
        console.log(`  HTML (${htmlSource}): ${htmlPath}  [${html.length} bytes]`);

        row[COLS.screenshot_path] = screenshotPath;
        row[COLS.html_path] = htmlPath;

    } catch (err) {
        console.error(`  ERROR: ${err.message}`);
        row[COLS.screenshot_path] = 'ERROR';
        row[COLS.html_path] = 'ERROR';
    } finally {
        await page.close();
    }

    // Save CSV after every item so progress is not lost on crash
    writeFileSync(CSV_PATH, serializeCSV(headers, rows), 'utf-8');
}

await browser.close();
console.log('\nAll done. CSV updated.');
