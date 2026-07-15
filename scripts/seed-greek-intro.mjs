/**
 * Seed Firestore with the grade7-greek-intro lesson document.
 *
 * Creates (or overwrites) lessons/grade7-greek-intro with markdown text for the
 * three Introduction page tabs: introduction, pronunciation, typing.
 *
 * Format: standard markdown with {curly brackets} around display-only content
 * (headings for now). The CF's stripCurly removes {…} before TTS.
 *
 * Usage: node scripts/seed-greek-intro.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const LESSON_ID = 'grade7-greek-intro';

// ── Tab content (markdown, headings in {}) ────────────────────────────────────

const introductionText = `{## Welcome to Greek}

{### A Language Worth Learning}

You are about to learn Ancient Greek — the language of Homer, Plato, and the New Testament. It is one of the oldest written languages in the world, and more English words come from Greek than from any other source.

This course follows a story set in the ancient Mediterranean. As you work through each chapter, you will encounter real Greek sentences, learn how the language works, and build a reading vocabulary drawn directly from the National Greek Exam syllabus.

{### How the Course Works}

Each chapter has three parts. The **Overview** tells you where the story is going and introduces the historical or geographical setting. The **Grammar** section explains one feature of how Greek is built. The **Practice** section gives you Greek sentences to read and vocabulary to master.

Before you dive into the first chapter, spend time in the **Alphabet** lesson. You cannot read Greek without knowing the letters, and the alphabet is smaller and more regular than you might expect.

{### What You Will Be Tested On}

This course prepares you for the **National Greek Exam** — a standardized test taken by students of Greek across the United States. The exam tests reading comprehension, vocabulary, grammar, and transliteration.

Everything in this course is aligned to the Introductory level of that exam. Every vocabulary word, every grammar point, every piece of historical content comes from the official syllabus.`;

const pronunciationText = `{## How We Pronounce Ancient Greek}

{### A Language Across 2,500 Years}

Ancient Greek was spoken across the Mediterranean world from roughly 800 BCE to 300 CE — a span longer than the entire history of the United States, multiplied by twelve. No recordings exist. No one alive has ever heard it spoken by a native speaker.

What we have instead are two traditions for reading it aloud:

**Reconstructed pronunciation** attempts to recover how ancient Greeks might have spoken, piecing together clues from their poetry, their puns, and comparisons with other ancient languages. Scholars still debate the details.

**Modern Greek pronunciation** is a living tradition — the direct descendant of ancient Greek, carried forward through the Byzantine Empire, the Orthodox Church, and 3,000 years of unbroken use. This is the pronunciation you will learn.

{### The Breathings: A Mark That Fell Silent}

Every Greek word that begins with a vowel carries one of two breathing marks:

<div class="breathing-pair">
  <div class="breathing-item">
    <span class="gk">ἀ</span>
    <div><strong>Smooth breathing</strong> — always silent. It simply marks the absence of an "h."</div>
  </div>
  <div class="breathing-item">
    <span class="gk">ἁ</span>
    <div><strong>Rough breathing</strong> — in ancient Greek, pronounced like the English letter "h." The word <span class="gk">ἁμαρτία</span> (meaning "fault" or "error") began with a clear, audible "h."</div>
  </div>
</div>

In modern Greek pronunciation, **both breathings are silent**. You will not pronounce either one. Modern Greek no longer even writes them in everyday text.

But knowing their history matters. When you see <span class="gk">ῥ</span> (rho with rough breathing), you are looking at a sound ancient Greeks pronounced "rh" — the same "rh" we still write in English words like *rhetoric* and *rhapsody*, those silent letters carrying the ghost of the ancient rough breathing.

{### The Great "ee" Merger}

This is the most striking thing about modern Greek pronunciation, and the hardest to believe until you hear it.

Ancient Greek had many distinct vowel sounds. Modern Greek collapsed most of them into a single sound: **"ee"** — like the "ee" in *meet*.

All of the following are pronounced the same way in modern Greek:

{| Letter or Diphthong | Ancient sound (approx.) | Modern sound |}
{|---|---|---|}
{| <span class="gk">ι</span> iota | short "i" (like *bit*) | **ee** |}
{| <span class="gk">η</span> eta | long "e" (like *they*) | **ee** |}
{| <span class="gk">υ</span> upsilon | like French *u* or German *ü* | **ee** |}
{| <span class="gk">ει</span> epsilon-iota | "ay" | **ee** |}
{| <span class="gk">οι</span> omicron-iota | "oy" | **ee** |}

Five different letters and diphthongs, one sound. Linguists call this **iotacism** — the gravitational pull of the "ee" sound across the whole vowel system of Greek.

{### English Does This Too}

If iotacism sounds strange, consider what English does with unstressed vowels.

The letter "a" in *about*, the "e" in *taken*, the "i" in *pencil*, the "o" in *lemon*, the "u" in *focus* — every one of these is pronounced the same way: **"uh."** Linguists call this sound the *schwa*, and it is the most common vowel sound in the English language.

Five different letters. Same sound. You have been doing this your whole life without thinking about it.

Greek did the same thing — in the other direction. Where English collapses vowels *downward* into a soft "uh," Greek collapsed them *upward* into a crisp "ee."

{### Easy Maps}

Most Greek consonants map cleanly to a single English sound:

{| Letter | Name | Sound | Like |}
{|---|---|---|---|}
{| <span class="gk">κ</span> | kappa | **k** | *kite* |}
{| <span class="gk">λ</span> | lambda | **l** | *lamp* |}
{| <span class="gk">μ</span> | mu | **m** | *map* |}
{| <span class="gk">ν</span> | nu | **n** | *note* |}
{| <span class="gk">π</span> | pi | **p** | *pen* |}
{| <span class="gk">ρ</span> | rho | **r** | *rope* |}
{| <span class="gk">σ / ς</span> | sigma | **s** | *sun* |}
{| <span class="gk">τ</span> | tau | **t** | *top* |}
{| <span class="gk">ζ</span> | zeta | **z** | *zero* |}

{### Shifted Sounds}

These three consonants sound different from what their names or English spellings would suggest:

{| Letter | Name | You might expect | Actually sounds like | Example |}
{|---|---|---|---|---|}
{| <span class="gk">β</span> | beta | "b" | **v** | *violin* |}
{| <span class="gk">δ</span> | delta | "d" | **th** (voiced) | *the, this, that* |}
{| <span class="gk">γ</span> | gamma | hard "g" | **soft g / y** | like "y" before an "ee" sound |}

{### No Direct English Letter}

These sounds have no single English letter — English uses two letters, a foreign spelling, or has no equivalent at all:

{| Letter | Name | Sound | Closest English |}
{|---|---|---|---|}
{| <span class="gk">θ</span> | theta | **th** (unvoiced) | *think, three, theater* |}
{| <span class="gk">χ</span> | chi | **kh** | "ch" in *Bach* or *loch* |}
{| <span class="gk">ξ</span> | xi | **ks** | the "x" in *box* |}
{| <span class="gk">ψ</span> | psi | **ps** | the ending of *lapse* |}
{| <span class="gk">αυ</span> | alpha-upsilon | **av / af** | shifts with what follows |}
{| <span class="gk">ευ</span> | epsilon-upsilon | **ev / ef** | shifts with what follows |}

{### Accents: From Pitch to Stress}

Ancient Greek accents marked **pitch** — a rise and fall in the voice on a particular syllable, more like a tonal language than a stress language. The acute (<span class="gk">ά</span>), grave (<span class="gk">ὰ</span>), and circumflex (<span class="gk">ᾶ</span>) each indicated a different melodic contour.

In modern Greek pronunciation, accents mark **stress** — which syllable you hit harder when you speak. The distinction between the three shapes matters less; what matters is that you stress the accented syllable.

{### Why Modern Pronunciation?}

Scholars who want to reconstruct the exact sounds of Pericles or Socrates use reconstructed pronunciation, piecing together evidence from poetry, meter, and comparisons with other ancient languages. It preserves distinctions that modern Greek has merged away.

But modern pronunciation has something reconstructed pronunciation does not: it is **alive**. It connects you to a living community of speakers, to the Greek Orthodox liturgy, to Homer read aloud in Greek schools today. It is the pronunciation a Greek child hears when encountering the Odyssey for the first time.

You are not learning a dead reconstruction. You are joining a tradition that has never stopped.`;

const typingText = `{## Two Ways to Type Greek}

{### The Problem}

Your keyboard was designed for English. Greek uses a completely different alphabet — 24 letters, none of which appear on your keys. So how do you type it?

This app gives you two options, and both matter. You can switch between them using the button in the top bar of the Alphabet lesson or in any lesson when practicing vocab.

{### Option 1: Greek Input}

The app maps each key on your keyboard to a Greek letter. Press <kbd>A</kbd> and you get <span class="gk">α</span> (alpha). Press <kbd>B</kbd> and you get <span class="gk">β</span> (beta). Press <kbd>K</kbd> and you get <span class="gk">κ</span> (kappa). Most keys match the first letter of the Greek name or its transliteration, though a few follow the standard Greek keyboard layout rather than a simple sound rule.

When the keyboard panel is visible at the bottom of the screen, you can see exactly which key produces which Greek letter. This is what **Greek + keyboard** mode shows you. Once you've memorized the Greek keyboard layout, you can toggle it to **Greek** to hide the keyboard.

Greek input is useful because it trains you to think in actual Greek letters. When you read a Greek word, you start to recognize the characters the way you recognize English.

{### Diacritics in Greek Mode}

Greek letters often carry small marks called **diacritics** — accents, breathings, or both. For example, <span class="gk">ἄ</span> is alpha with a smooth breathing and an acute accent. <span class="gk">ὦ</span> is omega with a smooth breathing and a circumflex.

In Greek input mode, you add diacritics by pressing the same key again. Press <kbd>A</kbd> once and you get <span class="gk">α</span>. Press <kbd>A</kbd> again and the app adds the next diacritic the letter needs — an accent or a breathing. Press it again and it adds another one if needed. The app always knows which marks belong on that letter in that word, so you never have to choose — just keep pressing until the letter looks right.

This is different from how professional Greek typists add diacritics, which involves pressing separate keys for each mark. The app's cycling method is simpler: one key, pressed repeatedly, until the letter is complete.

**If you're stuck:** if you're typing a Greek word and the next letter won't appear, it almost always means the current letter still needs a diacritic. Press its key one more time. A letter that needs both an accent and a breathing may require two extra presses before you can move on.

If you go on to study ancient Greek more formally, you will likely learn a different input method — one that gives you finer control over each mark. For now, the cycling approach gets you typing real Greek words without memorizing a separate set of diacritic keys.

{### Option 2: Transliteration}

Transliteration is a system for writing Greek sounds using English letters. Instead of typing the Greek character <span class="gk">θ</span>, you type the two letters **th**. Instead of <span class="gk">φ</span>, you type **ph**. Instead of <span class="gk">χ</span>, you type **ch**.

Here are some examples:

{| Greek word | Transliteration | Meaning |}
{|---|---|---|}
{| <span class="gk">ἄρχω</span> | **archo** | I lead, I rule |}
{| <span class="gk">θεός</span> | **theos** | god |}
{| <span class="gk">φιλία</span> | **philia** | love, friendship |}
{| <span class="gk">ψυχή</span> | **psyche** | soul, mind |}
{| <span class="gk">λόγος</span> | **logos** | word, reason |}

You have already seen transliteration in English. Words like *philosophy*, *psychology*, *chaos*, and *alphabet* are English words that were transliterated from Greek — the Greek sounds written out in English letters.

{### Why Both Matter}

**Greek input** helps you learn to read and recognize the actual alphabet. When you can look at <span class="gk">ξ</span> and immediately know it is "xi," or see <span class="gk">ω</span> and know it is "omega," you are reading Greek.

**Transliteration** connects those letters to sounds you already know how to say. And here is the part that directly affects your grade: the **National Greek Exam** — the standardized test for students of Greek — tests transliteration. You may be asked to write the Greek for a transliterated word, or to transliterate a Greek word into English letters.

That means you need to know both directions:

- See <span class="gk">φ</span> → know it transliterates as **ph**
- See **ch** → know it refers to <span class="gk">χ</span>

{### How to Practice}

In the **Alphabet** lesson, the button in the header lets you choose your mode:

<div class="mode-explainer">
  <div class="mode-row-item">
    <span class="mode-badge badge-keyboard">Greek + keyboard</span>
    <span>Type Greek characters using the QWERTY keyboard map. The keyboard panel shows you which key to press.</span>
  </div>
  <div class="mode-row-item">
    <span class="mode-badge badge-greek">Greek</span>
    <span>Same Greek input, but without the keyboard panel visible. Good once you have the keys memorized.</span>
  </div>
  <div class="mode-row-item">
    <span class="mode-badge badge-translit">Transliterate</span>
    <span>Type the English-letter equivalent — **th** for theta, **ph** for phi, **e** for eta. This is what the exam tests.</span>
  </div>
</div>

Start with Greek + keyboard while you are learning the letters. Once you feel comfortable, switch to Transliterate mode and practice that too — especially with the Flashcards and Vocabulary.`;

// ── Seed ──────────────────────────────────────────────────────────────────────

const lessonDoc = {
    courseType: 'intro',
    introduction: { text: introductionText },
    pronunciation: { text: pronunciationText },
    typing:        { text: typingText },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

console.log(`Writing lessons/${LESSON_ID}…`);
await db.collection('lessons').doc(LESSON_ID).set(lessonDoc, { merge: true });
console.log('Done.');
process.exit(0);
