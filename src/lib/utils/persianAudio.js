// Singleton audio player — prevents overlapping playback

// 0.8 = 80% speed, optimal for vocabulary acquisition
export const PLAYBACK_RATE = 0.8;

let current = null;

/**
 * Play a single audio URL. Stops any currently-playing audio first.
 * Returns the Promise from audio.play() (may be rejected if URL is empty or blocked).
 */
export function playUrl(url) {
    if (!url) return Promise.resolve();
    if (current) {
        current.pause();
        current.currentTime = 0;
    }
    current = new Audio(url);
    current.playbackRate = PLAYBACK_RATE;
    return current.play().catch(() => {});
}

/**
 * Play a sequence of audio URLs one after another.
 * Stops on any empty URL in the sequence.
 */
export function playSequence(urls) {
    const valid = urls.filter(Boolean);
    if (valid.length === 0) return Promise.resolve();

    return new Promise((resolve) => {
        let index = 0;

        function playNext() {
            if (index >= valid.length) { resolve(); return; }
            if (current) { current.pause(); current.currentTime = 0; }
            current = new Audio(valid[index]);
            current.playbackRate = PLAYBACK_RATE;
            current.addEventListener('ended', () => { index++; playNext(); }, { once: true });
            current.play().catch(() => { index++; playNext(); });
        }

        playNext();
    });
}

/** Stop whatever is currently playing. */
export function stopAll() {
    if (current) {
        current.pause();
        current.currentTime = 0;
        current = null;
    }
}
