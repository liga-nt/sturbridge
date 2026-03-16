// fix-malformed-rows.mjs
// For each broken 2-line pair (where a newline inside Standard Text caused a line split),
// replace both lines with one correctly-quoted CSV row.

import fs from 'fs';
import path from 'path';

// ── Build lookup maps ──────────────────────────────────────────────────────────

const urlMap = {};
const previewUrls = JSON.parse(fs.readFileSync('scripts/preview-urls.json', 'utf8'));
previewUrls.forEach(({ item_id, preview_url }) => { urlMap[item_id] = preview_url; });
for (const f of ['data/g4-math_2019_questions.json', 'data/g4-math_2023_questions.json', 'data/g4-math_2025_questions.json']) {
  JSON.parse(fs.readFileSync(f, 'utf8')).forEach(q => {
    if (q.item_id && q.preview_url) urlMap[q.item_id] = q.preview_url;
  });
}

const pngMap = {};
fs.readdirSync('data/items').forEach(id => {
  const p = path.join('data/items', id, id + '.png');
  if (fs.existsSync(p)) pngMap[id] = `data/items/${id}/${id}.png`;
});

// ── Hardcoded correct rows ─────────────────────────────────────────────────────
// Each entry: [Year, Item No., Page No., Reporting Category, Standard Code,
//              Substandard Code, Cluster, Standard Text,
//              Item Type, Item Description, Correct Answer, Released?, item_id]

const STD = {
  'MD_A3': 'Apply the area and perimeter formulas for rectangles in real-world and mathematical problems. For example, find the width of a rectangular room given the area of the flooring and the length, by viewing the area formula as a multiplication equation with an unknown factor. (Note: When finding areas of rectangular regions answers will be in square units. For example, the area of a 1 cm x 1 cm rectangular region will be 1 square centimeter (1 cm2, students are not expected to use this notation.) When finding the perimeter of a rectangular region answers will be in linear units. For example, the perimeter of the region is: 1cm + 1cm + 1cm +1cm = 4 cm or 2(1cm) + 2(1cm) = 4 cm).',
  'MD_B4': 'Make a line plot (dot plot) representation to display a data set of measurements in fractions of a unit (1/2, 1/4, 1/8). Solve problems involving addition and subtraction of fractions by using information presented in line plots (dot plots). For example, from a line plot (dot plot) find and interpret the difference in length between the longest and shortest specimens in an insect collection.',
  'NBT_A1': 'Recognize that in a multi-digit whole number, a digit in any place represents 10 times as much as it represents in the place to its right. For example, recognize that 700 ÷ 70 = 10 by applying concepts of place value and division.',
  'NF_C6': 'Use decimal notation to represent fractions with denominators 10 or 100. For example, rewrite 0.62 as 62/100; describe a length as 0.62 meters; locate 0.62 on a number line diagram.',
};

const CORRECT_ROWS = [
  // 4.MD.A.3
  ['2019','20','237','Measurement and Data','4.MD.A.3','4.MD.A.3','Solve problems involving measurement and conversion of measurements from a larger unit to a smaller unit.',STD.MD_A3,'SR','Given the length and the width of a rectangle, determine its area.','C','Released','MA247745'],
  ['2021','7','10','Measurement and Data','4.MD.A.3','4.MD.A.3','Solve problems involving measurement and conversion of measurements from a larger unit to a smaller unit.',STD.MD_A3,'SR','Use the area formula to find the area of a square.','C','Released','MA306940'],
  ['2022','8','10\u201311','Measurement and Data','4.MD.A.3','4.MD.A.3','Solve problems involving measurement and conversion of measurements from a larger unit to a smaller unit.',STD.MD_A3,'CR','Determine the area of a rectangle given the length and width, determine the width of a rectangle given the area and length, explain how it is possible for two rectangles with different areas to have the same perimeter, and solve a real-world problem involving rectangles with the same perimeter but with different areas.','','Released','MA903574399'],
  ['2023','15','20','Measurement and Data','4.MD.A.3','4.MD.A.3','Solve problems involving measurement and conversion of measurements from a larger unit to a smaller unit.',STD.MD_A3,'SR','Select the equation that shows how to find the perimeter of a rectangle given the length and width.','D','Released','MA903571693'],
  ['2025','4','7','Measurement and Data','4.MD.A.3','4.MD.A.3','Solve problems involving measurement and conversion of measurements from a larger unit to a smaller unit.',STD.MD_A3,'SR','Determine the perimeter and the units used to measure perimeter of a rectangle.','C','Released','MA010534486'],
  // 4.MD.B.4
  ['2019','8','225','Measurement and Data','4.MD.B.4','4.MD.B.4','Represent and interpret data.',STD.MD_B4,'SR','Solve a word problem with addition of fractions by using data from a dot plot.','D','Released','MA303329'],
  ['2021','9','11','Measurement and Data','4.MD.B.4','4.MD.B.4','Represent and interpret data.',STD.MD_B4,'SR','Determine which line plot represents given data.','B','Released','MA800763292'],
  ['2023','8','12','Measurement and Data','4.MD.B.4','4.MD.B.4','Represent and interpret data.',STD.MD_B4,'SR','Solve a word problem with addition of whole numbers and fractions by using data from a dot plot.','A','Released','MA002139080'],
  // 4.NBT.A.1
  ['2019','11','228','Number and Operations in Base Ten','4.NBT.A.1','4.NBT.A.1','Generalize place value understanding for multi-digit whole numbers less than or equal to 1,000,000.',STD.NBT_A1,'SA','In a given multi-digit number, recognize that the value of a digit is 10 times the value of the digit to its right.','10','Released','MA307033'],
  ['2022','4','6','Number and Operations in Base Ten','4.NBT.A.1','4.NBT.A.1','Generalize place value understanding for multi-digit whole numbers less than or equal to 1,000,000.',STD.NBT_A1,'SR','Determine which number has a digit with a value that is 10 times the value of a digit in a given number.','B','Released','MA307310'],
  // 4.NF.C.6
  ['2019','5','221','Number and Operations\u2013Fractions','4.NF.C.6','4.NF.C.6','Understand decimal notation for fractions, and compare decimal fractions.',STD.NF_C6,'SR','Determine the location of a given decimal on a number line.','C','Released','MA714225971'],
  ['2021','3','6','Number and Operations\u2013Fractions','4.NF.C.6','4.NF.C.6','Understand decimal notation for fractions, and compare decimal fractions.',STD.NF_C6,'SR','Determine which decimals are equivalent to a given amount represented by a visual model.','A,E','Released','MA229063'],
  ['2021','16','21\u201322','Number and Operations\u2013Fractions','4.NF.C.6','4.NF.C.6','Understand decimal notation for fractions, and compare decimal fractions.',STD.NF_C6,'SA','Write a decimal equivalent for a given fraction and choose which number line shows a point that represents a given decimal.','0.54;C','Released','MA714226701'],
  ['2022','19','24','Number and Operations\u2013Fractions','4.NF.C.6','4.NF.C.6','Understand decimal notation for fractions, and compare decimal fractions.',STD.NF_C6,'SR','Identify the fraction that is equivalent to a given decimal.','C','Released','MA286765'],
  ['2023','6','10','Number and Operations\u2014Fractions','4.NF.C.6','4.NF.C.6','Understand decimal notation for fractions, and compare decimal fractions.',STD.NF_C6,'SR','Convert a given fraction, with a denominator of 100, to a decimal and identify the number line with a point that represents the location of the decimal.','D','Released','MA002334462'],
  ['2025','17','20','Number and Operations\u2013Fractions','4.NF.C.6','4.NF.C.6','Understand decimal notation for fractions, and compare decimal fractions.',STD.NF_C6,'SR','Determine which fraction is equivalent to a given decimal.','D','Released','MA231836735'],
];

// Keyed by "Year|Item No." for fast lookup
const correctByKey = {};
CORRECT_ROWS.forEach(r => { correctByKey[`${r[0]}|${r[1]}`] = r; });

// ── CSV helpers ───────────────────────────────────────────────────────────────

function esc(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function rowToLine(fields) {
  return fields.map(esc).join(',');
}

// ── Process file ──────────────────────────────────────────────────────────────

const CSV_PATH = 'data/4th_grade_standards_released_questions.xlsx - All Years Combined.csv';
const rawLines = fs.readFileSync(CSV_PATH, 'utf8').trimEnd().split('\n');

const out = [];
let i = 0;
let fixed = 0;

while (i < rawLines.length) {
  const line = rawLines[i];
  const next = rawLines[i + 1] ?? '';

  if (next.startsWith('For example')) {
    // Broken pair — extract Year and Item No. from first line (safe columns)
    const parts = line.split(',');
    const year = parts[0];
    const itemNo = parts[1];
    const key = `${year}|${itemNo}`;
    const correct = correctByKey[key];

    if (!correct) {
      console.warn(`No hardcoded row for key "${key}" — keeping original pair`);
      out.push(line);
      i++;
      continue;
    }

    // Append png_path and preview_url
    const item_id = correct[12];
    const fullRow = [...correct, pngMap[item_id] ?? '', urlMap[item_id] ?? ''];
    out.push(rowToLine(fullRow));
    fixed++;
    i += 2; // consume both lines
  } else {
    out.push(line);
    i++;
  }
}

fs.writeFileSync(CSV_PATH, out.join('\n') + '\n');
console.log(`Fixed ${fixed} broken pairs. File now has ${out.length} lines (including header).`);
