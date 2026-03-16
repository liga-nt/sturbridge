/**
 * Renders text containing [n/d] fraction notation as HTML stacked fractions.
 * Example: "[6/100] + [3/10]" → HTML with .frac spans
 * Styles for .frac live in app.css so they apply to {@html} output.
 */
export function renderMath(text) {
    if (!text) return '';
    return text
        .replace(/\[(\d+)\/(\d+)\]/g, (_, num, den) =>
            `<span class="frac"><span class="frac-num">${num}</span><span class="frac-den">${den}</span></span>`
        )
        .replace(/\{\?\}/g, `<span class="box-q">?</span>`)
        .replace(/\[Save\]/g, `<span class="save-pill">Save</span>`);
}
