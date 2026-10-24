// localStorage with a safety net: private windows and blocked storage just fall back to defaults.

const PREFIX = "guitarhelper:";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function loadRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

// Global settings shared by every tool.
export const SETTINGS_DEFAULTS = {
  a4: 440,
  channel: "auto",      // "auto" | "1" | "2"
  sensitivity: 0.01,    // minimum RMS counted as sound
  sustainMs: 120,
  echoCancellation: false,
};

export function settings() {
  return load("settings", SETTINGS_DEFAULTS);
}

export function saveSettings(s) {
  save("settings", s);
}
