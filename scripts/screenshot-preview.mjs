import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// The dev server needs to be running; use the build preview
await page.goto('http://localhost:4173/dev/preview', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'scripts/preview-q1.png', fullPage: false });
console.log('Screenshot saved to scripts/preview-q1.png');

await browser.close();
