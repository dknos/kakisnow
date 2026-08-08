import test from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_BINDINGS, RESERVED_BINDING_KEYS, sanitizeBindings,
    validateBinding, setBinding, resetBindings, getBindingCodes,
} from "../src/core/playerBindings.js";
import {
    InputFamilyTracker, INPUT_FAMILIES, gamepadInputFamily, pointerInputFamily,
} from "../src/core/inputFamily.js";
import { sanitize as sanitizeSettings } from "../src/core/playerSettings.js";
import { ridePrompts } from "../src/ui/inputPrompts.js";
import { feedbackText, FeedbackCooldown, accessibilityCuesEnabled } from "../src/ui/accessibilityFeedback.js";
import { shouldShowIngredientGuide } from "../src/game/ingredientGuide.js";
import { ghostVisibility } from "../src/game/ghostVisibility.js";
import { input, releaseAllInputSources } from "../src/core/input.js";
import { touch } from "../src/core/touchInput.js";
import { menuBackTarget } from "../src/ui/snowBurgersUi.js";

test("keyboard binding safety rejects reserved keys and conflicts", () => {
    const defaults = sanitizeBindings({ version: 1, values: DEFAULT_BINDINGS });
    assert.equal(validateBinding("jump", "Escape", defaults).ok, false);
    assert.equal(validateBinding("jump", "KeyA", defaults).ok, false);
    assert.match(validateBinding("jump", "KeyA", defaults).error, /Steer left/);
    assert.ok(RESERVED_BINDING_KEYS.has("F1"));
    assert.equal(validateBinding("jump", "KeyJ", defaults).ok, true);
});

test("corrupt binding data is repaired to a complete, collision-free map", () => {
    const repaired = sanitizeBindings({ version: 1, values: {
        jump: ["Escape", "KeyJ"], steerLeft: ["KeyJ"],
        recover: 12, debug: ["F1"],
    }});
    const codes = Object.values(repaired).flat();
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(repaired.jump.includes("KeyJ") || repaired.jump.includes("Space"));
    assert.ok(repaired.steerRight.length > 0);
    assert.equal(repaired.debug, undefined);
});

test("bindings reset returns the shipped defaults and mutation remains valid", () => {
    resetBindings();
    assert.deepEqual(getBindingCodes("jump"), DEFAULT_BINDINGS.jump);
    assert.equal(setBinding("recover", "KeyJ").ok, true);
    assert.deepEqual(getBindingCodes("recover"), ["KeyJ"]);
    resetBindings();
    assert.deepEqual(getBindingCodes("recover"), DEFAULT_BINDINGS.recover);
});

test("input family tracker debounces incidental changes", () => {
    const tracker = new InputFamilyTracker({ debounceMs: 100 });
    tracker.note(INPUT_FAMILIES.STANDARD_PAD, 0);
    assert.equal(tracker.family, INPUT_FAMILIES.KEYBOARD_MOUSE);
    tracker.advance(99);
    assert.equal(tracker.family, INPUT_FAMILIES.KEYBOARD_MOUSE);
    tracker.advance(100);
    assert.equal(tracker.family, INPUT_FAMILIES.STANDARD_PAD);
    tracker.note(INPUT_FAMILIES.KEYBOARD_MOUSE, 101);
    assert.equal(tracker.family, INPUT_FAMILIES.STANDARD_PAD);
    tracker.advance(201);
    assert.equal(tracker.family, INPUT_FAMILIES.KEYBOARD_MOUSE);
});

test("input family change subscribers fire only after the debounce window", () => {
    const tracker = new InputFamilyTracker({ debounceMs: 100 });
    const seen = [];
    tracker.onChange((family) => seen.push(family));
    tracker.note(INPUT_FAMILIES.TOUCH, 0);
    tracker.advance(99);
    assert.deepEqual(seen, []);
    tracker.advance(100);
    assert.deepEqual(seen, [INPUT_FAMILIES.TOUCH]);
});

test("confirmed menu/touch activation commits the family immediately", () => {
    const tracker = new InputFamilyTracker({ debounceMs: 140 });
    tracker.activate(INPUT_FAMILIES.TOUCH, 0);
    assert.equal(tracker.family, INPUT_FAMILIES.TOUCH);
    tracker.activate(INPUT_FAMILIES.KEYBOARD_MOUSE, 1);
    assert.equal(tracker.family, INPUT_FAMILIES.KEYBOARD_MOUSE);
});

test("gamepad family uses the device identity, not standard mapping alone", () => {
    assert.equal(gamepadInputFamily({ mapping: "standard", id: "Xbox Wireless Controller" }), INPUT_FAMILIES.STANDARD_PAD);
    assert.equal(gamepadInputFamily({ mapping: "standard", id: "DualSense Wireless Controller" }), INPUT_FAMILIES.GENERIC_PAD);
    assert.equal(gamepadInputFamily({ mapping: "", id: "045e Xbox Controller" }), INPUT_FAMILIES.STANDARD_PAD);
});

test("menu pointer taps and reopened prompts use the current input family", () => {
    assert.equal(pointerInputFamily("mouse"), INPUT_FAMILIES.KEYBOARD_MOUSE);
    assert.equal(pointerInputFamily("touch"), INPUT_FAMILIES.TOUCH);
    assert.equal(pointerInputFamily("pen"), INPUT_FAMILIES.TOUCH);

    const tracker = new InputFamilyTracker({ debounceMs: 0 });
    tracker.note(INPUT_FAMILIES.STANDARD_PAD, 0);
    tracker.advance(0);
    assert.match(ridePrompts(tracker.family).jump, /^A /);
    tracker.note(INPUT_FAMILIES.TOUCH, 1);
    tracker.advance(1);
    assert.equal(ridePrompts(tracker.family).jump, "JUMP");
    assert.deepEqual(menuBackTarget("book"), { attr: "data-action", value: "title" });
    assert.deepEqual(menuBackTarget("sb-book"), { attr: "data-action", value: "title" });
    assert.deepEqual(menuBackTarget("confirm"), { attr: "data-action", value: "confirm-no" });
});

test("settings sanitizer bounds accessibility values and drops unsafe data", () => {
    const safe = sanitizeSettings({ version: 1, values: {
        hudScale: 1.4, ghostOpacity: 0.3, highContrast: true,
        routeAssist: true, ingredientBeacon: false, hazardWarnings: true,
        uiVolume: 0.4,
    }});
    assert.deepEqual(safe, {
        hudScale: 1.4, ghostOpacity: 0.3, highContrast: true,
        routeAssist: true, ingredientBeacon: false, hazardWarnings: true,
        uiVolume: 0.4,
    });
    const unsafe = sanitizeSettings({ version: 1, values: {
        hudScale: 12, ghostOpacity: -2, highContrast: "yes", uiVolume: 2,
    }});
    assert.deepEqual(unsafe, {});
});

test("prompts and captions carry non-colour state for every input family", () => {
    assert.match(ridePrompts(INPUT_FAMILIES.KEYBOARD_MOUSE).jump, /SPACE/i);
    assert.match(ridePrompts(INPUT_FAMILIES.STANDARD_PAD).rocket, /TRIGGER/i);
    assert.equal(ridePrompts(INPUT_FAMILIES.TOUCH).jump, "JUMP");
    assert.match(ridePrompts(INPUT_FAMILIES.GENERIC_PAD).jump, /SOUTH BUTTON/);
    assert.doesNotMatch(ridePrompts(INPUT_FAMILIES.GENERIC_PAD).jump, /SPACE/);
    assert.match(feedbackText("fuel", { level: 0.1 }), /\[FUEL\].*10%/);
    assert.match(feedbackText("landing", { grade: "perfect" }), /LANDING.*PERFECT/);
    const gate = new FeedbackCooldown(100);
    assert.equal(gate.allow("crash", 0), true);
    assert.equal(gate.allow("crash", 50), false);
    assert.equal(gate.allow("crash", 100), true);
    assert.equal(accessibilityCuesEnabled({}), false);
    assert.equal(accessibilityCuesEnabled({ ingredientBeacon: true }), true);
    assert.equal(accessibilityCuesEnabled({ highContrast: true }), true);
});

test("ingredient route guide disappears after collection while the pad remains", () => {
    assert.equal(shouldShowIngredientGuide({ collected: false }, true), true);
    assert.equal(shouldShowIngredientGuide({ collected: true }, true), false);
    assert.equal(shouldShowIngredientGuide({ collected: true }, false), false);
});

test("ghost strength is a bounded mesh visibility value", () => {
    assert.equal(ghostVisibility({ showGhost: false, ghostOpacity: 1 }), 0);
    assert.equal(ghostVisibility({ showGhost: true, ghostOpacity: 0.5 }), 0.5);
    assert.equal(ghostVisibility({ showGhost: true, ghostOpacity: -4 }), 0.25);
    assert.equal(ghostVisibility({ showGhost: true, ghostOpacity: 4 }), 1);
});

test("releaseAllInputSources clears every held keyboard, edge, and touch field", () => {
    Object.assign(input, {
        moveX: 1, moveZ: -1, moving: true, lookX: 1, lookY: -1,
        zoomDelta: 1, surf: true, sprint: true, boost: 1, jumpPressed: true,
        spellPressed: 3, spellHeld2: true, spin: 1, trickMod: true,
        recoverPressed: true,
    });
    Object.assign(touch, {
        active: true, x: 1, y: -1, ride: true, boost: 1, trick: true,
        jump: true, lookX: 1, lookY: 1,
    });
    releaseAllInputSources();
    for (const key of [
        "moveX", "moveZ", "lookX", "lookY", "zoomDelta", "boost",
        "spellPressed", "spin",
    ]) assert.equal(input[key], 0, key);
    for (const key of [
        "moving", "surf", "sprint", "jumpPressed", "spellHeld2",
        "trickMod", "recoverPressed",
    ]) {
        assert.equal(input[key], false, key);
    }
    assert.equal(touch.active, false);
    assert.equal(touch.x, 0);
    assert.equal(touch.ride, false);
    assert.equal(touch.jump, false);
});
