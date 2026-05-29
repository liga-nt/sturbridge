import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { json, error } from '@sveltejs/kit';

const CHAPTERS_DIRS = {
    '1': join(process.cwd(), 'data/Greek/chapters'),
    '2': join(process.cwd(), 'data/Greek/chapters_v2'),
};
const STORY_PATH             = join(process.cwd(), 'data/Greek/story.json');
const OUTLINE_V2_PATH        = join(process.cwd(), 'data/Greek/outline_v2.json');
const STANDARDS_PATH         = join(process.cwd(), 'data/Greek/nge_intro_standards.json');
const STANDARDS_HG_PATH      = join(process.cwd(), 'data/Greek/nge_intro_standards_hist_geo.json');
const STANDARDS_COVERAGE_PATH = join(process.cwd(), 'data/Greek/standards_coverage.json');

function loadJson(path) {
    const raw = readFileSync(path, 'utf-8')
        .split('\n')
        .filter(line => !line.trimStart().startsWith('//'))
        .join('\n');
    return JSON.parse(raw);
}

function buildStandardsMap(path) {
    const { standards } = loadJson(path);
    return Object.fromEntries(standards.map(s => [s.id, s]));
}

function chapterStandards(chapterId) {
    const story = loadJson(STORY_PATH);
    const standardsMap = buildStandardsMap(STANDARDS_PATH);
    const chapter = story.chapters.find(c => c.id === chapterId);
    if (!chapter) return [];
    return (chapter.standards_covered || []).map(id => ({
        id,
        ...(standardsMap[id] || { description: '(no description found)', domain: '' })
    }));
}

function chapterStandardsV2(chapterId) {
    const { standards } = loadJson(STANDARDS_COVERAGE_PATH);
    const standardsMap = buildStandardsMap(STANDARDS_HG_PATH);
    const matched = standards.filter(s =>
        s.status === 'covered' &&
        (s.chapters || []).some(c => chapterId === c || chapterId.startsWith(c + '_'))
    );
    return matched.map(s => ({
        id: s.id,
        ...(standardsMap[s.id] || { description: '(no description found)', domain: '' })
    }));
}

export async function GET({ url }) {
    const file  = url.searchParams.get('file');
    const draft = url.searchParams.get('draft') || '1';
    const dir   = CHAPTERS_DIRS[draft] || CHAPTERS_DIRS['1'];

    if (!file) {
        const files = existsSync(dir)
            ? readdirSync(dir).filter(f => f.endsWith('.md')).sort()
            : [];
        if (draft === '2') {
            const { chapters } = loadJson(OUTLINE_V2_PATH);
            const titles = Object.fromEntries(chapters.map(c => [c.chapter_id, c.title]));
            const v2Order = chapters.map(c => `${c.chapter_id}.md`);
            return json({ files, titles, v2Order });
        }
        return json({ files });
    }

    if (file.includes('..') || file.includes('/')) {
        throw error(400, 'Invalid filename');
    }

    const path = join(dir, file);
    const content = existsSync(path) ? readFileSync(path, 'utf-8') : '';
    const chapterId = file.replace(/\.md$/, '');
    const standards = draft === '2'
        ? chapterStandardsV2(chapterId)
        : chapterStandards(chapterId);
    return json({ content, standards });
}

export async function POST({ request, url }) {
    const { file, content } = await request.json();
    const draft = url.searchParams.get('draft') || '1';
    const dir   = CHAPTERS_DIRS[draft] || CHAPTERS_DIRS['1'];

    if (!file || typeof content !== 'string') {
        throw error(400, 'Missing file or content');
    }
    if (file.includes('..') || file.includes('/')) {
        throw error(400, 'Invalid filename');
    }

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), content, 'utf-8');
    return json({ ok: true });
}
