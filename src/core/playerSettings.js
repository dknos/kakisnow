/**
 * Player settings that survive a reload.
 *
 * A separate localStorage key from the Burger Book, because they are different
 * things with different failure costs: a lost record is a lost achievement, a
 * lost slider is thirty seconds of dragging. Keeping them apart also means
 * `BurgerBook.record()` — which rewrites its whole JSON, ghost included, on
 * every finished run — never carries the settings along for the ride.
 *
 * Only a whitelist is stored. `S` is full of renderer tuning the overlay
 * exists to poke at, and persisting all of it would mean a debugging session
 * permanently changed the game. What persists is exactly what a player sets
 * from the settings screen, nothing the F1 overlay touches on its own.
 *
 * Hydration goes through `set()` so every `onChange` subscriber fires — a
 * saved volume that skipped the audio system's listener would be a saved
 * number, not a saved volume.
 */

import { S, set, onChange, applyPreset, PRESETS } from "./settings.js";

const KEY = "snow-burgers.settings";
export const SETTINGS_VERSION = 1;

/** What a player may persist, and how to validate each value on the way in. */
const PLAYER_KEYS = {
    audio: (v) => typeof v === "boolean",
    masterVolume: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    musicVolume: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    sfxVolume: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    ambienceVolume: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    uiVolume: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    mouseSensitivity: (v) => Number.isFinite(v) && v >= 0.2 && v <= 3,
    invertY: (v) => typeof v === "boolean",
    shakeScale: (v) => Number.isFinite(v) && v >= 0 && v <= 1.5,
    reducedMotion: (v) => typeof v === "boolean",
    touchControls: (v) => v === "auto" || v === "on" || v === "off",
    preset: (v) => typeof v === "string" && v in PRESETS,
};

function storage() {
    try {
        const s = globalThis.localStorage;
        const probe = "__sbs_probe__";
        s.setItem(probe, "1");
        s.removeItem(probe);
        return s;
    } catch {
        return null;
    }
}

/**
 * Validate a raw parse into a clean `{key: value}` map.
 *
 * Exported for the unit test. Unknown keys are dropped, invalid values are
 * dropped, an unrecognisable envelope yields an empty object — the settings
 * screen's defaults are always a safe place to land.
 *
 * @param {unknown} raw
 * @returns {Record<string, number|boolean|string>}
 */
export function sanitize(raw) {
    if (!raw || typeof raw !== "object") return {};
    if (raw.version !== SETTINGS_VERSION) return {};
    const values = raw.values;
    if (!values || typeof values !== "object") return {};
    const out = {};
    for (const [k, validate] of Object.entries(PLAYER_KEYS)) {
        if (k in values && validate(values[k])) out[k] = values[k];
    }
    return out;
}

let _saveQueued = false;

function save() {
    // Coalesce: a slider drag fires onChange per pixel, and localStorage is
    // synchronous. One write per macrotask is plenty.
    if (_saveQueued) return;
    _saveQueued = true;
    setTimeout(() => {
        _saveQueued = false;
        const s = storage();
        if (!s) return;
        const values = {};
        for (const k of Object.keys(PLAYER_KEYS)) values[k] = S[k];
        try {
            s.setItem(KEY, JSON.stringify({ version: SETTINGS_VERSION, values }));
        } catch (err) {
            console.warn("[snow-burgers] could not save settings:", err);
        }
    }, 0);
}

/**
 * Load saved values into `S` and subscribe future edits.
 *
 * Called once, early in boot — before anything reads the affected settings to
 * build one-shot state. Import order does the sequencing; there is nothing
 * async here.
 */
export function initPlayerSettings() {
    const s = storage();
    if (s) {
        let raw = null;
        try {
            raw = JSON.parse(s.getItem(KEY) ?? "null");
        } catch {
            console.warn("[snow-burgers] settings were not valid JSON; using defaults");
        }
        const values = sanitize(raw);
        // Preset first: it writes its member keys through set(), and the
        // player's explicit values below must win over what it applies.
        if (values.preset) applyPreset(values.preset);
        for (const [k, v] of Object.entries(values)) {
            if (k === "preset") continue;
            set(k, v);
        }
    }
    onChange(Object.keys(PLAYER_KEYS), save);
}
