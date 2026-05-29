import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { json, error } from '@sveltejs/kit';

const APPROVALS_PATH = join(process.cwd(), 'data/approvals.json');

function load() {
  try {
    return JSON.parse(readFileSync(APPROVALS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export function GET() {
  return json(load());
}

export async function POST({ request }) {
  const { item_id, approved } = await request.json();
  if (!item_id || typeof approved !== 'boolean') throw error(400, 'Missing item_id or approved');

  const map = load();
  if (approved) {
    map[item_id] = true;
  } else {
    delete map[item_id];
  }
  writeFileSync(APPROVALS_PATH, JSON.stringify(map, null, 2) + '\n', 'utf-8');
  return json({ ok: true });
}
