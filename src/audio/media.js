// Recording players with one interface, so Play-along doesn't care where the music is from:
//   play(), pause(), seek(t), setRate(r), get time, get duration, get paused, destroy()
// - FilePlayer: an audio/video file the user picks. Stays on their machine (object URL).
//   Browsers keep the pitch when slowed (preservesPitch).
// - YouTubePlayer: the official IFrame Player API. Some videos block embedding.

export class FilePlayer {
  constructor(container, file) {
    this.url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    this.el = document.createElement(isVideo ? "video" : "audio");
    this.el.src = this.url;
    // Play-along draws its own transport (play, seek, speed, bars), so no native bar.
    this.el.controls = false;
    this.file = file;
    this.isVideo = isVideo;
    this.el.preload = "auto";
    this.el.preservesPitch = true;
    this.el.className = isVideo ? "media-video" : "media-audio";
    container.replaceChildren(this.el);
    this.id = `file:${file.name}:${file.size}`;
    this.label = file.name;
  }

  ready() {
    if (this.el.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.el.addEventListener("loadedmetadata", () => resolve(), { once: true });
      this.el.addEventListener("error", () => reject(new Error("This file type can't be played here.")), { once: true });
    });
  }

  play() { return this.el.play(); }
  pause() { this.el.pause(); }
  seek(t) { this.el.currentTime = Math.max(0, t); }
  setRate(r) { this.el.playbackRate = r; }
  get time() { return this.el.currentTime; }
  get duration() { return this.el.duration || 0; }
  get paused() { return this.el.paused; }
  // Float the video in its own always-on-top window (where the browser supports it).
  get canPopOut() { return this.isVideo && !!document.pictureInPictureEnabled; }
  popOut() { return this.el.requestPictureInPicture(); }
  destroy() {
    this.el.pause();
    this.el.remove();
    URL.revokeObjectURL(this.url);
  }
}

// "https://www.youtube.com/watch?v=ID", "youtu.be/ID", "/shorts/ID", "/embed/ID" or a bare ID.
export function youtubeId(input) {
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

let apiPromise = null;

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => { apiPromise = null; reject(new Error("Couldn't load YouTube (offline?).")); };
      document.head.append(tag);
    });
  }
  return apiPromise;
}

const YT_ERRORS = {
  2: "That doesn't look like a valid video ID.",
  5: "The video can't play in an embedded player.",
  100: "Video not found (removed or private).",
  101: "The owner doesn't allow this video to be embedded. Try another upload of the same song.",
  150: "The owner doesn't allow this video to be embedded. Try another upload of the same song.",
};

export class YouTubePlayer {
  constructor(container, videoId, { onError } = {}) {
    this.id = `yt:${videoId}`;
    this.label = `YouTube ${videoId}`;
    this.videoId = videoId;
    this.box = document.createElement("div");
    this.box.className = "media-yt";
    const mountPoint = document.createElement("div");
    this.box.append(mountPoint);
    container.replaceChildren(this.box);
    this._ready = loadYouTubeApi().then((YT) => new Promise((resolve) => {
      this.player = new YT.Player(mountPoint, {
        videoId,
        host: "https://www.youtube-nocookie.com", // privacy-enhanced embed
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => resolve(),
          onError: (e) => onError && onError(new Error(YT_ERRORS[e.data] || `YouTube error ${e.data}`)),
        },
      });
    }));
  }

  ready() { return this._ready; }
  play() { this.player && this.player.playVideo(); }
  pause() { this.player && this.player.pauseVideo(); }
  seek(t) { this.player && this.player.seekTo(Math.max(0, t), true); }
  // YouTube only accepts its own steps (0.25, 0.5, 0.75, 1, ...): pick the nearest.
  setRate(r) {
    if (!this.player) return;
    const rates = this.player.getAvailablePlaybackRates() || [1];
    const best = rates.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
    this.player.setPlaybackRate(best);
    return best;
  }
  get time() { return this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0; }
  get duration() { return this.player && this.player.getDuration ? this.player.getDuration() : 0; }
  get paused() { return !this.player || !this.player.getPlayerState || this.player.getPlayerState() !== 1; }
  destroy() {
    try { this.player && this.player.destroy(); } catch { /* already gone */ }
    this.box.remove();
  }
}
