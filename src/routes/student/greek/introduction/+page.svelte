<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let activeTab = 'pronunciation';

  const TABS = [
    { id: 'pronunciation', label: 'Pronunciation' },
    { id: 'typing',        label: 'Typing' },
  ];

  const VALID = new Set(['pronunciation', 'typing']);

  onMount(() => {
    const saved = localStorage.getItem('greek_intro_tab');
    activeTab = VALID.has(saved) ? saved : 'pronunciation';
  });

  function setTab(tab) {
    activeTab = tab;
    localStorage.setItem('greek_intro_tab', tab);
  }
</script>

<svelte:head>
  <title>Introduction to Greek</title>
</svelte:head>

<div class="intro-page">
  <header class="page-header">
    <div class="page-header-inner">
      <button class="back-btn" on:click={() => goto('/student/greek')} aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h1 class="page-title">Introduction</h1>
    </div>
  </header>

  <nav class="tab-bar">
    <div class="tab-bar-inner">
      {#each TABS as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          on:click={() => setTab(tab.id)}
        >{tab.label}</button>
      {/each}
    </div>
  </nav>

  <main class="tab-content">
    {#if activeTab === 'pronunciation'}
      <div class="prose-wrap">
        <article class="prose-lesson">

          <h2>How We Pronounce Ancient Greek</h2>

          <section>
            <h3>A Language Across 2,500 Years</h3>
            <p>Ancient Greek was spoken across the Mediterranean world from roughly 800 BCE to 300 CE — a span longer than the entire history of the United States, multiplied by twelve. No recordings exist. No one alive has ever heard it spoken by a native speaker.</p>
            <p>What we have instead are two traditions for reading it aloud:</p>
            <p><strong>Reconstructed pronunciation</strong> attempts to recover how ancient Greeks might have spoken, piecing together clues from their poetry, their puns, and comparisons with other ancient languages. Scholars still debate the details.</p>
            <p><strong>Modern Greek pronunciation</strong> is a living tradition — the direct descendant of ancient Greek, carried forward through the Byzantine Empire, the Orthodox Church, and 3,000 years of unbroken use. This is the pronunciation you will learn.</p>
          </section>

          <section>
            <h3>The Breathings: A Mark That Fell Silent</h3>
            <p>Every Greek word that begins with a vowel carries one of two breathing marks:</p>
            <div class="breathing-pair">
              <div class="breathing-item">
                <span class="gk">ἀ</span>
                <div>
                  <strong>Smooth breathing</strong> — always silent. It simply marks the absence of an "h."
                </div>
              </div>
              <div class="breathing-item">
                <span class="gk">ἁ</span>
                <div>
                  <strong>Rough breathing</strong> — in ancient Greek, pronounced like the English letter "h." The word <span class="gk">ἁμαρτία</span> (meaning "fault" or "error") began with a clear, audible "h."
                </div>
              </div>
            </div>
            <p>In modern Greek pronunciation, <strong>both breathings are silent</strong>. You will not pronounce either one. Modern Greek no longer even writes them in everyday text.</p>
            <p>But knowing their history matters. When you see <span class="gk">ῥ</span> (rho with rough breathing), you are looking at a sound ancient Greeks pronounced "rh" — the same "rh" we still write in English words like <em>rhetoric</em> and <em>rhapsody</em>, those silent letters carrying the ghost of the ancient rough breathing.</p>
          </section>

          <section>
            <h3>The Great "ee" Merger</h3>
            <p>This is the most striking thing about modern Greek pronunciation, and the hardest to believe until you hear it.</p>
            <p>Ancient Greek had many distinct vowel sounds. Modern Greek collapsed most of them into a single sound: <strong>"ee"</strong> — like the "ee" in <em>meet</em>.</p>
            <p>All of the following are pronounced the same way in modern Greek:</p>
            <table class="sound-table">
              <thead>
                <tr>
                  <th>Letter or Diphthong</th>
                  <th>Ancient sound (approx.)</th>
                  <th>Modern sound</th>
                </tr>
              </thead>
              <tbody>
                <tr><td class="gk-cell"><span class="gk">ι</span> iota</td><td>short "i" (like <em>bit</em>)</td><td class="ee-cell">ee</td></tr>
                <tr><td class="gk-cell"><span class="gk">η</span> eta</td><td>long "e" (like <em>they</em>)</td><td class="ee-cell">ee</td></tr>
                <tr><td class="gk-cell"><span class="gk">υ</span> upsilon</td><td>like French <em>u</em> or German <em>ü</em></td><td class="ee-cell">ee</td></tr>
                <tr><td class="gk-cell"><span class="gk">ει</span> epsilon-iota</td><td>"ay"</td><td class="ee-cell">ee</td></tr>
                <tr><td class="gk-cell"><span class="gk">οι</span> omicron-iota</td><td>"oy"</td><td class="ee-cell">ee</td></tr>
              </tbody>
            </table>
            <p>Five different letters and diphthongs, one sound. Linguists call this <strong>iotacism</strong> — the gravitational pull of the "ee" sound across the whole vowel system of Greek.</p>
          </section>

          <section>
            <h3>English Does This Too</h3>
            <p>If iotacism sounds strange, consider what English does with unstressed vowels.</p>
            <p>The letter "a" in <em>about</em>, the "e" in <em>taken</em>, the "i" in <em>pencil</em>, the "o" in <em>lemon</em>, the "u" in <em>focus</em> — every one of these is pronounced the same way: <strong>"uh."</strong> Linguists call this sound the <em>schwa</em>, and it is the most common vowel sound in the English language.</p>
            <p>Five different letters. Same sound. You have been doing this your whole life without thinking about it.</p>
            <p>Greek did the same thing — in the other direction. Where English collapses vowels <em>downward</em> into a soft "uh," Greek collapsed them <em>upward</em> into a crisp "ee."</p>
          </section>

          <section>
            <h3>Easy Maps</h3>
            <p>Most Greek consonants map cleanly to a single English sound:</p>
            <table class="sound-table">
              <thead>
                <tr><th>Letter</th><th>Name</th><th>Sound</th><th>Like</th></tr>
              </thead>
              <tbody>
                <tr><td class="gk-cell"><span class="gk">κ</span></td><td>kappa</td><td><strong>k</strong></td><td><em>kite</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">λ</span></td><td>lambda</td><td><strong>l</strong></td><td><em>lamp</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">μ</span></td><td>mu</td><td><strong>m</strong></td><td><em>map</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">ν</span></td><td>nu</td><td><strong>n</strong></td><td><em>note</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">π</span></td><td>pi</td><td><strong>p</strong></td><td><em>pen</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">ρ</span></td><td>rho</td><td><strong>r</strong></td><td><em>rope</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">σ / ς</span></td><td>sigma</td><td><strong>s</strong></td><td><em>sun</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">τ</span></td><td>tau</td><td><strong>t</strong></td><td><em>top</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">ζ</span></td><td>zeta</td><td><strong>z</strong></td><td><em>zero</em></td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3>Shifted Sounds</h3>
            <p>These three consonants sound different from what their names or English spellings would suggest:</p>
            <table class="sound-table">
              <thead>
                <tr><th>Letter</th><th>Name</th><th>You might expect</th><th>Actually sounds like</th><th>Example</th></tr>
              </thead>
              <tbody>
                <tr><td class="gk-cell"><span class="gk">β</span></td><td>beta</td><td>"b"</td><td><strong>v</strong></td><td><em>violin</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">δ</span></td><td>delta</td><td>"d"</td><td><strong>th</strong> (voiced)</td><td><em>the, this, that</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">γ</span></td><td>gamma</td><td>hard "g"</td><td><strong>soft g / y</strong></td><td>like "y" before an "ee" sound</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3>No Direct English Letter</h3>
            <p>These sounds have no single English letter — English uses two letters, a foreign spelling, or has no equivalent at all:</p>
            <table class="sound-table">
              <thead>
                <tr><th>Letter</th><th>Name</th><th>Sound</th><th>Closest English</th></tr>
              </thead>
              <tbody>
                <tr><td class="gk-cell"><span class="gk">θ</span></td><td>theta</td><td><strong>th</strong> (unvoiced)</td><td><em>think, three, theater</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">χ</span></td><td>chi</td><td><strong>kh</strong></td><td>"ch" in <em>Bach</em> or <em>loch</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">ξ</span></td><td>xi</td><td><strong>ks</strong></td><td>the "x" in <em>box</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">ψ</span></td><td>psi</td><td><strong>ps</strong></td><td>the ending of <em>lapse</em></td></tr>
                <tr><td class="gk-cell"><span class="gk">αυ</span></td><td>alpha-upsilon</td><td><strong>av / af</strong></td><td>shifts with what follows</td></tr>
                <tr><td class="gk-cell"><span class="gk">ευ</span></td><td>epsilon-upsilon</td><td><strong>ev / ef</strong></td><td>shifts with what follows</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3>Accents: From Pitch to Stress</h3>
            <p>Ancient Greek accents marked <strong>pitch</strong> — a rise and fall in the voice on a particular syllable, more like a tonal language than a stress language. The acute (<span class="gk">ά</span>), grave (<span class="gk">ὰ</span>), and circumflex (<span class="gk">ᾶ</span>) each indicated a different melodic contour.</p>
            <p>In modern Greek pronunciation, accents mark <strong>stress</strong> — which syllable you hit harder when you speak. The distinction between the three shapes matters less; what matters is that you stress the accented syllable.</p>
          </section>

          <section>
            <h3>Why Modern Pronunciation?</h3>
            <p>Scholars who want to reconstruct the exact sounds of Pericles or Socrates use reconstructed pronunciation, piecing together evidence from poetry, meter, and comparisons with other ancient languages. It preserves distinctions that modern Greek has merged away.</p>
            <p>But modern pronunciation has something reconstructed pronunciation does not: it is <strong>alive</strong>. It connects you to a living community of speakers, to the Greek Orthodox liturgy, to Homer read aloud in Greek schools today. It is the pronunciation a Greek child hears when encountering the Odyssey for the first time.</p>
            <p>You are not learning a dead reconstruction. You are joining a tradition that has never stopped.</p>
          </section>

        </article>
      </div>
    {:else if activeTab === 'typing'}
      <div class="prose-wrap">
        <article class="prose-lesson">

          <h2>Two Ways to Type Greek</h2>

          <section>
            <h3>The Problem</h3>
            <p>Your keyboard was designed for English. Greek uses a completely different alphabet — 24 letters, none of which appear on your keys. So how do you type it?</p>
            <p>This app gives you two options, and both matter. You can switch between them using the button in the top bar of the Alphabet lesson or in any leson when practicing vocab.</p>
          </section>

          <section>
            <h3>Option 1: Greek Input</h3>
            <p>The app maps each key on your keyboard to a Greek letter. Press <kbd>A</kbd> and you get <span class="gk">α</span> (alpha). Press <kbd>B</kbd> and you get <span class="gk">β</span> (beta). Press <kbd>K</kbd> and you get <span class="gk">κ</span> (kappa). Most keys match the first letter of the Greek name or its transliteration, though a few follow the standard Greek keyboard layout rather than a simple sound rule.</p>
            <p>When the keyboard panel is visible at the bottom of the screen, you can see exactly which key produces which Greek letter. This is what <strong>Greek + keyboard</strong> mode shows you. Once you've memorized the Greek keyboard layout, you can toggle it to <strong>Greek</strong> to hide the keyboard.</p>
            <p>Greek input is useful because it trains you to think in actual Greek letters. When you read a Greek word, you start to recognize the characters the way you recognize English.</p>
          </section>

          

          <section>
            <h3>Diacritics in Greek Mode</h3>
            <p>Greek letters often carry small marks called <strong>diacritics</strong> — accents, breathings, or both. For example, <span class="gk">ἄ</span> is alpha with a smooth breathing and an acute accent. <span class="gk">ὦ</span> is omega with a smooth breathing and a circumflex.</p>
            <p>In Greek input mode, you add diacritics by pressing the same key again. Press <kbd>A</kbd> once and you get <span class="gk">α</span>. Press <kbd>A</kbd> again and the app adds the next diacritic the letter needs — an accent or a breathing. Press it again and it adds another one if needed. The app always knows which marks belong on that letter in that word, so you never have to choose — just keep pressing until the letter looks right.</p>
            <p>This is different from how professional Greek typists add diacritics, which involves pressing separate keys for each mark. The app's cycling method is simpler: one key, pressed repeatedly, until the letter is complete.</p>
            <p><strong>If you're stuck:</strong> if you're typing a Greek word and the next letter won't appear, it almost always means the current letter still needs a diacritic. Press its key one more time. A letter that needs both an accent and a breathing may require two extra presses before you can move on.</p>
            <p>If you go on to study ancient Greek more formally, you will likely learn a different input method — one that gives you finer control over each mark. For now, the cycling approach gets you typing real Greek words without memorizing a separate set of diacritic keys.</p>
          </section>

          <section>
            <h3>Option 2: Transliteration</h3>
            <p>Transliteration is a system for writing Greek sounds using English letters. Instead of typing the Greek character <span class="gk">θ</span>, you type the two letters <strong>th</strong>. Instead of <span class="gk">φ</span>, you type <strong>ph</strong>. Instead of <span class="gk">χ</span>, you type <strong>ch</strong>.</p>
            <p>Here are some examples:</p>
            <table class="sound-table">
              <thead>
                <tr><th>Greek word</th><th>Transliteration</th><th>Meaning</th></tr>
              </thead>
              <tbody>
                <tr><td class="gk-cell"><span class="gk">ἄρχω</span></td><td><strong>archo</strong></td><td>I lead, I rule</td></tr>
                <tr><td class="gk-cell"><span class="gk">θεός</span></td><td><strong>theos</strong></td><td>god</td></tr>
                <tr><td class="gk-cell"><span class="gk">φιλία</span></td><td><strong>philia</strong></td><td>love, friendship</td></tr>
                <tr><td class="gk-cell"><span class="gk">ψυχή</span></td><td><strong>psyche</strong></td><td>soul, mind</td></tr>
                <tr><td class="gk-cell"><span class="gk">λόγος</span></td><td><strong>logos</strong></td><td>word, reason</td></tr>
              </tbody>
            </table>
            <p>You have already seen transliteration in English. Words like <em>philosophy</em>, <em>psychology</em>, <em>chaos</em>, and <em>alphabet</em> are English words that were transliterated from Greek — the Greek sounds written out in English letters.</p>
          </section>

          <section>
            <h3>Why Both Matter</h3>
            <p><strong>Greek input</strong> helps you learn to read and recognize the actual alphabet. When you can look at <span class="gk">ξ</span> and immediately know it is "xi," or see <span class="gk">ω</span> and know it is "omega," you are reading Greek.</p>
            <p><strong>Transliteration</strong> connects those letters to sounds you already know how to say. And here is the part that directly affects your grade: the <strong>National Greek Exam</strong> — the standardized test for students of Greek — tests transliteration. You may be asked to write the Greek for a transliterated word, or to transliterate a Greek word into English letters.</p>
            <p>That means you need to know both directions:</p>
            <ul>
              <li>See <span class="gk">φ</span> → know it transliterates as <strong>ph</strong></li>
              <li>See <strong>ch</strong> → know it refers to <span class="gk">χ</span></li>
            </ul>
          </section>

          <section>
            <h3>How to Practice</h3>
            <p>In the <strong>Alphabet</strong> lesson, the button in the header lets you choose your mode:</p>
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
                <span>Type the English-letter equivalent — <strong>th</strong> for theta, <strong>ph</strong> for phi, <strong>e</strong> for eta. This is what the exam tests.</span>
              </div>
            </div>
            <p>Start with Greek + keyboard while you are learning the letters. Once you feel comfortable, switch to Transliterate mode and practice that too — especially with the Flashcards and Vocabulary.</p>
          </section>

        </article>
      </div>
    {/if}
  </main>
</div>

<style>
  .intro-page {
    min-height: 100vh;
    background: #f1f5f9;
    display: flex;
    flex-direction: column;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .page-header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .page-header-inner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .back-btn {
    display: flex;
    align-items: center;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b7280;
    flex-shrink: 0;
  }
  .back-btn:hover { color: #111; }

  .page-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
    flex: 1;
  }

  .tab-bar {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .tab-bar-inner {
    display: flex;
    gap: 0.25rem;
    padding: 0 0.5rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .tab-btn {
    padding: 0.75rem 1.25rem;
    font-size: 0.9rem;
    color: #6b7280;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: #374151; }
  .tab-btn.active { color: #4f46e5; border-bottom-color: #6366f1; font-weight: 600; }

  .tab-content { flex: 1; }

  .prose-wrap {
    max-width: 740px;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
    box-sizing: border-box;
    width: 100%;
  }

  .prose-lesson {
    font-size: 1rem;
    line-height: 1.75;
    color: #1e293b;
  }

  .prose-lesson h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 1.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .prose-lesson section {
    margin-bottom: 2.25rem;
  }

  .prose-lesson h3 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #312e81;
    margin: 0 0 0.75rem;
  }

  .prose-lesson p {
    margin: 0 0 0.9rem;
    color: #334155;
  }

  .prose-lesson strong {
    color: #1e293b;
    font-weight: 700;
  }

  .prose-lesson em {
    font-style: italic;
    color: #475569;
  }

  .gk {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 1.05em;
    color: #312e81;
  }

  .breathing-pair {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0.75rem 0 1rem;
    padding: 1rem 1.25rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }

  .breathing-item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    font-size: 0.95rem;
    color: #334155;
  }

  .breathing-item .gk {
    font-size: 2rem;
    line-height: 1;
    min-width: 2rem;
    text-align: center;
    color: #4338ca;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .sound-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0 1rem;
    font-size: 0.9rem;
  }

  .sound-table th {
    background: #f1f5f9;
    color: #475569;
    font-weight: 600;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid #e2e8f0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sound-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: middle;
  }

  .sound-table tr:last-child td { border-bottom: none; }
  .sound-table tr:hover td { background: #f8fafc; }

  .gk-cell { white-space: nowrap; }

  .gk-cell .gk {
    font-size: 1.15rem;
    margin-right: 0.3em;
  }

  .ee-cell {
    font-weight: 700;
    color: #4338ca;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
  }

  .prose-lesson ul {
    margin: 0 0 0.9rem 1.25rem;
    padding: 0;
    color: #334155;
  }

  .prose-lesson ul li {
    margin-bottom: 0.35rem;
  }

  kbd {
    display: inline-block;
    padding: 0.1em 0.45em;
    font-size: 0.85em;
    font-family: monospace;
    font-weight: 600;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .mode-explainer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0.75rem 0 1rem;
    padding: 1rem 1.25rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }

  .mode-row-item {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    font-size: 0.92rem;
    color: #334155;
  }

  .mode-badge {
    flex-shrink: 0;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2em 0.7em;
    border-radius: 999px;
    border: 1px solid;
    white-space: nowrap;
  }

  .badge-keyboard { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
  .badge-greek    { background: #f9fafb; border-color: #d1d5db; color: #6b7280; }
  .badge-translit { background: #fdf4ff; border-color: #e9d5ff; color: #7e22ce; }
</style>
