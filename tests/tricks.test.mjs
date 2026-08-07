/**
 * Trick accounting, provable without a browser.
 *
 * The tracker is pure arithmetic over what the orchestrator feeds it, so every
 * rule — naming forgiveness, the grab gate, decay, the combo — pins here as an
 * exact number. The expected values below are deliberately restated from the
 * scoring table in `src/game/trickScore.js` rather than imported: a constant
 * that drifts should fail a test, not rewrite one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { TrickTracker } from "../src/game/trickScore.js";

const RAD = Math.PI / 180;

// ------------------------------------------------------------------ fixtures

/**
 * Fly one whole air on a tracker: grab held first (if any), then the rest of
 * the flight bare-handed with the rotation, then the landing.
 */
function air(t, {
    yawDeg = 0, pitchDeg = 0, airTime = 1, kicker = false,
    grab = null, grabTime = 0, grade = "clean",
} = {}) {
    t.beginAir({ onKicker: kicker });
    if (grab && grabTime > 0) {
        t.setGrab(grab);
        t.addRotation(0, 0, grabTime);
        t.setGrab(null);
    }
    t.addRotation(yawDeg * RAD, pitchDeg * RAD, Math.max(airTime - grabTime, 0));
    return t.land(grade);
}

/** One air on a fresh tracker — no decay, no combo history. */
function oneAir(opts) {
    return air(new TrickTracker(), opts);
}

// -------------------------------------------------------------- spin naming

test("spins name to the nearest lower 180 with 30 degrees of forgiveness", () => {
    assert.equal(oneAir({ yawDeg: 149 }), null);
    assert.equal(oneAir({ yawDeg: 150 }).name, "180");
    assert.equal(oneAir({ yawDeg: 329 }).name, "180");
    assert.equal(oneAir({ yawDeg: 330 }).name, "360");
    assert.equal(oneAir({ yawDeg: 510 }).name, "540");
    assert.equal(oneAir({ yawDeg: 689 }).name, "540");
    assert.equal(oneAir({ yawDeg: 690 }).name, "720");
    // Beyond the named ladder it keeps counting in 180 steps.
    assert.equal(oneAir({ yawDeg: 870 }).name, "900");
    // Direction does not matter to the spin; magnitude is |net yaw|.
    assert.equal(oneAir({ yawDeg: -330 }).name, "360");
});

test("spin scoring: 80 a step, x1.15 compounding past the first", () => {
    assert.equal(oneAir({ yawDeg: 180 }).score, 80);                    // 80 x 1
    assert.equal(oneAir({ yawDeg: 360 }).score, 184);                   // 160 x 1.15
    assert.equal(oneAir({ yawDeg: 540 }).score, 317);                   // 240 x 1.3225
    assert.equal(oneAir({ yawDeg: 720 }).score, 487);                   // 320 x 1.15^3
    const r = oneAir({ yawDeg: 360 });
    assert.equal(r.rotationSteps, 2);
    assert.equal(r.base, 160);
});

// -------------------------------------------------------------- flip naming

test("flips name at 300 degrees, direction from the net pitch sign", () => {
    assert.equal(oneAir({ pitchDeg: 299 }), null);
    assert.equal(oneAir({ pitchDeg: 300 }).name, "Backflip");   // nose-up = positive
    assert.equal(oneAir({ pitchDeg: -300 }).name, "Frontflip"); // nose-down = negative
    assert.equal(oneAir({ pitchDeg: 659 }).name, "Backflip");
    assert.equal(oneAir({ pitchDeg: 660 }).name, "Double Backflip");
    assert.equal(oneAir({ pitchDeg: -670 }).name, "Double Frontflip");
    assert.equal(oneAir({ pitchDeg: 310 }).score, 260);
    assert.equal(oneAir({ pitchDeg: 670 }).score, 520);
});

test("spin and flip combine into one name and one base", () => {
    const r = oneAir({ yawDeg: 540, pitchDeg: -320 });
    assert.equal(r.name, "Frontflip 540");
    assert.equal(r.rotationSteps, 3);
    assert.equal(r.flips, 1);
    assert.equal(r.base, 500);            // 240 spin + 260 flip
    assert.equal(r.score, 661);           // 500 x 1.15^2, rounded
});

// ---------------------------------------------------------------- the grab

test("a grab needs 0.25 s cumulative hold to count", () => {
    const short = oneAir({ yawDeg: 360, grab: "left", grabTime: 0.2 });
    assert.equal(short.name, "360");
    assert.equal(short.grab, null);
    assert.equal(short.score, 184);

    const held = oneAir({ yawDeg: 360, grab: "left", grabTime: 0.3 });
    assert.equal(held.name, "360 + Left Tweak");
    assert.equal(held.grab, "left");
    assert.equal(held.base, 220);         // 160 + 60 flat
    assert.equal(held.score, 304);        // 220 x 1.15 x 1.2

    assert.equal(
        oneAir({ yawDeg: 360, grab: "right", grabTime: 0.3 }).name,
        "360 + Right Tweak"
    );
});

test("the hold is cumulative across releases, and a grab alone is a trick", () => {
    const t = new TrickTracker();
    t.beginAir({});
    t.setGrab("left");
    t.addRotation(0, 0, 0.15);
    t.setGrab(null);
    t.addRotation(0, 0, 0.1);             // bare-handed gap
    t.setGrab("left");
    t.addRotation(0, 0, 0.15);            // 0.3 s held in total
    t.setGrab(null);
    t.addRotation(0, 0, 0.2);
    const r = t.land("clean");
    assert.equal(r.name, "Left Tweak");
    assert.equal(r.base, 60);
    assert.equal(r.score, 72);            // 60 x 1.2
});

// --------------------------------------------------------- kicker and grades

test("a kicker takeoff is worth a quarter more", () => {
    assert.equal(oneAir({ yawDeg: 180, kicker: true }).score, 100);           // 80 x 1.25
    assert.equal(oneAir({ yawDeg: 180, kicker: true, grade: "perfect" }).score, 150);
});

test("landing grades scale the trick; crash zeroes it and drops the combo", () => {
    assert.equal(oneAir({ yawDeg: 360, grade: "perfect" }).score, 276);  // 184 x 1.5
    assert.equal(oneAir({ yawDeg: 360, grade: "clean" }).score, 184);
    assert.equal(oneAir({ yawDeg: 360, grade: "sketchy" }).score, 101);  // 184 x 0.55

    const t = new TrickTracker();
    air(t, { yawDeg: 180 });
    t.bank();
    assert.equal(t.total, 80);
    air(t, { yawDeg: 360 });              // open combo again
    assert.equal(t.open.count, 1);

    const crash = air(t, { yawDeg: 540, grade: "crash" });
    assert.equal(crash.score, 0);
    assert.equal(crash.grade, "crash");
    assert.equal(crash.name, "540");      // the toast still knows what died
    assert.equal(crash.comboCount, 0);
    assert.equal(t.open, null);           // open portion lost...
    assert.equal(t.total, 80);            // ...banked kept
});

// -------------------------------------------------------------------- decay

test("a repeated name decays x0.6 per prior use, floored at 0.15", () => {
    const t = new TrickTracker();
    assert.equal(air(t, { yawDeg: 180 }).score, 80);
    assert.equal(air(t, { yawDeg: 180 }).score, 48);   // x0.6
    assert.equal(air(t, { yawDeg: 180 }).score, 29);   // x0.36
    assert.equal(air(t, { yawDeg: 180 }).score, 17);   // x0.216
    const floored = air(t, { yawDeg: 180 });           // 0.6^4=0.1296 -> floor 0.15
    assert.equal(floored.decay, 0.15);
    assert.equal(floored.score, 12);
    // A distinct name is untouched by the 180's history.
    assert.equal(air(t, { yawDeg: 360 }).score, 184);
});

test("a crashed attempt does not count as a use for decay", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180, grade: "crash" });
    assert.equal(air(t, { yawDeg: 180 }).score, 80);   // first scored use, no decay
});

// -------------------------------------------------------------------- combo

test("the combo multiplier grows 0.25 a trick and caps at 2.5", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180 });
    assert.equal(t.open.multiplier, 1);
    air(t, { yawDeg: 360 });
    assert.equal(t.open.multiplier, 1.25);
    air(t, { yawDeg: 540 });
    assert.deepEqual(t.open, { score: 80 + 184 + 317, count: 3, multiplier: 1.5 });

    for (let i = 0; i < 8; i++) air(t, { yawDeg: 180 });
    assert.equal(t.open.count, 11);
    assert.equal(t.open.multiplier, 2.5); // 1 + 0.25x10 = 3.5, capped
});

test("bank moves sum x multiplier to the total; loseCombo keeps the banked", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180 });
    air(t, { yawDeg: 360 });
    air(t, { yawDeg: 540 });
    const banked = t.bank();
    assert.equal(banked, 872);            // (80+184+317) x 1.5, rounded
    assert.equal(t.total, 872);
    assert.equal(t.open, null);
    assert.equal(t.bank(), 0);            // nothing open, nothing moves

    air(t, { yawDeg: 720 });
    assert.equal(t.loseCombo("out of bounds"), 487);
    assert.equal(t.open, null);
    assert.equal(t.total, 872);
});

// -------------------------------------------------------------------- grinds

test("a grind pays 40 a second; a clean exit adds x1.3 and banks the combo", () => {
    const t = new TrickTracker();
    for (let i = 0; i < 4; i++) t.addRailTime(0.5);
    const r = t.endRail(true);
    assert.equal(r.name, "Grind");
    assert.equal(r.base, 80);             // 40 x 2.0 s
    assert.equal(r.score, 104);           // x1.3 clean exit
    assert.equal(r.grade, "clean");
    assert.equal(t.open, null);           // clean exit banked it
    assert.equal(t.total, 104);
});

test("an unclean rail exit still scores but leaves the combo open", () => {
    const t = new TrickTracker();
    t.addRailTime(2);
    const r = t.endRail(false);
    assert.equal(r.score, 80);            // no clean bonus
    assert.equal(r.grade, "sketchy");
    assert.equal(t.total, 0);
    assert.deepEqual(t.open, { score: 80, count: 1, multiplier: 1 });
});

test("Grind is a name like any other: it decays on repeat", () => {
    const t = new TrickTracker();
    t.addRailTime(2);
    assert.equal(t.endRail(true).score, 104);
    t.addRailTime(2);
    assert.equal(t.endRail(true).score, 62); // 80 x 1.3 x 0.6
});

test("a grind joins the open combo before the clean exit banks it", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180 });              // 80, combo open
    t.addRailTime(1);
    const r = t.endRail(true);            // 52 = 40 x 1.3
    assert.equal(r.comboCount, 2);
    assert.equal(r.comboMultiplier, 1.25);
    assert.equal(t.total, 165);           // (80 + 52) x 1.25
    assert.equal(t.open, null);
});

test("a rail with no time held returns null", () => {
    const t = new TrickTracker();
    assert.equal(t.endRail(true), null);
    assert.equal(t.total, 0);
});

// ------------------------------------------------------------- the non-trick

test("plain airtime is null and does not break the combo", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180 });
    assert.equal(t.open.count, 1);

    assert.equal(air(t, { yawDeg: 100 }), null);              // nothing recognized
    assert.equal(air(t, { yawDeg: 360, airTime: 0.2 }), null); // too brief to score
    assert.equal(t.open.count, 1);        // the combo rode through both
});

test("a crash on a plain air is still a crash: null result, combo dropped", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180 });
    assert.equal(air(t, { yawDeg: 100, grade: "crash" }), null);
    assert.equal(t.open, null);
});

// ---------------------------------------------------------------- the books

test("the result object carries everything the HUD toast needs", () => {
    assert.deepEqual(oneAir({ yawDeg: 360, grab: "left", grabTime: 0.3 }), {
        name: "360 + Left Tweak",
        base: 220,
        rotationSteps: 2,
        flips: 0,
        grab: "left",
        grade: "clean",
        multiplier: 1.38,                 // 1.15 x 1.2
        decay: 1,
        score: 304,
        comboCount: 1,
        comboMultiplier: 1,
    });
});

test("best, trickCount and the capped log", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 180 });
    air(t, { yawDeg: 540 });
    air(t, { yawDeg: 180, grade: "crash" });
    assert.equal(t.trickCount, 2);        // the crash is not a scored trick
    assert.deepEqual(t.best, { name: "540", score: 317 });
    assert.equal(t.log.length, 3);        // ...but the log remembers it
    assert.deepEqual(t.log[2], { name: "180", score: 0, grade: "crash" });

    // The log keeps the newest 64: after 70 airs the first six are gone.
    const full = new TrickTracker();
    for (let i = 0; i < 6; i++) air(full, { yawDeg: 180, grade: "perfect" });
    for (let i = 0; i < 64; i++) air(full, { yawDeg: 180, grade: "clean" });
    assert.equal(full.log.length, 64);
    assert.equal(full.log[0].grade, "clean");
});

// -------------------------------------------------------------------- reset

test("reset clears the total, the combo, the books and the decay history", () => {
    const t = new TrickTracker();
    air(t, { yawDeg: 360 });
    t.bank();
    air(t, { yawDeg: 360 });              // decayed, and left open
    t.addRailTime(1);
    assert.ok(t.total > 0);

    t.reset();
    assert.equal(t.total, 0);
    assert.equal(t.open, null);
    assert.equal(t.best, null);
    assert.equal(t.trickCount, 0);
    assert.deepEqual(t.log, []);
    assert.equal(t.endRail(true), null);  // rail time did not survive
    assert.equal(air(t, { yawDeg: 360 }).score, 184); // decay history gone
});
