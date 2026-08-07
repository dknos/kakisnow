/**
 * Raw input state. Everything lands in one mutable struct that systems poll —
 * no events fired into game code, no per-frame allocation.
 *
 * Mouse look uses pointer lock, which frees the right button for snow-surf.
 */

import { touch, endTouchFrame } from "./touchInput.js";
import { S } from "./settings.js";

export const input = {
    // Movement axes, camera-relative, already normalised to a unit disc.
    moveX: 0,
    moveZ: 0,
    moving: false,

    // Accumulated mouse delta since last `endFrame()`, in radians.
    lookX: 0,
    lookY: 0,

    // Zoom, consumed by the camera rig.
    zoomDelta: 0,

    surf: false, // RMB held
    sprint: false, // shift
    /**
     * Rocket throttle, 0..1. Left Shift is on or off; a gamepad trigger is not.
     *
     * Analogue rather than a boolean because the vehicle ramps thrust from it,
     * and a controller that can ask for a third of the engine should be able
     * to. The keyboard simply asks for all of it.
     */
    boost: 0,
    /** Set for one frame on Space keydown. Buffered by the character controller. */
    jumpPressed: false,

    /** @type {number} 0 = none, else 1..5 — set on keydown, cleared each frame */
    spellPressed: 0,
    /** @type {boolean} spell 2 (Ribbon) is a held cast */
    spellHeld2: false,

    // ------------------------------------------------------------- tricks
    /** Signed spin intent, -1 left .. 1 right. Q/E or the bumpers. */
    spin: 0,
    /** The trick modifier — F or the west face button — held. */
    trickMod: false,
    /** Set for one frame on R / east button: recover to the last safe spot. */
    recoverPressed: false,

    locked: false,
};

const keys = Object.create(null);
/** Whether the right mouse button is currently holding the ride. */
let mouseSurf = false;
/**
 * Whether the poll's own sources (RMB, touch ride, or gamepad LT) held the
 * ride last frame.
 *
 * The touch merge made `pollInput` clear `input.surf` every frame the button
 * was up — which silently broke the committed smoke tools, whose contract is
 * that a one-shot `input.surf = true` persists the way it always had. Clearing
 * only on the frame a real source *releases* keeps both: buttons still behave
 * as holds, and an external write survives until something actually lets go.
 */
let ownSurfHeld = false;

const LOOK_SCALE = 0.0022;

/** Standard pad stick noise is most visible on a slow camera pan, so the
 * deadzone is radial rather than two independent axis gates. A diagonal at
 * the edge of the gate therefore cannot sneak a larger value through one
 * axis than another. */
export const GAMEPAD_STICK_DEADZONE = 0.18;
/** Trigger noise should not turn the chair on while the player is idle. */
export const GAMEPAD_TRIGGER_DEADZONE = 0.08;
/** Full right-stick look, in radians per second. pollInput scales by dt. */
export const GAMEPAD_LOOK_RATE = 3.0;
const DEFAULT_POLL_DT = 1 / 60;

// Reused output objects keep the browser poll path allocation-free. The pure
// helpers below accept caller-owned output objects too, which makes the input
// contract testable with deterministic fake pad snapshots.
const _radialOutput = { x: 0, y: 0 };
const _leftOutput = { x: 0, y: 0 };
const _lookOutput = { x: 0, y: 0 };
const _padSample = {
    connected: false,
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    moveStrength: 0,
    lookStrength: 0,
    surf: false,
    boost: 0,
    jump: false,
    spin: 0,
    trickMod: false,
    recover: false,
};

/** @type {(() => void)|null} */
let onToggleOverlay = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onToggleOverlay?: () => void }} [hooks]
 */
export function initInput(canvas, hooks) {
    onToggleOverlay = hooks?.onToggleOverlay ?? null;

    canvas.addEventListener("click", () => {
        if (!input.locked) canvas.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
        input.locked = document.pointerLockElement === canvas;
        if (!input.locked) {
            // Drop held state so the character doesn't run off while unfocused.
            for (const k in keys) keys[k] = false;
            mouseSurf = false;
            input.surf = false;
            input.spellHeld2 = false;
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (!input.locked) return;
        const scale = LOOK_SCALE * S.mouseSensitivity;
        input.lookX += e.movementX * scale;
        input.lookY += e.movementY * scale * (S.invertY ? -1 : 1);
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousedown", (e) => {
        if (!input.locked) return;
        if (e.button === 2) { input.surf = true; mouseSurf = true; }
    });

    document.addEventListener("mouseup", (e) => {
        if (e.button === 2) { input.surf = false; mouseSurf = false; }
    });

    document.addEventListener(
        "wheel",
        (e) => {
            if (!input.locked) return;
            e.preventDefault();
            input.zoomDelta += e.deltaY * 0.0016;
        },
        { passive: false }
    );

    window.addEventListener("keydown", (e) => {
        // Overlay toggle works whether or not the pointer is locked.
        if (e.code === "F1" || e.code === "Backquote") {
            e.preventDefault();
            onToggleOverlay?.();
            return;
        }
        if (e.repeat) return;
        keys[e.code] = true;

        if (e.code === "Space") {
            e.preventDefault();
            input.jumpPressed = true;
        }
        if (e.code === "KeyR") input.recoverPressed = true;

        const n = SPELL_KEYS[e.code];
        if (n) {
            input.spellPressed = n;
            if (n === 2) input.spellHeld2 = true;
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.code] = false;
        if (SPELL_KEYS[e.code] === 2) input.spellHeld2 = false;
    });

    window.addEventListener("blur", () => {
        for (const k in keys) keys[k] = false;
        input.surf = false;
        input.spellHeld2 = false;
    });
}

const SPELL_KEYS = {
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
};

/**
 * Apply a radial stick deadzone without allocating.
 *
 * @param {number} x raw horizontal axis
 * @param {number} y raw vertical axis
 * @param {number} deadzone 0..1
 * @param {{x:number,y:number}} [out] caller-owned result
 * @returns {{x:number,y:number}}
 */
export function applyRadialDeadzone(
    x, y, deadzone = GAMEPAD_STICK_DEADZONE, out = _radialOutput
) {
    const sx = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    const sy = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
    const radius = Math.hypot(sx, sy);
    const gate = Math.max(0, Math.min(0.99, deadzone));
    if (radius <= gate || radius <= Number.EPSILON) {
        out.x = 0;
        out.y = 0;
        return out;
    }
    const strength = Math.min(1, (radius - gate) / (1 - gate));
    const scale = strength / radius;
    out.x = sx * scale;
    out.y = sy * scale;
    return out;
}

function buttonValue(button) {
    if (!button) return 0;
    if (Number.isFinite(button.value)) {
        return Math.max(0, Math.min(1, button.value));
    }
    return button.pressed ? 1 : 0;
}

function buttonActive(button) {
    return Boolean(button?.pressed) || buttonValue(button) > GAMEPAD_TRIGGER_DEADZONE;
}

/**
 * Read one standard-mapped Gamepad snapshot into a caller-owned result.
 *
 * The output uses the game's camera-relative convention: standard axis 1 up
 * is negative, so `moveZ` is positive when the stick points up. This helper
 * contains no browser/global state and is the contract exercised by the pad
 * tests as well as by the live poll.
 */
export function sampleGamepad(pad, out = _padSample) {
    const connected = Boolean(pad?.connected);
    out.connected = connected;
    if (!connected) {
        out.moveX = 0;
        out.moveZ = 0;
        out.lookX = 0;
        out.lookY = 0;
        out.moveStrength = 0;
        out.lookStrength = 0;
        out.surf = false;
        out.boost = 0;
        out.jump = false;
        out.spin = 0;
        out.trickMod = false;
        out.recover = false;
        return out;
    }

    const axes = pad.axes;
    applyRadialDeadzone(axes?.[0], axes?.[1], GAMEPAD_STICK_DEADZONE, _leftOutput);
    applyRadialDeadzone(axes?.[2], axes?.[3], GAMEPAD_STICK_DEADZONE, _lookOutput);
    out.moveX = _leftOutput.x;
    out.moveZ = -_leftOutput.y;
    out.lookX = _lookOutput.x;
    out.lookY = _lookOutput.y;
    out.moveStrength = Math.hypot(out.moveX, out.moveZ);
    out.lookStrength = Math.hypot(out.lookX, out.lookY);

    const buttons = pad.buttons;
    out.surf = buttonActive(buttons[6]);
    const boost = buttonValue(buttons[7]);
    out.boost = boost > GAMEPAD_TRIGGER_DEADZONE ? boost : 0;
    out.jump = Boolean(buttons[0]?.pressed);
    out.spin = (buttons[4]?.pressed ? -1 : 0) + (buttons[5]?.pressed ? 1 : 0);
    out.trickMod = Boolean(buttons[2]?.pressed);
    out.recover = Boolean(buttons[1]?.pressed);
    return out;
}

function connectedGamepads() {
    if (typeof navigator === "undefined" ||
        typeof navigator.getGamepads !== "function") return null;
    return navigator.getGamepads();
}

/** Resolve held keys, touch, and standard gamepad input before update. */
export function pollInput(dt = DEFAULT_POLL_DT) {
    let x = 0;
    let z = 0;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;

    // Clamp to a unit disc so diagonals aren't faster.
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
        x /= len;
        z /= len;
    }
    const keyStrength = Math.hypot(x, z);
    const pads = connectedGamepads();
    let padMoveX = 0;
    let padMoveZ = 0;
    let padMoveStrength = 0;
    let padLookX = 0;
    let padLookY = 0;
    let padLookStrength = 0;
    let padSurf = false;
    let padBoost = 0;
    let padSpin = 0;
    let padTrickMod = false;

    const padCount = Math.max(
        pads?.length ?? 0, _padSouth.length, _padEast.length
    );
    for (let i = 0; i < padCount; i++) {
        const pad = pads?.[i];
        if (!pad?.connected) {
            // A disconnect is a release, including the edge-state buttons.
            _padSouth[i] = false;
            _padEast[i] = false;
            continue;
        }
        const sample = sampleGamepad(pad);
        if (sample.moveStrength >= padMoveStrength) {
            padMoveStrength = sample.moveStrength;
            padMoveX = sample.moveX;
            padMoveZ = sample.moveZ;
        }
        if (sample.lookStrength >= padLookStrength) {
            padLookStrength = sample.lookStrength;
            padLookX = sample.lookX;
            padLookY = sample.lookY;
        }
        padSurf = padSurf || sample.surf;
        padBoost = Math.max(padBoost, sample.boost);
        padSpin += sample.spin;
        padTrickMod = padTrickMod || sample.trickMod;
        if (sample.jump && !_padSouth[i]) input.jumpPressed = true;
        if (sample.recover && !_padEast[i]) input.recoverPressed = true;
        _padSouth[i] = sample.jump;
        _padEast[i] = sample.recover;
    }

    // Touch has always taken over the keyboard stick while it is engaged. A
    // live gamepad is the next strongest explicit source; otherwise the
    // established keyboard vector remains authoritative. Comparing strength
    // keeps a half-deflected pad from stealing a deliberate full keyboard
    // direction, while ties prefer the pad's analog intent.
    if (touch.x || touch.y) {
        x = touch.x;
        z = touch.y;
    } else if (padMoveStrength >= keyStrength && padMoveStrength > 0) {
        x = padMoveX;
        z = padMoveZ;
    }

    input.moveX = x;
    input.moveZ = z;
    input.moving = Math.hypot(x, z) > 0.001;
    input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
    input.boost = Math.max(
        keys.ShiftLeft || keys.ShiftRight ? 1 : 0,
        padBoost,
        touch.boost,
    );

    // Tricks. Q/E spin; F is the modifier that turns W/S into flips and A/D
    // into tweaks (the controller reads moveX/moveZ under trickMod). Gamepad:
    // bumpers spin, west button is the modifier, east recovers.
    let spin = 0;
    if (keys.KeyQ) spin -= 1;
    if (keys.KeyE) spin += 1;
    let trickMod = !!keys.KeyF || touch.trick;
    spin += padSpin;
    trickMod = trickMod || padTrickMod;
    input.spin = Math.max(-1, Math.min(1, spin));
    input.trickMod = trickMod;
    // Held, not toggled: the ride button behaves like the right mouse button
    // it stands in for. Cleared on release rather than reconciled every frame
    // — see `ownSurfHeld`.
    const ownSurf = touch.ride || mouseSurf || padSurf;
    if (ownSurf) input.surf = true;
    else if (ownSurfHeld) input.surf = false;
    ownSurfHeld = ownSurf;
    if (touch.jump) input.jumpPressed = true;
    input.lookX += touch.lookX;
    input.lookY += touch.lookY;

    // A held right stick is a rate, not a per-frame delta. Scaling by the
    // simulation's dt keeps one second of look identical at 30/60/120 Hz,
    // while the radial deadzone above prevents worn-stick drift. Mouse and
    // touch deltas retain their established additive semantics.
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    if (frameDt > 0 && padLookStrength > 0) {
        input.lookX += padLookX * GAMEPAD_LOOK_RATE * frameDt;
        input.lookY += padLookY * GAMEPAD_LOOK_RATE * frameDt
            * (S.invertY ? -1 : 1);
    }
}

/** Per-pad east-button state, for the recover edge. */
const _padEast = [];
/** Per-pad south-button state, for the jump edge. */
const _padSouth = [];

/** Clear per-frame accumulators. Called at the very end of the frame. */
export function endFrame() {
    endTouchFrame();
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
    input.spellPressed = 0;
    input.jumpPressed = false;
    input.recoverPressed = false;
}

export function isDown(code) {
    return !!keys[code];
}
