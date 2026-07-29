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

test("airborne riders do not emit gait footfalls", () => {
    resetInput();
    const controller = new CharacterController(new FlatTerrain());
    controller.position = new Vector3(0, 0, 0);
    input.jumpPressed = true;
    controller.update(1 / 60, rig);

    assert.equal(controller.stepping, false);
    assert.equal(controller.footfall, false);
});
