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

    const outline = loadJson(join(base, 'outline_v2.json'));
    const introStandards = loadJson(join(base, 'nge_intro_standards.json'));
    const ngeVocab = JSON.parse(readFileSync(join(base, 'nge_vocabulary.json'), 'utf-8'));

    const chapterTitles = Object.fromEntries(
        (outline.chapters ?? []).map(c => [c.chapter_id, c.title])
    );

    const grammarStandards = (introStandards.standards ?? []).filter(s =>
        s.domain === 'language'
    );
    const allNgeStandards = introStandards.standards ?? [];
    const ngeQuestions = JSON.parse(readFileSync(join(base, 'nge_questions.json'), 'utf-8'));

    const grammarFlashcards = loadJson(join(base, 'grammar_flashcards.json'));

    return {
        chapterTitles,
        grammarStandards,
        allNgeStandards,
        ngeQuestions,
        grammarFlashcards,
        introVocab: (ngeVocab.entries ?? []).filter(e => e.introduced === 'intro'),
    };
}
