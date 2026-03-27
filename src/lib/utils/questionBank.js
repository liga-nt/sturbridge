/**
 * Question bank: maps standardId → array of question objects (with item_id).
 * Built from all 5 question JSON files + a static item_id→standard mapping.
 */

import questions2019 from '../../../data/g4-math_2019_questions.json';
import questions2021 from '../../../data/g4-math_2021_questions.json';
import questions2022 from '../../../data/g4-math_2022_questions.json';
import questions2023 from '../../../data/g4-math_2023_questions.json';
import questions2025 from '../../../data/g4-math_2025_questions.json';

// Static mapping of item_id → standard code (derived from CSV)
const ITEM_STANDARD = {
  'MA714233266': '4.G.A.2',
  'MA714111699': '4.G.A.3',
  'MA222213':    '4.MD.A.1',
  'MA247745':    '4.MD.A.3',
  'MA303329':    '4.MD.B.4',
  'MA704650539': '4.MD.C.6',
  'MA306994':    '4.MD.C.7',
  'MA307033':    '4.NBT.A.1',
  'MA307037':    '4.NBT.A.2',
  'MA713680384': '4.NBT.A.3',
  'MA286777':    '4.NBT.B.4',
  'MA704647848': '4.NF.A.2',
  'MA303319':    '4.NF.B.3',
  'MA304988':    '4.NF.B.4',
  'MA311551':    '4.NF.C.5',
  'MA714225971': '4.NF.C.6',
  'MA311583':    '4.NF.C.7',
  'MA713939739': '4.OA.A.2',
  'MA279791':    '4.OA.A.3',
  'MA227383':    '4.OA.B.4',
  // 2021
  'MA311574':    '4.G.A.1',
  'MA800629956': '4.G.A.3',
  'MA287484':    '4.MD.A.2',
  'MA306940':    '4.MD.A.3',
  'MA800763292': '4.MD.B.4',
  'MA306993':    '4.MD.C.7',
  'MA800780932': '4.NBT.A.2',
  'MA803846674': '4.NBT.A.3',
  'MA270627':    '4.NBT.B.4',
  'MA803742735': '4.NF.A.1',
  'MA803746135': '4.NF.A.2',
  'MA704649496': '4.NF.B.3',
  'MA297973':    '4.NF.B.4',
  'MA736379417': '4.NF.C.5',
  'MA229063':    '4.NF.C.6',
  'MA714226701': '4.NF.C.6',
  'MA307079':    '4.OA.A.1',
  'MA713629341': '4.OA.A.3',
  'MA800628900': '4.OA.B.4',
  'MA803730594': '4.OA.C.5',
  // 2022
  'MA704652242': '4.G.A.1',
  'MA903757124': '4.G.A.2',
  'MA307066':    '4.G.A.3',
  'MA803738583': '4.MD.A.1',
  'MA903574399': '4.MD.A.3',
  'MA903537924': '4.MD.C.6',
  'MA307310':    '4.NBT.A.1',
  'MA900842465': '4.NBT.A.3',
  'MA307692':    '4.NBT.B.4',
  'MA279790':    '4.NBT.B.5',
  'MA623833763': '4.NBT.B.6',
  'MA800767155': '4.NF.A.1',
  'MA900845776': '4.NF.B.3',
  'MA800633803': '4.NF.B.4',
  'MA704650142': '4.NF.B.4',
  'MA903134963': '4.NF.C.5',
  'MA286765':    '4.NF.C.6',
  'MA900775955': '4.NF.C.7',
  'MA900751683': '4.OA.A.3',
  'MA311579A':   '4.OA.C.5',
  // 2023
  'MA002128911': '4.G.A.1',
  'MA307060':    '4.G.A.2',
  'MA247705':    '4.G.A.3',
  'MA002135528': '4.MD.A.1',
  'MA903571693': '4.MD.A.3',
  'MA002139080': '4.MD.B.4',
  'MA903776098': '4.MD.C.5',
  'MA002140372': '4.MD.C.7',
  'MA001851276': '4.NBT.A.3',
  'MA002034926': '4.NBT.B.4',
  'MA307317':    '4.NBT.B.5',
  'MA801035466': '4.NF.A.2',
  'MA900846441': '4.NF.B.3',
  'MA303324':    '4.NF.B.4',
  'MA002334462': '4.NF.C.6',
  'MA002145158': '4.NF.C.7',
  'MA704653374': '4.OA.A.1',
  'MA301798':    '4.OA.A.2',
  'MA001750121': '4.OA.B.4',
  'MA297614':    '4.OA.C.5',
  // 2025
  'MA232254177': '4.G.A.1',
  'MA232261850': '4.G.A.3',
  'MA231875780': '4.MD.A.1',
  'MA010534486': '4.MD.A.3',
  'MA311554':    '4.MD.C.5',
  'MA000732007': '4.MD.C.6',
  'MA713677363': '4.NBT.A.2',
  'MA202029218': '4.NBT.A.3',
  'MA307314':    '4.NBT.B.4',
  'MA002162929': '4.NBT.B.5',
  'MA311543':    '4.NBT.B.6',
  'MA900754381': '4.NF.A.2',
  'MA800780887': '4.NF.B.3',
  'MA233051799': '4.NF.B.4',
  'MA231836735': '4.NF.C.6',
  'MA900776517': '4.NF.C.7',
  'MA900741771': '4.OA.A.2',
  'MA136448521': '4.OA.B.4',
  'MA900750085': '4.OA.B.4',
  'MA250533':    '4.OA.C.5',
};

const allQuestions = [
  ...questions2019,
  ...questions2021,
  ...questions2022,
  ...questions2023,
  ...questions2025
];

/** { [item_id]: year } */
export const ITEM_YEAR = {};
for (const q of questions2019) ITEM_YEAR[q.item_id] = 2019;
for (const q of questions2021) ITEM_YEAR[q.item_id] = 2021;
for (const q of questions2022) ITEM_YEAR[q.item_id] = 2022;
for (const q of questions2023) ITEM_YEAR[q.item_id] = 2023;
for (const q of questions2025) ITEM_YEAR[q.item_id] = 2025;

/** { [standardId]: question[] } */
export const byStandard = {};

for (const q of allQuestions) {
  const std = ITEM_STANDARD[q.item_id];
  if (!std) continue;
  if (!byStandard[std]) byStandard[std] = [];
  byStandard[std].push(q);
}

// Question types that have no bind:value export and can't be graded in the student view
const UNSUPPORTED_TYPES = new Set([]);

/**
 * Pick a random question for a standard, preferring items not in seenIds.
 * Excludes question types that can't be rendered/graded in the student view.
 * Falls back to any supported question if all supported ones have been seen.
 */
export function pickQuestion(standardId, seenIds = []) {
  const pool = (byStandard[standardId] || []).filter(
    (q) => !UNSUPPORTED_TYPES.has(q.answer_type)
  );
  if (pool.length === 0) return null;
  const unseen = pool.filter((q) => !seenIds.includes(q.item_id));
  const candidates = unseen.length > 0 ? unseen : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export { ITEM_STANDARD };
