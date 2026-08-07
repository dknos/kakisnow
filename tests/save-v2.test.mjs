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
