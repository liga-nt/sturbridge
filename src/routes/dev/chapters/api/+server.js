import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { json, error } from '@sveltejs/kit';

const CHAPTERS_DIR = join(process.cwd(), 'data/Greek/chapters');

export async function GET({ url }) {
    const file = url.searchParams.get('file');

    if (!file) {
        const files = readdirSync(CHAPTERS_DIR)
            .filter(f => f.endsWith('.md'))
            .sort();
        return json({ files });
    }

    if (file.includes('..') || file.includes('/')) {
        throw error(400, 'Invalid filename');
    }

    const content = readFileSync(join(CHAPTERS_DIR, file), 'utf-8');
    return json({ content });
}

export async function POST({ request }) {
    const { file, content } = await request.json();

    if (!file || typeof content !== 'string') {
        throw error(400, 'Missing file or content');
    }
    if (file.includes('..') || file.includes('/')) {
        throw error(400, 'Invalid filename');
    }

    writeFileSync(join(CHAPTERS_DIR, file), content, 'utf-8');
    return json({ ok: true });
}
