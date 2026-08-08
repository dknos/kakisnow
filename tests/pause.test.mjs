/**
 * Pause semantics, provable without a browser.
 *
 * The pause mechanism is `dt = 0` through the existing frame path, so the
 * contract worth pinning here is that the run's own clocks are pure functions
 * of the dt they are fed: zero in, zero advance — for the run timer, the
 * countdown, the style integrals and the ghost recorder alike. The browser
 * halves (pointer lock, focus loss, the veil itself) are exercised by
 * tools/full-game/pause-smoke-windows.cjs against real Chrome.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { BurgerRun, RunState } from "../src/game/burgerRun.js";
import { canPauseState, suppressGameplayInput } from "../src/game/pauseSystem.js";
import { Mode } from "../src/game/modes.js";
import { input } from "../src/core/input.js";
import { sanitize, SETTINGS_VERSION } from "../src/core/playerSettings.js";
import {
    adjustRangeValue, bigAirPbSummary, nextMenuIndex,
    rectNeedsNearestScroll, resultIdentity,
} from "../src/ui/snowBurgersUi.js";
import { shouldShowHint } from "../src/ui/hintVisibility.js";

// ------------------------------------------------------------------ fixtures

/** The controller surface BurgerRun actually reads and writes. */
function stubController() {
    return {
        position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        velocity: { x: 0, y: 0, z: 0, setAll(v) { this.x = v; this.y = v; this.z = v; } },
        verticalVelocity: 0,
        facing: 0,
        grounded: true,
        airborne: false,
        airTime: 0,
        carve: 0,
        speed01: 0,
        landed: false,
        landingImpact: 0,
    };
}

function stubRun() {
    const controller = stubController();
    const run = new BurgerRun({
        controller,
        field: { place() {}, reset() {}, clear() {} },
        book: {
            event: () => ({}),
            record: () => ({}),
            markAssemblySeen() {},
            book: { seenAssembly: true },
        },
        terrain: { heightAt: () => 0, normalAt: (x, z, out) => out },
    });
    return { run, controller };
}

/** Put a run into a live state without the placement pipeline. */
function enterRun(run) {
    run._setState(RunState.ORDER);
    run._setState(RunState.COUNTDOWN);
    run.countdown = 3.2;
    run.update(3.3); // countdown expires, state becomes RUN
    assert.equal(run.state, RunState.RUN);
}

// ---------------------------------------------------------------- the clocks

test("a paused frame advances the run clock by exactly zero", () => {
    const { run, controller } = stubRun();
    enterRun(run);

    run.update(0.016);
    const before = run.time;
    assert.ok(before > 0);

    // Five real-world seconds of paused frames: 300 frames of dt=0.
    controller.position.z = 50;
    for (let i = 0; i < 300; i++) run.update(0);
    assert.equal(run.time, before);

    // And the clock picks up where it left off.
    run.update(0.016);
    assert.ok(run.time > before);
});

test("a paused countdown does not tick", () => {
    const { run } = stubRun();
    run._setState(RunState.ORDER);
    run._setState(RunState.COUNTDOWN);
    run.countdown = 2.0;

    for (let i = 0; i < 300; i++) run.update(0);
    assert.equal(run.countdown, 2.0);
    assert.equal(run.state, RunState.COUNTDOWN);
});

test("style integrals and the ghost recorder freeze with the clock", () => {
    const { run, controller } = stubRun();
    enterRun(run);

    controller.airborne = true;
    controller.carve = 1;
    controller.speed01 = 1;
    for (let i = 0; i < 40; i++) run.update(0.25); // 10 s, samples every 0.25
    const ghostLen = run._ghost.length;
    const air = run._airTime;
    assert.ok(ghostLen > 0);
    assert.ok(air > 0);

    for (let i = 0; i < 300; i++) run.update(0);
    assert.equal(run._ghost.length, ghostLen);
    assert.equal(run._airTime, air);
});

test("restart returns any live state to a fresh countdown on the same seed", () => {
    const { run } = stubRun();
    run.seed = 777;
    enterRun(run);
    run.update(5);
    run.splits.cheese = 2.5;

    run.restart();
    assert.equal(run.state, RunState.COUNTDOWN);
    assert.equal(run.seed, 777);
    assert.equal(run.time, 0);
    assert.deepEqual(run.splits, {});
    assert.ok(run.countdown > 3);

    // From IDLE it must refuse: there is nothing to restart.
    run.stop();
    run.restart();
    assert.equal(run.state, RunState.IDLE);
});

// ------------------------------------------------------------- pause gating

test("canPauseState pauses gameplay and refuses menus", () => {
    // Both lab modes pause regardless of run state.
    assert.equal(canPauseState(Mode.FREE_RIDE, RunState.IDLE), true);
    assert.equal(canPauseState(Mode.ROCKET_TEST, RunState.IDLE), true);
    // A burger run pauses only in its simulated states.
    assert.equal(canPauseState(Mode.BURGER_RUN, RunState.COUNTDOWN), true);
    assert.equal(canPauseState(Mode.BURGER_RUN, RunState.RUN), true);
    assert.equal(canPauseState(Mode.BURGER_RUN, RunState.ASSEMBLY), true);
    assert.equal(canPauseState(Mode.BURGER_RUN, RunState.ORDER), false);
    assert.equal(canPauseState(Mode.BURGER_RUN, RunState.RESULTS), false);
    assert.equal(canPauseState(Mode.BURGER_RUN, RunState.IDLE), false);
    assert.equal(canPauseState(Mode.TITLE, RunState.IDLE), false);
});

test("legacy control hint is restricted to active lab riding", () => {
    assert.equal(shouldShowHint(Mode.FREE_RIDE, false), true);
    assert.equal(shouldShowHint(Mode.ROCKET_TEST, false), true);
    assert.equal(shouldShowHint(Mode.TITLE, false), false);
    assert.equal(shouldShowHint(Mode.BURGER_RUN, false), false);
    // A visible pause/settings/order/results screen always wins, even in a lab.
    assert.equal(shouldShowHint(Mode.FREE_RIDE, true), false);
    assert.equal(shouldShowHint(Mode.ROCKET_TEST, true), false);
});

test("suppressGameplayInput zeroes everything that can move the world", () => {
    input.moveX = 1; input.moveZ = -1; input.moving = true;
    input.surf = true; input.sprint = true; input.boost = 1;
    input.jumpPressed = true; input.spellPressed = 3; input.spellHeld2 = true;
    input.lookX = 0.2; input.lookY = -0.1; input.zoomDelta = 2;

    suppressGameplayInput();

    assert.equal(input.moveX, 0);
    assert.equal(input.moveZ, 0);
    assert.equal(input.moving, false);
    assert.equal(input.surf, false);
    assert.equal(input.sprint, false);
    assert.equal(input.boost, 0);
    assert.equal(input.jumpPressed, false);
    assert.equal(input.spellPressed, 0);
    assert.equal(input.spellHeld2, false);
    assert.equal(input.lookX, 0);
    assert.equal(input.lookY, 0);
    assert.equal(input.zoomDelta, 0);
});

// -------------------------------------------------------------- settings io

test("sanitize keeps valid player settings and drops everything else", () => {
    const clean = sanitize({
        version: SETTINGS_VERSION,
        values: {
            masterVolume: 0.5,
            mouseSensitivity: 1.4,
            invertY: true,
            shakeScale: 0.2,
            reducedMotion: true,
            audio: false,
            touchControls: "on",
            preset: "balanced",
            // Hostile or stale entries:
            masterVolumeExtra: 1,
            exposure: 9,           // not a player key
            debugView: "deform",   // not a player key
        },
    });
    assert.deepEqual(clean, {
        audio: false,
        masterVolume: 0.5,
        mouseSensitivity: 1.4,
        invertY: true,
        shakeScale: 0.2,
        reducedMotion: true,
        touchControls: "on",
        preset: "balanced",
    });
});

test("sanitize rejects bad envelopes and bad values without throwing", () => {
    assert.deepEqual(sanitize(null), {});
    assert.deepEqual(sanitize("junk"), {});
    assert.deepEqual(sanitize({ version: 99, values: { audio: false } }), {});
    assert.deepEqual(sanitize({ version: SETTINGS_VERSION }), {});
    assert.deepEqual(
        sanitize({
            version: SETTINGS_VERSION,
            values: {
                masterVolume: 4,          // out of range
                mouseSensitivity: "fast", // wrong type
                invertY: 1,               // wrong type
                touchControls: "maybe",   // not an option
                preset: "cinematic",      // not a preset
                shakeScale: NaN,
            },
        }),
        {}
    );
});

// ---------------------------------------------------------- controller menus

test("settings menu navigation includes range values and wraps safely", () => {
    assert.equal(nextMenuIndex(4, -1, 1), 0);
    assert.equal(nextMenuIndex(4, -1, -1), 3);
    assert.equal(nextMenuIndex(4, 3, 1), 0);
    assert.equal(nextMenuIndex(4, 0, -1), 3);
    assert.equal(nextMenuIndex(0, -1, 1), -1);
});

test("settings focus scroll check only moves controls outside the visible card", () => {
    const viewport = { top: 100, bottom: 500 };
    assert.equal(rectNeedsNearestScroll({ top: 180, bottom: 220 }, viewport, 10), false);
    assert.equal(rectNeedsNearestScroll({ top: 92, bottom: 132 }, viewport, 10), true);
    assert.equal(rectNeedsNearestScroll({ top: 470, bottom: 510 }, viewport, 10), true);
});

test("results lead with the registered event identity, not its burger grade", () => {
    assert.equal(
        resultIdentity({ event: "big-air-basin-stack", grade: "Summit Stack" }),
        "The Big Air Stack",
    );
    assert.equal(
        resultIdentity({ event: "summit-stack", eventName: "Custom Event", grade: "Summit Stack" }),
        "Custom Event",
    );
});

test("Big Air first flight PB exposes a warm-callout payload", () => {
    const summary = bigAirPbSummary({
        bigAirFlight: { vehicle: "classic-snowboard", distance: 64.2 },
        bigAirBest: {
            vehicle: "classic-snowboard", isNew: true, previous: null,
            current: { vehicle: "classic-snowboard", distance: 64.2 },
            candidate: { vehicle: "classic-snowboard", distance: 64.2 },
        },
        records: { bigAir: true },
    });
    assert.deepEqual(summary, {
        label: "NEW FLIGHT PB", isNew: true, distance: 64.2,
        vehicle: "classic-snowboard", delta: null,
    });
});

test("Big Air repeat keeps the saved PB and reports the current delta", () => {
    const summary = bigAirPbSummary({
        bigAirFlight: { vehicle: "rocket-chair", distance: 58.4 },
        bigAirBest: {
            vehicle: "rocket-chair", isNew: false,
            previous: { vehicle: "rocket-chair", distance: 61.1 },
            current: { vehicle: "rocket-chair", distance: 61.1 },
            candidate: { vehicle: "rocket-chair", distance: 58.4 },
        },
        records: { bigAir: false },
    });
    assert.deepEqual(summary, {
        label: "FLIGHT PB", isNew: false, distance: 61.1,
        vehicle: "rocket-chair", delta: -2.7,
    });
});

test("non-Big-Air results do not grow a flight PB callout", () => {
    assert.equal(bigAirPbSummary({
        event: "summit-stack", completed: true,
        records: { bigAir: true },
    }), null);
});

test("controller range adjustment honors step, bounds, and decimal precision", () => {
    assert.equal(adjustRangeValue("0.50", "0", "1", "0.01", 1), 0.51);
    assert.equal(adjustRangeValue("0.50", "0", "1", "0.01", -1), 0.49);
    assert.equal(adjustRangeValue("1", "0", "1", "0.01", 1), 1);
    assert.equal(adjustRangeValue("0.2", "0.2", "3", "0.05", -1), 0.2);
    assert.equal(adjustRangeValue("1.45", "0", "1.5", "0.05", 1), 1.5);
});
