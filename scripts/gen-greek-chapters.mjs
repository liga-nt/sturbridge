#!/usr/bin/env node
/**
 * gen-greek-chapters.mjs
 *
 * Generates English overview prose for "The Aporia of the Children" chapters.
 * Each chapter is written in Socrates's first-person voice (or Plato's for ch_F),
 * using story.json as the narrative brief.
 *
 * Output: data/Greek/chapters/{chapter_id}.md
 *
 * Usage:
 *   node scripts/gen-greek-chapters.mjs ch_P_euthyphro
 *   node scripts/gen-greek-chapters.mjs --all
 *   node scripts/gen-greek-chapters.mjs --all --skip-existing
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const STORY_PATH   = path.join(__dirname, '../data/Greek/story.json');
const OUT_DIR      = path.join(__dirname, '../data/Greek/chapters');
const MODEL        = 'claude-opus-4-7';
const MAX_TOKENS   = 2500;

// ---------------------------------------------------------------------------
// Style exemplar — the author-revised prologue, used as the voice anchor
// ---------------------------------------------------------------------------
const STYLE_EXEMPLAR = fs.readFileSync(
    path.join(__dirname, '../data/Greek/chapters/ch_P_euthyphro.md'),
    'utf8'
);;

// ---------------------------------------------------------------------------
// System prompt — cached, reused for all chapters
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are writing chapters of "The Aporia of the Children," a novel for 7th graders preparing for the National Greek Exam. You write with precision, warmth, and literary care.

## The Story

Four children from a troubled future civilization travel back to fifth-century Athens seeking wisdom. Socrates becomes their guide — not by giving answers, but by questioning everything they think they've found. Each travel block presents a compelling false hope (divine authority, courage and sacrifice, beauty and human systems, grand ambition and vision). Each false hope is dissolved when the children return to Socrates. At the end, arriving with nothing but honest uncertainty — aporia — they discover that is precisely what they needed to find. Socrates dies the day of their final return.

## The Four False Hopes (in order)
1. Someone already has the answer (dissolved in the prologue)
2. Courage and sacrifice save civilizations (Travel Block II → dissolved at Return I / Apology)
3. Beauty, order, and human systems can heal civilization (Travel Block III → dissolved at Return II / Crito)
4. Grand vision and ambition can save everything (Travel Block IV → dissolved at Return III / Phaedo)

## The Characters
- **Phoebe** (13) — the observer; watches before she speaks; strong moral compass; patron deity Apollo; gift is a spyglass that shows truth. Most enamored with false hope 1 (divine authority). Her culminating moment: raises the spyglass at Return III and sees Socrates plainly — an old man at peace with not knowing.
- **Pallas** (13) — brave, decisive, natural leader; acts before thinking; patron deity Athena; gift is a flute with mysterious properties. Most enamored with false hope 2 (courage and sacrifice).
- **Klēta** (10) — inventive, practical, loves making things; patron deity Hephaestus; gift is a small hammer. Most enamored with false hope 3 (human creativity and institutions).
- **Dolios** (10) — charming, quick-witted, talks his way everywhere; patron deity Hermes; gift is winged sandals. Most enamored with false hope 4 (grand vision and ambition). Like Icarus, he flies too high on confidence — his central moment is finding the unfinished Daedalus frieze at Knossos.
- **Socrates** — narrator (first person) for all chapters except the finale. Approximately 70, Athenian philosopher, ironic and warm, relentlessly questioning, owns nothing. He has a habit of sitting down when struck by something. He is awaiting death throughout the story and is entirely at peace with it.
- **Plato** — narrator only for the final chapter (ch_F_plato). Young, approximately 28, devoted student of Socrates, historically absent from the death scene due to illness.

## The Platonic Arc (Socrates's timeline)
- Prologue (ch_P_euthyphro): Children meet Socrates on the steps of the King Archon's court, about to be tried
- Return I (ch_R1_apology): Socrates has been convicted and sentenced to death
- Return II (ch_R2_crito): Socrates is in prison; Crito is there with escape plan; he refuses
- Return III (ch_R3_phaedo_morning): Morning of the hemlock; mid-conversation with friends
- Finale (ch_F_plato): Plato finds the manuscript in the empty cell

## The Sailboat
The children arrived from the future on a modern sailboat capable of tacking into the wind — sailing at an angle against the wind. Greeks of Socrates's era could not tack; they waited for favorable winds. This is one of the details that convinces Socrates the children are genuinely from the future: Agamemnon's fleet was stranded at Aulis because they could not tack, which is why he sacrificed Iphigenia. The sailboat also travels through time, not just geography.

## Voice Rules for Socrates as Narrator
- First person, present and immediate for most chapters — he is writing this in prison and speaks as though recalling vividly
- Irony is warm, never cruel. He finds people genuinely interesting even when they are foolish.
- He sits down when struck by something important
- He does not lecture. He questions, observes, and notices what others miss.
- He does not claim knowledge he doesn't have. When narrating events he didn't witness (ch_00_storm), he notes this explicitly.
- He uses straightforward syntax. No ornate sentences. Clear and precise.
- Dialogue should feel natural for 7th graders but not dumbed down. The characters sound like actual people.

## Voice Rules for Plato as Narrator (ch_F only)
- First person, grief-filtered, secondhand reconstruction
- He is a young man writing about the teacher he lost. The emotion is present but controlled — he is trying to be accurate.
- He notes his own absence from the death scene. This is historically documented in the Phaedo.

## Style Reference
Here is the approved prologue chapter as your style anchor. Match this voice, register, and pacing:

${STYLE_EXEMPLAR}

## Formatting
- Begin with the chapter title on its own line: "Chapter [number/label]: [Title]"
- Prose paragraphs only — no headers, no bullet points, no subheadings within the chapter
- Target 600–1000 words for travel chapters, 400–700 for return chapters, 400–600 for at-sea transition chapters
- ch_F_plato (Plato's finale) should run 700–1000 words`;

// ---------------------------------------------------------------------------
// Build the per-chapter user prompt
// ---------------------------------------------------------------------------
function buildChapterBrief(chapter, story) {
    const lines = [];

    lines.push(`Write the chapter described below. Use the voice and style of the approved exemplar.`);
    lines.push('');
    lines.push(`**Chapter ID:** ${chapter.id}`);
    lines.push(`**Chapter number:** ${chapter.chapter_number}`);
    lines.push(`**Title:** ${chapter.title}`);
    lines.push(`**Type:** ${chapter.type}`);
    lines.push(`**Narrator:** ${chapter.narrator}`);
    lines.push('');
    lines.push(`**Narrative mode:** ${chapter.narrative_mode}`);
    lines.push('');

    if (chapter.location) {
        lines.push(`**Location:** ${chapter.location}`);
    }
    if (chapter.time_period) {
        lines.push(`**Time period:** ${chapter.time_period}`);
    }
    lines.push('');

    if (chapter.place_description) {
        lines.push(`**Place description:**`);
        lines.push(chapter.place_description);
        lines.push('');
    }

    if (chapter.historical_significance) {
        lines.push(`**Historical significance:**`);
        lines.push(chapter.historical_significance);
        lines.push('');
    }

    if (chapter.deity_artifact) {
        lines.push(`**Deity / artifact present:**`);
        lines.push(`Deity: ${chapter.deity_artifact.deity}`);
        lines.push(chapter.deity_artifact.description);
        lines.push('');
    }

    if (chapter.false_hope !== null && chapter.false_hope !== undefined) {
        const fh = story.false_hopes.find(f => f.id === chapter.false_hope);
        if (fh) {
            lines.push(`**False hope being cultivated (hope #${fh.id}: "${fh.label}"):**`);
            if (chapter.false_hope_description) {
                lines.push(chapter.false_hope_description);
            } else {
                lines.push(fh.description);
            }
            lines.push('');
        }
    }

    if (chapter.aporia_concealed) {
        lines.push(`**Aporia concealed (what the chapter quietly questions):**`);
        lines.push(chapter.aporia_concealed);
        lines.push('');
    }

    if (chapter.mystical_experience) {
        lines.push(`**Mystical experience in this chapter:**`);
        lines.push(`Child: ${chapter.mystical_experience.child}`);
        lines.push(chapter.mystical_experience.description);
        lines.push('');
    }

    if (chapter.gift_given) {
        lines.push(`**Gift given in this chapter:**`);
        lines.push(`To: ${chapter.gift_given.child} | From: ${chapter.gift_given.deity}`);
        lines.push(`Gift: ${chapter.gift_given.gift}`);
        lines.push(`How: ${chapter.gift_given.manner}`);
        lines.push('');
    }

    if (chapter.most_enamored_child) {
        const child = chapter.most_enamored_child === 'all'
            ? 'all four children equally'
            : chapter.most_enamored_child;
        lines.push(`**Child most enamored with the false hope:** ${child}`);
        lines.push('');
    }

    lines.push(`**Narrative description (the plot brief — what should happen in this chapter):**`);
    lines.push(chapter.narrative_description);
    lines.push('');

    if (chapter.standards_covered && chapter.standards_covered.length > 0) {
        lines.push(`**Standards this chapter must cover** (weave these in naturally — geography, history, myth as appropriate):`);
        lines.push(chapter.standards_covered.join(', '));
        lines.push('');
    }

    // Special instructions for specific chapter types
    if (chapter.id === 'ch_00_storm') {
        lines.push(`**Special instruction:** Socrates is narrating events he only knows second-hand from the children's account. He should make this explicit early — the very first thing he tells us is something he did not witness himself. This is intentional epistemic humility built into the opening.`);
        lines.push('');
    }

    if (chapter.id === 'ch_P_euthyphro') {
        lines.push(`**Special instruction:** This is an updated version of the style exemplar — it should closely match that voice but ADD the following: Socrates notices the children's sailboat and marvels at its rigging, specifically its ability to tack (sail at an angle into the wind). In his era, Greeks could not tack; if Agamemnon's fleet had been able to tack, they would not have been stranded at Aulis and he would not have had to sacrifice Iphigenia. The boat's rigging is one of the things that genuinely convinces Socrates the children are from the future. Work this detail in naturally — it fits with his habit of examining unusual things.`);
        lines.push('');
    }

    if (chapter.type === 'return') {
        lines.push(`**Special instruction:** This is a return chapter — shorter and more concentrated than travel chapters. The dramatic engine is Socratic questioning: the children present what they found; Socrates questions it until they arrive at honest uncertainty. The place description matters less here than the quality of the dialogue.`);
        lines.push('');
    }

    if (chapter.type === 'at_sea') {
        lines.push(`**Special instruction:** This is a transitional at-sea chapter. It should feel like a breath between larger episodes — contemplative, wide-angled. Socrates surveys the world from the water. The chapter is shorter and quieter than the travel chapters on either side.`);
        lines.push('');
    }

    if (chapter.id === 'ch_F_plato') {
        lines.push(`**Special instruction:** This chapter is narrated by Plato, not Socrates. Plato was historically absent from the death scene — he says so himself in the Phaedo, citing illness. He reconstructs the final conversation from secondhand accounts. He finds Socrates's manuscript (this story) in the prison cell, having been sent there by Hestia's presence at his own hearth. His voice is grief-filtered, careful, secondhand — a young man trying to be accurate about something he didn't see. Dolios's false hope (#4 — grand vision) is dissolved in the final conversation. The ending should be open and quiet: not triumphant, but at peace.`);
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);
    const doAll = args.includes('--all');
    const skipExisting = args.includes('--skip-existing');
    const targetId = args.find(a => !a.startsWith('--'));

    if (!doAll && !targetId) {
        console.error('Usage: node gen-greek-chapters.mjs <chapter_id>');
        console.error('       node gen-greek-chapters.mjs --all [--skip-existing]');
        process.exit(1);
    }

    const story = JSON.parse(fs.readFileSync(STORY_PATH, 'utf8'));
    const chapters = doAll ? story.chapters : story.chapters.filter(c => c.id === targetId);

    if (chapters.length === 0) {
        console.error(`No chapter found with id: ${targetId}`);
        process.exit(1);
    }

    const client = new Anthropic();

    for (const chapter of chapters) {
        const outPath = path.join(OUT_DIR, `${chapter.id}.md`);

        if (skipExisting && fs.existsSync(outPath)) {
            console.log(`skip  ${chapter.id} (exists)`);
            continue;
        }

        console.log(`gen   ${chapter.id}: ${chapter.title} ...`);

        try {
            const response = await client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: [
                    {
                        type: 'text',
                        text: SYSTEM_PROMPT,
                        cache_control: { type: 'ephemeral' }
                    }
                ],
                messages: [
                    {
                        role: 'user',
                        content: buildChapterBrief(chapter, story)
                    }
                ]
            });

            const text = response.content[0].text;
            fs.writeFileSync(outPath, text, 'utf8');

            const usage = response.usage;
            const cached = usage.cache_read_input_tokens ?? 0;
            console.log(`done  ${chapter.id} — ${text.split(/\s+/).length} words | cache_read: ${cached}`);

        } catch (err) {
            console.error(`FAIL  ${chapter.id}: ${err.message}`);
            if (!doAll) process.exit(1);
        }
    }
}

main();
