import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('Navigating to item library...');
await page.goto('https://mcas.digitalitemlibrary.com/home?subject=Math&grades=Grade%204&view=ALL', {
  waitUntil: 'networkidle',
  timeout: 30000
});

// Wait for items to load
await page.waitForTimeout(3000);

// Try to get all item data
const content = await page.content();

// Look for item cards or rows
const items = await page.evaluate(() => {
  const results = [];

  // Try various selectors for item rows/cards
  const rows = document.querySelectorAll('tr, .item-row, .item-card, [data-item-id], [class*="item"]');
  rows.forEach(row => {
    const text = row.innerText || row.textContent;
    if (text && text.includes('MA')) {
      results.push(text.trim().substring(0, 300));
    }
  });

  return results;
});

console.log('Found items:', items.length);
items.forEach(i => console.log(i));

// Also dump page text
const bodyText = await page.evaluate(() => document.body.innerText);
console.log('\n=== FULL PAGE TEXT ===');
console.log(bodyText.substring(0, 50000));

await browser.close();
