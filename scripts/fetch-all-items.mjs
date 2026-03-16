import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const URLS_PATH = resolve('scripts/preview-urls.json');
const OUTPUT_DIR = resolve('data/items');

// ── Load item list ────────────────────────────────────────────────────────────

const items = JSON.parse(readFileSync(URLS_PATH, 'utf-8'));
const skip = process.argv.includes('--skip-existing');

console.log(`Found ${items.length} items in preview-urls.json`);
if (skip) console.log('--skip-existing: skipping items that already have a PNG\n');

// ── Browser ───────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ channel: 'chrome', headless: false });
let done = 0, skipped = 0, failed = 0;

for (let i = 0; i < items.length; i++) {
    const { item_id: itemId } = items[i];
    if (!itemId) continue;

    const pngPath = join(OUTPUT_DIR, itemId, `${itemId}.png`);
    if (skip && existsSync(pngPath)) {
        console.log(`[${i + 1}/${items.length}] SKIP  ${itemId} (already fetched)`);
        skipped++;
        continue;
    }

    console.log(`\n[${i + 1}/${items.length}] ${itemId}`);

    const itemDir = join(OUTPUT_DIR, itemId);
    mkdirSync(itemDir, { recursive: true });

    const screenshotPath = join(itemDir, `${itemId}.png`);
    const htmlPath      = join(itemDir, `${itemId}.html`);
    const { preview_url: previewUrl } = items[i];

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    try {
        await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Expand any scroll-clipped containers so full content is visible
        await page.evaluate(() => {
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
        await page.waitForTimeout(300);

        // Screenshot the question body — try common TestNav containers, fall back to full page
        const containerSelectors = [
            '.item-body',
            '.qti-item-body',
            '[class*="item-content"]',
            '[class*="question-body"]',
            'body',
        ];
        let screenshotTarget = null;
        for (const sel of containerSelectors) {
            const el = page.locator(sel).first();
            if (await el.count() > 0) { screenshotTarget = el; break; }
        }

        if (screenshotTarget) {
            await screenshotTarget.screenshot({ path: screenshotPath });
        } else {
            await page.screenshot({ path: screenshotPath, fullPage: true });
        }
        console.log(`  Screenshot: ${screenshotPath}`);

        const html = await page.evaluate(() => document.documentElement.outerHTML);
        writeFileSync(htmlPath, html, 'utf-8');
        console.log(`  HTML: ${htmlPath}  [${html.length} bytes]`);

        done++;

    } catch (err) {
        console.error(`  ERROR: ${err.message}`);
        failed++;
    } finally {
        await page.close();
    }
}

await browser.close();
console.log(`\nAll done. ${done} fetched, ${skipped} skipped, ${failed} failed.`);
