import test from "node:test";
import assert from "node:assert/strict";

import { COURSES } from "../src/game/courses/index.js";
import { EVENTS } from "../src/game/courses/eventRegistry.js";
import {
    MAIN_TOUR_DELIVERY_IDS,
    burgerBookPages,
    completionStats,
} from "../src/game/progression.js";
import { RECIPE_TAPE_CONTENT, RECIPE_TAPE_TITLES } from "../src/game/recipeTapeContent.js";
import { bootIntent } from "../src/game/bootIntent.js";

function eventBook(ids = [], medals = ids) {
    const events = {};
    for (const id of ids) {
        events[id] = {
            completions: 1,
            bestMedal: medals.includes(id) ? "bronze" : null,
            bestTime: 42,
            bestStyle: 12,
            bestIntegrity: 80,
            bestRocket: 50,
            bestGhost: null,
        };
    }
    return { events, secrets: {} };
}

test("registry-derived completion totals stay 6 courses, 12 events, 18 tapes", () => {
    const stats = completionStats({});
    assert.equal(stats.courseTotal, Object.keys(COURSES).length);
    assert.equal(stats.eventTotal, Object.keys(EVENTS).length);
    assert.equal(stats.tapeTotal, Object.values(COURSES).reduce((n, c) => n + c.secrets.length, 0));
    assert.deepEqual(MAIN_TOUR_DELIVERY_IDS, [
        "summit-stack", "timber-melt", "blue-plate", "night-shift",
        "avalanche-special", "big-air-basin-stack",
    ]);
});

test("six main deliveries earn Tour Complete, while 100% needs medals and tapes", () => {
    const book = eventBook(MAIN_TOUR_DELIVERY_IDS);
    const tour = completionStats(book);
    assert.equal(tour.tourComplete, true);
    assert.equal(tour.hundredPercent, false);

    for (const id of Object.keys(EVENTS)) {
        book.events[id] ??= { completions: 1, bestMedal: "gold" };
        book.events[id].completions = 1;
        book.events[id].bestMedal = "gold";
    }
    for (const course of Object.values(COURSES)) {
        book.secrets[course.id] = course.secrets.map((tape) => tape.id);
    }
    const full = completionStats(book);
    assert.equal(full.completedEvents, 12);
    assert.equal(full.medalEvents, 12);
    assert.equal(full.foundTapes, 18);
    assert.equal(full.hundredPercent, true);
});

test("Burger Book pages mirror every event and tape, with no authored tape gaps", () => {
    const pages = burgerBookPages({ events: {}, secrets: {} });
    assert.equal(pages.length, 6);
    assert.equal(pages.reduce((n, p) => n + p.events.length, 0), 12);
    assert.equal(pages.reduce((n, p) => n + p.tapes.length, 0), 18);
    for (const page of pages) for (const tape of page.tapes) {
        assert.ok(RECIPE_TAPE_CONTENT[`${page.id}:${tape.id}`], `${page.id}:${tape.id}`);
        assert.ok(RECIPE_TAPE_TITLES[`${page.id}:${tape.id}`], `${page.id}:${tape.id} title`);
        assert.equal(tape.found, false);
    }
});

test("Burger Book event URLs boot the order card for same- and cross-course starts", () => {
    const registry = {
        "summit-stack": { courseId: "summit-line" },
        "timber-melt": { courseId: "pinecone-pass" },
    };
    // This is the exact intent emitted by startBookEvent for a non-active
    // course: ?course=pinecone-pass&event=timber-melt&mode=burger-run.
    assert.equal(bootIntent({
        requestedMode: "burger-run",
        eventParam: "timber-melt",
        eventRegistry: registry,
        courseId: "pinecone-pass",
    }), "burger-run");
    // Direct links from either course remain order-card starts even if an old
    // bookmark omitted the explicit mode parameter.
    assert.equal(bootIntent({
        eventParam: "timber-melt",
        eventRegistry: registry,
        courseId: "pinecone-pass",
    }), "burger-run");
    assert.equal(bootIntent({
        eventParam: "summit-stack",
        eventRegistry: registry,
        courseId: "summit-line",
    }), "burger-run");
    // Course/event mismatches fail closed to title rather than opening the
    // wrong order on the wrong mountain.
    assert.equal(bootIntent({
        eventParam: "timber-melt",
        eventRegistry: registry,
        courseId: "summit-line",
    }), "title");
});
