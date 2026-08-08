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
import { getEvent } from "../game/courses/eventRegistry.js";
import { COURSES } from "../game/courses/index.js";
import { S, set as setSetting, applyPreset, onChange } from "../core/settings.js";
import {
    getInputFamily, onInputFamilyChange, activateInputFamily,
    pointerInputFamily,
} from "../core/inputFamily.js";
import {
    BINDING_LABELS, getBindings, setBinding,
} from "../core/playerBindings.js";
import { ridePrompts } from "./inputPrompts.js";
import { feedbackText } from "./accessibilityFeedback.js";
import { completionStats, burgerBookPages } from "../game/progression.js";
import { recipeTapeContent, recipeTapeTitle } from "../game/recipeTapeContent.js";
import packageInfo from "../../package.json" with { type: "json" };

const ICONS = (import.meta.env?.BASE_URL ?? "/") + "assets/ui/snow-burgers/";
export const PRODUCT_VERSION = packageInfo.version;

const CSS = `
#sb-ui, #sb-ui * { box-sizing: border-box; }
#sb-ui {
    position: fixed; inset: 0; z-index: 60;
    pointer-events: none;
    color: var(--snow, #e9f4fb);
    font-family: "Segoe UI", system-ui, sans-serif;
    /* Snow-Burgers is a trail docket in a night mountain: ink, snow, ice,
       then one warm diner signal. Keep these tokens in one place so every
       screen reads as the same instrument panel. */
    --night: #07111b;
    --snow: #e9f4fb;
    --ice: #80bdd9;
    --grill: #ff9d3f;
    --ketchup: #ef6252;
    --warm: var(--grill);
    --warm-dim: rgba(255, 157, 63, 0.55);
    --line: rgba(233, 244, 251, 0.17);
    --muted: rgba(233, 244, 251, 0.62);
    --sb-hud-scale: 1;
}
#sb-ui.reduced-motion *, #sb-ui.reduced-motion *::before, #sb-ui.reduced-motion *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
}
#sb-ui.high-contrast { --line: rgba(255,255,255,.38); --muted: rgba(255,255,255,.88); }
#sb-ui .sb-screen {
    position: absolute; inset: 0;
    display: none; place-items: center;
    padding: max(16px, env(safe-area-inset-top))
        max(20px, env(safe-area-inset-right))
        max(16px, env(safe-area-inset-bottom))
        max(20px, env(safe-area-inset-left));
    overflow: auto;
    background: radial-gradient(120% 90% at 50% 44%,
        rgba(9, 20, 31, 0.79) 0%, rgba(5, 12, 20, 0.93) 62%, rgba(3, 8, 14, 0.97) 100%);
    pointer-events: auto;
    opacity: 0;
    transition: opacity 420ms cubic-bezier(0.4, 0, 0.2, 1);
}
#sb-ui .sb-screen.on { display: grid; opacity: 1; }

/* ------------------------------------------------------------------ title */
.sb-title-screen { align-items: center; }
.sb-title-inner {
    /* Bounded scale: grow the docket on an ultrawide without turning the
       title into a full-width dashboard, while still fitting a 720p window. */
    width: min(clamp(1120px, 72vw, 1480px), calc(100vw - 40px));
    max-height: calc(100svh - 32px);
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(128, 189, 217, 0.42) transparent;
}
.sb-title-header {
    display: flex; align-items: end; justify-content: space-between; gap: 28px;
    padding-bottom: clamp(14px, 2.5vh, 26px);
    border-bottom: 1px solid var(--line);
}
.sb-title-brand { min-width: 0; }
.sb-wordmark {
    font-family: "Bahnschrift Condensed", "Arial Narrow", "Segoe UI", sans-serif;
    font-size: clamp(36px, 5.1vw, 92px);
    font-stretch: condensed; font-weight: 300;
    letter-spacing: clamp(0.12em, 0.28vw, 0.26em); text-indent: 0.08em;
    line-height: 1.02;
}
.sb-wordmark b { font-weight: 500; color: var(--warm); }
.sb-rule {
    width: min(420px, 100%); height: 1px; margin: 1em 0 0.85em;
    background: linear-gradient(90deg, transparent, rgba(219,230,242,0.28) 20%,
        var(--warm-dim) 50%, rgba(219,230,242,0.28) 80%, transparent);
}
.sb-tagline {
    font-size: clamp(10px, 0.8vw, 13px); font-weight: 600;
    letter-spacing: clamp(0.16em, 0.3vw, 0.4em); text-indent: 0.3em; text-transform: uppercase;
    color: var(--muted);
}
.sb-title-motto {
    max-width: 330px; text-align: right;
    font: 500 clamp(10px, calc(8px + 0.18vw), 14px)/1.55 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.11em; text-transform: uppercase; color: rgba(233,244,251,0.5);
}
.sb-title-motto b { display: block; color: var(--ice); font-weight: 500; }
.sb-title-grid {
    display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(270px, 0.75fr);
    gap: clamp(24px, 3vw, 56px); align-items: start;
    padding-top: clamp(16px, 3vh, 30px);
}
.sb-tour-pane, .sb-aux-pane { min-width: 0; }
.sb-pane-head {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    font: 600 clamp(10px, calc(8px + 0.14vw), 13px)/1 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--ice);
}
.sb-pane-head span:last-child { color: rgba(233,244,251,0.42); }
.sb-course-identity { margin: 12px 0 16px; }
.sb-course-identity strong {
    display: block; font-family: "Bahnschrift Condensed", "Arial Narrow", sans-serif;
    font-size: clamp(24px, 2.8vw, 52px); font-weight: 400; letter-spacing: 0.04em;
    text-transform: uppercase;
}
.sb-course-identity span {
    display: block; margin-top: 4px; max-width: 610px;
    color: rgba(233,244,251,0.56); font-size: clamp(11px, calc(8px + 0.22vw), 15px); line-height: 1.4;
}
.sb-title-strip {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px;
    margin-top: clamp(12px, 2vh, 20px); padding: 10px 12px;
    border-top: 1px solid rgba(128,189,217,0.34);
    border-bottom: 1px solid rgba(128,189,217,0.18);
    background: rgba(7,17,27,0.48);
    font: 500 clamp(10px, calc(8px + 0.14vw), 13px)/1.25 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.1em; text-transform: uppercase; color: rgba(233,244,251,0.55);
}
.sb-title-strip strong { color: var(--snow); font-weight: 500; }
.sb-title-strip .sb-strip-hot { color: var(--warm); }
.sb-next-run {
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
    margin: 0 0 8px; padding: 9px 12px;
    border-left: 3px solid var(--warm); background: rgba(255,157,63,0.1);
}
.sb-next-run .sb-next-label {
    font: 600 clamp(9px, calc(7px + 0.14vw), 12px)/1 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.16em; color: var(--warm); text-transform: uppercase;
}
.sb-next-run strong { font-size: clamp(12px, 1vw, 15px); font-weight: 600; }
.sb-next-run span:last-child { color: rgba(233,244,251,0.54); font-size: clamp(11px, calc(9px + 0.12vw), 14px); }
.sb-menu { margin-top: 12px; display: grid; gap: 5px; }
.sb-item {
    appearance: none; width: 100%; border: 0; border-left: 2px solid transparent;
    background: rgba(233,244,251,0.035); cursor: pointer; text-align: left;
    color: rgba(233,244,251,0.78); padding: 9px 12px; position: relative;
    font: 500 clamp(12px, 0.9vw, 15px)/1.2 "Segoe UI", system-ui, sans-serif;
    transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
}
.sb-item:hover, .sb-item:focus-visible { color: var(--snow); background: rgba(128,189,217,0.13); border-left-color: var(--ice); outline: none; }
.sb-item.sb-primary { border-left-color: var(--warm); background: rgba(255,157,63,0.14); color: var(--snow); }
.sb-item.sb-primary:hover, .sb-item.sb-primary:focus-visible { border-left-color: var(--warm); background: rgba(255,157,63,0.24); }
.sb-item.sb-event-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; }
.sb-event-row-copy { min-width: 0; }
.sb-event-row-copy strong { display: block; font-size: clamp(12px, 1vw, 16px); font-weight: 600; }
.sb-event-row-copy .sb-sub { margin-top: 3px; }
.sb-event-meta { display: flex; flex-wrap: wrap; justify-content: end; gap: 5px 12px; max-width: 260px; text-align: right; }
.sb-event-meta span, .sb-course-row .sb-course-meta {
    font: 500 clamp(9px, calc(7px + 0.13vw), 12px)/1.25 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.08em; text-transform: uppercase; color: rgba(233,244,251,0.48);
}
.sb-event-meta span:first-child { color: var(--ice); }
.sb-sub { display: block; color: rgba(233,244,251,0.46); font: 400 clamp(10px, calc(8px + 0.15vw), 14px)/1.35 "Segoe UI", system-ui, sans-serif; }
.sb-section-label { margin-top: 18px; margin-bottom: 7px; padding-bottom: 6px; border-bottom: 1px solid rgba(233,244,251,0.12); color: rgba(233,244,251,0.46); font: 600 clamp(9px, calc(7px + 0.12vw), 12px)/1 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.16em; text-transform: uppercase; }
.sb-course-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; }
.sb-course-row strong { display: block; font-size: clamp(12px, calc(10px + 0.12vw), 15px); font-weight: 600; }
.sb-course-row .sb-course-meta { text-align: right; color: rgba(233,244,251,0.42); }
.sb-aux-pane .sb-item { padding-block: 8px; }
.sb-aux-pane .sb-item.sb-locked { border-left-color: rgba(233,244,251,0.12); }
.sb-aux-pane .sb-item.sb-locked:hover, .sb-aux-pane .sb-item.sb-locked:focus-visible { background: rgba(233,244,251,0.035); }
.sb-item.sb-locked {
    color: rgba(233, 244, 251, 0.30);
    cursor: default;
}
.sb-item.sb-locked:hover, .sb-item.sb-locked:focus-visible {
    color: rgba(233, 244, 251, 0.30); outline: none;
}
.sb-item.sb-locked .sb-sub { color: rgba(255, 157, 63, 0.55); }
.sb-item.sb-compact { background: transparent; border: 1px solid rgba(233,244,251,0.12); }
.sb-item.sb-compact:hover, .sb-item.sb-compact:focus-visible { border-color: var(--ice); }
.sb-credit {
    position: fixed; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%);
    font: 400 9px/1 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(233, 244, 251, 0.26); white-space: nowrap;
}

/* ------------------------------------------------------------- order card */
.sb-card {
    width: min(760px, calc(100vw - 40px));
    max-height: calc(100svh - 32px); overflow: auto; text-align: left;
    padding: clamp(18px, 3vw, 34px);
    border-top: 2px solid var(--warm);
    background: rgba(7,17,27,0.54);
}
.sb-kicker {
    font: 600 9px/1 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.34em; text-transform: uppercase; color: var(--warm);
}
.sb-event {
    margin-top: 0.55em;
    font-family: "Bahnschrift Condensed", "Arial Narrow", "Segoe UI", sans-serif;
    font-size: clamp(27px, 3.2vw, 48px); font-weight: 400;
    letter-spacing: 0.04em; text-transform: uppercase;
}
.sb-sublabel {
    margin-top: 0.55em; font-size: clamp(11px, 1vw, 14px); font-weight: 400;
    letter-spacing: 0.02em; color: rgba(233,244,251,0.6);
}
.sb-order-facts {
    display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px;
    margin-top: 22px; padding: 11px 0; border-top: 1px solid var(--line);
    border-bottom: 1px solid rgba(233,244,251,0.11);
}
.sb-order-fact { min-width: 0; }
.sb-order-fact + .sb-order-fact { border-left: 1px solid rgba(233,244,251,0.12); padding-left: 12px; }
.sb-order-fact span { display: block; font: 600 8px/1 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(233,244,251,0.42); }
.sb-order-fact strong { display: block; margin-top: 6px; font-size: clamp(11px, 1vw, 14px); font-weight: 600; color: var(--snow); }
.sb-order-fact:first-child strong { color: var(--ice); }
.sb-order-fact:last-child strong { color: var(--warm); }
.sb-order-instruction { margin-top: 14px; font: 500 9px/1.5 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(233,244,251,0.42); }
.sb-order-instruction b { color: var(--snow); font-weight: 500; }
.sb-chips {
    margin: 1.4em 0 0; display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 10px; max-width: none;
}
.sb-chip {
    padding: 10px 6px 9px; position: relative; text-align: center;
    border-top: 1px solid rgba(219,230,242,0.14);
}
.sb-chip img {
    display: block; width: clamp(46px, 5vw, 62px); height: clamp(46px, 5vw, 62px); margin: 0 auto 8px;
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
.sb-actions { margin-top: 1.7em; display: flex; gap: 10px; justify-content: flex-start; flex-wrap: wrap; }
.sb-actions .sb-item { width: auto; min-width: 126px; text-align: center; }

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
    transform: scale(var(--sb-hud-scale)); transform-origin: top left;
    width: calc(100% / var(--sb-hud-scale)); height: calc(100% / var(--sb-hud-scale));
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
.sb-hud-flight {
    position: absolute; top: 92px; right: max(26px, env(safe-area-inset-right));
    min-width: 168px; opacity: 0; transition: opacity 220ms ease;
    text-align: right; text-shadow: 0 2px 14px rgba(3,8,15,0.9);
}
.sb-hud-flight.on { opacity: 1; }
.sb-hud-flight-label {
    font: 500 8px/1 ui-monospace, monospace; letter-spacing: 0.24em;
    text-transform: uppercase; color: rgba(219,230,242,0.5);
}
.sb-hud-flight-value {
    margin-top: 6px; font: 500 11px/1.35 ui-monospace, monospace;
    letter-spacing: 0.08em; color: var(--warm); font-variant-numeric: tabular-nums;
}

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
/* The tutorial's one line: present until its action happens, never again. */
#sb-tutor {
    position: absolute; left: 50%; bottom: 158px; transform: translateX(-50%);
    font: 400 12px/1.6 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.26em; text-transform: uppercase;
    color: var(--warm);
    opacity: 0; transition: opacity 260ms ease;
    text-shadow: 0 2px 16px rgba(3,8,15,0.9);
    pointer-events: none;
}
#sb-tutor.on { opacity: 1; }

/* The avalanche: a distance that wants watching. */
#sb-avalanche {
    position: absolute; top: max(24px, env(safe-area-inset-top));
    left: max(30px, env(safe-area-inset-left));
    font: 500 11px/1.5 ui-monospace, "Cascadia Mono", monospace;
    letter-spacing: 0.22em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    color: rgba(219,230,242,0.6);
    opacity: 0; transition: opacity 240ms ease;
    text-shadow: 0 2px 14px rgba(3,8,15,0.9);
    pointer-events: none;
}
#sb-avalanche.on { opacity: 1; }
#sb-avalanche.close { color: #e2553a; }
#sb-avalanche::before { content: "[AVALANCHE] "; color: var(--warm); }
.sb-slot.done { outline: 1px solid var(--warm); outline-offset: 3px; }
.sb-slot.done::before { content: "[OK]"; display: block; color: var(--warm); font: 600 8px/1 ui-monospace,monospace; }
.sb-slot.beacon { outline: 1px dashed var(--ice); outline-offset: 4px; }
.sb-caption {
    position: absolute; left: 50%; bottom: 42px; transform: translateX(-50%);
    max-width: min(90vw, 680px); padding: 7px 12px; text-align: center;
    color: var(--snow); background: rgba(3,8,15,.72); border: 1px solid var(--line);
    font: 600 10px/1.35 ui-monospace,monospace; letter-spacing: .12em;
    text-transform: uppercase; opacity: 0; transition: opacity 160ms ease;
}
.sb-caption.on { opacity: 1; }
#sb-finish-beacon { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); opacity:0; color:var(--warm); border:1px solid var(--warm); padding:6px 10px; font:600 10px/1 ui-monospace,monospace; letter-spacing:.16em; text-transform:uppercase; text-shadow:0 2px 14px #03080f; pointer-events:none; }
#sb-finish-beacon.on { opacity:1; }

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
    align-items: center; gap: 14px; border-left: 2px solid transparent;
    padding: 2px 0 2px 8px; transition: border-color 160ms ease, background 160ms ease;
}
.sb-set-row:focus-within, .sb-set-row.sb-menu-focus { border-left-color: var(--ice); background: rgba(128,189,217,0.08); }
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
.sb-binding-row { display:grid; grid-template-columns: 148px 1fr; gap:14px; align-items:center; }
.sb-binding-key { appearance:none; border:1px solid rgba(233,244,251,.18); background:rgba(233,244,251,.04); color:var(--snow); padding:7px 9px; text-align:left; cursor:pointer; font:500 10px/1.2 ui-monospace,monospace; }
.sb-binding-key.capturing { border-color:var(--warm); color:var(--warm); }
.sb-binding-error { grid-column:1 / -1; color:#ff9b78; font:500 9px/1.3 ui-monospace,monospace; }
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
.sb-results {
    width: min(clamp(760px, 36vw, 1120px), calc(100vw - 40px)); max-height: calc(100svh - 32px);
    overflow: auto; padding: clamp(18px, 3vw, 34px); border-top: 2px solid var(--ice);
    background: rgba(7,17,27,0.54);
}
.sb-result-event {
    margin-top: 0.45em; text-align: center;
    font-family: "Bahnschrift Condensed", "Arial Narrow", "Segoe UI", sans-serif;
    font-size: clamp(26px, 3.1vw, 54px); font-weight: 400;
    letter-spacing: 0.045em; line-height: 1.08; text-transform: uppercase;
    color: var(--snow);
}
.sb-result-quality {
    margin-top: 1.6em; text-align: center;
    font: 600 clamp(8px, calc(7px + 0.1vw), 12px)/1 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.2em; text-transform: uppercase; color: var(--ice);
}
.sb-grade {
    margin-top: 0.42em; text-align: center;
    font-family: "Bahnschrift Condensed", "Arial Narrow", sans-serif;
    font-size: clamp(20px, 2.2vw, 34px); font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: rgba(233,244,251,0.72);
}
.sb-stars {
    margin-top: 0.55em; text-align: center;
    font: 300 clamp(16px, 2vw, 22px)/1 ui-monospace, monospace;
    letter-spacing: 0.5em; text-indent: 0.5em; color: var(--warm);
}
.sb-result-medal { margin-top: 0.5em; text-align: center; font: 600 clamp(12px, 1.1vw, 16px)/1.3 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.16em; text-transform: uppercase; color: var(--warm); }
.sb-flight-pb {
    display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: baseline;
    gap: 10px 16px; margin-top: 18px; padding: 10px 14px;
    border-left: 3px solid var(--warm); background: rgba(255,157,63,0.1);
}
.sb-flight-pb.is-new { background: rgba(255,157,63,0.16); }
.sb-flight-pb-kicker {
    font: 600 clamp(9px, calc(7px + 0.1vw), 12px)/1 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--warm);
}
.sb-flight-pb strong {
    font: 500 clamp(16px, 1.6vw, 24px)/1 "Cascadia Mono", ui-monospace, monospace;
    font-variant-numeric: tabular-nums; color: var(--snow); white-space: nowrap;
}
.sb-flight-pb span {
    min-width: 0; color: rgba(233,244,251,0.62);
    font: 500 clamp(9px, calc(7px + 0.11vw), 13px)/1.3 "Cascadia Mono", ui-monospace, monospace;
    letter-spacing: 0.08em; text-transform: uppercase;
}
.sb-result-time { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; margin-top: 22px; padding: 13px 0; border-top: 1px solid var(--line); border-bottom: 1px solid rgba(233,244,251,0.11); }
.sb-result-time span { font: 600 9px/1 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(233,244,251,0.48); }
.sb-result-time strong { font: 500 clamp(24px, 3vw, 38px)/1 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.04em; color: var(--snow); font-variant-numeric: tabular-nums; }
.sb-metric-label { margin: 22px 0 9px; font: 600 9px/1 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ice); }
.sb-rows { display: grid; gap: 13px; }
.sb-row { display: grid; grid-template-columns: 132px minmax(0, 1fr) minmax(220px, 0.8fr); align-items: center; gap: 16px; }
.sb-row .sb-k {
    font: 500 9px/1 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.14em;
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
    font: 400 12px/1.35 ui-monospace, monospace; letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums; color: rgba(232,242,251,0.86); white-space: normal;
}
.sb-row.sb-unmeasured .sb-v { color: rgba(219,230,242,0.3); }
.sb-note {
    margin-top: 1.7em; padding-top: 12px; border-top: 1px solid rgba(233,244,251,0.11); text-align: left;
    font: 400 9px/1.7 "Cascadia Mono", ui-monospace, monospace; letter-spacing: 0.08em;
    color: rgba(219,230,242,0.3);
}

/* ----------------------------------------------------------- Burger Book */
.sb-book-wrap, .sb-credits-wrap, .sb-finale-wrap, .sb-howto-wrap, .sb-confirm-wrap {
    width: min(1180px, calc(100vw - 40px)); max-height: calc(100svh - 32px);
    overflow: auto; padding: clamp(18px, 3vw, 40px);
    border-top: 2px solid var(--warm); background: rgba(7,17,27,0.62);
}
.sb-book-header { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
.sb-book-header h1, .sb-credits-wrap h1, .sb-finale-wrap h1, .sb-howto-wrap h1 {
    margin: 0.4em 0 0; font: 400 clamp(28px, 4vw, 58px)/1.05 "Bahnschrift Condensed", "Arial Narrow", sans-serif;
    letter-spacing: 0.05em; text-transform: uppercase;
}
.sb-book-kicker { color: var(--warm); font: 600 9px/1 ui-monospace, monospace; letter-spacing: .25em; text-transform: uppercase; }
.sb-book-overview { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1px; margin: 24px 0 22px; border-block: 1px solid var(--line); background: var(--line); }
.sb-book-stat { padding: 14px; background: rgba(7,17,27,.72); }
.sb-book-stat strong { display: block; font: 500 clamp(20px, 2vw, 32px)/1 ui-monospace, monospace; color: var(--snow); }
.sb-book-stat span { display: block; margin-top: 7px; color: var(--muted); font: 600 9px/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
.sb-book-progress { margin: 8px 0 20px; color: var(--muted); font: 500 11px/1.5 ui-monospace, monospace; letter-spacing: .05em; }
.sb-book-progress b { color: var(--warm); font-weight: 600; }
.sb-book-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
.sb-book-tab { appearance: none; border: 0; border-bottom: 2px solid transparent; padding: 9px 12px; background: transparent; color: var(--muted); cursor: pointer; font: 600 10px/1 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
.sb-book-tab:hover, .sb-book-tab:focus-visible, .sb-book-tab.on { color: var(--snow); border-bottom-color: var(--warm); outline: none; }
.sb-book-course-line { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.sb-book-course-line h2 { margin: 0; font: 400 clamp(21px, 2.4vw, 38px)/1.1 "Bahnschrift Condensed", "Arial Narrow", sans-serif; letter-spacing: .04em; text-transform: uppercase; }
.sb-book-course-line p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.sb-book-course-status { color: var(--warm); font: 600 10px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; text-align: right; }
.sb-book-events { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px; margin-top: 18px; }
.sb-book-event { appearance: none; border: 0; border-left: 2px solid rgba(233,244,251,.12); padding: 12px; background: rgba(233,244,251,.04); color: var(--snow); text-align: left; cursor: pointer; }
.sb-book-event:hover, .sb-book-event:focus-visible { border-left-color: var(--warm); background: rgba(255,157,63,.10); outline: none; }
.sb-book-event strong { display: block; font-size: 14px; font-weight: 600; }
.sb-book-event span { display: block; margin-top: 5px; color: var(--muted); font: 500 10px/1.3 ui-monospace, monospace; letter-spacing: .05em; }
.sb-book-tapes { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin-top: 22px; }
.sb-tape { min-height: 104px; padding: 13px; border-left: 3px solid var(--warm); background: rgba(255,157,63,.08); }
.sb-tape.unfound { border-left-color: rgba(233,244,251,.2); background: rgba(233,244,251,.03); color: rgba(233,244,251,.38); }
.sb-tape b { display: block; color: inherit; font: 600 10px/1.2 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; }
.sb-tape p { margin: 9px 0 0; color: inherit; font-size: 12px; line-height: 1.45; }
.sb-book-footer { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 24px; }
.sb-book-footer .sb-item { width: auto; min-width: 126px; }
.sb-credits-wrap, .sb-finale-wrap, .sb-howto-wrap, .sb-confirm-wrap { width: min(760px, calc(100vw - 40px)); }
.sb-confirm-wrap { width: min(560px, calc(100vw - 40px)); text-align: center; border-top-color: var(--ketchup); }
.sb-confirm-detail { margin-top: 18px; color: var(--muted); font: 400 12px/1.6 ui-monospace, monospace; }
.sb-credits-list { display: grid; gap: 13px; margin-top: 24px; color: var(--muted); font: 400 12px/1.55 ui-monospace, monospace; }
.sb-credits-list strong { display: block; margin-bottom: 3px; color: var(--ice); font-size: 10px; letter-spacing: .15em; text-transform: uppercase; }
.sb-finale-wrap { text-align: center; border-top-color: var(--warm); }
.sb-finale-badge { margin: 22px auto 0; width: 110px; height: 110px; display: grid; place-items: center; border: 1px solid var(--warm); color: var(--warm); font: 600 12px/1.4 ui-monospace, monospace; letter-spacing: .15em; text-transform: uppercase; transform: rotate(45deg); }
.sb-finale-badge span { transform: rotate(-45deg); }
.sb-finale-copy { margin: 19px auto 0; max-width: 520px; color: var(--muted); font: 400 12px/1.6 ui-monospace, monospace; }
.sb-howto-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 1px; margin-top: 22px; background: var(--line); }
.sb-howto-row { padding: 12px; background: rgba(7,17,27,.75); }
.sb-howto-row strong { display: block; color: var(--snow); font-size: 13px; }
.sb-howto-row span { display: block; margin-top: 4px; color: var(--muted); font: 500 10px/1.4 ui-monospace, monospace; }

@media (max-width: 900px) {
    .sb-title-grid { grid-template-columns: 1fr; gap: 12px; }
    .sb-aux-pane { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    .sb-aux-pane > .sb-section-label { grid-column: 1 / -1; margin-top: 4px; }
    .sb-aux-pane > .sb-menu { margin-top: 0; }
}
@media (min-width: 1800px) {
    .sb-title-inner { width: min(1480px, calc(100vw - 96px)); }
    .sb-title-header { gap: 56px; }
    .sb-title-grid { grid-template-columns: minmax(0, 1.5fr) minmax(330px, 0.8fr); }
    .sb-menu { gap: 7px; }
    .sb-item { padding-block: 11px; }
    .sb-aux-pane .sb-item { padding-block: 10px; }
    .sb-results {
        width: min(1120px, calc(100vw - 96px));
        padding: clamp(34px, 2.4vw, 48px);
    }
    .sb-result-event { font-size: clamp(34px, 3.1vw, 64px); }
    .sb-result-quality { font-size: clamp(10px, calc(8px + 0.12vw), 14px); }
    .sb-grade { font-size: clamp(24px, 2.2vw, 40px); }
    .sb-result-medal { font-size: clamp(14px, 1.1vw, 20px); }
    .sb-result-time strong { font-size: clamp(30px, 3vw, 52px); }
    .sb-flight-pb { padding: 14px 18px; gap: 12px 20px; }
    .sb-flight-pb-kicker { font-size: clamp(10px, calc(8px + 0.12vw), 14px); }
    .sb-flight-pb strong { font-size: clamp(20px, 1.6vw, 28px); }
    .sb-flight-pb span { font-size: clamp(11px, calc(8px + 0.11vw), 15px); }
    .sb-row {
        grid-template-columns: 170px minmax(0, 1fr) minmax(360px, 0.8fr);
        gap: 22px;
    }
    .sb-row .sb-k { font-size: clamp(10px, calc(8px + 0.1vw), 14px); }
    .sb-row .sb-v { font-size: clamp(13px, 0.55vw, 17px); white-space: nowrap; line-height: 1.2; }
}
@media (max-width: 620px) {
    #sb-ui .sb-screen { padding-inline: 14px; }
    .sb-title-inner { width: calc(100vw - 28px); max-height: calc(100svh - 20px); }
    .sb-title-header { align-items: start; display: block; }
    .sb-title-motto { display: none; }
    .sb-wordmark { font-size: clamp(30px, 10vw, 52px); }
    .sb-event-row { grid-template-columns: 1fr; gap: 8px; }
    .sb-event-meta { justify-content: start; max-width: none; text-align: left; }
    .sb-aux-pane { display: block; }
    .sb-order-facts { grid-template-columns: 1fr; gap: 9px; }
    .sb-order-fact + .sb-order-fact { border-left: 0; border-top: 1px solid rgba(233,244,251,0.12); padding: 9px 0 0; }
    .sb-row { grid-template-columns: 104px 1fr 65px; gap: 9px; }
    .sb-row .sb-v { white-space: normal; }
    .sb-flight-pb { grid-template-columns: 1fr auto; }
    .sb-flight-pb span { grid-column: 1 / -1; }
    .sb-book-overview, .sb-book-events, .sb-book-tapes, .sb-howto-grid { grid-template-columns: 1fr; }
    .sb-book-header, .sb-book-course-line { display: block; }
    .sb-book-course-status { margin-top: 10px; text-align: left; }
}
@media (max-height: 760px) and (min-width: 621px) {
    .sb-title-header { padding-bottom: 12px; }
    .sb-title-grid { padding-top: 14px; }
    .sb-course-identity { margin-block: 8px 11px; }
    .sb-pane-head { font-size: 9px; }
    .sb-section-label { margin-top: 10px; }
    .sb-item { padding-block: 7px; }
    .sb-next-run { padding-block: 7px; }
}
@media (prefers-reduced-motion: reduce) {
    #sb-ui *, #sb-ui *::before, #sb-ui *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
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
            titleMottoCopy: this.root.querySelector("#sb-title-motto-copy"),
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
            flight: this.root.querySelector("#sb-hud-flight"),
            flightValue: this.root.querySelector("#sb-hud-flight-value"),
            caption: this.root.querySelector("#sb-caption"),
            finishBeacon: this.root.querySelector("#sb-finish-beacon"),
            alertMain: this.root.querySelector("#sb-alert-main"),
            alertSub: this.root.querySelector("#sb-alert-sub"),
            chips: this.root.querySelector("#sb-order-chips"),
            titleStrip: this.root.querySelector("#sb-title-strip"),
            courseChip: this.root.querySelector("#sb-course-chip"),
            courseTitle: this.root.querySelector("#sb-course-title"),
            courseSubtitle: this.root.querySelector("#sb-course-subtitle"),
            nextRun: this.root.querySelector("#sb-next-run"),
            titleLabs: this.root.querySelector("#sb-title-labs"),
            titleMountains: this.root.querySelector("#sb-title-mountains"),
            titleSettings: this.root.querySelector("#sb-title-settings"),
            eventRule: this.root.querySelector("#sb-event-rule"),
            eventVehicle: this.root.querySelector("#sb-event-vehicle"),
            eventMedal: this.root.querySelector("#sb-event-medal"),
            orderCount: this.root.querySelector("#sb-order-count"),
            orderPrompt: this.root.querySelector("#sb-order-prompt"),
            results: this.root.querySelector("#sb-results"),
            resultBody: this.root.querySelector("#sb-result-body"),
            book: this.root.querySelector("#sb-book"),
            bookBody: this.root.querySelector("#sb-book-body"),
            credits: this.root.querySelector("#sb-credits"),
            finale: this.root.querySelector("#sb-finale"),
            finaleBody: this.root.querySelector("#sb-finale-body"),
            howto: this.root.querySelector("#sb-howto"),
            confirm: this.root.querySelector("#sb-confirm"),
            confirmBody: this.root.querySelector("#sb-confirm-body"),
            avalanche: this.root.querySelector("#sb-avalanche"),
            trick: this.root.querySelector("#sb-trick"),
            trickName: this.root.querySelector("#sb-trick-name"),
            trickScore: this.root.querySelector("#sb-trick-score"),
            grade: this.root.querySelector("#sb-grade"),
            combo: this.root.querySelector("#sb-combo"),
            notice: this.root.querySelector("#sb-notice"),
            tutor: this.root.querySelector("#sb-tutor"),
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
        this._syncAccessibility();
        onChange(["hudScale", "highContrast", "reducedMotion"], () => this._syncAccessibility());
        this._inputFamilyOff = onInputFamilyChange(() => {
            this._syncAccessibility();
            this._refreshInputPrompts();
        });
        this.root.addEventListener("pointerdown", (e) => {
            // A menu tap is meaningful input even without a touch-stick poll;
            // this keeps the order/how-to glyphs honest on button-only touch.
            activateInputFamily(pointerInputFamily(e.pointerType));
        });
        this._lastClock = -1;
        this._lastFuel = -1;
        /** @type {Record<string, HTMLElement>} */
        this._slotEls = {};
    }

    _syncAccessibility() {
        this.root.style.setProperty("--sb-hud-scale", String(Math.max(0.8, Math.min(1.6, Number(S.hudScale) || 1))));
        this.root.classList.toggle("high-contrast", !!S.highContrast);
        this.root.classList.toggle("reduced-motion", !!S.reducedMotion);
        this.root.dataset.inputFamily = getInputFamily();
        for (const [id, el] of Object.entries(this._slotEls ?? {})) {
            if (!el.classList.contains("done")) el.classList.toggle("beacon", !!S.ingredientBeacon || !!S.highContrast);
        }
    }

    _refreshInputPrompts() {
        if (this.el.howto.classList.contains("on")) this._setHowToPromptText();
        if (this.el.order.classList.contains("on") && this._orderEvent) {
            this._setOrderPromptText(this._orderEvent);
        }
    }

    _setHowToPromptText() {
        const prompts = ridePrompts(getInputFamily());
        const copy = {
            steer: `Steer with ${prompts.steer}. Ease into an edge to hold a clean line.`,
            jump: `Jump with ${prompts.jump}. Buffer before a lip and release to settle.`,
            spin: `Spin with ${prompts.spin}. Anticipate the landing.`,
            trick: `Hold ${prompts.trick} while airborne. Steer to tweak the grab line.`,
            recover: `Recover with ${prompts.recover} to return to the last safe spot.`,
            rocket: `Boost with ${prompts.rocket}. Fuel refills at ingredients; save it for climbs.`,
        };
        for (const [key, text] of Object.entries(copy)) {
            const span = this.el.howto.querySelector(`[data-howto="${key}"] span`);
            if (span) span.textContent = text;
        }
    }

    _setOrderPromptText(event) {
        const prompts = ridePrompts(getInputFamily());
        const count = event.required.length;
        this.el.orderPrompt.innerHTML = `Collect <b id="sb-order-count">${count} ingredient${count === 1 ? "" : "s"}</b> on the mountain · steer ${prompts.steer} · jump ${prompts.jump}. Serve at the grill.`;
        this.el.orderCount = this.el.orderPrompt.querySelector("#sb-order-count");
    }

    _markup() {
        return `
<div class="sb-screen sb-title-screen" id="sb-title">
  <div class="sb-title-inner">
    <header class="sb-title-header">
      <div class="sb-title-brand">
        <div class="sb-wordmark">SNOW<b>&#8209;</b>BURGERS</div>
        <div class="sb-rule"></div>
        <div class="sb-tagline">Shred. Stack. Serve.</div>
      </div>
      <div class="sb-title-motto"><b>KAKISNOW SNOW TECHNOLOGY</b><span id="sb-title-motto-copy">Six mountains. Twelve orders. Find your line.</span></div>
    </header>
    <div class="sb-title-strip" id="sb-title-strip"></div>
    <div class="sb-title-grid">
      <section class="sb-tour-pane" aria-labelledby="sb-tour-label">
        <div class="sb-pane-head"><span id="sb-tour-label">Burger Tour</span><span id="sb-course-chip"></span></div>
        <div class="sb-course-identity"><strong id="sb-course-title"></strong><span id="sb-course-subtitle"></span></div>
        <div id="sb-next-run" class="sb-next-run"></div>
        <div class="sb-section-label">Events on this mountain</div>
        <nav class="sb-menu" id="sb-title-menu" aria-label="Events"></nav>
      </section>
      <aside class="sb-aux-pane">
        <div class="sb-section-label">Labs & practice</div>
        <nav class="sb-menu" id="sb-title-labs" aria-label="Labs"></nav>
        <div class="sb-section-label">Burger Tour map</div>
        <nav class="sb-menu" id="sb-title-mountains" aria-label="Mountains"></nav>
        <div class="sb-section-label">Player desk</div>
        <nav class="sb-menu" id="sb-title-settings" aria-label="Player settings"></nav>
      </aside>
    </div>
  </div>
  <div class="sb-credit">Snow-Burgers v${PRODUCT_VERSION} · Powered by KAKISNOW Snow Technology</div>
</div>

<div class="sb-screen" id="sb-order">
  <div class="sb-card">
    <div class="sb-kicker">Order up</div>
    <div class="sb-event" id="sb-event-name">The Summit Stack</div>
    <div class="sb-sublabel" id="sb-event-tag">Four on the mountain. Buns at the grill.</div>
    <div class="sb-order-facts">
      <div class="sb-order-fact"><span>Rule</span><strong id="sb-event-rule">Delivery</strong></div>
      <div class="sb-order-fact"><span>Vehicle</span><strong id="sb-event-vehicle">Classic board</strong></div>
      <div class="sb-order-fact"><span>Medal target</span><strong id="sb-event-medal">Gold · 0:34</strong></div>
    </div>
    <div class="sb-order-instruction" id="sb-order-prompt">Collect <b id="sb-order-count">four ingredients</b> on the mountain. Serve at the grill.</div>
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
  <div class="sb-hud-fuel" id="sb-hud-fuel" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-label="Rocket fuel 100 percent">
    <div class="sb-fuel-label">Rocket fuel</div>
    <div class="sb-fuel-track"><i id="sb-fuel-fill"></i></div>
  </div>
  <div class="sb-hud-flight" id="sb-hud-flight">
    <div class="sb-hud-flight-label">Big Air flight</div>
    <div class="sb-hud-flight-value" id="sb-hud-flight-value">AIR · 0.00 S</div>
  </div>
  <div class="sb-hud-alert" id="sb-hud-alert">
    <div class="sb-alert-main" id="sb-alert-main"></div>
    <div class="sb-alert-sub" id="sb-alert-sub"></div>
  </div>
  <div id="sb-avalanche"></div>
  <div id="sb-finish-beacon" aria-label="Burger grill ahead">[GRILL] FINISH</div>
  <div class="sb-caption" id="sb-caption" role="status" aria-live="assertive"></div>
  <div id="sb-grade"></div>
  <div id="sb-trick">
    <div class="sb-trick-name" id="sb-trick-name"></div>
    <div class="sb-trick-score" id="sb-trick-score"></div>
  </div>
  <div id="sb-combo"></div>
  <div id="sb-notice"></div>
  <div id="sb-tutor"></div>
</div>

<div class="sb-screen" id="sb-results">
  <div class="sb-results" id="sb-result-body"></div>
</div>

<div class="sb-screen" id="sb-book">
  <div class="sb-book-wrap" id="sb-book-body"></div>
</div>

<div class="sb-screen" id="sb-credits">
  <div class="sb-credits-wrap">
    <div class="sb-book-kicker">Snow-Burgers · release notes</div>
    <h1>Credits</h1>
    <div class="sb-credits-list">
      <div><strong>Project</strong>Snow-Burgers v${PRODUCT_VERSION} · SHRED. STACK. SERVE.</div>
      <div><strong>Technology</strong>KAKISNOW Snow Technology · custom WebGPU snow, terrain, deformation, lighting, atmosphere, and post stack.</div>
      <div><strong>External work</strong>Runtime asset sources, licenses, attribution, and modifications are listed in <code>THIRD_PARTY_NOTICES.txt</code>.</div>
      <div><strong>Open source</strong>Browser dependencies and their license notices are enumerated in the shipped release documentation.</div>
      <div><strong>AI disclosure</strong>Some promotional 2D art is AI-assisted. Source prompts, edits, hashes, and the release decision are recorded in the asset ledger.</div>
      <div><strong>Privacy</strong>No accounts, ads, analytics, or telemetry. Settings, records, ghosts, and progress stay in this browser unless you choose Export Save.</div>
      <div><strong>Special thanks</strong>To every rider who took the long line for one more tape.</div>
    </div>
    <div class="sb-actions"><button class="sb-item sb-primary" data-action="title">Back to title</button><button class="sb-item" data-action="book">Burger Book</button></div>
  </div>
</div>

<div class="sb-screen" id="sb-finale">
  <div class="sb-finale-wrap" id="sb-finale-body"></div>
</div>

<div class="sb-screen" id="sb-howto">
  <div class="sb-howto-wrap">
    <div class="sb-book-kicker">Rider reference</div>
    <h1>How to Ride</h1>
    <div class="sb-howto-grid">
      <div class="sb-howto-row" data-howto="steer"><strong>Steer / carve</strong><span>Left stick or A/D. Ease into an edge to hold a clean line.</span></div>
      <div class="sb-howto-row" data-howto="jump"><strong>Jump</strong><span>Space / gamepad south (A). Buffer before a lip and release to settle.</span></div>
      <div class="sb-howto-row" data-howto="spin"><strong>Spin / flip</strong><span>Q/E or gamepad bumpers spin. Hold the trick modifier and steer to flip.</span></div>
      <div class="sb-howto-row" data-howto="trick"><strong>Grab / tweak</strong><span>F / gamepad west (X) while airborne. Left/right tweaks the grab line.</span></div>
      <div class="sb-howto-row"><strong>Grind</strong><span>Approach a rail with the board level; Space / south pops off.</span></div>
      <div class="sb-howto-row" data-howto="recover"><strong>Recover</strong><span>R / gamepad east (B) returns to the last safe spot and costs a little time.</span></div>
      <div class="sb-howto-row" data-howto="rocket"><strong>Rocket chair</strong><span>Left Shift / right trigger. Fuel refills at ingredients; save it for climbs.</span></div>
      <div class="sb-howto-row"><strong>Spells / event icons</strong><span>1–5 trigger mountain flourishes. The order card names every event target.</span></div>
    </div>
    <div class="sb-actions"><button class="sb-item sb-primary" data-action="book">Back to Burger Book</button><button class="sb-item" data-action="title">Title</button></div>
  </div>
</div>

<div class="sb-screen" id="sb-confirm">
  <div class="sb-confirm-wrap" id="sb-confirm-body"></div>
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

    /** The screen whose buttons the keyboard and pad drive, or null. */
    _visibleMenuRoot() {
        for (const id of ["settings", "pause", "title", "order", "results", "book", "credits", "finale", "howto", "confirm"]) {
            if (this.el[id]?.classList.contains("on")) return this.el[id];
        }
        return null;
    }

    /** @returns {(HTMLButtonElement|HTMLInputElement)[]} actionable items, top to bottom */
    menuButtons() {
        const root = this._visibleMenuRoot();
        if (!root) return [];
        return [...root.querySelectorAll("button, input[type=range]")]
            .filter((item) => !item.classList.contains("sb-locked") &&
                item.offsetParent !== null);
    }

    /** Activate the family-appropriate back/cancel action for a controller. */
    menuBack() {
        const root = this._visibleMenuRoot();
        if (!root) return false;
        const target = menuBackTarget(root.id);
        if (!target) return false;
        const button = root.querySelector(`[${target.attr}="${target.value}"]`);
        if (!button) return false;
        button.click();
        return true;
    }

    /** Move focus through the visible menu. @param {1|-1} dir */
    menuMove(dir) {
        const items = this.menuButtons();
        if (!items.length) return false;
        const i = items.indexOf(document.activeElement);
        const next = nextMenuIndex(items.length, i, dir);
        this._focusMenuItem(items[next]);
        return true;
    }

    _focusMenuItem(item) {
        for (const row of this.root.querySelectorAll(".sb-set-row.sb-menu-focus")) {
            row.classList.remove("sb-menu-focus");
        }
        // Let the browser establish normal focus first. On a compact settings
        // viewport this may already reveal the control; only ask the nearest
        // scrolling screen/card to move when the focused item remains outside
        // its visible bounds, so ordinary title navigation does not jump.
        item.focus();
        const viewport = scrollViewportFor(item);
        if (viewport && rectNeedsNearestScroll(
            item.getBoundingClientRect(), viewport.getBoundingClientRect(), 10,
        )) {
            item.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        item.closest(".sb-set-row")?.classList.add("sb-menu-focus");
    }

    /** Press the focused item, or the first one if nothing is focused yet. */
    menuActivate() {
        const items = this.menuButtons();
        if (!items.length) return false;
        const target = items.includes(document.activeElement)
            ? document.activeElement
            : items[0];
        // A range is a focused value control, not a button. Confirm should be
        // harmless; left/right are the deliberate adjustment gesture.
        if (target instanceof HTMLInputElement && target.type === "range") return true;
        target.click();
        return true;
    }

    /** Adjust the focused settings range by one step. */
    menuAdjust(direction) {
        const target = document.activeElement;
        if (!(target instanceof HTMLInputElement) || target.type !== "range" ||
            !this.menuButtons().includes(target)) return false;
        const next = adjustRangeValue(
            target.value, target.min, target.max, target.step, direction,
        );
        if (next === Number(target.value)) return true;
        target.value = String(next);
        this._focusMenuItem(target);
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    anyScreenVisible() {
        return this._visibleMenuRoot() !== null;
    }

    _bind() {
        // Arrows walk the visible menu, Enter presses. Captured here rather
        // than in the input layer because arrows are ALSO steering keys, and
        // a menu that is up owns them — preventDefault keeps the rider
        // behind the title card from twitching in time with the cursor.
        window.addEventListener("keydown", (e) => {
            if (this._bindingCapture) {
                e.preventDefault();
                const action = this._bindingCapture;
                const target = this.root.querySelector(`[data-binding-action="${action}"]`);
                if (e.code === "Escape") {
                    this._bindingCapture = null;
                    this._buildSettingsRows();
                    target?.focus();
                    return;
                }
                const result = setBinding(action, e.code);
                if (!result.ok) {
                    if (target) {
                        target.textContent = result.error;
                        target.classList.add("capturing");
                        setTimeout(() => this._buildSettingsRows(), 1200);
                    }
                    this._bindingCapture = null;
                    return;
                }
                this._bindingCapture = null;
                this._buildSettingsRows();
                this.root.querySelector(`[data-binding-action="${action}"]`)?.focus();
                return;
            }
            if (!this.anyScreenVisible()) return;
            if (e.code === "ArrowUp") {
                e.preventDefault();
                this.menuMove(-1);
            } else if (e.code === "ArrowDown") {
                e.preventDefault();
                this.menuMove(1);
            } else if (e.code === "ArrowLeft") {
                if (this.menuAdjust(-1)) e.preventDefault();
            } else if (e.code === "ArrowRight") {
                if (this.menuAdjust(1)) e.preventDefault();
            } else if (e.code === "Enter") {
                e.preventDefault();
                this.menuActivate();
            }
        });

        this.root.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            if (btn.dataset.pause) {
                this.onPauseAction?.(btn.dataset.pause);
                return;
            }
            if (btn.classList.contains("sb-locked")) return;
            if (btn.dataset.continue) {
                this.hooks.onContinue?.();
                return;
            }
            if (btn.dataset.titleSettings) {
                this.showTitleSettings();
                return;
            }
            if (btn.dataset.bookEvent) {
                this.hooks.onBookEvent?.(btn.dataset.bookEvent, btn.dataset.bookCourse);
                return;
            }
            if (btn.dataset.bookCourse && /^\d+$/.test(btn.dataset.bookCourse)) {
                this._renderBook(+btn.dataset.bookCourse);
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
                case "book": this.hooks.onBook?.(); break;
                case "credits": this.hooks.onCredits?.(); break;
                case "howto": this.showHowToRide(); break;
                case "title": this.hooks.onMenu?.(); break;
                case "finale-credits": this.hooks.onCredits?.(); break;
                case "finale-book": this.hooks.onBook?.(); break;
                case "finale-skip": this.hooks.onMenu?.(); break;
                case "save-export": this.hooks.onSaveAction?.("export"); break;
                case "save-import": this._startSaveImport(); break;
                case "clear-ghosts": this.hooks.onSaveAction?.("clear-ghosts"); break;
                case "reset-progress": this.hooks.onSaveAction?.("reset"); break;
                case "reset-bindings": this.hooks.onSaveAction?.("reset-bindings"); break;
                case "reset-settings": this.hooks.onSaveAction?.("reset-settings"); break;
                case "confirm-yes": this.hooks.onSaveAction?.("confirm", this._confirmAction); break;
                case "confirm-no":
                    if (this._confirmFrom === "pause") this.showPauseSettings();
                    else if (this._confirmFrom === "title") this.showTitleSettings();
                    else this.showBurgerBook(this._bookInput, this._bookCourseId);
                    break;
                default: break;
            }
        });
    }

    // ------------------------------------------------------------- screens

    _show(name) {
        for (const id of ["title", "order", "results", "book", "credits", "finale", "howto", "confirm"]) {
            this.el[id].classList.toggle("on", id === name);
        }
        if (name !== "pause") this.el.pause.classList.remove("on");
        if (name !== "settings") this.el.settings.classList.remove("on");
        this.hooks.onScreenVisibilityChange?.();
    }

    showTitle() { this._show("title"); this.setHud(false); }

    /**
     * Fill the title menu: Continue where the player left off, the booted
     * course's events, the two labs, the other mountains with their tour
     * locks, and Settings. The title IS the course's menu, driven by the
     * same registries the game runs on.
     *
     * @param {object} opts
     * @param {object} opts.course the active course definition
     * @param {null|{name:string, courseTitle:string}} opts.continueEntry
     * @param {{id:string, name:string, tagline:string}[]} opts.events
     * @param {{id:string, title:string, subtitle:string, locked:boolean,
     *          reason:string}[]} opts.otherCourses
     * @param {object} [opts.completion] registry-derived tour completion
     */
    setTitleMenu({ course, continueEntry, events, otherCourses, completion = null }) {
        const safeCourse = course ?? {};
        const safeEvents = Array.isArray(events) ? events : [];
        const safeOther = Array.isArray(otherCourses) ? otherCourses : [];
        const openCourses = 1 + safeOther.filter((entry) => !entry.locked).length;
        const courseTotal = 1 + safeOther.length;
        const registryCourses = Object.values(COURSES);
        const mountainCount = registryCourses.length || courseTotal;
        const orderCount = registryCourses.reduce(
            (total, entry) => total + (Array.isArray(entry.events) ? entry.events.length : 0),
            0,
        ) || safeEvents.length;
        if (this.el.titleMottoCopy) {
            this.el.titleMottoCopy.textContent =
                `${mountainCount} mountains. ${orderCount} orders. Find your line.`;
        }

        this.el.courseChip.textContent = `${safeEvents.length} event${safeEvents.length === 1 ? "" : "s"}`;
        this.el.courseTitle.textContent = safeCourse.title ?? "Current mountain";
        this.el.courseSubtitle.textContent = safeCourse.subtitle ?? "Choose a line and serve the next order.";
        const completionBadge = completion?.hundredPercent
            ? `<span class="sb-strip-hot">100% SERVED</span>`
            : completion?.tourComplete ? `<span class="sb-strip-hot">BURGER CROWN EARNED</span>` : "";
        this.el.titleStrip.innerHTML = `
            <span class="sb-strip-hot">Burger Tour</span>
            <strong>${escapeHtml(safeCourse.title ?? "Current mountain")}</strong>
            <span>${safeEvents.length} event${safeEvents.length === 1 ? "" : "s"} here</span>
            <span>${openCourses}/${courseTotal} mountains open</span>${completionBadge}`;

        const nextName = continueEntry?.name ?? safeEvents[0]?.name ?? "Choose an event";
        const nextCourse = continueEntry?.courseTitle ?? safeCourse.title ?? "Current mountain";
        this.el.nextRun.innerHTML = `
            <span class="sb-next-label">${continueEntry ? "Next up" : "Start here"}</span>
            <strong>${escapeHtml(nextName)}</strong>
            <span>${escapeHtml(nextCourse)}</span>`;

        this.el.titleLabs.innerHTML = [
            `<button class="sb-item sb-compact" data-mode="rocket-test">Rocket Board Test<span class="sb-sub">Infinite fuel · nothing recorded</span></button>`,
            `<button class="sb-item sb-compact" data-mode="free-ride">Free Ride Lab<span class="sb-sub">${escapeHtml(safeCourse.title ?? "Current mountain")} · open and unscored</span></button>`,
        ].join("");

        this.el.titleSettings.innerHTML = [
            `<button class="sb-item sb-compact" data-action="book">Burger Book<span class="sb-sub">${registryCourses.length} mountains · ${orderCount} orders · tapes</span></button>`,
            `<button class="sb-item sb-compact" data-action="howto">How to Ride<span class="sb-sub">Movement · tricks · rocket · recovery</span></button>`,
            `<button class="sb-item sb-compact" data-title-settings="1">Settings<span class="sb-sub">Volume · controls · accessibility</span></button>`,
            `<button class="sb-item sb-compact" data-action="credits">Credits<span class="sb-sub">Technology · assets · licenses</span></button>`,
        ].join("");

        this.el.titleMountains.innerHTML = safeOther.map((other) => {
            const title = escapeHtml(other.title ?? other.id ?? "Mountain");
            if (other.locked) {
                // Present but inert: a tour with invisible mountains reads as
                // a shorter game, and the reason is the invitation.
                return `<button class="sb-item sb-course-row sb-locked" tabindex="-1" aria-disabled="true">
                    <span><strong>${title}</strong><span class="sb-sub">${escapeHtml(other.reason ?? "Complete the next order")}</span></span>
                    <span class="sb-course-meta">Locked</span></button>`;
            }
            return `<button class="sb-item sb-course-row" data-course="${escapeAttr(other.id)}">
                <span><strong>${title}</strong><span class="sb-sub">${escapeHtml(other.subtitle ?? "Travel to this mountain")}</span></span>
                <span class="sb-course-meta">Travel</span></button>`;
        }).join("");

        this.el.titleMenu = this.root.querySelector("#sb-title-menu");
        const continueItem = continueEntry
            ? `<button class="sb-item sb-event-row sb-primary" data-continue="1">
                <span class="sb-event-row-copy"><strong>Continue</strong><span class="sb-sub">${escapeHtml(continueEntry.name)} · ${escapeHtml(continueEntry.courseTitle)}</span></span>
                <span class="sb-event-meta"><span>Next run</span><span>Tour</span></span>
            </button>`
            : "";
        this.el.titleMenu.innerHTML = continueItem + safeEvents.map((ev, index) => {
            const isPrimary = (!continueEntry && index === 0) ? " sb-primary" : "";
            return `<button class="sb-item sb-event-row${isPrimary}" data-event="${escapeAttr(ev.id)}">
                <span class="sb-event-row-copy"><strong>${escapeHtml(ev.name ?? ev.id)}</strong><span class="sb-sub">${escapeHtml(ev.tagline ?? "Deliver the order")}</span></span>
                <span class="sb-event-meta"><span>${escapeHtml(describeEventRule(ev))}</span><span>${escapeHtml(describeVehicle(ev))}</span><span>${escapeHtml(describeMedalTarget(ev))}</span></span>
            </button>`;
        }).join("");
    }

    /**
     * Open the registry-backed Burger Book. A page is a course, not a second
     * event picker: every record row and tape count comes from the same source
     * data the run uses, while the current course remains one clear focus.
     */
    showBurgerBook(book, initialCourseId = null) {
        this._bookInput = book ?? {};
        this._bookPages = burgerBookPages(this._bookInput);
        const initial = this._bookPages.findIndex((p) => p.id === initialCourseId);
        this._bookPage = initial >= 0 ? initial : Math.max(0, this._bookPage ?? 0);
        this._renderBook(this._bookPage);
        this._show("book");
        this.menuButtons()[0]?.focus({ preventScroll: true });
    }

    _renderBook(index = 0) {
        if (!this.el.bookBody) return;
        const pages = this._bookPages ?? [];
        if (!pages.length) return;
        this._bookPage = Math.max(0, Math.min(pages.length - 1, index));
        const stats = completionStats(this._bookInput ?? {});
        const page = pages[this._bookPage];
        const courseEvents = page.events.map((event) => {
            const name = eventDisplayName(event.id);
            const best = event.bestTime == null ? "No time yet" : `Best ${formatTime(event.bestTime)}`;
            const medal = event.medal ? `${event.medal} medal` : "No medal";
            const vehicle = event.bestVehicle ? flightVehicleLabel(event.bestVehicle) : "Not ridden";
            const definition = eventDefinition(event.id) ?? {};
            const status = event.completions ? `${event.completions} served · ${medal}` : "Not served yet";
            const trick = event.trick ? `Best trick ${event.trick.score}` : "No trick record";
            const metric = [best, vehicle, `Style ${event.style}`, `Integrity ${event.integrity}`, `Rocket ${event.rocket}`, trick, event.ghost ? "Ghost" : "No ghost", `Start ${describeVehicle(definition)}`].join(" · ");
            const locked = !page.unlocked;
            return `<button class="sb-book-event${locked ? " sb-locked" : ""}" ${locked ? "aria-disabled=\"true\" tabindex=\"-1\"" : `data-book-event=\"${escapeAttr(event.id)}\" data-book-course=\"${escapeAttr(page.id)}\"`}>
                <strong>${escapeHtml(name)}</strong><span>${locked ? "Locked · " : ""}${escapeHtml(status)} · ${escapeHtml(describeEventRule(definition))} · ${escapeHtml(describeMedalTarget(definition))}</span><span>${escapeHtml(metric)}</span>
            </button>`;
        }).join("");
        const tapes = page.tapes.map((tape) => tape.found
            ? `<article class="sb-tape"><b>${escapeHtml(recipeTapeTitle(page.id, tape.id))}</b><p>${escapeHtml(recipeTapeContent(page.id, tape.id))}</p></article>`
            : `<article class="sb-tape unfound"><b>${escapeHtml(recipeTapeTitle(page.id, tape.id))}</b><p>Undiscovered line note · find this tape on the mountain.</p></article>`
        ).join("");
        const eventCompletion = page.events.filter((e) => e.completions > 0).length;
        const courseMedals = page.events.filter((e) => e.medal).length;
        this.el.bookBody.innerHTML = `
            <div class="sb-book-header"><div><div class="sb-book-kicker">Player desk · ${stats.hundredPercent ? "100% complete" : stats.tourComplete ? "Tour complete" : "In progress"}</div><h1>Burger Book</h1></div><div class="sb-book-course-status">${stats.completedEvents}/${stats.eventTotal} orders served</div></div>
            <div class="sb-book-overview">
                <div class="sb-book-stat"><strong>${stats.unlockedCourses}/${stats.courseTotal}</strong><span>Mountains open</span></div>
                <div class="sb-book-stat"><strong>${stats.burgersServed}</strong><span>Burgers served</span></div>
                <div class="sb-book-stat"><strong>${stats.totalStars}</strong><span>Total stars</span></div>
                <div class="sb-book-stat"><strong>${stats.completionPercent}%</strong><span>Completion</span></div>
                <div class="sb-book-stat"><strong>${stats.completedEvents}/${stats.eventTotal}</strong><span>Events served</span></div>
                <div class="sb-book-stat"><strong>${stats.medalEvents}/${stats.eventTotal}</strong><span>Medals earned</span></div>
                <div class="sb-book-stat"><strong>${stats.foundTapes}/${stats.tapeTotal}</strong><span>Recipe tapes</span></div>
                <div class="sb-book-stat"><strong>${stats.runs}</strong><span>Runs logged</span></div>
            </div>
            <div class="sb-book-progress"><b>${stats.tourComplete ? "TOUR COMPLETE" : `TOUR ${stats.mainCompleted}/${stats.mainTotal}`}</b> · ${stats.hundredPercent ? "Every event medalled. The book is full." : `${stats.eventTotal - stats.completedEvents} events, ${stats.eventTotal - stats.medalEvents} medals, and ${stats.tapeTotal - stats.foundTapes} tapes remain for 100%.`}</div>
            <div class="sb-book-tabs" role="tablist" aria-label="Course pages">${pages.map((p, i) => `<button class="sb-book-tab${i === this._bookPage ? " on" : ""}" data-book-course="${i}" role="tab" aria-selected="${i === this._bookPage}">${escapeHtml(p.title)}</button>`).join("")}</div>
            <div class="sb-book-course-line"><div><h2>${escapeHtml(page.title)}</h2><p>${escapeHtml(page.subtitle ?? "A line worth learning.")}</p></div><div class="sb-book-course-status">${page.unlocked ? "Open" : "Locked"} · ${eventCompletion}/${page.events.length} served · ${courseMedals}/${page.events.length} medals · ${page.tapes.filter((t) => t.found).length}/${page.tapes.length} tapes</div></div>
            <div class="sb-section-label">Events & records</div><div class="sb-book-events">${courseEvents}</div>
            <div class="sb-section-label">Recipe Tapes · ${page.tapes.filter((t) => t.found).length}/${page.tapes.length} found</div><div class="sb-book-tapes">${tapes}</div>
            <div class="sb-book-footer"><button class="sb-item sb-primary" data-action="title">Course menu</button><button class="sb-item" data-action="howto">How to Ride</button><button class="sb-item" data-action="save-export">Export save</button><button class="sb-item" data-action="save-import">Import save</button><button class="sb-item" data-action="clear-ghosts">Clear ghosts</button><button class="sb-item" data-action="reset-progress">Reset progress</button><button class="sb-item" data-action="credits">Credits</button></div>`;
    }

    showCredits() {
        this._show("credits");
        this.menuButtons()[0]?.focus({ preventScroll: true });
    }

    showBookMessage(text) {
        const line = this.el.bookBody?.querySelector(".sb-book-progress");
        if (line) {
            line.innerHTML = `<b>SAVE DESK</b> · ${escapeHtml(text)}`;
            return;
        }
        this.showNotice(text);
    }

    /** Game-owned confirmation: reachable by arrows, Enter, and gamepad. */
    showSaveConfirm(action) {
        this._confirmAction = action;
        this._bookCourseId = this._bookPages?.[this._bookPage ?? 0]?.id ?? null;
        this._confirmFrom = ["reset-settings", "reset-bindings"].includes(action)
            ? (this._settingsFrom ?? "title") : "book";
        const reset = action === "reset";
        const settings = action === "reset-settings";
        const bindings = action === "reset-bindings";
        const title = bindings ? "Reset keyboard bindings?" : settings ? "Reset player settings?" : reset ? "Reset Burger Book?" : "Clear ghosts?";
        const detail = settings
            ? "This restores accessibility, audio, and HUD options. Keyboard bindings and Burger Tour progress stay."
            : bindings ? "This restores keyboard controls only. Burger Tour progress and accessibility settings stay."
            : reset ? "This removes served orders, medals, tapes, records, and completion rewards. It cannot be undone."
                : "This removes personal-best ghost lines only. Records, medals, tapes, and burgers stay.";
        const yes = bindings ? "Reset bindings" : settings ? "Reset settings" : reset ? "Reset progress" : "Clear ghosts";
        this.el.confirmBody.innerHTML = `<div class="sb-book-kicker">Player desk · confirm</div><h1>${title}</h1><p class="sb-confirm-detail">${detail}</p><div class="sb-actions" style="justify-content:center"><button class="sb-item sb-primary" data-action="confirm-yes">${yes}</button><button class="sb-item" data-action="confirm-no">Cancel</button></div>`;
        this._show("confirm");
        this.menuButtons()[0]?.focus({ preventScroll: true });
    }

    _startSaveImport() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                this.hooks.onSaveAction?.("import", await file.text());
            } catch {
                this.hooks.onSaveAction?.("import", "");
            }
        }, { once: true });
        input.click();
    }

    showHowToRide() {
        this._setHowToPromptText();
        this._show("howto");
        this.menuButtons()[0]?.focus({ preventScroll: true });
    }

    showTourComplete(stats, { hundredPercent = false } = {}) {
        const countLine = hundredPercent
            ? `All ${stats.eventTotal} events medalled · all ${stats.tapeTotal} Recipe Tapes found`
            : `${stats.mainTotal} main deliveries served · ${stats.completedEvents}/${stats.eventTotal} events in the book`;
        this.el.finaleBody.innerHTML = `<div class="sb-book-kicker">Burger Base Camp · ${hundredPercent ? "perfect book" : "final order"}</div><h1>${hundredPercent ? "100% Served" : "Tour Complete"}</h1><div class="sb-finale-badge"><span>${hundredPercent ? "BOOK\nFULL" : "BURGER\nCROWN"}</span></div><p class="sb-finale-copy">${hundredPercent ? "Every line, every medal, every strange little tape. The mountain is yours." : "The six-course Burger Tour is on the pass. Your crown is waiting at Base Camp."}<br/><br/>${escapeHtml(countLine)}</p><div class="sb-actions" style="justify-content:center"><button class="sb-item sb-primary" data-action="finale-credits">Credits</button><button class="sb-item" data-action="finale-book">Burger Book</button><button class="sb-item" data-action="finale-skip">Keep riding</button></div>`;
        this._show("finale");
        this.menuButtons()[0]?.focus({ preventScroll: true });
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
        this._orderEvent = event;
        this.root.querySelector("#sb-event-name").textContent = event.name;
        this.root.querySelector("#sb-event-tag").textContent = event.tagline;
        this.el.eventRule.textContent = describeEventRule(event);
        this.el.eventVehicle.textContent = describeVehicle(event);
        this.el.eventMedal.textContent = `Gold · ${formatTime(event.gold)}`;
        this.el.orderCount.textContent = `${event.required.length} ingredient${event.required.length === 1 ? "" : "s"}`;
        this._setOrderPromptText(event);
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
            return `<div class="sb-slot" data-id="${id}" role="status" aria-label="${def.label} not collected">
                <img src="${ICONS}${id}.webp" alt="${def.label}" />
                <span>${def.label}</span></div>`;
        }).join("");
        this._slotEls = {};
        for (const el of this.el.slots.querySelectorAll(".sb-slot")) {
            this._slotEls[el.dataset.id] = el;
        }
    }

    markCollected(id) {
        const slot = this._slotEls[id];
        slot?.classList.add("done");
        slot?.classList.remove("beacon");
        if (slot) slot.setAttribute("aria-label", `${INGREDIENTS[id]?.label ?? id} collected`);
        this.el.chips.querySelector(`.sb-chip[data-id="${id}"]`)?.classList.add("done");
    }

    resetCollected() {
        for (const el of Object.values(this._slotEls)) el.classList.remove("done");
        for (const el of Object.values(this._slotEls)) el.classList.toggle("beacon", !!S.ingredientBeacon || !!S.highContrast);
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
            this.el.caption?.classList.remove("on");
            this.el.finishBeacon?.classList.remove("on");
            this.el.tutor.classList.remove("on");
            this.el.avalanche.classList.remove("on");
            this.el.flight?.classList.remove("on");
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
        if (!fitted) {
            this.el.fuel.setAttribute("aria-label", "Rocket fuel unavailable");
            return;
        }
        const v = Math.max(0, Math.min(1, level));
        // Only touch the DOM when the bar actually moves a visible amount.
        const step = Math.round(v * 84);
        if (step === this._lastFuel) return;
        this._lastFuel = step;
        this.el.fuelFill.style.transform = `scaleX(${v.toFixed(3)})`;
        this.el.fuel.classList.toggle("low", v < 0.25);
        this.el.fuel.setAttribute("aria-label", `Rocket fuel ${Math.round(v * 100)} percent${v < 0.25 ? ", low fuel" : ""}`);
        this.el.fuel.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    }

    /**
     * Event-specific Big Air readout. It is absent on every other course and
     * accepts the simulation's snapshot rather than sampling the camera.
     * @param {object|null} flight
     */
    setBigAirFlight(flight) {
        const el = this.el.flight;
        if (!el) return;
        if (!flight) {
            el.classList.remove("on");
            return;
        }
        const trick = flight.trick ? ` · ${flight.trick}` : "";
        this.el.flightValue.textContent =
            `AIR ${Number(flight.airtime ?? 0).toFixed(2)} S · ` +
            `${Number(flight.distance ?? 0).toFixed(1)} M · ` +
            `PEAK ${Number(flight.maxClearance ?? 0).toFixed(1)} M${trick}`;
        el.classList.add("on");
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
        el.setAttribute("role", "status");
        el.setAttribute("aria-label", `Landing grade ${grade}`);
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

    /**
     * The avalanche readout. Null hides it; metres show it, red under 25.
     * @param {number|null} distance
     */
    setAvalanche(distance) {
        const el = this.el.avalanche;
        if (distance === null) {
            el.classList.remove("on");
            this._lastAva = null;
            return;
        }
        const shown = Math.max(0, Math.round(distance));
        if (shown !== this._lastAva) {
            this._lastAva = shown;
            el.textContent = `avalanche \u2212${shown} m`;
            el.setAttribute("role", "status");
            el.setAttribute("aria-label", `Avalanche ${shown} metres behind`);
        }
        el.classList.add("on");
        el.classList.toggle("close", distance < 25);
    }

    /** The tutorial line: shown until dismissed, null hides. */
    setTutor(text) {
        if (!text) {
            this.el.tutor.classList.remove("on");
            return;
        }
        if (this.el.tutor.textContent !== text) {
            this.el.tutor.textContent = text;
        }
        this.el.tutor.classList.add("on");
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

    /** Visible, non-audio warning that remains available while muted. */
    setCaption(kind, value = {}, duration = 1500) {
        if (!this.el.caption) return;
        this.el.caption.textContent = feedbackText(kind, value);
        this.el.caption.classList.add("on");
        clearTimeout(this._captionTimer);
        this._captionTimer = setTimeout(() => this.el.caption.classList.remove("on"), duration);
    }

    setFinishBeacon(on) {
        this.el.finishBeacon?.classList.toggle("on", !!on && (!!S.routeAssist || !!S.highContrast));
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
        this.hooks.onScreenVisibilityChange?.();
        // Keyboard and gamepad players land on the safe default.
        this.el.pauseResume.focus({ preventScroll: true });
    }

    hidePause() {
        this.el.pause.classList.remove("on");
        this.el.settings.classList.remove("on");
        this.hooks.onScreenVisibilityChange?.();
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
        this._settingsFrom = "pause";
        this._buildSettingsRows();
        this.el.pause.classList.remove("on");
        this.el.settings.classList.add("on");
        this.hooks.onScreenVisibilityChange?.();
        const first = this.menuButtons()[0];
        if (first) this._focusMenuItem(first);
    }

    /** The same panel, reached from the title. Back returns there. */
    showTitleSettings() {
        this._settingsFrom = "title";
        this._buildSettingsRows();
        this.el.settings.classList.add("on");
        this._show("settings");
        const first = this.menuButtons()[0];
        if (first) this._focusMenuItem(first);
    }

    /** Where the settings panel's Back goes depends on where it came from. */
    closeSettings() {
        const from = this._settingsFrom ?? "pause";
        if (from === "title") this._show("title");
        this.el.settings.classList.remove("on");
        this.hooks.onScreenVisibilityChange?.();
        return from;
    }

    showSettingsAfterReset() {
        if (this._settingsFrom === "pause") this.showPauseSettings();
        else this.showTitleSettings();
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
        const bindingRows = Object.keys(BINDING_LABELS).map((action) => {
            const codes = getBindings()[action] ?? [];
            const text = codes.map((code) => code.replace(/^Key/, "").replace(/^Arrow/, "")).join(" / ");
            return `<div class="sb-binding-row"><div class="sb-k">${BINDING_LABELS[action]}</div><button class="sb-binding-key" data-binding-action="${action}" aria-label="Remap ${BINDING_LABELS[action]}">${text}</button></div>`;
        }).join("");
        this.el.setRows.innerHTML = rows + `<div class="sb-section-label">Keyboard bindings</div>${bindingRows}<div class="sb-actions"><button class="sb-item" data-action="reset-bindings">Reset keyboard bindings</button><button class="sb-item" data-action="reset-settings">Reset settings</button></div>`;

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
                const binding = e.target.closest("button[data-binding-action]");
                if (binding) {
                    this._bindingCapture = binding.dataset.bindingAction;
                    binding.textContent = "Press a key · Escape cancels";
                    binding.classList.add("capturing");
                    binding.focus();
                    return;
                }
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
        const resultEvent = eventDefinition(result.event);
        const eventName = resultIdentity(result);
        const flightPb = bigAirPbSummary(result);
        const requiredCount = resultEvent?.required?.length ?? result.collected?.length ?? 0;
        const collectedCount = result.collected?.length ?? 0;

        // Results are a decision, not a telemetry dump: completion and medal
        // first, then the clock, then only the metric the event invited.
        const metrics = metricRowsForResult(result);
        const rows = metrics.map((metric) => row(...metric)).join("");

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
<div class="sb-kicker" style="text-align:center">Results</div>
<div class="sb-result-event">${escapeHtml(eventName)}</div>
<div class="sb-result-quality">Burger quality</div>
<div class="sb-grade">${escapeHtml(result.grade)}</div>
<div class="sb-result-medal">${escapeHtml(result.completed ? `${medal} medal` : "No medal · serve the order to score")}</div>
${flightPb ? `<div class="sb-flight-pb${flightPb.isNew ? " is-new" : ""}">
    <div class="sb-flight-pb-kicker">${escapeHtml(flightPb.label)}</div>
    <strong>${escapeHtml(formatFlightDistance(flightPb.distance))}</strong>
    <span>${escapeHtml(flightVehicleLabel(flightPb.vehicle))}${flightPb.delta == null ? "" : ` · ${escapeHtml(formatFlightDelta(flightPb.delta))}`}</span>
</div>` : ""}
<div class="sb-stars">${stars}</div>
<div class="sb-result-time"><span>${result.completed ? "Finish time" : "Run time"}</span><strong>${formatTime(result.time)}</strong></div>
${rows ? `<div class="sb-metric-label">Event metrics</div><div class="sb-rows">${rows}</div>` : ""}
<div class="sb-note"><strong>${result.completed ? "Burger served" : "Order incomplete"}</strong> · Order ${collectedCount}/${requiredCount} · ${escapeHtml(bestLine)}${escapeHtml(brokeLine)}${escapeHtml(trickLine)}${escapeHtml(crashLine)}<br/>
Seed ${result.seed}${result.notMeasured.length
    ? " · not measured this run: " + result.notMeasured.join(", ")
    : ""}</div>
<div class="sb-actions">
  <button class="sb-item sb-primary" data-action="retry">Retry</button>
  <button class="sb-item" data-action="next">Next event</button>
  <button class="sb-item" data-action="menu">Course menu</button>
  <button class="sb-item" data-action="book">Burger Book</button>
</div>`;
        this._show("results");
        this.setHud(false);
        // Let the bars animate from zero rather than appear filled.
        const fillResultBars = () => {
            for (const i of this.el.resultBody.querySelectorAll(".sb-bar i")) {
                i.style.width = i.dataset.w;
            }
        };
        // Reduced motion is a persisted player setting, so it must win over
        // the usual result flourish even when the OS preference is unchanged.
        if (S.reducedMotion) fillResultBars();
        else requestAnimationFrame(fillResultBars);
    }

    dispose() {
        this._inputFamilyOff?.();
        this.root.remove();
        this._style.remove();
    }
}

/**
 * Controller east/back targets. Kept pure so navigation cannot silently lose
 * a screen when DOM focus happens to be on a tab or record row.
 */
export function menuBackTarget(screenId) {
    const id = String(screenId ?? "").replace(/^sb-/, "");
    return ({
        pause: { attr: "data-pause", value: "resume" },
        settings: { attr: "data-pause", value: "settings-back" },
        order: { attr: "data-action", value: "menu" },
        results: { attr: "data-action", value: "menu" },
        book: { attr: "data-action", value: "title" },
        howto: { attr: "data-action", value: "book" },
        credits: { attr: "data-action", value: "title" },
        finale: { attr: "data-action", value: "finale-skip" },
        confirm: { attr: "data-action", value: "confirm-no" },
    })[id] ?? null;
}

/** Keep registry copy and UI copy in plain language, so the title and order
 * card teach the same rule without exposing internal mode names. */
export function describeEventRule(event = {}) {
    if (event.mode === "time-trial") return "Time trial";
    if (event.mode === "rocket-rush") return "Rocket rush";
    if (event.mode === "final") return "Survival delivery";
    if (event.trickTarget != null) return `Tricks ${event.trickTarget}+`;
    if (event.styleTarget != null) return `Style ${event.styleTarget}+`;
    if (event.integrityTarget != null) return `Stack ${event.integrityTarget}+`;
    return "Delivery";
}

export function describeVehicle(event = {}) {
    if (event.forcedVehicle === "rocket-chair") return "Rocket chair";
    if (event.forcedVehicle === "classic-snowboard") return "Classic board";
    const vehicles = event.allowedVehicles ?? [];
    if (vehicles.includes("rocket-chair") && vehicles.includes("classic-snowboard")) {
        return "Board or rocket";
    }
    if (vehicles.includes("rocket-chair")) return "Rocket chair";
    return "Classic board";
}

export function describeMedalTarget(event = {}) {
    return Number.isFinite(event.gold) ? `Gold ${formatTime(event.gold)}` : "Medals await";
}

/** @param {object} result @returns {Array<[string,string,string,boolean?]>} */
export function metricRowsForResult(result = {}) {
    const event = eventDefinition(result.event);
    const notMeasured = result.notMeasured ?? [];
    const rows = [];
    if (result.bigAirFlight) {
        const flight = result.bigAirFlight;
        const trick = flight.trick
            ? ` · ${flight.trick} +${flight.trickScore}` : "";
        rows.push([
            "Big Air flight",
            pct((flight.distance ?? 0) / 80),
            `${flight.distance ?? 0} m · ${flight.airtime ?? 0} s · ` +
            `peak ${flight.maxClearance ?? flight.maxHeight ?? 0} m · ` +
            `${flight.landingGrade ?? "ungraded"}${trick}`,
        ]);
    }
    if (event?.mode === "style-delivery" || event?.styleTarget != null) {
        rows.push(["Style", pct((result.style ?? 0) / 100), String(result.style ?? 0)]);
    }
    if (event?.trickTarget != null) {
        // The bar saturates at a committed trick run; the number is open.
        rows.push(["Tricks", pct((result.trickScore ?? 0) / 1400), String(result.trickScore ?? 0)]);
    }
    if (event?.mode === "rocket-rush" || (event?.mode === "final" && !notMeasured.includes("rocket efficiency"))) {
        const unmeasured = notMeasured.includes("rocket efficiency");
        rows.push(["Rocket efficiency", pct((result.rocket ?? 0) / 100), unmeasured ? "Not fitted" : String(result.rocket ?? 0), unmeasured]);
    }
    if (event?.integrityTarget != null || event?.mode === "final" || event?.mode === "delivery") {
        rows.push(["Stack integrity", pct((result.integrity ?? 0) / 100), String(result.integrity ?? 0)]);
    }
    return rows;
}

function eventDefinition(id) {
    try { return id ? getEvent(id) : null; } catch { return null; }
}

function eventDisplayName(id) {
    return eventDefinition(id)?.name ?? id ?? "Run";
}

/** The event identity leads results; the stack grade is a separate quality readout. */
export function resultIdentity(result = {}) {
    return result.eventName ?? eventDisplayName(result.event);
}

/**
 * Reduce the save-boundary Big Air comparison to one small UI readout.
 * Ordinary results, incomplete flights, and records without a trustworthy
 * saved distance return null so they keep the established results layout.
 */
export function bigAirPbSummary(result = {}) {
    const flight = result.bigAirFlight;
    if (!flight || typeof flight !== "object") return null;
    const best = result.bigAirBest && typeof result.bigAirBest === "object"
        ? result.bigAirBest : null;
    const finiteDistance = (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const candidateDistance = finiteDistance(best?.candidate?.distance ?? flight.distance);
    const previousDistance = finiteDistance(best?.previous?.distance);
    const isNew = best?.isNew === true || result.records?.bigAir === true;
    const savedDistance = finiteDistance(
        best?.current?.distance ?? (isNew ? candidateDistance : previousDistance),
    );
    if (savedDistance == null) return null;
    const compareDistance = isNew ? previousDistance : savedDistance;
    const delta = candidateDistance == null || compareDistance == null
        ? null : Number((candidateDistance - compareDistance).toFixed(1));
    return {
        label: isNew ? "NEW FLIGHT PB" : "FLIGHT PB",
        isNew,
        distance: savedDistance,
        vehicle: best?.vehicle ?? best?.current?.vehicle ??
            best?.candidate?.vehicle ?? flight.vehicle ?? "classic-snowboard",
        delta,
    };
}

function flightVehicleLabel(vehicle) {
    if (vehicle === "rocket-chair") return "Rocket chair";
    if (vehicle === "classic-snowboard") return "Classic board";
    return "Board";
}

function formatFlightDistance(distance) {
    return `${Number(distance).toFixed(1)} m`;
}

function formatFlightDelta(delta) {
    if (Math.abs(delta) < 0.05) return "level with PB";
    return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} m this attempt`;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

/** Wrap a menu index, including the no-active-item case used on first focus. */
export function nextMenuIndex(length, activeIndex, direction) {
    if (length <= 0) return -1;
    if (activeIndex < 0) return direction > 0 ? 0 : length - 1;
    return (activeIndex + (direction > 0 ? 1 : -1) + length) % length;
}

/**
 * Pure visibility check used before a focused menu item asks its nearest
 * scrolling ancestor to move. A small inset keeps the focus ring readable at
 * the edge without moving controls that are already comfortably visible.
 */
export function rectNeedsNearestScroll(itemRect, viewportRect, inset = 0) {
    if (!itemRect || !viewportRect) return false;
    const margin = Math.max(0, Number(inset) || 0);
    return itemRect.top < viewportRect.top + margin ||
        itemRect.bottom > viewportRect.bottom - margin;
}

function scrollViewportFor(item) {
    const view = item.ownerDocument?.defaultView;
    for (let parent = item.parentElement; parent; parent = parent.parentElement) {
        const style = view?.getComputedStyle(parent);
        const scrollsY = style && /(?:auto|scroll|overlay)/.test(style.overflowY);
        if (scrollsY && parent.scrollHeight > parent.clientHeight + 1) return parent;
    }
    return item.closest(".sb-screen, .sb-card, .sb-results");
}

/** One deterministic range step, shared by keyboard and gamepad navigation. */
export function adjustRangeValue(value, min, max, step, direction) {
    const current = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    const delta = Math.abs(Number(step)) || 1;
    if (![current, lo, hi].every(Number.isFinite) || !Number.isFinite(direction)) {
        return current;
    }
    const decimals = Math.max(decimalPlaces(delta), decimalPlaces(lo), decimalPlaces(hi));
    const next = Math.min(hi, Math.max(lo, current + (direction > 0 ? delta : -delta)));
    return Number(next.toFixed(decimals));
}

function decimalPlaces(value) {
    const text = String(value);
    const point = text.indexOf(".");
    return point < 0 ? 0 : text.length - point - 1;
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
        k: "uiVolume", label: "Interface", type: "range",
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
    {
        k: "hudScale", label: "HUD scale", type: "range",
        min: 0.8, max: 1.6, step: 0.05, fmt: (v) => Math.round(v * 100) + "%",
    },
    { k: "highContrast", label: "High contrast cues", type: "toggle" },
    { k: "routeAssist", label: "Route assist", type: "toggle" },
    { k: "ingredientBeacon", label: "Ingredient beacon", type: "toggle" },
    { k: "hazardWarnings", label: "Hazard captions", type: "toggle" },
    { k: "showGhost", label: "Race your ghost", type: "toggle" },
    {
        k: "ghostOpacity", label: "Ghost strength", type: "range",
        min: 0.25, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%",
    },
    { k: "forgivingLanding", label: "Forgiving landings", type: "toggle" },
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
