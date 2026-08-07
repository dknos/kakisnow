import test from "node:test";
import assert from "node:assert/strict";

import {
    CAMERA_ARM_MIN,
    solveCameraArmDistance,
    solveAirFrameOffset,
    predictLandingAim,
    shortestAngleDelta,
} from "../src/core/cameraMath.js";

test("camera arm retracts faster than it relaxes after an obstruction", () => {
    const dt = 1 / 60;
    const inward = solveCameraArmDistance(8, 8, 3, dt);
    const outward = solveCameraArmDistance(3, 8, Infinity, dt);

    assert.ok(inward < 8 && inward > 3, `inward distance ${inward}`);
    assert.ok(outward > 3 && outward < 8, `outward distance ${outward}`);
    assert.ok(8 - inward > outward - 3,
        `inward ${8 - inward} must exceed outward ${outward - 3}`);
});

test("camera arm clamps a near hit and never overshoots its target", () => {
    const dt = 1 / 60;
    const near = solveCameraArmDistance(6, 6, 0, dt);
    const clear = solveCameraArmDistance(3, 6, Infinity, dt);

    assert.ok(near >= CAMERA_ARM_MIN);
    assert.ok(near < 6);
    assert.ok(clear > 3 && clear < 6);
});

test("camera arm caps a hitch step instead of teleporting through a rail", () => {
    const oneFrame = solveCameraArmDistance(8, 8, 2, 1 / 60);
    const hitch = solveCameraArmDistance(8, 8, 2, 1);

    assert.ok(hitch > 2, "a long frame still eases inward");
    assert.ok(hitch < oneFrame, "a hitch may correct faster, but remains bounded");
});

test("signature-jump camera bias eases in, stays bounded, and restores", () => {
    const maxBias = 0.46;
    let offset = 0;
    for (let i = 0; i < 30; i++) {
        offset = solveAirFrameOffset(offset, maxBias, 1 / 60);
    }
    assert.ok(offset > 0 && offset < maxBias);

    for (let i = 0; i < 120; i++) {
        offset = solveAirFrameOffset(offset, 0, 1 / 60);
    }
    assert.ok(Math.abs(offset) < 0.01, `restored offset ${offset}`);
});

test("signature-jump framing chooses the shortest heading and caps lateral bias", () => {
    const d = shortestAngleDelta(Math.PI * 1.9, -Math.PI * 1.9);
    assert.ok(Math.abs(d) < 1, `wrapped heading delta ${d}`);
    const capped = solveAirFrameOffset(0, Math.min(0.46, Math.abs(d)), 1 / 60);
    assert.ok(capped > 0 && capped < 0.46);
});

test("Big Air landing aim uses the first controller trajectory/terrain crossing", () => {
    const out = {};
    const aim = predictLandingAim({
        x: 0, y: 9, z: 300, vx: 2, vy: 4, vz: 19,
        groundAt: (x, z) => -0.18 * (z - 300) + x * 0.01,
    }, out);
    assert.equal(aim, out);
    assert.equal(aim.valid, true);
    assert.ok(aim.time > 0.1 && aim.time < 2.0, `flight time ${aim.time}`);
    assert.ok(aim.z > 300, `target z ${aim.z}`);
    const ground = -0.18 * (aim.z - 300) + aim.x * 0.01;
    assert.ok(Math.abs(aim.y - ground - 0.55) < 1e-8);
});

test("landing aim fails closed when the sampled trajectory never meets terrain", () => {
    const out = { valid: true };
    predictLandingAim({
        x: 0, y: 500, z: 300, vx: 0, vy: 0, vz: 1,
        groundAt: () => 0,
    }, out);
    assert.equal(out.valid, false);
});
