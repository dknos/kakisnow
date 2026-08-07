import test from "node:test";
import assert from "node:assert/strict";

import {
    BigAirFlightTelemetry,
    BIG_AIR_CAPTURE_FROM,
    BIG_AIR_CAPTURE_TO,
    isBetterBigAirFlight,
} from "../src/game/bigAirFlight.js";

function controller(z, airborne = true) {
    return {
        airborne,
        groundY: 0,
        landingAirTime: 0,
        landingGrade: null,
        position: { x: 0, y: 0, z },
    };
}

test("Big Air telemetry captures a controller-authoritative flight", () => {
    const t = new BigAirFlightTelemetry();
    const c = controller(BIG_AIR_CAPTURE_FROM + 1);
    c.position.y = 2;
    assert.equal(t.shouldBegin(c), true);
    assert.equal(t.begin(c, "rocket-chair"), true);

    c.position.x = 2;
    c.position.y = 14;
    c.position.z = 326;
    t.observe(c, 0.5);
    c.position.x = 4;
    c.position.y = 4;
    c.position.z = BIG_AIR_CAPTURE_TO + 44;
    c.airborne = false;
    c.landingAirTime = 1.07;
    c.landingGrade = "perfect";
    const result = t.finish(c, { name: "Backside Spin", score: 420 });

    assert.deepEqual(result, {
        vehicle: "rocket-chair",
        airtime: 1.07,
        distance: 65.1,
        maxHeight: 12,
        maxClearance: 14,
        trick: "Backside Spin",
        trickScore: 420,
        landingGrade: "perfect",
        recordKey: "big-air-basin:rocket-chair",
    });
    assert.equal(t.framingActive, true);
    t.tick(1);
    assert.equal(t.framingActive, false);
});

test("Big Air telemetry ignores ordinary airtime outside the authored window", () => {
    const t = new BigAirFlightTelemetry();
    const c = controller(BIG_AIR_CAPTURE_FROM - 4);
    assert.equal(t.shouldBegin(c), false);
    assert.equal(t.inFlight, false);
});

test("flight personal-best comparison is distance-first and deterministic", () => {
    assert.equal(isBetterBigAirFlight({ distance: 50, maxHeight: 14 }, null), true);
    assert.equal(isBetterBigAirFlight({ distance: 50, maxHeight: 14 }, { distance: 51, maxHeight: 20 }), false);
    assert.equal(isBetterBigAirFlight({ distance: 51, maxHeight: 14 }, { distance: 51, maxHeight: 13 }), true);
});
