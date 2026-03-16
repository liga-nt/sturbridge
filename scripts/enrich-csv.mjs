import fs from 'fs';
import path from 'path';

// Build preview_url map from all sources
const urlMap = {};

// From preview-urls.json (2021/2022)
const previewUrls = JSON.parse(fs.readFileSync('scripts/preview-urls.json', 'utf8'));
previewUrls.forEach(({ item_id, preview_url }) => { urlMap[item_id] = preview_url; });

// From 2019/2023/2025 JSON files
for (const f of ['data/g4-math_2019_questions.json', 'data/g4-math_2023_questions.json', 'data/g4-math_2025_questions.json']) {
  const qs = JSON.parse(fs.readFileSync(f, 'utf8'));
  qs.forEach(q => { if (q.item_id && q.preview_url) urlMap[q.item_id] = q.preview_url; });
}

// Build PNG presence map
const pngMap = {};
const itemsDir = 'data/items';
fs.readdirSync(itemsDir).forEach(id => {
  const pngPath = path.join(itemsDir, id, id + '.png');
  if (fs.existsSync(pngPath)) pngMap[id] = `data/items/${id}/${id}.png`;
});

// Parse CSV (handle quoted fields with commas)
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const csvText = fs.readFileSync('data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv', 'utf8');
const lines = csvText.trimEnd().split('\n');

const headerFields = parseCSVLine(lines[0]);

// Remove existing png_path/preview_url columns if present
const pngIdx = headerFields.indexOf('png_path');
const urlIdx = headerFields.indexOf('preview_url');

// Build new header
const cleanHeader = headerFields.filter((_, i) => i !== pngIdx && i !== urlIdx);
const newHeader = [...cleanHeader, 'png_path', 'preview_url'];

const newLines = [newHeader.map(escapeCSV).join(',')];

for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);
  // Remove old columns
  const clean = fields.filter((_, j) => j !== pngIdx && j !== urlIdx);
  // item_id is last column of cleanHeader
  const item_id = clean[clean.length - 1].trim();
  const png = pngMap[item_id] || '';
  const url = urlMap[item_id] || '';
  newLines.push([...clean.map(escapeCSV), escapeCSV(png), escapeCSV(url)].join(','));
}

fs.writeFileSync(
  'data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv',
  newLines.join('\n') + '\n'
);

console.log(`Done. ${newLines.length - 1} data rows updated.`);
const withPng = newLines.slice(1).filter(l => {
  const f = parseCSVLine(l);
  return f[f.length - 2] !== '';
}).length;
const withUrl = newLines.slice(1).filter(l => {
  const f = parseCSVLine(l);
  return f[f.length - 1] !== '';
}).length;
console.log(`  png_path filled: ${withPng}`);
console.log(`  preview_url filled: ${withUrl}`);
