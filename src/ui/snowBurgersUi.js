/**
 * The Snow-Burgers interface: title, order card, countdown, run HUD, results.
 *
 * Owns its own markup and its own stylesheet rather than living in
 * `index.html`. The game layer is a mode — Free Ride Lab turns all of this off
 * and hands the mountain back — so the whole interface being one object that
 * can be built, shown, hidden and torn down is worth more than matching where
 * the Summit Line HUD happens to keep its markup.
 *
 * ------------------------------------------------------------------ the look
 *
 * The existing interface is cold: thin weights, wide tracking, frost on ink,
 * tabular monospace for anything numeric. That is kept, and the only thing
 * added is warmth — a single amber accent for the order, the ingredients and
 * the grill. Cold interface, warm food is the joke played straight, and it is
 * also the readable answer: the mountain is white and pale blue, so warm is the
 * hue that survives being drawn on top of it.
 *
 * Ingredient imagery is rendered from the shipped models by
 * `tools/snow-burgers/qa-render.py --transparent`, not drawn and not typed. An
 * emoji would be a different tomato from the one on the mountain.
 *
 * Nothing here reads the renderer, the terrain or the controller. It is given
 * plain values by `GameDirector` and returns intent through callbacks, which is
 * what keeps a interface change from becoming a graphics change.
 */

import { INGREDIENTS } from "../game/ingredients.js";
import { RunState } from "../game/burgerRun.js";
import { S, set as setSetting, applyPreset } from "../core/settings.js";

const ICONS = (import.meta.env?.BASE_URL ?? "/") + "assets/ui/snow-burgers/";

const CSS = `
#sb-ui, #sb-ui * { box-sizing: border-box; }
#sb-ui {
    position: fixed; inset: 0; z-index: 60;
    pointer-events: none;
    color: var(--frost, #dbe6f2);
    font-family: ui-sans-serif, "Inter", "Segoe UI", system-ui, sans-serif;
    /* The one warm value in a cold interface. Every amber below refers here. */
    --warm: #f2a13d;
    --warm-dim: rgba(242, 161, 61, 0.55);
}
#sb-ui .sb-screen {
    position: absolute; inset: 0;
    display: none; place-items: center;
    background: radial-gradient(120% 90% at 50% 44%,
        rgba(9, 14, 22, 0.82) 0%, rgba(5, 8, 13, 0.94) 62%, rgba(3, 5, 9, 0.97) 100%);
    pointer-events: auto;
    opacity: 0;
    transition: opacity 420ms cubic-bezier(0.4, 0, 0.2, 1);
}
#sb-ui .sb-screen.on { display: grid; opacity: 1; }

/* ------------------------------------------------------------------ title */
.sb-title-inner { text-align: center; width: min(760px, 84vw); }
.sb-wordmark {
    font-size: clamp(34px, 6.4vw, 82px);
    font-weight: 200;
    letter-spacing: 0.30em; text-indent: 0.30em;
    line-height: 1.02;
}
.sb-wordmark b { font-weight: 500; color: var(--warm); }
.sb-rule {
    width: 100%; height: 1px; margin: 1.5em 0 1.25em;
    background: linear-gradient(90deg, transparent, rgba(219,230,242,0.28) 20%,
        var(--warm-dim) 50%, rgba(219,230,242,0.28) 80%, transparent);
}
.sb-tagline {
    font-size: clamp(10px, 1.2vw, 13px); font-weight: 400;
    letter-spacing: 0.44em; text-indent: 0.44em; text-transform: uppercase;
    color: rgba(219, 230, 242, 0.62);
}
.sb-menu { margin-top: 3.2em; display: grid; gap: 2px; justify-items: center; }
.sb-item {
    appearance: none; border: 0; background: none; cursor: pointer;
    color: rgba(219, 230, 242, 0.72);
    font: 300 clamp(13px, 1.5vw, 17px)/2.3 inherit;
    letter-spacing: 0.30em; text-indent: 0.30em; text-transform: uppercase;
    padding: 0 1.6em; position: relative;
    transition: color 200ms ease, letter-spacing 320ms cubic-bezier(0.16,1,0.3,1);
}
.sb-item::before {
    content: ""; position: absolute; left: 0; top: 50%; width: 0.9em; height: 1px;
    background: var(--warm); opacity: 0;
    transform: translateX(-6px); transition: opacity 200ms ease, transform 200ms ease;
}
.sb-item:hover, .sb-item:focus-visible {
    color: #f4f9ff; letter-spacing: 0.36em; text-indent: 0.36em; outline: none;
}
.sb-item:hover::before, .sb-item:focus-visible::before { opacity: 1; transform: none; }
.sb-item .sb-sub {
    display: block; font-size: 9px; letter-spacing: 0.18em; text-indent: 0.18em;
    line-height: 1.4; color: rgba(219,230,242,0.34); margin-top: -0.5em;
}
.sb-credit {
    position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
    font: 400 9px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(219, 230, 242, 0.26);
}

/* ------------------------------------------------------------- order card */
.sb-card { width: min(620px, 88vw); text-align: center; }
.sb-kicker {
    font: 500 9px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.34em; text-transform: uppercase; color: var(--warm);
}
.sb-event {
    margin-top: 0.9em;
    font-size: clamp(26px, 3.6vw, 44px); font-weight: 200;
    letter-spacing: 0.16em; text-indent: 0.16em; text-transform: uppercase;
}
.sb-sublabel {
    margin-top: 1.1em; font-size: 11px; font-weight: 400;
    letter-spacing: 0.2em; color: rgba(219,230,242,0.5); text-transform: uppercase;
}
.sb-chips {
    margin: 2.4em auto 0; display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 14px; max-width: 520px;
}
.sb-chip {
    padding: 14px 6px 12px; position: relative;
    border-top: 1px solid rgba(219,230,242,0.14);
}
.sb-chip img {
    display: block; width: 62px; height: 62px; margin: 0 auto 10px;
    object-fit: contain;
    filter: drop-shadow(0 6px 14px rgba(0,0,0,0.55));
    transition: opacity 260ms ease, filter 260ms ease;
}
.sb-chip .sb-name {
    font: 500 9px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.2em; text-transform: uppercase;
    color: rgba(219,230,242,0.72);
}
.sb-chip .sb-zone {
    margin-top: 6px; font: 400 8px/1.4 ui-monospace, monospace;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(219,230,242,0.32);
}
.sb-chip .sb-tick {
    position: absolute; top: 8px; right: 8px; width: 14px; height: 14px;
    opacity: 0; transition: opacity 220ms ease;
}
.sb-chip.done { border-top-color: var(--warm); }
.sb-chip.done .sb-tick { opacity: 1; }
.sb-chip.done .sb-name { color: var(--warm); }
.sb-actions { margin-top: 3em; display: flex; gap: 30px; justify-content: center; }

/* -------------------------------------------------------------- countdown */
#sb-countdown {
    position: absolute; inset: 0; display: none; place-items: center;
    pointer-events: none;
}
#sb-countdown.on { display: grid; }
.sb-count-num {
    font-size: clamp(72px, 13vw, 190px); font-weight: 100;
    letter-spacing: 0.06em;
    color: rgba(244, 249, 255, 0.94);
    text-shadow: 0 8px 60px rgba(3, 8, 15, 0.9);
    font-variant-numeric: tabular-nums;
}
.sb-count-num.go { color: var(--warm); }

/* --------------------------------------------------------------- run HUD */
#sb-hud {
    position: absolute; inset: 0; display: none; pointer-events: none;
}
#sb-hud.on { display: block; }
.sb-hud-order {
    position: absolute; top: max(24px, env(safe-area-inset-top));
    right: max(26px, env(safe-area-inset-right));
    display: flex; gap: 10px;
}
.sb-slot {
    width: 52px; text-align: center;
    opacity: 0.42; transition: opacity 260ms ease, transform 320ms cubic-bezier(0.16,1,0.3,1);
    text-shadow: 0 2px 14px rgba(3,8,15,0.85);
}
.sb-slot img { width: 40px; height: 40px; object-fit: contain; display: block; margin: 0 auto; }
.sb-slot span {
    display: block; margin-top: 4px;
    font: 500 8px/1 ui-monospace, monospace; letter-spacing: 0.16em;
    text-transform: uppercase; color: rgba(219,230,242,0.6);
}
.sb-slot.done { opacity: 1; transform: translateY(-2px); }
.sb-slot.done span { color: var(--warm); }
.sb-hud-clock {
    position: absolute; top: max(24px, env(safe-area-inset-top));
    left: 50%; transform: translateX(-50%);
    font: 300 clamp(26px, 3vw, 38px)/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.06em; font-variant-numeric: tabular-nums;
    color: rgba(238, 246, 253, 0.9);
    text-shadow: 0 2px 20px rgba(3,8,15,0.9);
}
.sb-hud-split {
    margin-top: 7px; text-align: center;
    font: 500 10px/1 ui-monospace, monospace; letter-spacing: 0.2em;
    text-transform: uppercase; color: rgba(219,230,242,0.42);
}
.sb-hud-fuel {
    position: absolute; left: 50%; top: 92px; transform: translateX(-50%);
    width: 168px; opacity: 0;
    transition: opacity 300ms ease;
}
.sb-hud-fuel.on { opacity: 1; }
.sb-hud-fuel .sb-fuel-label {
    font: 500 8px/1 ui-monospace, monospace; letter-spacing: 0.24em;
    text-transform: uppercase; color: rgba(219,230,242,0.45);
    text-align: center; margin-bottom: 6px;
    text-shadow: 0 2px 14px rgba(3,8,15,0.9);
}
.sb-hud-fuel .sb-fuel-track {
    height: 3px; background: rgba(219,230,242,0.16); overflow: hidden;
    box-shadow: 0 1px 10px rgba(3,8,15,0.7);
}
.sb-hud-fuel .sb-fuel-track i {
    display: block; height: 100%; width: 100%;
    transform-origin: left center;
    background: linear-gradient(90deg, var(--warm-dim), var(--warm));
}
/* Under a quarter it stops being information and starts being a warning. */
.sb-hud-fuel.low .sb-fuel-track i { background: #e2553a; }
.sb-hud-fuel.low .sb-fuel-label { color: #e2553a; }

/* ---------------------------------------------------------------- tricks */
/* Bottom-left, clear of the course: the trick toast, the open combo, and
   the landing grade. Brief and readable — the mountain stays the screen. */
#sb-trick {
    position: absolute; left: max(30px, env(safe-area-inset-left)); bottom: 118px;
    opacity: 0; transform: translateY(6px);
    transition: opacity 220ms ease, transform 320ms cubic-bezier(0.16,1,0.3,1);
    pointer-events: none;
}
#sb-trick.on { opacity: 1; transform: none; }
#sb-trick .sb-trick-name {
    font: 300 clamp(17px, 1.9vw, 24px)/1.2 inherit;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(244, 249, 255, 0.94);
    text-shadow: 0 2px 18px rgba(3,8,15,0.9);
}
#sb-trick .sb-trick-score {
    margin-top: 3px;
    font: 400 12px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.14em; font-variant-numeric: tabular-nums;
    color: var(--warm);
    text-shadow: 0 2px 14px rgba(3,8,15,0.9);
}
#sb-grade {
    position: absolute; left: max(30px, env(safe-area-inset-left)); bottom: 168px;
    font: 500 10px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.34em; text-transform: uppercase;
    opacity: 0; transition: opacity 180ms ease;
    text-shadow: 0 2px 14px rgba(3,8,15,0.9);
    pointer-events: none;
}
#sb-grade.on { opacity: 1; }
#sb-grade.perfect { color: var(--warm); }
#sb-grade.clean { color: rgba(219,230,242,0.85); }
#sb-grade.sketchy { color: rgba(219,230,242,0.45); }
#sb-grade.crash { color: #e2553a; }
#sb-combo {
    position: absolute; left: max(30px, env(safe-area-inset-left)); bottom: 92px;
    font: 400 11px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.2em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    color: rgba(219,230,242,0.6);
    opacity: 0; transition: opacity 240ms ease;
    text-shadow: 0 2px 14px rgba(3,8,15,0.9);
    pointer-events: none;
}
#sb-combo.on { opacity: 1; }
#sb-combo b { color: var(--warm); font-weight: 500; }
/* A small transient notice (recovery penalty, checkpoint) above the alert. */
#sb-notice {
    position: absolute; left: 50%; bottom: 128px; transform: translateX(-50%);
    font: 400 11px/1 ui-monospace, monospace;
    letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(219,230,242,0.7);
    opacity: 0; transition: opacity 200ms ease;
    text-shadow: 0 2px 14px rgba(3,8,15,0.9);
    pointer-events: none;
}
#sb-notice.on { opacity: 1; }

.sb-hud-alert {
    position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%);
    text-align: center; max-width: 80vw;
    opacity: 0; transition: opacity 300ms ease;
}
.sb-hud-alert.on { opacity: 1; }
.sb-hud-alert .sb-alert-main {
    font: 400 13px/1.5 inherit; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--warm); text-shadow: 0 2px 18px rgba(3,8,15,0.9);
}
.sb-hud-alert .sb-alert-sub {
    margin-top: 6px; font: 400 10px/1.5 ui-monospace, monospace;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: rgba(219,230,242,0.55);
}

/* ----------------------------------------------------------------- pause */
/* A lighter veil than the full screens: those carry a 90% blackout scrim
   because they play over a bright idle snowfield, but a pause sits over the
   player's own run and the mountain should stay present behind it. */
#sb-ui .sb-screen.sb-lite {
    background: rgba(6, 10, 16, 0.55);
    backdrop-filter: blur(9px) saturate(0.82);
    -webkit-backdrop-filter: blur(9px) saturate(0.82);
}
.sb-pause-card { text-align: center; width: min(560px, 86vw); }
.sb-pause-detail {
    margin-top: 0.9em;
    font: 400 11px/1.6 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.2em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    color: rgba(219, 230, 242, 0.55);
}
.sb-item.sb-armed { color: #e2553a; }
.sb-item.sb-armed::before { background: #e2553a; opacity: 1; transform: none; }

/* -------------------------------------------------------------- settings */
.sb-settings-card { width: min(520px, 88vw); }
.sb-set-rows { margin-top: 2.4em; display: grid; gap: 15px; }
.sb-set-row {
    display: grid; grid-template-columns: 148px 1fr 56px;
    align-items: center; gap: 14px;
}
.sb-set-row .sb-k {
    font: 500 9px/1.3 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.2em; text-transform: uppercase;
    color: rgba(219,230,242,0.55); text-align: left;
}
.sb-set-row .sb-v {
    text-align: right;
    font: 400 11px/1 ui-monospace, monospace; letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums; color: rgba(232,242,251,0.85);
}
.sb-set-row input[type="range"] {
    appearance: none; -webkit-appearance: none;
    width: 100%; height: 18px; background: none; cursor: pointer;
}
.sb-set-row input[type="range"]::-webkit-slider-runnable-track {
    height: 2px; background: rgba(219,230,242,0.18);
}
.sb-set-row input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 11px; height: 11px; margin-top: -4.5px;
    background: var(--warm); border: 0; border-radius: 0;
}
.sb-set-row input[type="range"]:focus-visible { outline: 1px solid var(--warm); outline-offset: 4px; }
.sb-set-row input[type="range"]::-moz-range-track {
    height: 2px; background: rgba(219,230,242,0.18);
}
.sb-set-row input[type="range"]::-moz-range-thumb {
    width: 11px; height: 11px; background: var(--warm);
    border: 0; border-radius: 0;
}
.sb-seg { display: flex; gap: 2px; }
.sb-seg button {
    appearance: none; border: 0; cursor: pointer;
    flex: 1; padding: 7px 0;
    background: rgba(219,230,242,0.06);
    color: rgba(219,230,242,0.55);
    font: 500 9px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.14em; text-transform: uppercase;
    transition: background 160ms ease, color 160ms ease;
}
.sb-seg button:hover, .sb-seg button:focus-visible { color: #f4f9ff; outline: none; }
.sb-seg button.on { background: rgba(242,161,61,0.16); color: var(--warm); }

/* --------------------------------------------------------------- results */
.sb-results { width: min(700px, 90vw); }
.sb-grade {
    text-align: center; font-size: clamp(26px, 3.6vw, 46px); font-weight: 200;
    letter-spacing: 0.14em; text-indent: 0.14em; text-transform: uppercase;
}
.sb-stars {
    margin-top: 1.1em; text-align: center;
    font: 300 clamp(16px, 2vw, 22px)/1 ui-monospace, monospace;
    letter-spacing: 0.5em; text-indent: 0.5em; color: var(--warm);
}
.sb-rows { margin-top: 2.6em; display: grid; gap: 13px; }
.sb-row { display: grid; grid-template-columns: 132px 1fr 74px; align-items: center; gap: 16px; }
.sb-row .sb-k {
    font: 500 9px/1 ui-monospace, monospace; letter-spacing: 0.2em;
    text-transform: uppercase; color: rgba(219,230,242,0.48);
}
.sb-row .sb-bar { height: 2px; background: rgba(219,230,242,0.13); overflow: hidden; }
.sb-row .sb-bar i {
    display: block; height: 100%; width: 0%;
    background: linear-gradient(90deg, var(--warm-dim), var(--warm));
    transition: width 700ms cubic-bezier(0.16,1,0.3,1);
}
.sb-row .sb-v {
    text-align: right;
    font: 400 12px/1 ui-monospace, monospace; letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums; color: rgba(232,242,251,0.86);
}
.sb-row.sb-unmeasured .sb-v { color: rgba(219,230,242,0.3); }
.sb-note {
    margin-top: 1.8em; text-align: center;
    font: 400 9px/1.7 ui-monospace, monospace; letter-spacing: 0.1em;
    color: rgba(219,230,242,0.3);
}
`;

/**
 * A tick mark drawn rather than typed.
 *
 * Inline SVG because a checkmark glyph is a font dependency and the brief rules
 * emoji out; nine bytes of path is cheaper than either.
 */
const TICK = `<svg class="sb-tick" viewBox="0 0 14 14" fill="none" aria-hidden="true">
<path d="M2 7.4 5.3 10.6 12 3.6" stroke="#f2a13d" stroke-width="1.6"
      stroke-linecap="square"/></svg>`;

export class SnowBurgersUi {
    /**
     * @param {object} hooks
     * @param {(mode:string)=>void} hooks.onSelectMode
     * @param {()=>void} hooks.onDropIn
     * @param {()=>void} hooks.onRetry
     * @param {()=>void} hooks.onNextOrder
     * @param {()=>void} hooks.onMenu
     */
    constructor(hooks = {}) {
        this.hooks = hooks;
        this.root = document.createElement("div");
        this.root.id = "sb-ui";
        this.root.setAttribute("aria-live", "polite");

        const style = document.createElement("style");
        style.textContent = CSS;
        document.head.appendChild(style);
        this._style = style;

        this.root.innerHTML = this._markup();
        document.body.appendChild(this.root);

        this.el = {
            title: this.root.querySelector("#sb-title"),
            order: this.root.querySelector("#sb-order"),
            countdown: this.root.querySelector("#sb-countdown"),
            countNum: this.root.querySelector("#sb-count-num"),
            hud: this.root.querySelector("#sb-hud"),
            slots: this.root.querySelector("#sb-hud-slots"),
            clock: this.root.querySelector("#sb-hud-clock"),
            split: this.root.querySelector("#sb-hud-split"),
            alert: this.root.querySelector("#sb-hud-alert"),
            fuel: this.root.querySelector("#sb-hud-fuel"),
            fuelFill: this.root.querySelector("#sb-fuel-fill"),
            alertMain: this.root.querySelector("#sb-alert-main"),
            alertSub: this.root.querySelector("#sb-alert-sub"),
            chips: this.root.querySelector("#sb-order-chips"),
            results: this.root.querySelector("#sb-results"),
            resultBody: this.root.querySelector("#sb-result-body"),
            trick: this.root.querySelector("#sb-trick"),
            trickName: this.root.querySelector("#sb-trick-name"),
            trickScore: this.root.querySelector("#sb-trick-score"),
            grade: this.root.querySelector("#sb-grade"),
            combo: this.root.querySelector("#sb-combo"),
            notice: this.root.querySelector("#sb-notice"),
            pause: this.root.querySelector("#sb-pause"),
            pauseTitle: this.root.querySelector("#sb-pause-title"),
            pauseDetail: this.root.querySelector("#sb-pause-detail"),
            pauseResume: this.root.querySelector("#sb-pause-resume"),
            pauseRestart: this.root.querySelector("#sb-pause-restart"),
            settings: this.root.querySelector("#sb-settings"),
            setRows: this.root.querySelector("#sb-set-rows"),
        };

        /** Set by the pause system. Receives the data-pause action strings. */
        this.onPauseAction = null;

        this._bind();
        this._lastClock = -1;
        this._lastFuel = -1;
        /** @type {Record<string, HTMLElement>} */
        this._slotEls = {};
    }

    _markup() {
        return `
<div class="sb-screen" id="sb-title">
  <div class="sb-title-inner">
    <div class="sb-wordmark">SNOW<b>&#8209;</b>BURGERS</div>
    <div class="sb-rule"></div>
    <div class="sb-tagline">Shred. Stack. Serve.</div>
    <nav class="sb-menu" id="sb-title-menu"></nav>
  </div>
  <div class="sb-credit">Powered by KAKISNOW Snow Technology</div>
</div>

<div class="sb-screen" id="sb-order">
  <div class="sb-card">
    <div class="sb-kicker">Order up</div>
    <div class="sb-event" id="sb-event-name">The Summit Stack</div>
    <div class="sb-sublabel" id="sb-event-tag">Four on the mountain. Buns at the grill.</div>
    <div class="sb-chips" id="sb-order-chips"></div>
    <div class="sb-actions">
      <button class="sb-item" data-action="drop-in">Drop in</button>
      <button class="sb-item" data-action="menu">Back</button>
    </div>
  </div>
</div>

<div id="sb-countdown"><div class="sb-count-num" id="sb-count-num">3</div></div>

<div id="sb-hud">
  <div class="sb-hud-clock" id="sb-hud-clock">0:00.00
    <div class="sb-hud-split" id="sb-hud-split">The Summit Stack</div>
  </div>
  <div class="sb-hud-order" id="sb-hud-slots"></div>
  <div class="sb-hud-fuel" id="sb-hud-fuel">
    <div class="sb-fuel-label">Rocket fuel</div>
    <div class="sb-fuel-track"><i id="sb-fuel-fill"></i></div>
  </div>
  <div class="sb-hud-alert" id="sb-hud-alert">
    <div class="sb-alert-main" id="sb-alert-main"></div>
    <div class="sb-alert-sub" id="sb-alert-sub"></div>
  </div>
  <div id="sb-grade"></div>
  <div id="sb-trick">
    <div class="sb-trick-name" id="sb-trick-name"></div>
    <div class="sb-trick-score" id="sb-trick-score"></div>
  </div>
  <div id="sb-combo"></div>
  <div id="sb-notice"></div>
</div>

<div class="sb-screen" id="sb-results">
  <div class="sb-results" id="sb-result-body"></div>
</div>

<div class="sb-screen sb-lite" id="sb-pause">
  <div class="sb-pause-card">
    <div class="sb-kicker">Paused</div>
    <div class="sb-event" id="sb-pause-title">Snow-Burgers</div>
    <div class="sb-pause-detail" id="sb-pause-detail"></div>
    <nav class="sb-menu">
      <button class="sb-item" data-pause="resume" id="sb-pause-resume">Resume</button>
      <button class="sb-item" data-pause="restart" id="sb-pause-restart">Restart run</button>
      <button class="sb-item" data-pause="settings">Settings</button>
      <button class="sb-item" data-pause="quit">Quit to menu</button>
    </nav>
  </div>
</div>

<div class="sb-screen sb-lite" id="sb-settings">
  <div class="sb-settings-card">
    <div class="sb-kicker">Settings</div>
    <div class="sb-set-rows" id="sb-set-rows"></div>
    <div class="sb-actions">
      <button class="sb-item" data-pause="settings-back">Back</button>
    </div>
  </div>
</div>`;
    }

    _bind() {
        this.root.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            if (btn.dataset.pause) {
                this.onPauseAction?.(btn.dataset.pause);
                return;
            }
            if (btn.dataset.event) {
                this.hooks.onSelectEvent?.(btn.dataset.event);
                return;
            }
            if (btn.dataset.course) {
                this.hooks.onSelectCourse?.(btn.dataset.course);
                return;
            }
            if (btn.dataset.mode) this.hooks.onSelectMode?.(btn.dataset.mode);
            switch (btn.dataset.action) {
                case "drop-in": this.hooks.onDropIn?.(); break;
                case "retry": this.hooks.onRetry?.(); break;
                case "next": this.hooks.onNextOrder?.(); break;
                case "menu": this.hooks.onMenu?.(); break;
                default: break;
            }
        });
    }

    // ------------------------------------------------------------- screens

    _show(name) {
        for (const id of ["title", "order", "results"]) {
            this.el[id].classList.toggle("on", id === name);
        }
    }

    showTitle() { this._show("title"); this.setHud(false); }

    /**
     * Fill the title menu for the booted course: its events, the two labs,
     * and the other mountains. The real course-select screen is coming; until
     * then the title IS the course's menu, driven by the same registries.
     *
     * @param {object} course the active course definition
     * @param {{id:string, name:string, tagline:string}[]} events resolved defs
     * @param {{id:string, title:string}[]} otherCourses switchable courses
     */
    setTitleMenu(course, events, otherCourses) {
        const menu = this.root.querySelector("#sb-title-menu");
        const items = [];
        for (const ev of events) {
            items.push(`<button class="sb-item" data-event="${ev.id}">${ev.name}
                <span class="sb-sub">${ev.tagline}</span></button>`);
        }
        items.push(`<button class="sb-item" data-mode="rocket-test">Rocket Board Test
            <span class="sb-sub">Infinite fuel, nothing recorded</span></button>`);
        items.push(`<button class="sb-item" data-mode="free-ride">Free Ride Lab
            <span class="sb-sub">${course.title}, open and unscored</span></button>`);
        for (const other of otherCourses) {
            items.push(`<button class="sb-item" data-course="${other.id}">
                ${other.title}
                <span class="sb-sub">travel to ${other.subtitle ?? other.title}</span></button>`);
        }
        menu.innerHTML = items.join("");
    }

    /**
     * Drop every full-screen panel, leaving the run HUD alone.
     *
     * Each screen carries its own darkening scrim, which is what makes a title
     * or an order readable over a bright snowfield — and is also why leaving one
     * up during a run does not merely overlay some text, it puts the whole
     * mountain behind a 90% grey.
     */
    hideScreens() { this._show(null); }

    hideAll() { this._show(null); this.setHud(false); this.setCountdown(null); }

    /**
     * @param {{name:string, tagline:string, required:string[]}} event
     * @param {object[]} placements route, for the zone names on the card
     */
    showOrder(event, placements) {
        this.root.querySelector("#sb-event-name").textContent = event.name;
        this.root.querySelector("#sb-event-tag").textContent = event.tagline;
        const zoneOf = Object.fromEntries(
            placements.map((p) => [p.ingredient, p.zoneName ?? ""])
        );
        this.el.chips.innerHTML = event.required.map((id) => {
            const def = INGREDIENTS[id];
            return `<div class="sb-chip" data-id="${id}">${TICK}
                <img src="${ICONS}${id}.webp" alt="${def.label}" />
                <div class="sb-name">${def.label}</div>
                <div class="sb-zone">${zoneOf[id] ?? ""}</div>
            </div>`;
        }).join("");
        this._show("order");
        this.setHud(false);
    }

    /** Build the run HUD's slots for this order. */
    setOrderSlots(required) {
        this.el.slots.innerHTML = required.map((id) => {
            const def = INGREDIENTS[id];
            return `<div class="sb-slot" data-id="${id}">
                <img src="${ICONS}${id}.webp" alt="${def.label}" />
                <span>${def.label}</span></div>`;
        }).join("");
        this._slotEls = {};
        for (const el of this.el.slots.querySelectorAll(".sb-slot")) {
            this._slotEls[el.dataset.id] = el;
        }
    }

    markCollected(id) {
        this._slotEls[id]?.classList.add("done");
        this.el.chips.querySelector(`.sb-chip[data-id="${id}"]`)?.classList.add("done");
    }

    resetCollected() {
        for (const el of Object.values(this._slotEls)) el.classList.remove("done");
        for (const el of this.el.chips.querySelectorAll(".sb-chip")) {
            el.classList.remove("done");
        }
    }

    setHud(on) {
        this.el.hud.classList.toggle("on", !!on);
        if (!on) {
            this.setAlert(null);
            this.el.trick.classList.remove("on");
            this.el.grade.classList.remove("on");
            this.el.combo.classList.remove("on");
            this.el.notice.classList.remove("on");
        }
    }

    /** @param {number|null} seconds remaining, or null to hide */
    setCountdown(seconds) {
        if (seconds === null) {
            this.el.countdown.classList.remove("on");
            return;
        }
        this.el.countdown.classList.add("on");
        const n = Math.ceil(seconds);
        const go = n <= 0;
        this.el.countNum.textContent = go ? "DROP" : String(n);
        this.el.countNum.classList.toggle("go", go);
    }

    /**
     * @param {number} seconds
     */
    setClock(seconds) {
        // Only touch the DOM when the hundredth actually changes. At 240 Hz
        // this is most frames doing nothing, which is the point: a layout on
        // every frame for a digit that did not move is the cheapest thing in a
        // HUD to get wrong and one of the more expensive to pay for.
        const hundredths = (seconds * 100) | 0;
        if (hundredths === this._lastClock) return;
        this._lastClock = hundredths;
        this.el.clock.firstChild.textContent = formatTime(seconds);
    }

    /**
     * @param {number} level 0..1
     * @param {boolean} fitted whether a thrusting vehicle is on the rider
     *
     * Hidden entirely rather than shown empty when there is no engine. A gauge
     * reading zero on a board that has no tank is a bug report waiting to
     * happen.
     */
    setFuel(level, fitted) {
        this.el.fuel.classList.toggle("on", !!fitted);
        if (!fitted) return;
        const v = Math.max(0, Math.min(1, level));
        // Only touch the DOM when the bar actually moves a visible amount.
        const step = Math.round(v * 84);
        if (step === this._lastFuel) return;
        this._lastFuel = step;
        this.el.fuelFill.style.transform = `scaleX(${v.toFixed(3)})`;
        this.el.fuel.classList.toggle("low", v < 0.25);
    }

    setSubtitle(text) {
        this.el.split.textContent = text;
    }

    // -------------------------------------------------------------- tricks

    /**
     * Name a landed trick. Fades itself; a new trick replaces the old one.
     * @param {{name:string, score:number, grade:string}} result
     */
    showTrick(result) {
        this.el.trickName.textContent = result.name;
        this.el.trickScore.textContent =
            result.score > 0 ? `+${result.score}` : "lost";
        this.el.trick.classList.add("on");
        clearTimeout(this._trickTimer);
        this._trickTimer = setTimeout(
            () => this.el.trick.classList.remove("on"), 1700
        );
    }

    /** @param {string|null} grade one of the landing grades, or null to hide */
    flashGrade(grade) {
        const el = this.el.grade;
        if (!grade) {
            el.classList.remove("on");
            return;
        }
        el.textContent = grade;
        el.className = "on " + grade;
        el.id = "sb-grade";
        clearTimeout(this._gradeTimer);
        this._gradeTimer = setTimeout(() => el.classList.remove("on"), 1100);
    }

    /** @param {null|{score:number, count:number, multiplier:number}} open */
    setCombo(open) {
        if (!open || open.count < 1) {
            this.el.combo.classList.remove("on");
            this._lastCombo = "";
            return;
        }
        const text = `combo <b>×${open.multiplier.toFixed(2)}</b> · ${open.score}`;
        if (text !== this._lastCombo) {
            this._lastCombo = text;
            this.el.combo.innerHTML = text;
        }
        this.el.combo.classList.add("on");
    }

    /** A short transient notice — the recovery penalty, a checkpoint. */
    showNotice(text) {
        this.el.notice.textContent = text;
        this.el.notice.classList.add("on");
        clearTimeout(this._noticeTimer);
        this._noticeTimer = setTimeout(
            () => this.el.notice.classList.remove("on"), 1500
        );
    }

    /** @param {null|{main:string, sub?:string}} alert */
    setAlert(alert) {
        if (!alert) {
            this.el.alert.classList.remove("on");
            return;
        }
        this.el.alertMain.textContent = alert.main;
        this.el.alertSub.textContent = alert.sub ?? "";
        this.el.alert.classList.add("on");
    }

    // --------------------------------------------------------------- pause

    /**
     * The pause veil. An overlay, not a screen: it never joins `_show`'s
     * exclusive set, so whatever the run had on screen is exactly what is
     * there when the veil lifts.
     *
     * @param {{title:string, detail:string, canRestart:boolean}} context
     */
    showPause(context) {
        this.el.pauseTitle.textContent = context.title;
        this.el.pauseDetail.textContent = context.detail;
        this.el.pauseRestart.style.display = context.canRestart ? "" : "none";
        this.armRestart(false);
        this.el.settings.classList.remove("on");
        this.el.pause.classList.add("on");
        // Keyboard and gamepad players land on the safe default.
        this.el.pauseResume.focus({ preventScroll: true });
    }

    hidePause() {
        this.el.pause.classList.remove("on");
        this.el.settings.classList.remove("on");
    }

    /** Restart wants a second press; show that state on the button itself. */
    armRestart(on) {
        this.el.pauseRestart.classList.toggle("sb-armed", !!on);
        this.el.pauseRestart.textContent = on ? "Press again to restart" : "Restart run";
    }

    // ------------------------------------------------------------- settings

    /**
     * The player settings panel, reached from the pause menu.
     *
     * This is the one part of the interface allowed to touch the settings
     * store directly — it is a settings surface, the same way the F1 overlay
     * is. Rows are rebuilt on every open so they always show the live values,
     * including anything the overlay changed in the meantime.
     */
    showPauseSettings() {
        this._buildSettingsRows();
        this.el.pause.classList.remove("on");
        this.el.settings.classList.add("on");
    }

    _buildSettingsRows() {
        const rows = PLAYER_SETTINGS.map((def, i) => {
            if (def.type === "range") {
                return `<div class="sb-set-row">
                    <div class="sb-k">${def.label}</div>
                    <input type="range" data-si="${i}" min="${def.min}" max="${def.max}"
                        step="${def.step}" value="${S[def.k]}" aria-label="${def.label}" />
                    <div class="sb-v" id="sb-sv-${i}">${def.fmt(S[def.k])}</div>
                </div>`;
            }
            const opts = def.type === "toggle" ? ["on", "off"] : def.opts;
            const current = def.type === "toggle" ? (S[def.k] ? "on" : "off") : String(S[def.k]);
            return `<div class="sb-set-row">
                <div class="sb-k">${def.label}</div>
                <div class="sb-seg" role="group" aria-label="${def.label}">${opts.map((o) =>
                    `<button data-si="${i}" data-opt="${o}"
                        class="${o === current ? "on" : ""}">${o}</button>`).join("")}
                </div>
                <div class="sb-v"></div>
            </div>`;
        }).join("");
        this.el.setRows.innerHTML = rows;

        if (!this._settingsBound) {
            this._settingsBound = true;
            this.el.setRows.addEventListener("input", (e) => {
                const el = e.target;
                if (!(el instanceof HTMLInputElement) || el.type !== "range") return;
                const def = PLAYER_SETTINGS[+el.dataset.si];
                const v = parseFloat(el.value);
                setSetting(def.k, v);
                const label = this.root.querySelector(`#sb-sv-${el.dataset.si}`);
                if (label) label.textContent = def.fmt(v);
            });
            this.el.setRows.addEventListener("click", (e) => {
                const btn = e.target.closest("button[data-opt]");
                if (!btn) return;
                const def = PLAYER_SETTINGS[+btn.dataset.si];
                const opt = btn.dataset.opt;
                if (def.type === "toggle") setSetting(def.k, opt === "on");
                else if (def.apply) def.apply(opt);
                else setSetting(def.k, opt);
                for (const b of btn.parentElement.children) {
                    b.classList.toggle("on", b === btn);
                }
            });
        }
    }

    // ------------------------------------------------------------- results

    /**
     * @param {object} result from `BurgerRun._score`
     * @param {object} best the event's stored bests, for comparison
     */
    showResults(result, best) {
        const stars = "★".repeat(result.stars) + "☆".repeat(5 - result.stars);
        const medal = result.medal
            ? result.medal[0].toUpperCase() + result.medal.slice(1)
            : "No medal";

        const rows = [
            row("Time", pct(result.completed ? medalFraction(result) : 0),
                formatTime(result.time)),
            row("Medal", result.medal ? pct(medalFraction(result)) : "0%", medal),
            row("Style", pct(result.style / 100), String(result.style)),
            // The bar saturates at a committed trick run; the number is open.
            row("Tricks", pct((result.trickScore ?? 0) / 1400),
                String(result.trickScore ?? 0)),
            row("Stack integrity", pct(result.integrity / 100), String(result.integrity)),
            row("Rocket efficiency",
                pct((result.rocket ?? 0) / 100),
                result.notMeasured.includes("rocket efficiency")
                    ? "not fitted"
                    : String(result.rocket),
                result.notMeasured.includes("rocket efficiency")),
        ].join("");

        const trickLine = result.bestTrick
            ? ` · best ${result.bestTrick.name} +${result.bestTrick.score}`
            : "";
        const crashLine = result.crashes
            ? ` · ${result.crashes} crash${result.crashes === 1 ? "" : "es"}`
            : "";

        const bestLine = best?.bestTime != null
            ? `Best ${formatTime(best.bestTime)} · ${best.completions} burger${best.completions === 1 ? "" : "s"} served`
            : "First completion";

        const brokeLine = result.records?.time ? " · new best time" : "";

        this.el.resultBody.innerHTML = `
<div class="sb-kicker" style="text-align:center">${
    result.completed ? "Burger served" : "Order incomplete"
}</div>
<div class="sb-grade">${result.grade}</div>
<div class="sb-stars">${stars}</div>
<div class="sb-rows">${rows}</div>
<div class="sb-note">${bestLine}${brokeLine}${trickLine}${crashLine}<br/>
Seed ${result.seed}${result.notMeasured.length
    ? " · not measured this run: " + result.notMeasured.join(", ")
    : ""}</div>
<div class="sb-actions">
  <button class="sb-item" data-action="retry">Retry</button>
  <button class="sb-item" data-action="next">Next order</button>
  <button class="sb-item" data-action="menu">Menu</button>
</div>`;
        this._show("results");
        this.setHud(false);
        // Let the bars animate from zero rather than appear filled.
        requestAnimationFrame(() => {
            for (const i of this.el.resultBody.querySelectorAll(".sb-bar i")) {
                i.style.width = i.dataset.w;
            }
        });
    }

    dispose() {
        this.root.remove();
        this._style.remove();
    }
}

/**
 * What the player may change without opening the F1 overlay.
 *
 * Every key persists via `playerSettings.js`. The quality preset routes
 * through `applyPreset` so its member keys fire their own listeners.
 */
const PLAYER_SETTINGS = [
    {
        k: "preset", label: "Quality", type: "seg",
        opts: ["balanced", "high", "ultra"], apply: (v) => applyPreset(v),
    },
    { k: "audio", label: "Audio", type: "toggle" },
    {
        k: "masterVolume", label: "Volume", type: "range",
        min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%",
    },
    {
        k: "sfxVolume", label: "Effects", type: "range",
        min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%",
    },
    {
        k: "ambienceVolume", label: "Ambience", type: "range",
        min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%",
    },
    {
        k: "musicVolume", label: "Music", type: "range",
        min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%",
    },
    {
        k: "mouseSensitivity", label: "Mouse sensitivity", type: "range",
        min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + "×",
    },
    { k: "invertY", label: "Invert look Y", type: "toggle" },
    {
        k: "shakeScale", label: "Camera shake", type: "range",
        min: 0, max: 1.5, step: 0.05, fmt: (v) => Math.round(v * 100) + "%",
    },
    { k: "reducedMotion", label: "Reduced motion", type: "toggle" },
    { k: "touchControls", label: "Touch controls", type: "seg", opts: ["auto", "on", "off"] },
];

function row(key, width, value, unmeasured = false) {
    return `<div class="sb-row${unmeasured ? " sb-unmeasured" : ""}">
        <div class="sb-k">${key}</div>
        <div class="sb-bar"><i data-w="${width}"></i></div>
        <div class="sb-v">${value}</div></div>`;
}

function pct(v) {
    return Math.round(Math.max(0, Math.min(1, v)) * 100) + "%";
}

/** How close to gold the run was, for the time bar. */
function medalFraction(result) {
    if (!result.completed) return 0;
    // Gold fills it; anything slower than bronze still shows something, because
    // a bar reading zero on a finished run reads as a failure rather than as a
    // slow time. The ladder rides on the result itself, so this bar always
    // describes the event that was actually run.
    const gold = result.medals?.gold ?? 34;
    const bronze = result.medals?.bronze ?? 58;
    if (result.time <= gold) return 1;
    if (result.time >= bronze) return 0.12;
    return 0.12 + 0.88 * (1 - (result.time - gold) / (bronze - gold));
}

export function formatTime(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? "0" : ""}${rest.toFixed(2)}`;
}

export { RunState };
