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

    locked: false,
};

const keys = Object.create(null);
/** Whether the right mouse button is currently holding the ride. */
let mouseSurf = false;
/**
 * Whether the poll's own sources (RMB, touch ride) held the ride last frame.
 *
 * The touch merge made `pollInput` clear `input.surf` every frame the button
 * was up — which silently broke the committed smoke tools, whose contract is
 * that a one-shot `input.surf = true` persists the way it always had. Clearing
 * only on the frame a real source *releases* keeps both: buttons still behave
 * as holds, and an external write survives until something actually lets go.
 */
let ownSurfHeld = false;

const LOOK_SCALE = 0.0022;

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

/** Resolve held keys into movement axes. Called once per frame before update. */
export function pollInput() {
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
    // Merge the touch stick here rather than letting it write `input` itself.
    // This function rebuilds the axes from held keys every frame, so anything
    // assigned from outside is overwritten before the controller reads it.
    if (touch.x || touch.y) {
        x = touch.x;
        z = touch.y;
    }

    input.moveX = x;
    input.moveZ = z;
    input.moving = Math.hypot(x, z) > 0.001;
    input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
    input.boost = Math.max(pollBoost(), touch.boost);
    // Held, not toggled: the ride button behaves like the right mouse button
    // it stands in for. Cleared on release rather than reconciled every frame
    // — see `ownSurfHeld`.
    const ownSurf = touch.ride || mouseSurf;
    if (ownSurf) input.surf = true;
    else if (ownSurfHeld) input.surf = false;
    ownSurfHeld = ownSurf;
    if (touch.jump) input.jumpPressed = true;
    input.lookX += touch.lookX;
    input.lookY += touch.lookY;
}


/**
 * Throttle, from the keyboard or a gamepad's right trigger.
 *
 * The gamepad is read here rather than through events because that is the only
 * way the API offers: `navigator.getGamepads` returns a fresh snapshot and a
 * connected pad that is never polled reports nothing. Reading it inside the
 * frame poll also means a pad disconnecting mid-run simply stops contributing
 * on the next frame instead of leaving a stuck throttle.
 *
 * Whichever input is asking for more wins, so a player can hold Shift with a
 * pad plugged in and not have the pad's idle trigger argue with it.
 */
function pollBoost() {
    let boost = (keys.ShiftLeft || keys.ShiftRight) ? 1 : 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return boost;
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad || !pad.connected) continue;
        // Standard mapping puts the right trigger at button 7, and it reports a
        // value even though it is typed as a button. Sticks and triggers idle
        // at small non-zero values on worn hardware, so a deadzone is not
        // optional.
        const trigger = pad.buttons && pad.buttons[7] ? pad.buttons[7].value : 0;
        if (trigger > 0.08) boost = Math.max(boost, trigger);
    }
    return boost;
}

/** Clear per-frame accumulators. Called at the very end of the frame. */
export function endFrame() {
    endTouchFrame();
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
    input.spellPressed = 0;
    input.jumpPressed = false;
}

export function isDown(code) {
    return !!keys[code];
}
