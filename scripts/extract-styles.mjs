import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();

// Intercept CSS responses
const cssFiles = {};
context.on('response', async (response) => {
    const url = response.url();
    if (url.includes('.css') && !url.includes('font')) {
        try {
            const body = await response.text();
            const filename = url.split('/').pop().split('?')[0];
            cssFiles[filename] = { url, body };
        } catch {}
    }
});

const page = await context.newPage();

await page.goto(
    'https://mcas.digitalitemlibrary.com/home?subject=Math&grades=Grade%204&view=ALL&itemUIN=MA227383',
    { waitUntil: 'networkidle', timeout: 30000 }
);
await page.waitForTimeout(8000);

// Get into the TestNav iframe
const frames = page.frames();
const previewFrame = frames.find(f => f.name() === 'itemPreviewFrame');

let computedStyles = {};
if (previewFrame) {
    await previewFrame.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    computedStyles = await previewFrame.evaluate(() => {
        const get = (selector, props) => {
            const el = document.querySelector(selector);
            if (!el) return { error: 'not found: ' + selector };
            const cs = window.getComputedStyle(el);
            const result = {};
            props.forEach(p => result[p] = cs.getPropertyValue(p));
            return result;
        };

        const props = [
            'font-family', 'font-size', 'font-weight', 'line-height',
            'color', 'background-color', 'padding', 'margin',
            'border', 'border-radius', 'letter-spacing'
        ];

        return {
            body: get('body', props),
            questionText: get('.abbi-richtext p', props),
            choiceList: get('.int-choice-list', props),
            choiceItem: get('.int-choice-list li', props),
            choiceLabel: get('.int-choice-label', props),
            choiceDesc: get('.int-choice-desc', props),
            choiceControl: get('.int-choice-control', props),
            radioInput: get('input[type="radio"]', props),
            image: get('.abbi-image', props),
        };
    });
}

// Save CSS files
for (const [name, { url, body }] of Object.entries(cssFiles)) {
    writeFileSync(`scripts/css-${name}`, body);
    console.log(`Saved CSS: scripts/css-${name} (${body.length} chars) from ${url}`);
}

// Save computed styles
writeFileSync('scripts/computed-styles-MA227383.json', JSON.stringify(computedStyles, null, 2));
console.log('Computed styles saved to scripts/computed-styles-MA227383.json');

await browser.close();
