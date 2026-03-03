import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const itemId = process.argv[2];
if (!itemId) {
    console.error('Usage: node scripts/fetch-question.mjs <itemID>');
    process.exit(1);
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

await page.goto(
    `https://mcas.digitalitemlibrary.com/home?subject=Math&grades=Grade%204&view=ALL&itemUIN=${itemId}`,
    { waitUntil: 'networkidle', timeout: 30000 }
);
await page.waitForTimeout(8000);

await page.screenshot({ path: `scripts/question-${itemId}.png`, fullPage: true });

// Extract the TestNav preview URL from the outer page's iframe src
const previewUrl = await page.evaluate(() => {
    const iframe = document.querySelector('iframe[name="itemPreviewFrame"]');
    return iframe ? iframe.src : null;
});
if (previewUrl) {
    console.log(`PREVIEW_URL: ${previewUrl}`);
} else {
    console.warn('Could not find itemPreviewFrame src');
}

// The item renders inside itemPreviewFrame (TestNav previewer)
const frames = page.frames();
const previewFrame = frames.find(f => f.name() === 'itemPreviewFrame' || f.url().includes('testnav'));

if (previewFrame) {
    await previewFrame.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);
    const html = await previewFrame.evaluate(() => document.body.innerHTML);
    writeFileSync(`scripts/question-${itemId}.html`, html);
    console.log(`HTML saved from TestNav frame: scripts/question-${itemId}.html`);
    console.log('Length:', html.length);
} else {
    const html = await page.evaluate(() => document.body.innerHTML);
    writeFileSync(`scripts/question-${itemId}.html`, html);
    console.log(`HTML saved from page: scripts/question-${itemId}.html`);
    console.log('Length:', html.length);
}

await browser.close();
