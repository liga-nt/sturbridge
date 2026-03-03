import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const itemId = process.argv[2];
if (!itemId) {
    console.error('Usage: node scripts/fetch-one-item.mjs <itemID>');
    process.exit(1);
}

const OUTPUT_DIR = resolve('scripts/items');
const itemDir = join(OUTPUT_DIR, itemId);
mkdirSync(itemDir, { recursive: true });

const screenshotPath = join(itemDir, `${itemId}.png`);
const htmlPath = join(itemDir, `${itemId}.html`);
const url = `https://mcas.cognia.org/item-catalog/?itemID=${itemId}&Subject=Math&Grade=4`;

console.log(`Item:   ${itemId}`);
console.log(`URL:    ${url}`);
console.log(`Folder: ${itemDir}`);

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 4000 });

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(5000);

// ── Get into the modal iframe ─────────────────────────────────────────────────
const iframeLocator = page.locator('#itemPreviewIFrame').first();
if (await iframeLocator.count() === 0) {
    console.error('Could not find #itemPreviewIFrame — aborting.');
    await browser.close();
    process.exit(1);
}

const iframeHandle = await iframeLocator.elementHandle();
const frame = await iframeHandle.contentFrame();
await frame.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(2000);

// Debug: show the top of the iframe's body so we know what's inside
const bodyPreview = await frame.evaluate(() => document.body.innerHTML.slice(0, 800));
console.log('\niFrame body preview:\n', bodyPreview, '\n');

// ── Expand scroll containers inside the iframe ───────────────────────────────
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

// ── Resize the iframe element to match its full content height ────────────────
const contentHeight = await frame.evaluate(() => document.body.scrollHeight);
console.log(`iframe content height: ${contentHeight}px`);
await page.evaluate((h) => {
    const iframe = document.querySelector('#itemPreviewIFrame');
    if (iframe) {
        iframe.style.height = h + 'px';
        iframe.style.maxHeight = 'none';
        iframe.style.minHeight = '0';
    }
}, contentHeight);
await page.waitForTimeout(300);

// ── Screenshot just the iframe element ───────────────────────────────────────
await iframeLocator.screenshot({ path: screenshotPath });
console.log(`Screenshot saved: ${screenshotPath}`);

// ── HTML from inside the iframe ───────────────────────────────────────────────
const html = await frame.evaluate(() => document.documentElement.outerHTML);
writeFileSync(htmlPath, html, 'utf-8');
console.log(`HTML saved:  ${htmlPath}  [${html.length} bytes]`);

// ── CSS files referenced by the iframe ───────────────────────────────────────
const baseUrl = frame.url();
const cssHrefs = await frame.evaluate(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
        .map(el => el.href)  // browser resolves to absolute URLs
);

if (cssHrefs.length > 0) {
    const cssDir = join(itemDir, 'css');
    mkdirSync(cssDir, { recursive: true });

    for (const href of cssHrefs) {
        try {
            const response = await page.context().request.get(href);
            if (response.ok()) {
                const filename = href.split('/').pop().split('?')[0] || 'style.css';
                const cssPath = join(cssDir, filename);
                writeFileSync(cssPath, await response.text(), 'utf-8');
                console.log(`CSS saved:   ${cssPath}`);
            } else {
                console.warn(`CSS skipped (${response.status()}): ${href}`);
            }
        } catch (e) {
            console.warn(`CSS fetch failed: ${href}\n  ${e.message}`);
        }
    }
} else {
    console.log('No external CSS links found in iframe.');
}

await browser.close();
