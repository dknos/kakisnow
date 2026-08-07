import test from "node:test";
import assert from "node:assert/strict";

import { CharacterController } from "../src/character/controller.js";
import { input } from "../src/core/input.js";
import { BIG_AIR_BASIN } from "../src/game/courses/bigAirBasin.js";
import {
    RocketThrust, isCleanLandingForRefill, refillForCleanLanding,
} from "../src/vehicles/rocketThrust.js";

class FlatTerrain {
    heightAt() {
        return 0;
    }

    normalAt(_x, _z, out) {
        return out.set(0, 1, 0);
    }
}

const rig = {
    yaw: 0,
    trauma: 0,
    getFlatForward(out) {
        return out.set(0, 0, 1);
    },
    getFlatRight(out) {
        return out.set(1, 0, 0);
    },
    addTrauma(amount) {
        this.trauma += amount;
    },
};

function resetInput() {
    input.moveX = 0;
    input.moveZ = 0;
    input.moving = false;
    input.surf = false;
    input.sprint = false;
    input.boost = 0;
    input.jumpPressed = false;
    input.spin = 0;
    input.trickMod = false;
}

function runAuthoredProbe({ hz, x = 0, z = 300, vx = 0, vz = 10 }) {
    resetInput();
    input.surf = true;
    const controller = new CharacterController(new FlatTerrain());
    controller.setTakeoffAssist({
        jump: BIG_AIR_BASIN.terrain.skiJumps[0],
        laneHalf: BIG_AIR_BASIN.terrain.laneHalf,
    });
    controller.position.set(x, 0, z);
    controller.velocity.set(vx, 0, vz);
    controller.surf = 1;
    controller.update(1 / hz, rig);
    return controller;
}

test("Big Air authored launch captures centered and mild lateral approaches", () => {
    resetInput();
    const jump = BIG_AIR_BASIN.terrain.skiJumps[0];
    assert.deepEqual(jump.launchCapture, {
        from: 298,
        to: 304,
        xHalf: 24,
        minSpeed: 7.5,
        launchRise: 8.5,
    });

    for (const hz of [30, 60]) {
        for (const x of [0, -18, 18]) {
            const controller = new CharacterController(new FlatTerrain());
            controller.setTakeoffAssist({
                jump,
                laneHalf: BIG_AIR_BASIN.terrain.laneHalf,
            });
            controller.position.set(x, 0, 297.9);
            controller.velocity.set(0, 0, 10);
            controller.surf = 1;
            input.surf = true;

            controller.update(1 / hz, rig);

            assert.equal(controller.airborne, true, `${hz} Hz x=${x} did not launch`);
            assert.equal(controller.grounded, false, `${hz} Hz x=${x} remained grounded`);
            assert.equal(controller.jumpCount, 1, `${hz} Hz x=${x} double-launched`);
            // The authored 8.5 m/s rise is integrated for this render step;
            // 30 Hz therefore reports 7.883 m/s after gravity, while 60 Hz
            // reports 8.192 m/s. Both retain the signature launch.
            assert.ok(controller.verticalVelocity > 7.7, `${hz} Hz x=${x} launch rise was not authored`);
        }
    }
});

test("Big Air authored capture follows the actual segment across dense phases and rates", () => {
    for (const hz of [30, 45, 60, 90, 120]) {
        for (let i = 0; i <= 59; i++) {
            const z = 298 + i * 0.1;
            const controller = runAuthoredProbe({ hz, z });
            assert.equal(controller.airborne, true, `${hz} Hz z=${z} missed capture`);
            assert.equal(controller.grounded, false, `${hz} Hz z=${z} stayed grounded`);
            assert.equal(controller.jumpCount, 1, `${hz} Hz z=${z} double-launched`);
            assert.ok(controller.verticalVelocity > 0, `${hz} Hz z=${z} launch was not upward`);
        }
    }
});

test("Big Air authored capture includes lane-edge crossings but rejects non-intersections", () => {
    for (const hz of [30, 45, 60, 90, 120]) {
        for (const [x, vx, side] of [[24.1, -30, "right"], [-24.1, 30, "left"]]) {
            const controller = runAuthoredProbe({ hz, x, vx, z: 303.9 });
            assert.equal(controller.airborne, true, `${hz} Hz ${side} lane crossing missed`);
            assert.equal(controller.jumpCount, 1, `${hz} Hz ${side} lane crossing repeated`);
        }

        const farOutside = runAuthoredProbe({ hz, z: 304.01 });
        assert.equal(farOutside.airborne, false, `${hz} Hz far-outside segment launched`);
        assert.equal(farOutside.jumpCount, 0, `${hz} Hz far-outside segment counted a jump`);

        const laneOutside = runAuthoredProbe({ hz, x: 24.2, vx: -20, z: 303.9 });
        assert.equal(laneOutside.airborne, false, `${hz} Hz non-intersecting lane segment launched`);
        assert.equal(laneOutside.jumpCount, 0, `${hz} Hz non-intersecting lane counted a jump`);
    }
});

test("the Big Air capture does not change ordinary non-Big-Air ground feel", () => {
    resetInput();
    const controller = new CharacterController(new FlatTerrain());
    controller.setTakeoffAssist(null);
    controller.position.set(0, 0, 297.9);
    controller.velocity.set(0, 0, 10);
    controller.surf = 1;
    input.surf = true;

    controller.update(1 / 60, rig);

    assert.equal(controller.airborne, false);
    assert.equal(controller.grounded, true);
});

test("touchdown preserves and consumes airtime for exactly one rocket refill check", () => {
    resetInput();
    const controller = new CharacterController(new FlatTerrain());
    controller.position.set(0, 0, 0);
    input.jumpPressed = true;
    controller.update(1 / 60, rig);
    input.jumpPressed = false;

    let landing = null;
    for (let i = 0; i < 180; i++) {
        controller.update(1 / 60, rig);
        if (controller.landed) {
            landing = controller.landingAirTime;
            break;
        }
    }

    assert.ok(landing > 0.35, `expected a flown landing, got ${landing}`);
    assert.equal(controller.airTime, 0, "airTime should remain the post-touchdown value");
    assert.equal(isCleanLandingForRefill(controller, landing), true);
    assert.equal(controller.consumeLandingAirTime(), landing);
    assert.equal(controller.consumeLandingAirTime(), 0, "landing refill latch repeated");
    controller.landingImpact = 1.1;
    assert.equal(isCleanLandingForRefill(controller, landing), false);
});

test("rocket clean landing refill consumes its latch once", () => {
    const thrust = new RocketThrust();
    thrust.fuel = 1;
    let pending = 0.5;
    const controller = {
        landed: true,
        landingImpact: 0.8,
        landingClean: true,
        consumeLandingAirTime() {
            const value = pending;
            pending = 0;
            return value;
        },
    };

    assert.equal(refillForCleanLanding(thrust, controller), true);
    assert.equal(thrust.refills, 1);
    assert.ok(thrust.fuel > 1);
    assert.equal(refillForCleanLanding(thrust, controller), false);
    assert.equal(thrust.refills, 1);
});
