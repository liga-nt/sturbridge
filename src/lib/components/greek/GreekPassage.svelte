<script>
  import { createEventDispatcher } from 'svelte';

  /**
   * GreekPassage — center panel rendering the Greek text with audio + highlighting.
   * Props:
   *   sentences: array of sentence objects with words, audio urls, timepoints
   * Events:
   *   wordHover({ word, sentence } | null)
   */
  export let sentences = [];

  const dispatch = createEventDispatcher();

  // Audio mode: 'greek' | 'english' | 'alternating'
  let audioMode = 'greek';

  // Which words are currently highlighted during playback (Set of `${sentenceNum}-${sentPos}`)
  let activeWordKeys = new Set();

  // Which sentences have English revealed
  let revealedEnglish = new Set();

  // Whether we're currently playing (to disable other buttons)
  let isPlaying = false;
  let currentAudio = null;
  let rafId = null;

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    activeWordKeys = new Set();
    isPlaying = false;
  }

  function playWithTimepoints(audioUrl, timepoints, sentenceNum) {
    stopAudio();
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    currentAudio = audio;
    isPlaying = true;

    function checkTime() {
      if (!currentAudio || currentAudio.paused || currentAudio.ended) {
        activeWordKeys = new Set();
        isPlaying = false;
        return;
      }
      const t = currentAudio.currentTime;
      const found = new Set();
      for (const [sentPos, tp] of Object.entries(timepoints ?? {})) {
        if (t >= tp.start && t <= tp.end) {
          found.add(`${sentenceNum}-${sentPos}`);
        }
      }
      activeWordKeys = found;
      rafId = requestAnimationFrame(checkTime);
    }

    audio.addEventListener('ended', () => {
      activeWordKeys = new Set();
      isPlaying = false;
    });

    audio.play().catch(() => {
      isPlaying = false;
    });

    rafId = requestAnimationFrame(checkTime);
  }

  function playSentence(sentence, mode) {
    if (mode === 'greek') {
      const url = sentence.greek_audio_url ?? sentence.audio_url ?? null;
      const timepoints = sentence.timepoints?.greek ?? {};
      playWithTimepoints(url, timepoints, sentence.num);
    } else if (mode === 'english') {
      const url = sentence.english_audio_url ?? null;
      const timepoints = sentence.timepoints?.english ?? {};
      playWithTimepoints(url, timepoints, sentence.num);
    }
  }

  async function playAll() {
    stopAudio();
    isPlaying = true;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const mode = audioMode === 'alternating'
        ? (i % 2 === 0 ? 'greek' : 'english')
        : audioMode;

      await new Promise((resolve) => {
        const url = mode === 'english'
          ? (sentence.english_audio_url ?? null)
          : (sentence.greek_audio_url ?? sentence.audio_url ?? null);

        if (!url) { resolve(); return; }

        const timepoints = mode === 'english'
          ? (sentence.timepoints?.english ?? {})
          : (sentence.timepoints?.greek ?? {});

        const audio = new Audio(url);
        currentAudio = audio;

        function checkTime() {
          if (!currentAudio || currentAudio !== audio || audio.paused || audio.ended) return;
          const t = audio.currentTime;
          const found = new Set();
          for (const [sentPos, tp] of Object.entries(timepoints)) {
            if (t >= tp.start && t <= tp.end) {
              found.add(`${sentence.num}-${sentPos}`);
            }
          }
          activeWordKeys = found;
          rafId = requestAnimationFrame(checkTime);
        }

        audio.addEventListener('ended', () => {
          activeWordKeys = new Set();
          resolve();
        });

        audio.addEventListener('error', resolve);
        audio.play().catch(resolve);
        rafId = requestAnimationFrame(checkTime);
      });

      if (!isPlaying) break;
    }

    isPlaying = false;
    currentAudio = null;
  }

  function toggleReveal(sentenceNum) {
    const next = new Set(revealedEnglish);
    if (next.has(sentenceNum)) {
      next.delete(sentenceNum);
    } else {
      next.add(sentenceNum);
    }
    revealedEnglish = next;
  }

  function handleWordEnter(e, word, sentence) {
    dispatch('wordHover', { word, sentence, event: e });
  }

  function handleWordLeave() {
    dispatch('wordHover', null);
  }
</script>

<div class="passage-panel">
  <!-- Audio controls -->
  <div class="audio-controls">
    <div class="mode-buttons" role="group" aria-label="Audio mode">
      <button
        class="mode-btn"
        class:active={audioMode === 'greek'}
        on:click={() => { stopAudio(); audioMode = 'greek'; }}
        title="Play Greek audio"
      >
        ▶ Greek
      </button>
      <button
        class="mode-btn"
        class:active={audioMode === 'english'}
        on:click={() => { stopAudio(); audioMode = 'english'; }}
        title="Play English audio"
      >
        ▶ English
      </button>
      <button
        class="mode-btn"
        class:active={audioMode === 'alternating'}
        on:click={() => { stopAudio(); audioMode = 'alternating'; }}
        title="Alternate Greek and English"
      >
        ↕ Alt
      </button>
    </div>
    {#if isPlaying}
      <button class="stop-btn" on:click={stopAudio}>■ Stop</button>
    {:else}
      <button class="play-all-btn" on:click={playAll}>▶ Play All</button>
    {/if}
  </div>

  <div class="sentences">
    {#each sentences as sentence}
      <div class="sentence-block">
        <!-- Greek text line -->
        <div class="greek-line">
          {#each sentence.words ?? [] as word}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <span
              class="greek-word"
              class:word-active={activeWordKeys.has(`${sentence.num}-${word.sentPos}`)}
              on:mouseenter={(e) => handleWordEnter(e, word, sentence)}
              on:mouseleave={handleWordLeave}
            >{word.text}</span>{' '}
          {/each}
        </div>

        <!-- Per-sentence controls -->
        <div class="sentence-controls">
          <button
            class="sent-btn"
            on:click={() => playSentence(sentence, audioMode === 'alternating' ? 'greek' : audioMode)}
            title="Play this sentence"
          >
            ▶
          </button>
          <button
            class="sent-btn reveal-btn"
            on:click={() => toggleReveal(sentence.num)}
            title="Toggle English translation"
          >
            {revealedEnglish.has(sentence.num) ? 'Hide' : 'English'}
          </button>
        </div>

        <!-- English translation (hidden by default) -->
        {#if revealedEnglish.has(sentence.num)}
          <div class="english-line">{sentence.english ?? ''}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .passage-panel {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .audio-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }

  .mode-buttons {
    display: flex;
    gap: 4px;
  }

  .mode-btn {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    color: #374151;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .mode-btn:hover {
    background: #f3f4f6;
  }

  .mode-btn.active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }

  .play-all-btn,
  .stop-btn {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    border: none;
    transition: background 0.1s;
  }

  .play-all-btn {
    background: #16a34a;
    color: #fff;
  }

  .play-all-btn:hover {
    background: #15803d;
  }

  .stop-btn {
    background: #ef4444;
    color: #fff;
  }

  .stop-btn:hover {
    background: #dc2626;
  }

  .sentences {
    flex: 1;
    overflow-y: auto;
  }

  .sentence-block {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #f3f4f6;
  }

  .greek-line {
    font-size: 19px;
    line-height: 1.7;
    color: #111827;
    margin-bottom: 6px;
    word-spacing: 2px;
  }

  .greek-word {
    cursor: pointer;
    border-radius: 3px;
    padding: 1px 2px;
    transition: background 0.1s;
    display: inline-block;
  }

  .greek-word:hover {
    background: #dbeafe;
  }

  .greek-word.word-active {
    background: #fffacd;
    color: #92400e;
    font-weight: 600;
  }

  .sentence-controls {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }

  .sent-btn {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    color: #374151;
    cursor: pointer;
  }

  .sent-btn:hover {
    background: #f3f4f6;
  }

  .reveal-btn {
    color: #2563eb;
    border-color: #bfdbfe;
    background: #eff6ff;
  }

  .reveal-btn:hover {
    background: #dbeafe;
  }

  .english-line {
    font-size: 14px;
    line-height: 1.5;
    color: #6b7280;
    font-style: italic;
    padding: 6px 10px;
    background: #f9fafb;
    border-radius: 4px;
    border-left: 3px solid #d1d5db;
  }
</style>
