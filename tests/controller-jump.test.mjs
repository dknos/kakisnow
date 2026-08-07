import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CharacterController } from "../src/character/controller.js";
import { input } from "../src/core/input.js";

class FlatTerrain {
    heightAt() {
        return 0;
    }

    normalAt(_x, _z, out) {
        return out.set(0, 1, 0);
    }
}

class KickerTerrain {
    heightAt(_x, z) {
        if (z <= 2) return z * 0.62;
        if (z < 2.22) return 1.24 - (z - 2) * 5.4;
        return 0.052;
    }

    normalAt(x, z, out) {
        const e = 0.01;
        const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
        const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        return out.set(-hx, 2 * e, -hz).normalize();
    }
}

class SteepDownhillTerrain {
    heightAt(_x, z) {
        return -z * 1.2;
    }

    normalAt(_x, _z, out) {
        return out.set(0, 1, 1.2).normalize();
    }
}

class SteepLinearTerrain {
    heightAt(_x, z) {
        return -1.8 * z;
    }

    normalAt(_x, _z, out) {
        return out.set(0, 1, 1.8).normalize();
    }
}

class AbruptDownhillTerrain {
    heightAt(_x, z) {
        return z < 2 ? 0 : -3;
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
    input.jumpPressed = false;
}

test("Space produces a ballistic jump and a single grounded landing", () => {
    resetInput();
    rig.trauma = 0;
    const controller = new CharacterController(new FlatTerrain());
    controller.position.set(0, 0, 0);

    input.jumpPressed = true;
    controller.update(1 / 60, rig);
    input.jumpPressed = false;

    assert.equal(controller.grounded, false);
    assert.equal(controller.airborne, true);
    assert.ok(controller.position.y > 0);
    assert.ok(controller.verticalVelocity > 6);

    let apex = controller.position.y;
    let landings = 0;
    for (let i = 0; i < 180; i++) {
        controller.update(1 / 60, rig);
        apex = Math.max(apex, controller.position.y);
        if (controller.landed) landings++;
    }

    assert.ok(apex > 1.2, `expected a readable apex, got ${apex}`);
    assert.equal(landings, 1);
    assert.equal(controller.grounded, true);
    assert.equal(controller.position.y, 0);
    assert.ok(rig.trauma > 0);
});

test("a fast surf run naturally leaves a kicker instead of snapping down", () => {
    resetInput();
    const terrain = new KickerTerrain();
    const controller = new CharacterController(terrain);
    controller.position.set(0, terrain.heightAt(0, 1.72), 1.72);
    controller.velocity.set(0, 0, 11);
    controller.surf = 1;
    input.surf = true;

    let tookOff = false;
    for (let i = 0; i < 18; i++) {
        controller.update(1 / 60, rig);
        if (!controller.grounded) {
            tookOff = true;
            break;
        }
    }

    assert.equal(tookOff, true);
    assert.ok(controller.verticalVelocity > 0);
    assert.ok(controller.position.y > controller.groundY);
});

test("a natural takeoff consumes coyote time instead of double-launching", () => {
    resetInput();
    const terrain = new KickerTerrain();
    const controller = new CharacterController(terrain);
    controller.position.set(0, terrain.heightAt(0, 1.72), 1.72);
    controller.velocity.set(0, 0, 11);
    controller.surf = 1;
    input.surf = true;

    for (let i = 0; i < 18 && !controller.airborne; i++) {
        controller.update(1 / 60, rig);
    }
    assert.equal(controller.airborne, true);
    assert.equal(controller.jumpCount, 1);
    const launchVelocity = controller.verticalVelocity;

    // A buffered input immediately after the lip must not create a second
    // impulse. Coyote time still applies to leaving ordinary snow; a natural
    // takeoff is already the jump the terrain authored.
    input.jumpPressed = true;
    controller.update(1 / 60, rig);
    input.jumpPressed = false;

    assert.equal(controller.jumpCount, 1);
    assert.ok(controller.verticalVelocity < launchVelocity);
});

function runKickerAtRate(hz) {
    resetInput();
    rig.trauma = 0;
    const terrain = new KickerTerrain();
    const controller = new CharacterController(terrain);
    controller.position.set(0, terrain.heightAt(0, 1.72), 1.72);
    controller.velocity.set(0, 0, 11);
    controller.surf = 1;
    input.surf = true;

    let launchFrame = -1;
    let launchVelocity = 0;
    let launchClearance = 0;
    let apex = controller.position.y;
    let landingAirTime = null;
    for (let frame = 0; frame < 300; frame++) {
        controller.update(1 / hz, rig);
        apex = Math.max(apex, controller.position.y);
        if (controller.airborne && launchFrame < 0) {
            launchFrame = frame;
            launchVelocity = controller.verticalVelocity;
            launchClearance = controller.position.y - controller.groundY;
        }
        if (controller.landed) {
            landingAirTime = controller.landingAirTime;
            break;
        }
    }
    return {
        hz,
        launchFrame,
        launchVelocity,
        launchClearance,
        apex,
        landingAirTime,
        jumpCount: controller.jumpCount,
    };
}

function runKickerFromPhase(startZ, hz) {
    resetInput();
    rig.trauma = 0;
    const terrain = new KickerTerrain();
    const controller = new CharacterController(terrain);
    controller.position.set(0, terrain.heightAt(0, startZ), startZ);
    controller.velocity.set(0, 0, 11);
    controller.surf = 1;
    input.surf = true;

    let launchFrame = -1;
    let launchVelocity = 0;
    let launchClearance = Infinity;
    let minAirClearance = Infinity;
    let landings = 0;
    for (let frame = 0; frame < 300; frame++) {
        controller.update(1 / hz, rig);
        if (controller.airborne) {
            if (launchFrame < 0) {
                launchFrame = frame;
                launchVelocity = controller.verticalVelocity;
                launchClearance = controller.position.y - controller.groundY;
            }
            minAirClearance = Math.min(
                minAirClearance,
                controller.position.y - controller.groundY,
            );
        }
        if (controller.landed) landings++;
    }
    return {
        startZ,
        hz,
        launchFrame,
        launchVelocity,
        launchClearance,
        minAirClearance,
        landings,
        jumpCount: controller.jumpCount,
    };
}

function runNoLaunchCase(Terrain, startZ, hz) {
    resetInput();
    const terrain = new Terrain();
    const controller = new CharacterController(terrain);
    controller.position.set(0, terrain.heightAt(0, startZ), startZ);
    controller.velocity.set(0, 0, 11);
    controller.surf = 1;
    input.surf = true;
    for (let frame = 0; frame < 120; frame++) controller.update(1 / hz, rig);
    return { Terrain, startZ, hz, jumpCount: controller.jumpCount, airborne: controller.airborne };
}

test("swept natural takeoff launches the narrow lip consistently at render rates", () => {
    const rates = [30, 45, 60, 90, 120].map(runKickerAtRate);
    for (const result of rates) {
        assert.ok(result.launchFrame >= 0, `${result.hz} Hz missed the lip`);
        assert.equal(result.jumpCount, 1, `${result.hz} Hz double-launched`);
        assert.ok(result.launchVelocity > 0, `${result.hz} Hz launch was not upward`);
        assert.ok(result.launchClearance > 0, `${result.hz} Hz launch intersected ground`);
        assert.ok(result.landingAirTime > 0.5, `${result.hz} Hz did not complete a flight`);
    }
    const apexes = rates.map((result) => result.apex);
    const airtimes = rates.map((result) => result.landingAirTime);
    assert.ok(
        Math.max(...apexes) - Math.min(...apexes) < 0.35,
        `apex variance too large: ${apexes.join(", ")}`
    );
    assert.ok(
        Math.max(...airtimes) - Math.min(...airtimes) < 0.08,
        `airtime variance too large: ${airtimes.join(", ")}`
    );
});

test("phase-independent lip sweep catches every 30 Hz KickerTerrain start phase", () => {
    for (let i = 0; i <= 80; i++) {
        const result = runKickerFromPhase(1.6 + i * 0.005, 30);
        assert.equal(result.jumpCount, 1, `z=${result.startZ} did not launch exactly once`);
        assert.ok(result.launchVelocity > 0, `z=${result.startZ} launched downward`);
        assert.ok(result.launchClearance > 0, `z=${result.startZ} passed through the lip`);
        assert.ok(
            result.minAirClearance >= -1e-6,
            `z=${result.startZ} passed through terrain by ${result.minAirClearance}`
        );
        assert.equal(result.landings, 1, `z=${result.startZ} had ${result.landings} landings`);
    }
});

test("59/60/61 Hz boundary remains continuous at the same lip phase", () => {
    for (const hz of [59, 60, 61]) {
        const result = runKickerFromPhase(1.84, hz);
        assert.equal(result.jumpCount, 1, `${hz} Hz missed or repeated the launch`);
        assert.ok(result.launchVelocity > 0, `${hz} Hz launch was not upward`);
        assert.ok(result.minAirClearance >= -1e-6, `${hz} Hz passed through terrain`);
        assert.equal(result.landings, 1, `${hz} Hz had ${result.landings} landings`);
    }
});

test("flat, steep-linear, and abrupt downhill sweeps do not invent a lip", () => {
    const terrains = [FlatTerrain, SteepLinearTerrain, AbruptDownhillTerrain];
    const rates = [30, 45, 60, 90, 120];
    const phases = [1.6, 1.84, 2.0];
    for (const Terrain of terrains) {
        for (const hz of rates) {
            for (const startZ of phases) {
                const result = runNoLaunchCase(Terrain, startZ, hz);
                assert.equal(
                    result.jumpCount,
                    0,
                    `${Terrain.name} ${hz} Hz z=${startZ} invented a jump`
                );
                assert.equal(
                    result.airborne,
                    false,
                    `${Terrain.name} ${hz} Hz z=${startZ} stayed airborne`
                );
            }
        }
    }
});

test("pre-lip sweep leaves ordinary flat snow unchanged", () => {
    for (const hz of [30, 45, 60, 90, 120]) {
        resetInput();
        const controller = new CharacterController(new FlatTerrain());
        controller.position.set(0, 0, 0);
        controller.velocity.set(0, 0, 11);
        controller.surf = 1;
        input.surf = true;
        controller.update(1 / hz, rig);
        assert.equal(controller.grounded, true, `${hz} Hz flat snow launched`);
        assert.equal(controller.jumpCount, 0, `${hz} Hz flat snow counted a jump`);
    }
});

test("jump pressed during a crash is not carried into recovery", () => {
    resetInput();
    const controller = new CharacterController(new FlatTerrain());
    controller.position.set(0, 0, 0);
    controller.forceCrash();

    // The late press is the important case: _startCrash cannot clear a
    // buffer that is refreshed after the tumble has already begun.
    for (let i = 0; i < 52; i++) controller.update(1 / 60, rig);
    input.jumpPressed = true;
    controller.update(1 / 60, rig);
    input.jumpPressed = false;
    for (let i = 0; i < 18; i++) controller.update(1 / 60, rig);
    assert.equal(controller.needsRecovery, true);
    controller.finishCrash(0, 0, 0, 0);
    controller.update(1 / 60, rig);

    assert.equal(controller.jumpCount, 0);
    assert.equal(controller.grounded, true);
});

test("airborne riders do not emit gait footfalls", () => {
    resetInput();
    const controller = new CharacterController(new FlatTerrain());
    controller.position = new Vector3(0, 0, 0);
    input.jumpPressed = true;
    controller.update(1 / 60, rig);

    assert.equal(controller.stepping, false);
    assert.equal(controller.footfall, false);
});

test("downhill slope assist accelerates forward instead of reversing", () => {
    resetInput();
    const terrain = new SteepDownhillTerrain();
    const controller = new CharacterController(terrain);
    controller.position.set(0, terrain.heightAt(0, 0), 0);
    controller.velocity.set(0, 0, 8);
    controller.surf = 1;
    input.surf = true;

    for (let i = 0; i < 120; i++) {
        controller.update(1 / 60, rig);
        assert.ok(
            controller.velocity.z > 0,
            `rider reversed on downhill at frame ${i}`
        );
    }

    assert.ok(controller.position.z > 25);
    assert.ok(controller.velocity.z > 12);
});
