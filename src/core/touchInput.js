/**
 * Touch controls: a stick, three buttons, and a look area.
 *
 * ------------------------------------------------------------------ the merge
 *
 * This does not write `input` directly, and that is the whole design.
 * `pollInput()` rebuilds the movement axes, the throttle and the sprint flag
 * from held keys on every frame, so anything written from outside it is
 * overwritten before the controller ever reads it — the same trap that made an
 * early rocket capture measure an engine that never lit. So this owns a small
 * state object, and `pollInput` merges it.
 *
 * ------------------------------------------------------------- the layout
 *
 * Stick bottom-left, buttons bottom-right, and everywhere else is the camera.
 * That last part is why the look area is not its own widget: a player's spare
 * thumb lands wherever there is room, and reserving a strip for it would make
 * the one gesture that has to feel free the one with a box around it.
 *
 * Multi-touch is tracked per pointer id rather than per element, because a
 * thumb that starts on the stick and slides off it is still steering, and a
 * stick that let go at its own edge would be a stick that fights the player at
 * exactly the moment they are asking for full lock.
 */

import { S } from "./settings.js";

/** Merged by `pollInput`. Nothing else writes it. */
export const touch = {
    active: false,
    /** Stick, -1..1 each. */
    x: 0,
    y: 0,
    /** Held buttons. */
    ride: false,
    boost: 0,
    /** The trick modifier, held. Stick direction picks the trick axis. */
    trick: false,
    /** Set for one frame; cleared by the input layer's own frame end. */
    jump: false,
    /** Accumulated look delta since the last frame, radians. */
    lookX: 0,
    lookY: 0,
};

const STICK_RADIUS = 62;
const LOOK_SCALE = 0.0042;

const CSS = `
#sb-touch { position: fixed; inset: 0; z-index: 55; pointer-events: none;
    touch-action: none; -webkit-user-select: none; user-select: none; display: none; }
#sb-touch.on { display: block; }
#sb-touch .pad {
    position: absolute; bottom: max(28px, env(safe-area-inset-bottom));
    left: max(28px, env(safe-area-inset-left));
    width: 148px; height: 148px; border-radius: 50%;
    border: 1px solid rgba(219,230,242,0.22);
    background: radial-gradient(circle, rgba(9,14,22,0.30), rgba(9,14,22,0.10) 70%, transparent);
    pointer-events: auto;
}
#sb-touch .nub {
    position: absolute; left: 50%; top: 50%; width: 62px; height: 62px;
    margin: -31px 0 0 -31px; border-radius: 50%;
    background: rgba(219,230,242,0.20);
    border: 1px solid rgba(219,230,242,0.42);
    box-shadow: 0 2px 18px rgba(3,8,15,0.55);
    transition: background 140ms ease;
}
#sb-touch .pad.held .nub { background: rgba(242,161,61,0.32); border-color: #f2a13d; }
#sb-touch .keys {
    position: absolute; bottom: max(28px, env(safe-area-inset-bottom));
    right: max(26px, env(safe-area-inset-right));
    display: grid; grid-template-columns: repeat(2, auto); gap: 14px;
    pointer-events: auto;
}
#sb-touch .keys .key:first-child { width: 66px; height: 66px; align-self: end; }
#sb-touch .key {
    width: 82px; height: 82px; border-radius: 50%;
    border: 1px solid rgba(219,230,242,0.26);
    background: rgba(9,14,22,0.30);
    color: rgba(232,242,251,0.82);
    font: 500 9px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.16em; text-transform: uppercase;
    display: grid; place-items: center; text-align: center;
    text-shadow: 0 2px 12px rgba(3,8,15,0.8);
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
#sb-touch .key.held {
    background: rgba(242,161,61,0.28); border-color: #f2a13d;
    color: #fff; transform: scale(0.94);
}
#sb-touch .key.wide { grid-column: span 2; width: 178px; height: 54px; border-radius: 27px; }
#sb-touch .pause {
    position: absolute; top: max(18px, env(safe-area-inset-top));
    right: max(18px, env(safe-area-inset-right));
    width: 44px; height: 44px; border-radius: 50%;
    border: 1px solid rgba(219,230,242,0.26);
    background: rgba(9,14,22,0.30);
    color: rgba(232,242,251,0.82);
    font: 500 12px/1 ui-monospace, "Cascadia Mono", monospace;
    display: grid; place-items: center;
    pointer-events: auto;
    transition: background 120ms ease, border-color 120ms ease;
}
#sb-touch .pause:active { background: rgba(242,161,61,0.28); border-color: #f2a13d; }
`;

let root = null;
let padEl = null;
let nubEl = null;
/** @type {(() => void)|null} the pause system's tap handler */
let onPauseTap = null;

/** Wire the pause button. A callback rather than a `touch` field, because a
 *  tap is an intent for the flow layer, not per-frame input for the poll. */
export function setTouchPauseHandler(fn) {
    onPauseTap = fn;
}
/** @type {Map<number, {kind: string, el?: HTMLElement, x: number, y: number}>} */
const pointers = new Map();

/**
 * Whether to show them at all.
 *
 * `maxTouchPoints` rather than a user-agent test, because the question is
 * whether this device has a touchscreen and not what it calls itself — and a
 * touchscreen laptop that shows them loses nothing, while a phone that does not
 * has no way to play.
 */
export function shouldShowTouch() {
    if (S.touchControls === "on") return true;
    if (S.touchControls === "off") return false;
    return (navigator.maxTouchPoints ?? 0) > 0;
}

export function initTouch(canvas) {
    if (root) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.id = "sb-touch";
    root.innerHTML = `
<div class="pad" id="sb-pad"><div class="nub" id="sb-nub"></div></div>
<div class="keys">
  <button class="key" data-hold="trick">Trick</button>
  <button class="key" data-hold="boost">Boost</button>
  <button class="key" data-tap="jump">Jump</button>
  <button class="key wide" data-hold="ride">Ride</button>
</div>
<button class="pause" aria-label="Pause">&#9613;&#9613;</button>`;
    document.body.appendChild(root);
    padEl = root.querySelector("#sb-pad");
    nubEl = root.querySelector("#sb-nub");

    setTouchVisible(shouldShowTouch());

    // Buttons. `pointerdown`/`pointerup` rather than click, because a control
    // that only reports on release cannot be held, and two of these three are
    // held controls.
    for (const key of root.querySelectorAll(".key")) {
        key.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            key.classList.add("held");
            key.setPointerCapture?.(e.pointerId);
            if (key.dataset.hold === "ride") touch.ride = true;
            if (key.dataset.hold === "boost") touch.boost = 1;
            if (key.dataset.hold === "trick") touch.trick = true;
            if (key.dataset.tap === "jump") touch.jump = true;
        });
        const release = (e) => {
            key.classList.remove("held");
            if (key.dataset.hold === "ride") touch.ride = false;
            if (key.dataset.hold === "boost") touch.boost = 0;
            if (key.dataset.hold === "trick") touch.trick = false;
            if (e) e.preventDefault();
        };
        key.addEventListener("pointerup", release);
        key.addEventListener("pointercancel", release);
        key.addEventListener("pointerleave", (e) => {
            // Only give up the button if the finger actually lifted; a thumb
            // rolling across a 82 px target still means "held".
            if (!key.hasPointerCapture?.(e.pointerId)) release(e);
        });
    }

    // The pause corner button. `pointerdown` for parity with the other keys,
    // but it is a tap, not a hold — one intent per press.
    root.querySelector(".pause").addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPauseTap?.();
    });

    // The stick.
    padEl.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        padEl.setPointerCapture(e.pointerId);
        padEl.classList.add("held");
        pointers.set(e.pointerId, { kind: "stick" });
        updateStick(e);
    });
    padEl.addEventListener("pointermove", (e) => {
        if (pointers.get(e.pointerId)?.kind !== "stick") return;
        updateStick(e);
    });
    const endStick = (e) => {
        if (pointers.get(e.pointerId)?.kind !== "stick") return;
        pointers.delete(e.pointerId);
        padEl.classList.remove("held");
        touch.x = 0;
        touch.y = 0;
        nubEl.style.transform = "";
    };
    padEl.addEventListener("pointerup", endStick);
    padEl.addEventListener("pointercancel", endStick);

    // Look: anything on the canvas that is not the stick or a button.
    canvas.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        pointers.set(e.pointerId, { kind: "look", x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener("pointermove", (e) => {
        const p = pointers.get(e.pointerId);
        if (!p || p.kind !== "look") return;
        touch.lookX += (e.clientX - p.x) * LOOK_SCALE;
        touch.lookY += (e.clientY - p.y) * LOOK_SCALE;
        p.x = e.clientX;
        p.y = e.clientY;
    });
    const endLook = (e) => {
        if (pointers.get(e.pointerId)?.kind === "look") pointers.delete(e.pointerId);
    };
    canvas.addEventListener("pointerup", endLook);
    canvas.addEventListener("pointercancel", endLook);

    // A touchscreen has no pointer lock to enter and no right button to hold,
    // so the canvas must not try to grab either.
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
}

function updateStick(e) {
    const r = padEl.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
    }
    nubEl.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.x = dx / STICK_RADIUS;
    // Screen down is positive; forward is negative. The controller wants
    // forward positive on Z, so the sign flips exactly once, here.
    touch.y = -dy / STICK_RADIUS;
    touch.active = true;
}

export function setTouchVisible(on) {
    if (!root) return;
    root.classList.toggle("on", !!on);
    if (!on) {
        touch.x = 0; touch.y = 0; touch.ride = false; touch.boost = 0;
        touch.trick = false;
    }
}

/** Called by the input layer at the end of a frame. */
export function endTouchFrame() {
    touch.jump = false;
    touch.lookX = 0;
    touch.lookY = 0;
}
