/**
 * Plays an ordered list of audio segments back-to-back behind ONE play/pause
 * toggle — e.g. a single-part question's stimulus_intro → math_expression →
 * question_text, or a multi-part item's shared setup, or one part's own
 * text + math_expression. Segments with no pregenerated audio (audioUrl
 * null) are skipped automatically, so a partially-piloted question still
 * plays whatever it has.
 *
 * Exposes a Svelte store `{ playing, activeIndex, activeFieldKey, currentTime }`
 * — the consumer passes `active`/`currentTime` down to AudioText.svelte for
 * whichever field matches activeFieldKey.
 */
import { writable } from 'svelte/store';

const IDLE = { playing: false, activeIndex: null, activeFieldKey: null, currentTime: 0 };

export function createAudioSequencePlayer() {
  const state = writable({ ...IDLE });
  let audioEl = null;
  let segments = [];
  let rafId = null;

  // `timeupdate` only fires a handful of times per second (browser-throttled,
  // not frame-synced), which made the word highlight visibly lag the audio.
  // Polling currentTime every animation frame instead keeps it smooth.
  function stopRaf() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function startRaf() {
    stopRaf();
    const tick = () => {
      if (!audioEl) return;
      state.update((s) => ({ ...s, currentTime: audioEl.currentTime }));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function cleanup() {
    stopRaf();
    if (audioEl) {
      audioEl.pause();
      audioEl.onended = null;
      audioEl = null;
    }
  }

  function playFrom(index) {
    if (index >= segments.length) {
      cleanup();
      state.set({ ...IDLE });
      return;
    }
    const seg = segments[index];
    if (!seg.audioUrl) { playFrom(index + 1); return; }

    cleanup();
    audioEl = new Audio(seg.audioUrl);
    audioEl.onended = () => playFrom(index + 1);
    state.set({ playing: true, activeIndex: index, activeFieldKey: seg.fieldKey, currentTime: 0 });
    audioEl.play();
    startRaf();
  }

  /** Replace the playable segments (e.g. a new question loaded) and stop any current playback. */
  function setSegments(newSegments) {
    cleanup();
    segments = newSegments ?? [];
    state.set({ ...IDLE });
  }

  /** Play/pause/resume toggle for the whole sequence. */
  function toggle() {
    let current;
    const unsub = state.subscribe((s) => (current = s));
    unsub();

    if (current.playing) {
      if (audioEl) audioEl.pause();
      stopRaf();
      state.update((s) => ({ ...s, playing: false }));
    } else if (current.activeIndex !== null && audioEl) {
      state.update((s) => ({ ...s, playing: true }));
      audioEl.play();
      startRaf();
    } else {
      playFrom(0);
    }
  }

  function destroy() {
    cleanup();
  }

  return { subscribe: state.subscribe, setSegments, toggle, destroy };
}
