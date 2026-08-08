/**
 * Pause — the one place the simulation clock is allowed to stop.
 *
 * The mechanism is the debug freeze the project already trusts: `main.js`
 * computes one dt for the whole frame, and `S.freezeTime` has been feeding a
 * zero through every system since before the game layer existed. Pausing rides
 * exactly that path — `paused` is a second reason for the same zero — so there
 * is no per-system pause flag to forget, and anything the freeze slider proved
 * safe is proved safe here too. Rendering continues; only simulated time stops.
 *
 * The two stay separate on purpose: `S.freezeTime` is an overlay tool a
 * developer toggles to stare at a frame, and this is game state with an
 * interface, input rules and audio behaviour. They meet only in the dt gate.
 *
 * ---------------------------------------------------------------- the Escape
 *
 * While the pointer is locked, the browser swallows Escape: the page never
 * sees the keydown, the lock just ends. So "press Escape to pause" is
 * implemented as two halves that must both exist —
 *
 *   locked   → Escape exits pointer lock → `pointerlockchange` → pause
 *   unlocked → Escape reaches `keydown`  → pause (or resume)
 *
 * — and the lock-loss half doubles as the safety net the brief asks for: any
 * way the pointer escapes during a run (Escape, the browser stealing it, a
 * system dialog) holds the rider instead of letting them ride on unsteered.
 *
 * Resuming re-requests the lock, best-effort. Chrome refuses a request made
 * too soon after an Escape-exit, so a refusal is caught and the game resumes
 * unlocked — the canvas click handler that has always armed the lock picks it
 * up on the next click. What must never happen is the feedback loop: resume →
 * lock refused → lock-loss handler pauses again. The handler only fires on a
 * *transition* out of a held lock while unpaused, so a resume that never
 * acquired the lock cannot trip it.
 *
 * ------------------------------------------------------------------ the input
 *
 * While paused, `suppressGameplayInput()` zeroes the shared input struct every
 * frame after the poll — the same overwrite-after-poll trick `beforePhysics`
 * uses to hold the rider at the gate. Held keys therefore do nothing, and the
 * one-frame flags (`jumpPressed`, `spellPressed`) are re-zeroed each frame by
 * `endFrame()` as always, so nothing buffered during the pause can fire on the
 * resume frame.
 */

import { input } from "../core/input.js";
import { gamepadInputFamily, noteInputFamily } from "../core/inputFamily.js";
import { audio } from "../audio/audio.js";
import { Mode } from "./modes.js";
import { RunState } from "./burgerRun.js";

/** Standard-mapping gamepad indices. */
const PAD_START = 9;

/**
 * Whether this mode/state combination is active gameplay a pause can hold.
 *
 * Title, the order card and the results screen are already menus: pausing a
 * menu would stack two screens and freeze nothing of value. Everything else —
 * a countdown, a live run, the assembly, both lab modes — is simulation the
 * player can lose progress in, so those pause.
 *
 * Exported pure, so the unit tests can hold this table still.
 *
 * @param {string} mode a `Mode` value
 * @param {string} runState a `RunState` value
 * @returns {boolean}
 */
export function canPauseState(mode, runState) {
    if (mode === Mode.FREE_RIDE || mode === Mode.ROCKET_TEST) return true;
    if (mode !== Mode.BURGER_RUN) return false;
    return (
        runState === RunState.COUNTDOWN ||
        runState === RunState.RUN ||
        runState === RunState.ASSEMBLY
    );
}

/**
 * Zero every field of the input struct that can move the world.
 *
 * Look and zoom are zeroed too: a paused camera that still orbits is a paused
 * game that still plays. The struct is rebuilt by `pollInput()` next frame
 * regardless — this only has to win the race for the current one.
 */
export function suppressGameplayInput() {
    input.moveX = 0;
    input.moveZ = 0;
    input.moving = false;
    input.surf = false;
    input.sprint = false;
    input.boost = 0;
    input.jumpPressed = false;
    input.spellPressed = 0;
    input.spellHeld2 = false;
    input.spin = 0;
    input.trickMod = false;
    input.recoverPressed = false;
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
}

export class PauseSystem {
    /**
     * @param {object} deps
     * @param {import("./gameDirector.js").GameDirector} deps.director
     * @param {HTMLCanvasElement} deps.canvas
     */
    constructor({ director, canvas }) {
        this.director = director;
        this.canvas = canvas;
        this.ui = director.ui;

        /** The dt gate reads this. Nothing else writes it. */
        this.active = false;
        /** "user" | "focus" | "pointer-lock" — why, for the pause screen. */
        this.reason = null;
        /**
         * Whether losing focus/visibility pauses. `?autopause=off` clears it —
         * an escape hatch for headless tools, which drive the page without a
         * window manager and must never find a surprise veil over a run.
         */
        this.autoPauseEnabled =
            new URLSearchParams(location.search).get("autopause") !== "off";

        /** Restart wants a deliberate second press, not a modal. */
        this._restartArmed = false;

        /** Per-pad Start button state, for edge detection. */
        this._padStart = [];
        /** Per-pad menu-navigation button states, same family. */
        this._padNav = [];

        /** Whether the pointer was locked when the pause began. */
        this._relockOnResume = false;

        window.addEventListener("keydown", (e) => {
            if (e.code !== "Escape") return;
            // Escape only ever reaches here unlocked — see the header.
            if (this.active) {
                e.preventDefault();
                this.resume();
            } else if (this._canPause()) {
                e.preventDefault();
                this.pause("user");
            }
        });

        document.addEventListener("pointerlockchange", () => {
            const locked = document.pointerLockElement === this.canvas;
            if (locked) {
                this._hadLock = true;
                return;
            }
            // A transition out of a held lock, mid-gameplay, unpaused: the
            // rider must not keep going downhill unsteered.
            if (this._hadLock && !this.active && this._canPause()) {
                this.pause("pointer-lock");
            }
            this._hadLock = false;
        });
        this._hadLock = false;

        const focusPause = () => {
            if (!this.autoPauseEnabled) return;
            if (!this.active && this._canPause()) this.pause("focus");
        };
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") focusPause();
        });
        window.addEventListener("blur", focusPause);

        this.ui.onPauseAction = (action) => this._onAction(action);
    }

    _canPause() {
        return canPauseState(this.director.mode, this.director.run.state);
    }

    /**
     * Per-frame work: the gamepad Start poll.
     *
     * Polled rather than evented because that is the only interface the
     * Gamepad API offers — the same reason `pollBoost` reads the trigger
     * inside the frame. Edge-detected per pad, so holding Start is one press.
     */
    update() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : null;
        if (!pads) return;
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            const down = !!(pad && pad.connected && pad.buttons[PAD_START]?.pressed);
            if (down && !this._padStart[i]) {
                noteInputFamily(gamepadInputFamily(pad));
                if (this.active) this.resume();
                else if (this._canPause()) this.pause("user");
            }
            this._padStart[i] = down;

            // Menus on the pad: d-pad walks, left/right adjust a focused
            // settings range, south presses, east backs out.
            // Edge-detected against the same per-pad state family as Start.
            if (!pad || !pad.connected) continue;
            const edges = this._padNav[i] ?? (this._padNav[i] = {});
            const read = (idx, name) => {
                const now = !!pad.buttons[idx]?.pressed;
                const was = edges[name] ?? false;
                edges[name] = now;
                return now && !was;
            };
            const up = read(12, "up");
            const dn = read(13, "down");
            const left = read(14, "left");
            const right = read(15, "right");
            const south = read(0, "south");
            const east = read(1, "east");
            if (up || dn || left || right || south || east) {
                noteInputFamily(gamepadInputFamily(pad));
            }
            if (!this.ui.anyScreenVisible()) continue;
            if (up) this.ui.menuMove(-1);
            if (dn) this.ui.menuMove(1);
            if (left) this.ui.menuAdjust(-1);
            if (right) this.ui.menuAdjust(1);
            if (south) this.ui.menuActivate();
            if (east) {
                if (this.ui.menuBack?.()) {
                    // The UI owns screen-specific cancel/back routing,
                    // including Burger Book, How to Ride, confirmations, and
                    // title credits. This keeps east/back usable even when
                    // focus is on a tab or record row.
                } else if (this.active) {
                    this.resume();
                }
            }
        }
    }

    /** @param {"user"|"focus"|"pointer-lock"|"touch"} reason */
    pause(reason = "user") {
        if (this.active) return;
        if (!this._canPause()) return;
        this.active = true;
        this.reason = reason;
        this._restartArmed = false;
        this.director.paused = true;

        // Release the pointer so the pause menu is clickable. Remember whether
        // there was a lock to give back: a touch or gamepad player never had
        // one, and handing them a lock request on resume would be a mystery
        // cursor grab.
        this._relockOnResume = document.pointerLockElement === this.canvas;
        // `_hadLock` drops first, or exiting the lock we hold would re-enter
        // `pause` through the lock-loss handler.
        this._hadLock = false;
        if (this._relockOnResume) document.exitPointerLock?.();

        audio.setDucked(true);
        audio.ui();
        this.ui.showPause(this._context());
    }

    resume() {
        if (!this.active) return;
        this.active = false;
        this.reason = null;
        this._restartArmed = false;
        this.director.paused = false;

        audio.setDucked(false);
        audio.ui();
        this.ui.hidePause();

        // One clean frame: nothing pressed during the pause may fire now.
        suppressGameplayInput();

        if (this._relockOnResume) {
            this._relockOnResume = false;
            // Chrome refuses a re-lock made too soon after an Escape exit.
            // Refused is fine: the game resumes unlocked and the canvas click
            // handler re-arms the lock, exactly as it does at boot.
            try {
                const p = this.canvas.requestPointerLock?.();
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch { /* resume unlocked */ }
        }
    }

    toggle() {
        if (this.active) this.resume();
        else this.pause("user");
    }

    /** What the pause screen prints under "Paused". */
    _context() {
        const d = this.director;
        if (d.mode === Mode.BURGER_RUN) {
            const total = d.run.event.required.length;
            const got = Object.keys(d.run.splits).length;
            return {
                title: d.run.event.name,
                detail: `${formatClock(d.run.time)} · ${got}/${total} collected`,
                canRestart: true,
            };
        }
        if (d.mode === Mode.ROCKET_TEST) {
            return { title: "Rocket Board Test", detail: "Infinite fuel", canRestart: true };
        }
        return { title: "Free Ride Lab", detail: "The original open mountain", canRestart: false };
    }

    _onAction(action) {
        switch (action) {
            case "resume":
                this.resume();
                break;
            case "restart":
                // A deliberate second press rather than a modal: fast for the
                // player who means it, recoverable for the one who slipped.
                if (!this._restartArmed) {
                    this._restartArmed = true;
                    audio.ui();
                    this.ui.armRestart(true);
                    return;
                }
                this.active = false;
                this.reason = null;
                this._restartArmed = false;
                this.director.paused = false;
                audio.setDucked(false);
                audio.ui("confirm");
                this.ui.hidePause();
                suppressGameplayInput();
                this.director.restartCurrent();
                break;
            case "settings":
                this.ui.showPauseSettings();
                break;
            case "settings-back": {
                // The panel serves the pause menu AND the title; only the
                // pause path re-raises the veil.
                const from = this.ui.closeSettings();
                if (from === "pause" && this.active) {
                    this.ui.showPause(this._context());
                }
                break;
            }
            case "quit":
                this.active = false;
                this.reason = null;
                this._restartArmed = false;
                this.director.paused = false;
                audio.setDucked(false);
                audio.ui();
                this.ui.hidePause();
                suppressGameplayInput();
                this.director.quitToTitle();
                break;
            default:
                break;
        }
    }
}

function formatClock(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? "0" : ""}${rest.toFixed(2)}`;
}
