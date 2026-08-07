/**
 * Save schema v2, provable without a browser.
 *
 * The contract worth pinning is the migration ladder: a v1 book comes forward
 * with every record intact and its ghost stamped with the only identity v1
 * could have meant, while anything unreadable — junk, truncation, versions
 * from a future build — degrades to a fresh book instead of a boot failure.
 *
 * The ghost compatibility rule (`ghostMatches`) is tested here rather than
 * through `GhostPlayback.arm`, because ghost.js pulls Babylon mesh builders
 * and cannot load under bare Node; the rule was put in burgerBook.js for
 * exactly this reason, and arm() is a thin caller of it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BurgerRun, RunState } from "../src/game/burgerRun.js";
import { BIG_AIR_BASIN } from "../src/game/courses/bigAirBasin.js";
import { BIG_AIR_STACK } from "../src/game/courses/eventRegistry.js";

// ------------------------------------------------------------------ fixtures

const KEY = "snow-burgers.book";

/** The subset of the Storage interface burgerBook actually touches. */
function memoryStorage() {
    const map = new Map();
    return {
        getItem(k) { return map.has(k) ? map.get(k) : null; },
        setItem(k, v) { map.set(k, String(v)); },
        removeItem(k) { map.delete(k); },
    };
}

// The stub must exist before the module does: burgerBook is written against
// the browser global, so it is assigned first and the import is dynamic.
globalThis.localStorage = memoryStorage();
const { BurgerBook, SCHEMA_VERSION, ghostMatches } =
    await import("../src/game/burgerBook.js");

/** Swap in a clean storage, optionally pre-seeded, and open a book on it. */
function fresh(json) {
    globalThis.localStorage = memoryStorage();
    if (json !== undefined) globalThis.localStorage.setItem(KEY, json);
    return new BurgerBook();
}

/** A save exactly as the shipped v1 build wrote it. */
function v1Book() {
    return {
        version: 1,
        burgers: 7,
        runs: 12,
        seenAssembly: true,
        events: {
            "summit-stack": {
                completions: 7,
                bestTime: 41.3,
                bestStyle: 62,
                bestIntegrity: 88,
                bestRocket: 3,
                bestStars: 4,
                bestMedal: "silver",
                bestSeed: 1234,
                bestGhost: {
                    version: 1,
                    seed: 1234,
                    samples: [0, 1, 2, 3, 4, 5, 6, 7, 8],
                },
            },
        },
    };
}

/** A well-formed v2 ghost; overrides poke individual fields. */
function v2Ghost(overrides = {}) {
    return {
        version: 2,
        seed: 42,
        interval: 0.25,
        courseId: "glacier",
        courseVersion: 3,
        eventId: "glacier-run",
        eventVersion: 2,
        vehicleId: "rocket-chair",
        samples: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        ...overrides,
    };
}

/** A completed run result in the shape `_score` produces. */
function wonRun(time, seed) {
    return {
        completed: true,
        time,
        seed,
        medal: "gold",
        style: 10,
        integrity: 50,
        rocket: 0,
        stars: 2,
    };
}

// ------------------------------------------------------------ the v1 ladder

test("a realistic v1 book migrates with records intact and the ghost upgraded", () => {
    const book = fresh(JSON.stringify(v1Book())).book;

    assert.equal(book.version, 2);
    assert.equal(SCHEMA_VERSION, 2);
    assert.equal(book.burgers, 7);
    assert.equal(book.runs, 12);
    assert.equal(book.seenAssembly, true);

    // The v2-only fields arrive at their defaults.
    assert.deepEqual(book.unlockedCourses, ["summit-line"]);
    assert.deepEqual(book.secrets, {});
    assert.deepEqual(book.tutorial, {});
    assert.deepEqual(book.lastSelected, {
        courseId: "summit-line", eventId: "summit-stack",
    });

    const e = book.events["summit-stack"];
    assert.equal(e.completions, 7);
    assert.equal(e.bestTime, 41.3);
    assert.equal(e.bestStyle, 62);
    assert.equal(e.bestIntegrity, 88);
    assert.equal(e.bestRocket, 3);
    assert.equal(e.bestStars, 4);
    assert.equal(e.bestMedal, "silver");
    assert.equal(e.bestSeed, 1234);
    // v1 only ever shipped one course, layout and vehicle: the stamp is known.
    assert.equal(e.courseId, "summit-line");
    assert.equal(e.courseVersion, 1);
    assert.equal(e.eventVersion, 1);
    assert.equal(e.bestVehicle, "classic-snowboard");

    assert.deepEqual(e.bestGhost, {
        version: 2,
        seed: 1234,
        interval: 0.25,
        courseId: "summit-line",
        courseVersion: 1,
        eventId: "summit-stack",
        eventVersion: 1,
        vehicleId: "classic-snowboard",
        samples: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    });
});

test("a v1 book with missing and non-finite fields reads as zeros, no throw", () => {
    // Written as a raw string because JSON.stringify would already have
    // laundered NaN into null; a real rotten save arrives as text.
    const book = fresh(
        '{"version":1,"burgers":null,"runs":"twelve","seenAssembly":"yes",' +
        '"events":{"summit-stack":{"completions":null,"bestTime":"fast"},"junk":null}}'
    ).book;

    assert.equal(book.version, 2);
    assert.equal(book.burgers, 0);
    assert.equal(book.runs, 0);
    assert.equal(book.seenAssembly, false);
    assert.equal("junk" in book.events, false);

    const e = book.events["summit-stack"];
    assert.equal(e.completions, 0);
    assert.equal(e.bestTime, null);
    assert.equal(e.bestGhost, null);
    assert.equal(e.courseId, "summit-line");
    // Every event that came up the v1 step gets the v1 vehicle stamp, even a
    // rotten one: v1 could not have recorded anything on any other vehicle.
    assert.equal(e.bestVehicle, "classic-snowboard");
});

test("a corrupt ghost is dropped without rejecting the save around it", () => {
    const raw = v1Book();
    raw.events["summit-stack"].bestGhost.samples = [0, 1, NaN, 3, 4, 5, 6, 7, 8];
    raw.events["pipe-dream"] = {
        completions: 2, bestTime: 55, bestStyle: 1, bestIntegrity: 1,
        bestRocket: 0, bestStars: 1, bestMedal: "bronze", bestSeed: 9,
        bestGhost: { version: 1, seed: 9, samples: "junk" },
    };
    const book = fresh(JSON.stringify(raw)).book;

    // Both records survive; both ghosts are gone.
    assert.equal(book.events["summit-stack"].bestTime, 41.3);
    assert.equal(book.events["summit-stack"].bestGhost, null);
    assert.equal(book.events["pipe-dream"].bestTime, 55);
    assert.equal(book.events["pipe-dream"].bestGhost, null);
});

// --------------------------------------------------------- unreadable saves

test("truncated JSON in storage degrades to a fresh book", () => {
    const book = fresh('{"version":1,"burg').book;
    assert.equal(book.version, 2);
    assert.equal(book.burgers, 0);
    assert.deepEqual(book.events, {});
});

test("a save from a future build is rejected whole", () => {
    const book = fresh(JSON.stringify({ version: 3, burgers: 99 })).book;
    assert.equal(book.version, 2);
    assert.equal(book.burgers, 0);
});

test("no localStorage at all: fresh book, save() reports false, no throw", () => {
    const saved = globalThis.localStorage;
    try {
        delete globalThis.localStorage;
        const b = new BurgerBook();
        assert.equal(b.book.version, 2);
        assert.equal(b.book.burgers, 0);
        assert.equal(b.save(), false);
    } finally {
        globalThis.localStorage = saved;
    }
});

// -------------------------------------------------------------- v2 round trip

test("record() with meta stamps the run identity and it survives a reload", () => {
    const first = fresh();
    const ghost = v2Ghost();
    const meta = {
        courseId: "glacier", courseVersion: 3,
        eventVersion: 2, vehicleId: "rocket-chair",
    };
    const broke = first.record("glacier-run", wonRun(30.5, 42), ghost, meta);
    assert.equal(broke.time, true);

    const reload = new BurgerBook(); // same storage, brand-new instance
    const e = reload.book.events["glacier-run"];
    assert.equal(e.bestTime, 30.5);
    assert.equal(e.courseId, "glacier");
    assert.equal(e.courseVersion, 3);
    assert.equal(e.eventVersion, 2);
    assert.equal(e.bestVehicle, "rocket-chair");
    assert.deepEqual(e.bestGhost, ghost);
    assert.deepEqual(reload.book, first.book);
});

test("record() without meta falls back to the v1 identity", () => {
    const b = fresh();
    b.record("summit-stack", wonRun(40, 7), null);
    const e = b.book.events["summit-stack"];
    assert.equal(e.courseId, "summit-line");
    assert.equal(e.courseVersion, 1);
    assert.equal(e.eventVersion, 1);
    assert.equal(e.bestVehicle, "classic-snowboard");
});

test("Big Air personal bests persist per vehicle without a schema bump", () => {
    const b = fresh();
    const classic = {
        ...wonRun(40, 7),
        bigAirFlight: {
            vehicle: "classic-snowboard", airtime: 2.5, distance: 49.2,
            maxHeight: 18.6, maxClearance: 18.6, trick: "Mute", trickScore: 120,
            landingGrade: "clean", recordKey: "spoofed",
        },
    };
    const rocket = {
        ...wonRun(39, 8),
        bigAirFlight: {
            vehicle: "rocket-chair", airtime: 2.4, distance: 61.1,
            maxHeight: 20.4, maxClearance: 20.4, trick: null, trickScore: 0,
            landingGrade: "perfect",
        },
    };

    const first = b.record("big-air-basin-stack", classic, null, { vehicleId: "classic-snowboard" });
    assert.equal(first.bigAir, true);
    assert.equal(classic.bigAirBest.isNew, true);
    assert.equal(classic.bigAirBest.previous, null);
    assert.equal(classic.bigAirBest.current.distance, 49.2);

    const second = b.record("big-air-basin-stack", rocket, null, { vehicleId: "rocket-chair" });
    assert.equal(second.bigAir, true);
    assert.equal(rocket.bigAirBest.vehicle, "rocket-chair");

    const reload = new BurgerBook();
    const flights = reload.book.events["big-air-basin-stack"].bestBigAirFlights;
    assert.equal(flights["classic-snowboard"].distance, 49.2);
    assert.equal(flights["rocket-chair"].distance, 61.1);
    assert.equal(flights["classic-snowboard"].recordKey, "big-air-basin:classic-snowboard");
});

test("a shorter Big Air attempt keeps the old PB and exposes both results", () => {
    const b = fresh();
    b.record("big-air-basin-stack", {
        ...wonRun(40, 7),
        bigAirFlight: {
            vehicle: "classic-snowboard", airtime: 2, distance: 52,
            maxHeight: 18, maxClearance: 18, trick: null, trickScore: 0,
            landingGrade: "clean",
        },
    });
    const repeat = {
        ...wonRun(39, 8),
        bigAirFlight: {
            vehicle: "classic-snowboard", airtime: 2, distance: 50,
            maxHeight: 20, maxClearance: 20, trick: "Spin", trickScore: 400,
            landingGrade: "sketchy",
        },
    };
    const broke = b.record("big-air-basin-stack", repeat, null);
    assert.equal(broke.bigAir, false);
    assert.equal(repeat.bigAirBest.isNew, false);
    assert.equal(repeat.bigAirBest.previous.distance, 52);
    assert.equal(repeat.bigAirBest.current.distance, 52);
    assert.equal(repeat.bigAirBest.candidate.distance, 50);
});

test("corrupt optional flight data is dropped without losing the v2 event", () => {
    const raw = {
        version: 2, burgers: 3, runs: 4, seenAssembly: true,
        events: {
            "big-air-basin-stack": {
                bestTime: 44,
                bestBigAirFlights: {
                    "classic-snowboard": {
                        vehicle: "classic-snowboard", distance: "far",
                        airtime: NaN, maxHeight: 10, maxClearance: 10,
                    },
                    "rocket-chair": {
                        vehicle: "rocket-chair", distance: 60, airtime: 2,
                        maxHeight: 17, maxClearance: 17, trickScore: 0,
                    },
                    "hacker-vehicle": { vehicle: "hacker-vehicle", distance: 999 },
                },
            },
            "summit-stack": { bestTime: 80 },
        },
    };
    const b = fresh(JSON.stringify(raw)).book;
    assert.equal(b.burgers, 3);
    assert.equal(b.events["big-air-basin-stack"].bestTime, 44);
    assert.deepEqual(Object.keys(b.events["big-air-basin-stack"].bestBigAirFlights), ["rocket-chair"]);
    assert.equal(b.events["summit-stack"].bestBigAirFlights instanceof Object, true);
});

test("a keyed vehicle mismatch cannot cross-contaminate a flight PB", () => {
    const raw = {
        version: 2,
        events: {
            "big-air-basin-stack": {
                bestBigAirFlights: {
                    // Deliberately place a rocket payload under the classic key.
                    "classic-snowboard": {
                        vehicle: "rocket-chair", airtime: 2.4, distance: 900,
                        maxHeight: 90, maxClearance: 90, trickScore: 0,
                    },
                    "rocket-chair": {
                        vehicle: "rocket-chair", airtime: 2.4, distance: 60,
                        maxHeight: 17, maxClearance: 17, trickScore: 0,
                    },
                },
            },
        },
    };
    const b = fresh(JSON.stringify(raw)).book;
    assert.deepEqual(b.events["big-air-basin-stack"].bestBigAirFlights, {
        "rocket-chair": {
            vehicle: "rocket-chair", airtime: 2.4, distance: 60,
            maxHeight: 17, maxClearance: 17, trick: null, trickScore: 0,
            landingGrade: null, recordKey: "big-air-basin:rocket-chair",
        },
    });
});

function bigAirRunFixture(book) {
    const controller = {
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
        crashCount: 0,
    };
    return new BurgerRun({
        controller,
        field: { place() {}, reset() {}, clear() {} },
        book,
        terrain: { heightAt: () => 0, normalAt: (x, z, out) => out },
        course: BIG_AIR_BASIN,
        event: BIG_AIR_STACK,
    });
}

test("BurgerRun completed Big Air assembly assigns PB records to its result", () => {
    const b = fresh();
    const run = bigAirRunFixture(b);
    run.vehicleId = "classic-snowboard";
    run.flightTelemetry = {
        vehicle: "classic-snowboard", airtime: 2.5, distance: 49.2,
        maxHeight: 18.6, maxClearance: 18.6, trick: null, trickScore: 0,
        landingGrade: "clean", recordKey: "big-air-basin:classic-snowboard",
    };
    run.state = RunState.ASSEMBLY;
    run.completeAssembly();
    assert.equal(run.result.completed, true);
    assert.equal(run.result.records.bigAir, true);
    assert.equal(run.result.bigAirBest.isNew, true);
    assert.equal(run.result.bigAirBest.current.distance, 49.2);
});

test("BurgerRun abandon cannot award a Big Air PB", () => {
    const b = fresh();
    const run = bigAirRunFixture(b);
    run.vehicleId = "classic-snowboard";
    run.flightTelemetry = {
        vehicle: "classic-snowboard", airtime: 2.5, distance: 99,
        maxHeight: 18.6, maxClearance: 18.6, trick: null, trickScore: 0,
        landingGrade: "clean", recordKey: "big-air-basin:classic-snowboard",
    };
    run.state = RunState.RUN;
    run.abandon();
    assert.equal(run.result.completed, false);
    assert.equal(run.result.records.bigAir, false);
    assert.equal(run.result.bigAirBest, undefined);
    assert.deepEqual(b.book.events["big-air-basin-stack"].bestBigAirFlights, {});
});

test("non-Big-Air records do not create a flight PB", () => {
    const b = fresh();
    const result = {
        ...wonRun(42, 9),
        // A malformed/cross-wired caller must not turn an ordinary event into
        // a Big Air record merely by attaching telemetry-shaped data.
        bigAirFlight: {
            vehicle: "classic-snowboard", airtime: 2, distance: 99,
            maxHeight: 20, maxClearance: 20, trick: null, trickScore: 0,
            landingGrade: "clean",
        },
    };
    const broke = b.record("summit-stack", result, null);
    assert.equal(broke.bigAir, false);
    assert.equal(result.bigAirBest, undefined);
    assert.deepEqual(b.book.events["summit-stack"].bestBigAirFlights, {});
});

test("an incomplete Big Air attempt cannot award a flight PB", () => {
    const b = fresh();
    const result = {
        ...wonRun(42, 9),
        completed: false,
        bigAirFlight: {
            vehicle: "classic-snowboard", airtime: 2, distance: 99,
            maxHeight: 20, maxClearance: 20, trick: null, trickScore: 0,
            landingGrade: "clean",
        },
    };
    const broke = b.record("big-air-basin-stack", result, null);
    assert.equal(broke.bigAir, false);
    assert.equal(result.bigAirBest, undefined);
    assert.deepEqual(b.book.events["big-air-basin-stack"].bestBigAirFlights, {});
});

test("progression helpers are idempotent and persist across a reload", () => {
    const b = fresh();
    b.unlockCourse("glacier");
    b.unlockCourse("glacier"); // second unlock is a no-op, not a duplicate
    assert.equal(b.isCourseUnlocked("glacier"), true);
    assert.equal(b.isCourseUnlocked("moon"), false);

    assert.equal(b.addSecret("glacier", "cave"), true);
    assert.equal(b.addSecret("glacier", "cave"), false); // only the first find
    b.setLastSelected("glacier", "glacier-run");
    b.markTutorial("carving");

    const reload = new BurgerBook().book;
    assert.deepEqual(reload.unlockedCourses, ["summit-line", "glacier"]);
    assert.deepEqual(reload.secrets, { glacier: ["cave"] });
    assert.deepEqual(reload.lastSelected, {
        courseId: "glacier", eventId: "glacier-run",
    });
    assert.deepEqual(reload.tutorial, { carving: true });
});

// -------------------------------------------------------- the identity gate

test("ghostMatches arms on a full identity match and nothing less", () => {
    const stored = v2Ghost();
    const expect = {
        seed: 42, courseId: "glacier", courseVersion: 3,
        eventId: "glacier-run", eventVersion: 2, vehicleId: "rocket-chair",
    };
    assert.equal(ghostMatches(stored, expect), true);

    // Every identity field refuses alone: a ghost from a different seed,
    // course revision, layout or vehicle rode a different run.
    const mismatches = [
        ["seed", 43],
        ["courseId", "summit-line"],
        ["courseVersion", 4],
        ["eventId", "pipe-dream"],
        ["eventVersion", 3],
        ["vehicleId", "classic-snowboard"],
    ];
    for (const [key, wrong] of mismatches) {
        assert.equal(ghostMatches(stored, { ...expect, [key]: wrong }), false, key);
    }
});

test("ghostMatches refuses anything that is not a valid v2 ghost", () => {
    const expect = {
        seed: 1234, courseId: "summit-line", courseVersion: 1,
        eventId: "summit-stack", eventVersion: 1, vehicleId: "classic-snowboard",
    };
    // An unmigrated v1 ghost, even one whose seed agrees.
    assert.equal(
        ghostMatches({ version: 1, seed: 1234, samples: [0, 1, 2, 3, 4, 5] }, expect),
        false
    );
    assert.equal(ghostMatches(null, expect), false);
    assert.equal(ghostMatches(v2Ghost({ interval: 0 }), expect), false);
    assert.equal(ghostMatches(v2Ghost({ samples: [0, 1] }), expect), false); // not triples
    assert.equal(ghostMatches(v2Ghost(), null), false);
});
