import { readFileSync } from 'fs';
import { join } from 'path';

function loadJson(path) {
    const raw = readFileSync(path, 'utf-8')
        .split('\n')
        .filter(line => !line.trimStart().startsWith('//'))
        .join('\n');
    return JSON.parse(raw);
}

export function load() {
    const base = join(process.cwd(), 'data/Greek');

    const curriculum = JSON.parse(readFileSync(join(base, 'chapter_curriculum.json'), 'utf-8'));
    const outline = loadJson(join(base, 'outline_v2.json'));
    const coverageData = loadJson(join(base, 'standards_coverage.json'));
    const coverage = coverageData.standards ?? [];
    const introStandards = loadJson(join(base, 'nge_intro_standards.json'));
    const ngeVocab = JSON.parse(readFileSync(join(base, 'nge_vocabulary.json'), 'utf-8'));

    const chapterTitles = Object.fromEntries(
        (outline.chapters ?? []).map(c => [c.chapter_id, c.title])
    );

    const grammarStandards = (introStandards.standards ?? []).filter(s =>
        s.domain === 'language'
    );

    return {
        curriculum,
        chapterTitles,
        standardsCoverage: coverage,  // flat array of { id, status, chapters }
        grammarStandards,
        introVocab: (ngeVocab.entries ?? []).filter(e => e.introduced === 'intro'),
    };
}
