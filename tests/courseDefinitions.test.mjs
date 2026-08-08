/**
 * Every course and event definition validates, and the registries stay
 * cross-consistent — the loud-in-development guarantee, held in CI shape.
 *
 * The validators are also exercised negatively: a validator that never
 * rejects anything is a comment, not a validator.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COURSES, getCourse, DEFAULT_COURSE_ID } from "../src/game/courses/index.js";
import { validateCourse, validateEvent } from "../src/game/courses/validate.js";
import { EVENTS, getEvent, courseForEvent } from "../src/game/courses/eventRegistry.js";
import { SUMMIT_LINE } from "../src/game/courses/summitLine.js";
import { encodeCoursePrimitives } from "../src/game/courses/encode.js";
import { tourState, assertTourCoversCourses } from "../src/game/progression.js";
import { BIG_AIR_BASIN } from "../src/game/courses/bigAirBasin.js";
import {
    JUMPS, PIPES, BASE_CAMP_Z, COURSE_FINISH_Z, LANE_HALF, ZONES,
} from "../src/game/ingredientPlacement.js";

// --------------------------------------------------------------------- tour

/**
 * The title menu lists `Object.values(COURSES)` and asks the tour whether each
 * is unlocked. A course with no tour entry renders LOCKED, with an empty
 * reason, and no play can ever open it — which is how Big Air Basin first
 * shipped: reachable only by typing `?course=` into the address bar.
 */
test("the Burger Tour has an entry for every registered course", () => {
    const tour = tourState({});
    for (const id of Object.keys(COURSES)) {
        assert.ok(tour[id], `no tour entry for "${id}"`);
        assert.ok(
            tour[id].unlocked || tour[id].reason,
            `"${id}" is locked with no stated way to unlock it`
        );
    }
    assert.doesNotThrow(() => assertTourCoversCourses(COURSES));
});

test("the tour coverage check rejects a registry it does not cover", () => {
    assert.throws(
        () => assertTourCoversCourses({ ...COURSES, "kaki-alps": {} }),
        /missing from the Burger Tour/
    );
});

// -------------------------------------------------------------------- venue

/**
 * `venue.js` steps `for (z = zFrom; z <= zTo; z += spacing)`. A spacing of
 * zero, or a mistyped key that reads `undefined` and steps by NaN, hangs the
 * tab inside the loading screen rather than failing at load like every other
 * course subsystem.
 */
test("validateCourse rejects a venue that would hang the builder", () => {
    const bad = (venue) => validateCourse({ ...BIG_AIR_BASIN, venue });
    const stands = BIG_AIR_BASIN.venue.stands;
    assert.ok(
        bad({ stands: { ...stands, spacing: 0 } })
            .some(m => /venue.stands needs a positive spacing/.test(m))
    );
    assert.ok(
        bad({ stands: { ...stands, spacing: undefined } })
            .some(m => /venue.stands needs a positive spacing/.test(m))
    );
    assert.ok(
        bad({ stands: { ...stands, zFrom: 600, zTo: 300 } })
            .some(m => /venue.stands span is inverted/.test(m))
    );
    assert.ok(
        bad({ lift: { ...BIG_AIR_BASIN.venue.lift, pylons: 0 } })
            .some(m => /venue.lift needs a positive pylons/.test(m))
    );
    // The shipped block is, of course, fine.
    assert.deepEqual(validateCourse(BIG_AIR_BASIN), []);
});

// ------------------------------------------------------------------ registry

test("every registered course validates", () => {
    for (const course of Object.values(COURSES)) {
        assert.deepEqual(validateCourse(course), [], course.id);
    }
    assert.ok(COURSES[DEFAULT_COURSE_ID]);
});

test("every registered event validates against its course", () => {
    for (const event of Object.values(EVENTS)) {
        const course = getCourse(event.courseId);
        assert.deepEqual(validateEvent(event, course), [], event.id);
        assert.ok(course.events.includes(event.id),
            `${event.id} missing from ${course.id}'s event list`);
    }
});

test("every course's event list resolves, in both directions", () => {
    for (const course of Object.values(COURSES)) {
        for (const id of course.events) {
            assert.equal(getEvent(id).courseId, course.id);
            assert.equal(courseForEvent(id), course);
        }
    }
});

test("unknown ids throw rather than return undefined", () => {
    assert.throws(() => getCourse("mount-doom"));
    assert.throws(() => getEvent("the-lava-special"));
});

// ------------------------------------------- the one-source-of-truth contract

test("ingredientPlacement's compat exports are views of the Summit definition", () => {
    assert.equal(JUMPS, SUMMIT_LINE.terrain.jumps);
    assert.equal(PIPES, SUMMIT_LINE.terrain.pipes);
    assert.equal(ZONES, SUMMIT_LINE.zones);
    assert.equal(BASE_CAMP_Z, SUMMIT_LINE.baseCampZ);
    assert.equal(COURSE_FINISH_Z, SUMMIT_LINE.finishZ);
    assert.equal(LANE_HALF, SUMMIT_LINE.terrain.laneHalf);
});

test("the Summit definition still describes the shipped course", () => {
    // The numbers records and ghosts were earned on. If a deliberate course
    // change moves them, bump SUMMIT_LINE.version in the same commit so old
    // ghosts refuse to race the new mountain.
    assert.deepEqual(SUMMIT_LINE.terrain.jumps.map((j) => j.lip), [50, 184, 496]);
    assert.deepEqual(
        SUMMIT_LINE.terrain.jumps.map((j) => j.height), [1.55, 1.80, 1.75]);
    assert.deepEqual(
        SUMMIT_LINE.terrain.pipes.map((p) => [p.from, p.to]),
        [[292, 370], [410, 450]]);
    assert.equal(SUMMIT_LINE.finishZ, 520);
    assert.equal(SUMMIT_LINE.baseCampZ, 548);
    assert.equal(SUMMIT_LINE.version, 2);
});

// -------------------------------------------------------------- the encoding

test("course primitives encode into the bake texture layout", () => {
    const data = new Float32Array(4 * 32 * 4);
    const rows = encodeCoursePrimitives(SUMMIT_LINE.terrain, data);
    assert.equal(rows, 5); // three jumps + two pipes

    // A Float32Array stores the nearest f32 — which is exactly what the GPU
    // sees, so the expectations are frounded, not "fixed".
    const f = Math.fround;

    // Row 0, first jump: kind 1, lip 50, runIn 22, drop 20; height 1.55.
    assert.deepEqual([...data.slice(0, 4)], [1, 50, 22, 20]);
    assert.equal(data[4], f(1.55));

    // Row 3, first pipe: kind 2, fade 270→292, span to 370; out-fade to 394.
    const p = 3 * 4 * 4;
    assert.deepEqual([...data.slice(p, p + 4)], [2, 270, 292, 370]);
    assert.deepEqual([...data.slice(p + 4, p + 8)], [394, 5, 21, f(4.4)]);
    // pack, falloff, lateral gate.
    assert.deepEqual([...data.slice(p + 8, p + 12)], [f(0.24), f(0.008), 27, 40]);

    // Row 4, second pipe: fades 388→410, out 450→470, amp 4.0.
    const q = 4 * 4 * 4;
    assert.deepEqual([...data.slice(q, q + 4)], [2, 388, 410, 450]);
    assert.equal(data[q + 4], 470);
    assert.equal(data[q + 7], 4.0);
});

test("encoding rejects a course with more primitives than the texture holds", () => {
    const jumps = Array.from({ length: 33 }, (_, i) => (
        { lip: i * 10, runIn: 5, drop: 5, height: 1 }
    ));
    const data = new Float32Array(4 * 32 * 4);
    assert.throws(() => encodeCoursePrimitives({ jumps, pipes: [] }, data));
});

// ---------------------------------------------------------------- validators

function cloneSummit() {
    return JSON.parse(JSON.stringify(SUMMIT_LINE));
}

test("validateCourse rejects each class of malformed course", () => {
    const cases = [
        ["no finish", (c) => { c.finishZ = c.startZ; }],
        ["camp before finish", (c) => { c.baseCampZ = c.finishZ - 1; }],
        ["outside play radius", (c) => { c.baseCampZ = 1000; }],
        ["inverted gate", (c) => { c.terrain.gate.zInFrom = 0; c.terrain.gate.zInTo = -50; }],
        ["malformed jump", (c) => { c.terrain.jumps[0].runIn = 0; }],
        ["inverted pipe", (c) => { c.terrain.pipes[0].to = c.terrain.pipes[0].from - 1; }],
        ["zone out of course", (c) => { c.zones.cheese.z = [400, 900]; }],
        ["zone out of lane", (c) => { c.zones.cheese.x = [-200, 200]; }],
        ["unordered features", (c) => { c.features[1].z = -5; }],
        ["no events", (c) => { c.events = []; }],
        ["no dressing seed", (c) => { delete c.dressing; }],
        ["missing version", (c) => { delete c.version; }],
    ];
    for (const [name, mutate] of cases) {
        const c = cloneSummit();
        mutate(c);
        assert.ok(validateCourse(c).length > 0, `expected rejection: ${name}`);
    }
});

test("validateEvent rejects each class of malformed event", () => {
    const course = SUMMIT_LINE;
    const base = () => ({
        id: "x", version: 1, courseId: course.id, name: "X",
        mode: "delivery", required: ["cheese"], seedPolicy: "random",
        allowedVehicles: ["classic-snowboard"], forcedVehicle: null,
        medals: { gold: 30, silver: 40, bronze: 50 },
    });
    const cases = [
        ["wrong course", (e) => { e.courseId = "elsewhere"; }],
        ["unknown mode", (e) => { e.mode = "battle-royale"; }],
        ["ingredient without a zone", (e) => { e.required = ["pickle"]; }],
        ["unknown vehicle", (e) => { e.allowedVehicles = ["hovercraft"]; }],
        ["inverted medals", (e) => { e.medals = { gold: 50, silver: 40, bronze: 30 }; }],
        ["fixed seed without a seed", (e) => { e.seedPolicy = "fixed"; }],
    ];
    for (const [name, mutate] of cases) {
        const e = base();
        mutate(e);
        assert.ok(validateEvent(e, course).length > 0, `expected rejection: ${name}`);
    }
    assert.deepEqual(validateEvent(base(), course), []);
});
