/** Input-device family detection with a small hysteresis window. */
export const INPUT_FAMILIES = Object.freeze({
    KEYBOARD_MOUSE: "keyboard-mouse",
    STANDARD_PAD: "standard-pad",
    GENERIC_PAD: "generic-pad",
    TOUCH: "touch",
});

export function inputFamilyLabel(family) {
    return ({
        [INPUT_FAMILIES.KEYBOARD_MOUSE]: "Keyboard / mouse",
        [INPUT_FAMILIES.STANDARD_PAD]: "Xbox-style controller",
        [INPUT_FAMILIES.GENERIC_PAD]: "Gamepad",
        [INPUT_FAMILIES.TOUCH]: "Touch controls",
    })[family] ?? "Keyboard / mouse";
}

/**
 * Browser `mapping === "standard"` only describes button positions; it does
 * not identify the physical family. Keep Xbox-style glyphs for the common
 * XInput/Microsoft IDs and use deliberately generic labels for other pads
 * (including standard-mapped DualShock/DualSense devices).
 */
export function gamepadInputFamily(pad) {
    const id = String(pad?.id ?? "").toLowerCase();
    return /(xbox|xinput|microsoft|045e)/i.test(id)
        ? INPUT_FAMILIES.STANDARD_PAD
        : INPUT_FAMILIES.GENERIC_PAD;
}

/** Pointer-family mapping used by the UI shell as well as touch controls. */
export function pointerInputFamily(pointerType) {
    return pointerType === "mouse"
        ? INPUT_FAMILIES.KEYBOARD_MOUSE
        : INPUT_FAMILIES.TOUCH;
}

export class InputFamilyTracker {
    constructor({ debounceMs = 140 } = {}) {
        this.family = INPUT_FAMILIES.KEYBOARD_MOUSE;
        this.pending = this.family;
        this.pendingSince = 0;
        this.debounceMs = debounceMs;
        this.lastMeaningful = 0;
        this.listeners = new Set();
    }

    _commit(family) {
        if (family === this.family) return;
        this.family = family;
        for (const listener of this.listeners) listener(family);
    }

    /**
     * Note a deliberate source action. Mouse movement is ignored unless the
     * caller confirms pointer lock, avoiding prompt flicker while navigating.
     */
    note(family, now = Date.now()) {
        if (!Object.values(INPUT_FAMILIES).includes(family)) return this.family;
        if (family === this.family) {
            this.pending = family;
            this.pendingSince = now;
            this.lastMeaningful = now;
            return this.family;
        }
        if (this.pending !== family) {
            this.pending = family;
            this.pendingSince = now;
        }
        this.lastMeaningful = now;
        if (now - this.pendingSince >= this.debounceMs) this._commit(family);
        return this.family;
    }

    /** Commit a confirmed discrete action immediately (touch/menu press). */
    activate(family, now = Date.now()) {
        if (!Object.values(INPUT_FAMILIES).includes(family)) return this.family;
        this.pending = family;
        this.pendingSince = now;
        this.lastMeaningful = now;
        this._commit(family);
        return this.family;
    }

    /** Advance the candidate without a new event. */
    advance(now = Date.now()) {
        if (this.pending !== this.family && now - this.pendingSince >= this.debounceMs) {
            this._commit(this.pending);
        }
        return this.family;
    }

    onChange(listener) {
        if (typeof listener !== "function") return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const inputFamily = new InputFamilyTracker();

export function getInputFamily() { return inputFamily.family; }
export function noteInputFamily(family, now) { return inputFamily.note(family, now); }
export function activateInputFamily(family, now) { return inputFamily.activate(family, now); }
export function advanceInputFamily(now) { return inputFamily.advance(now); }
export function onInputFamilyChange(listener) { return inputFamily.onChange(listener); }
