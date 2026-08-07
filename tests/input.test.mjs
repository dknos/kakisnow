import test from "node:test";
import assert from "node:assert/strict";

import {
    applyRadialDeadzone,
    endFrame,
    initInput,
    input,
    pollInput,
    sampleGamepad,
} from "../src/core/input.js";
import { touch } from "../src/core/touchInput.js";
import { S } from "../src/core/settings.js";

const listeners = new Map();
const emit = (target, type, event) => {
    const fn = listeners.get(`${target}:${type}`);
    fn?.(event);
};

// input.js only touches the DOM when initInput is called. A tiny event surface
// lets these tests drive the same key/poll path as the browser without a
// renderer or a synthetic replacement for the input module.
globalThis.window = {
    addEventListener(type, fn) { listeners.set(`window:${type}`, fn); },
};
globalThis.document = {
    pointerLockElement: null,
    addEventListener(type, fn) { listeners.set(`document:${type}`, fn); },
};
initInput({
    addEventListener() {},
    requestPointerLock() {},
});

let pads = [];
navigator.getGamepads = () => pads;

function button(value = 0, pressed = value > 0.08) {
    return { value, pressed };
}

function fakePad({
    axes = [0, 0, 0, 0],
    south = false,
    east = false,
    west = false,
    left = false,
    right = false,
    leftTrigger = 0,
    rightTrigger = 0,
    connected = true,
} = {}) {
    const buttons = Array.from({ length: 8 }, () => button());
    buttons[0] = button(south ? 1 : 0, south);
    buttons[1] = button(east ? 1 : 0, east);
    buttons[2] = button(west ? 1 : 0, west);
    buttons[4] = button(left ? 1 : 0, left);
    buttons[5] = button(right ? 1 : 0, right);
    buttons[6] = button(leftTrigger, leftTrigger > 0.08);
    buttons[7] = button(rightTrigger, rightTrigger > 0.08);
    return { connected, axes, buttons };
}

function reset() {
    pads = [];
    touch.x = 0;
    touch.y = 0;
    touch.ride = false;
    touch.boost = 0;
    touch.jump = false;
    touch.lookX = 0;
    touch.lookY = 0;
    input.moveX = 0;
    input.moveZ = 0;
    input.moving = false;
    input.surf = false;
    input.sprint = false;
    input.boost = 0;
    input.jumpPressed = false;
    input.lookX = 0;
    input.lookY = 0;
    input.spin = 0;
    input.trickMod = false;
    input.recoverPressed = false;
    S.invertY = false;
    endFrame();
}

test("radial deadzone rejects worn-stick noise and preserves a unit diagonal", () => {
    const noise = {};
    applyRadialDeadzone(0.10, 0.10, 0.18, noise);
    assert.deepEqual(noise, { x: 0, y: 0 });

    const diagonal = {};
    applyRadialDeadzone(0.6, 0.8, 0.18, diagonal);
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
    assert.ok(diagonal.x > 0 && diagonal.y > 0);
});

test("sampleGamepad maps the standard controls without browser state", () => {
    const sample = {};
    sampleGamepad(fakePad({
        axes: [0.6, -0.8, 0.4, -0.2],
        south: true, east: true, west: true,
        left: true, right: true, leftTrigger: 0.7, rightTrigger: 0.55,
    }), sample);

    assert.equal(sample.connected, true);
    assert.ok(Math.abs(sample.moveX - 0.6) < 1e-9);
    assert.ok(Math.abs(sample.moveZ - 0.8) < 1e-9);
    const lookScale = (Math.hypot(0.4, 0.2) - 0.18) / (1 - 0.18);
    const lookRadius = Math.hypot(0.4, 0.2);
    assert.ok(Math.abs(sample.lookX - (0.4 / lookRadius) * lookScale) < 1e-9);
    assert.ok(Math.abs(sample.lookY + (0.2 / lookRadius) * lookScale) < 1e-9);
    assert.equal(sample.surf, true);
    assert.equal(sample.boost, 0.55);
    assert.equal(sample.jump, true);
    assert.equal(sample.spin, 0);
    assert.equal(sample.trickMod, true);
    assert.equal(sample.recover, true);

    const quiet = {};
    sampleGamepad(fakePad({ leftTrigger: 0.03, rightTrigger: 0.03 }), quiet);
    assert.equal(quiet.surf, false);
    assert.equal(quiet.boost, 0);
});

test("poll path rides the left stick, bounds diagonals, and disconnect releases it", () => {
    reset();
    pads = [fakePad({ axes: [0.6, -0.8] })];
    pollInput(1 / 60);
    assert.ok(Math.abs(input.moveX - 0.6) < 1e-9);
    assert.ok(Math.abs(input.moveZ - 0.8) < 1e-9);
    assert.ok(Math.hypot(input.moveX, input.moveZ) <= 1 + 1e-9);
    assert.equal(input.moving, true);

    pads = [null];
    pollInput(1 / 60);
    assert.equal(input.moveX, 0);
    assert.equal(input.moveZ, 0);
    assert.equal(input.moving, false);
});

test("touch keeps priority, and a weaker pad does not steal a full keyboard vector", () => {
    reset();
    emit("window", "keydown", { code: "KeyW", repeat: false, preventDefault() {} });
    pads = [fakePad({ axes: [0.12, -0.12] })];
    pollInput(1 / 60);
    assert.equal(input.moveX, 0);
    assert.equal(input.moveZ, 1);

    touch.x = -0.4;
    touch.y = 0.2;
    pollInput(1 / 60);
    assert.equal(input.moveX, -0.4);
    assert.equal(input.moveZ, 0.2);
    emit("window", "keyup", { code: "KeyW" });
});

test("south and east pad buttons are edge actions, while LT ride and RT boost are held", () => {
    reset();
    pads = [fakePad({ south: true, east: true, leftTrigger: 0.7, rightTrigger: 0.45 })];
    pollInput(1 / 60);
    assert.equal(input.jumpPressed, true);
    assert.equal(input.recoverPressed, true);
    assert.equal(input.surf, true);
    assert.equal(input.boost, 0.45);

    endFrame();
    pollInput(1 / 60);
    assert.equal(input.jumpPressed, false);
    assert.equal(input.recoverPressed, false);
    assert.equal(input.surf, true);

    pads = [fakePad({ leftTrigger: 0, rightTrigger: 0 })];
    pollInput(1 / 60);
    assert.equal(input.surf, false);
    assert.equal(input.boost, 0);
});

test("external surf writes survive an idle poll but pad disconnect wins its release", () => {
    reset();
    input.surf = true;
    pollInput(1 / 60);
    assert.equal(input.surf, true);

    pads = [fakePad({ leftTrigger: 1 })];
    pollInput(1 / 60);
    assert.equal(input.surf, true);
    pads = [];
    pollInput(1 / 60);
    assert.equal(input.surf, false);
});

test("right-stick look is frame-rate independent and respects invert Y", () => {
    const totals = [];
    for (const hz of [30, 60, 120]) {
        reset();
        pads = [fakePad({ axes: [0, 0, 0.8, -0.6] })];
        let yaw = 0;
        let pitch = 0;
        for (let i = 0; i < hz; i++) {
            pollInput(1 / hz);
            yaw += input.lookX;
            pitch += input.lookY;
            endFrame();
        }
        totals.push({ yaw, pitch });
    }

    for (const result of totals) {
        assert.ok(Math.abs(result.yaw - totals[0].yaw) < 1e-9);
        assert.ok(Math.abs(result.pitch - totals[0].pitch) < 1e-9);
    }
    assert.ok(Math.abs(totals[0].yaw - 2.4) < 1e-9);
    assert.ok(Math.abs(totals[0].pitch + 1.8) < 1e-9);

    reset();
    S.invertY = true;
    pads = [fakePad({ axes: [0, 0, 0, -0.6] })];
    pollInput(1 / 60);
    assert.ok(input.lookY > 0);
});

test("south button only jumps on a new press and pressing again after release works", () => {
    reset();
    pads = [fakePad({ south: true })];
    pollInput(1 / 60);
    assert.equal(input.jumpPressed, true);
    endFrame();
    pollInput(1 / 60);
    assert.equal(input.jumpPressed, false);
    pads = [fakePad({ south: false })];
    pollInput(1 / 60);
    endFrame();
    pads = [fakePad({ south: true })];
    pollInput(1 / 60);
    assert.equal(input.jumpPressed, true);
});
