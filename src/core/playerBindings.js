/**
 * Player-facing keyboard bindings.
 *
 * This deliberately lives beside (rather than inside) the renderer input
 * poll.  It gives settings, the tutorial, and tests one small contract for
 * keyboard intent while standard-pad and touch layouts remain fixed and
 * discoverable.  Reserved browser/debug/menu keys can never be captured.
 */

const KEY = "snow-burgers.bindings";
export const BINDINGS_VERSION = 1;

export const BINDING_LABELS = Object.freeze({
    steerLeft: "Steer left",
    steerRight: "Steer right",
    steerForward: "Steer forward",
    steerBack: "Steer back",
    jump: "Jump",
    spinLeft: "Spin left",
    spinRight: "Spin right",
    trickModifier: "Trick modifier",
    recover: "Recover",
    rocketBoost: "Rocket boost",
    spell1: "Spell 1",
    spell2: "Spell 2",
    spell3: "Spell 3",
    spell4: "Spell 4",
    spell5: "Spell 5",
});

export const DEFAULT_BINDINGS = Object.freeze({
    steerLeft: ["KeyA", "ArrowLeft"],
    steerRight: ["KeyD", "ArrowRight"],
    steerForward: ["KeyW", "ArrowUp"],
    steerBack: ["KeyS", "ArrowDown"],
    jump: ["Space"],
    spinLeft: ["KeyQ"],
    spinRight: ["KeyE"],
    trickModifier: ["KeyF"],
    recover: ["KeyR"],
    rocketBoost: ["ShiftLeft", "ShiftRight"],
    spell1: ["Digit1"], spell2: ["Digit2"], spell3: ["Digit3"],
    spell4: ["Digit4"], spell5: ["Digit5"],
});

// Escape/Enter/Space/Back and the debug toggles are intentionally excluded.
// Space remains jump, but it can never be moved onto a menu safety key.
export const RESERVED_BINDING_KEYS = Object.freeze(new Set([
    "Escape", "Enter", "NumpadEnter", "Space", "Tab", "Backspace", "F1", "Backquote",
    "BrowserBack", "BrowserForward", "AltLeft", "AltRight", "ControlLeft",
    "ControlRight", "MetaLeft", "MetaRight",
]));

function copyDefaults() {
    const out = {};
    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) out[action] = [...codes];
    return out;
}

/** Return a safe, fully populated keyboard map from untrusted JSON. */
export function sanitizeBindings(raw) {
    const values = raw?.version === BINDINGS_VERSION ? raw.values : raw;
    if (!values || typeof values !== "object") return copyDefaults();
    const out = copyDefaults();
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
        const candidate = Array.isArray(values[action]) ? values[action] :
            typeof values[action] === "string" ? [values[action]] : null;
        if (!candidate) continue;
        const clean = [...new Set(candidate.filter((code) =>
            typeof code === "string" && /^[A-Za-z][A-Za-z0-9]+$/.test(code) &&
            !RESERVED_BINDING_KEYS.has(code)).slice(0, 2))];
        if (clean.length) out[action] = clean;
    }
    // Sanitisation must also remove collisions from corrupt hand-edited saves.
    const seen = new Set();
    for (const action of Object.keys(out)) {
        out[action] = out[action].filter((code) => {
            if (seen.has(code)) return false;
            seen.add(code);
            return true;
        });
        if (!out[action].length) {
            out[action] = DEFAULT_BINDINGS[action].filter((code) => !seen.has(code));
            // A hand-edited save may consume every shipped alias. Keep the
            // action usable with a deterministic spare rather than restoring
            // a collision that makes two actions fire together.
            if (!out[action].length) {
                let spare = "KeyJ";
                while (seen.has(spare)) spare = `Key${String.fromCharCode(spare.charCodeAt(3) + 1)}`;
                out[action] = [spare];
            }
            for (const code of out[action]) seen.add(code);
        }
    }
    return out;
}

/**
 * Validate a proposed binding without mutating the live map.
 * @returns {{ok:true}|{ok:false,error:string,action?:string}}
 */
export function validateBinding(action, code, bindings = currentBindings) {
    if (!(action in DEFAULT_BINDINGS)) return { ok: false, error: "Unknown action." };
    if (typeof code !== "string" || !code) return { ok: false, error: "Choose a keyboard key." };
    if (RESERVED_BINDING_KEYS.has(code)) {
        return { ok: false, error: "That key is reserved for pause, menus, or diagnostics." };
    }
    for (const [other, codes] of Object.entries(bindings)) {
        if (other !== action && codes.includes(code)) {
            return { ok: false, action: other, error: `${BINDING_LABELS[other]} already uses ${code}.` };
        }
    }
    return { ok: true };
}

let currentBindings = copyDefaults();
let saveTimer = 0;
const listeners = new Set();

function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try { globalThis.localStorage?.setItem(KEY, JSON.stringify({ version: BINDINGS_VERSION, values: currentBindings })); }
        catch { /* controls still work for this session */ }
    }, 0);
}

export function initPlayerBindings() {
    try {
        const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null");
        currentBindings = sanitizeBindings(raw);
    } catch { currentBindings = copyDefaults(); }
    return getBindings();
}

export function getBindings() {
    const out = {};
    for (const [action, codes] of Object.entries(currentBindings)) out[action] = [...codes];
    return out;
}

export function getBindingCodes(action) {
    return currentBindings[action] ?? [];
}

export function isBindingDown(action, isDown) {
    return getBindingCodes(action).some((code) => isDown(code));
}

/** Set one primary key, preserving a second default alias for movement. */
export function setBinding(action, code) {
    const check = validateBinding(action, code);
    if (!check.ok) return check;
    currentBindings[action] = [code];
    save();
    for (const fn of listeners) fn(action, code);
    return { ok: true };
}

export function resetBindings() {
    currentBindings = copyDefaults();
    save();
    for (const fn of listeners) fn(null, null);
    return getBindings();
}

export function onBindingsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function bindingLabel(action, family = "keyboard") {
    if (family === "touch") return action === "jump" ? "JUMP" : action === "rocketBoost" ? "BOOST" : "TOUCH";
    if (family === "standard-pad" || family === "generic-pad") {
        const generic = family === "generic-pad";
        return (generic
            ? { jump: "SOUTH BUTTON", recover: "EAST BUTTON", trickModifier: "WEST BUTTON", rocketBoost: "RIGHT TRIGGER", spinLeft: "LEFT BUMPER", spinRight: "RIGHT BUMPER" }
            : { jump: "A", recover: "B", trickModifier: "X", rocketBoost: "RT", spinLeft: "LB", spinRight: "RB" }
        )[action] ?? "LEFT STICK";
    }
    const code = getBindingCodes(action)[0] ?? DEFAULT_BINDINGS[action]?.[0] ?? "?";
    return code.replace(/^Key/, "").replace(/^Digit/, "").replace("Arrow", "").replace("Left", "").replace("Right", "");
}
