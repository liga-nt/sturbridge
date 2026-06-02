import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { json } from '@sveltejs/kit';

const CURRICULUM_PATH = join(process.cwd(), 'data/Greek/chapter_curriculum.json');

export async function PATCH({ request }) {
  const { chapter_id, vocab, grammar } = await request.json();
  if (!chapter_id) return json({ error: 'chapter_id required' }, { status: 400 });

  const curriculum = JSON.parse(readFileSync(CURRICULUM_PATH, 'utf-8'));
  const idx = curriculum.findIndex(c => c.chapter_id === chapter_id);
  if (idx === -1) return json({ error: 'Chapter not found' }, { status: 404 });

  if (vocab !== undefined) curriculum[idx].vocab = vocab;
  if (grammar !== undefined) curriculum[idx].grammar = grammar;

  writeFileSync(CURRICULUM_PATH, JSON.stringify(curriculum, null, 2));
  return json({ ok: true });
}
