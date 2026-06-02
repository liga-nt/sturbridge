/**
 * build-standards-coverage.mjs
 * Strips JS-style comments from data/Greek/standards_coverage.json
 * and writes a clean copy to static/data/Greek/standards_coverage.json
 * so it can be fetched by the client-side app.
 *
 * Usage: node scripts/build-standards-coverage.mjs
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const raw = fs.readFileSync(path.join(ROOT, 'data/Greek/standards_coverage.json'), 'utf8')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('//'))
  .join('\n');

const data = JSON.parse(raw);

const outPath = path.join(ROOT, 'static/data/Greek/standards_coverage.json');
fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Wrote ${data.standards.length} standards to ${outPath}`);
