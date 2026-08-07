/**
 * The event registry.
 *
 * An event is the rules of one scored descent: which course, which
 * ingredients, which vehicles, and the measured medal ladder. `BurgerRun`
 * executes whatever event it is handed; nothing event-specific may live as
 * if/else in the director — a new event is a new entry here, not a new branch
 * there.
 *
 * Medal thresholds are MEASURED, never copied. The convention from the first
 * event stands for every future one: run the autopilot
 * (`tools/snow-burgers/playthrough-windows.cjs`) on the finished course,
 * record its floor beside the thresholds, and set gold just above it.
 */

import { COURSES, getCourse } from "./index.js";
import { validateEvent } from "./validate.js";

/**
 * The one event, unchanged in every number the save file and the tools know.
 *
 * `gold`/`silver`/`bronze` stay as flat fields — `BurgerRun._score` and the
 * committed tools read them there — and `medals` is the same ladder in the
 * shape the validator and future UI consume. One source, two views.
 */
export const SUMMIT_STACK = {
    id: "summit-stack",
    version: 1,
    courseId: "summit-line",
    name: "The Summit Stack",
    tagline: "Four on the mountain. Buns at the grill.",
    mode: "delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard", "rocket-chair"],
    forcedVehicle: null,
    /** Where the rider starts, and where the gate is. */
    startZ: 0,
    finishZ: 548,
    /**
     * Medal thresholds, seconds. Measured, not guessed: the autopilot rides a
     * near-optimal line in 31 s on the classic board (28 s on the rocket), so
     * gold sits just above the floor. The first thresholds ever written were
     * more than twice this, and the robot golded them on its first attempt.
     */
    gold: 34,
    silver: 44,
    bronze: 58,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * Summit Gold — the fixed-line time trial.
 *
 * One seed forever, so every attempt races the same route and the ghost is
 * always eligible; two ingredients instead of four, so the line matters more
 * than the shopping. Classic board only: a time trial with an engine is a
 * fuel event wearing a stopwatch.
 *
 * Medals measured 2026-08-06: the autopilot's near-optimal line on seed 7
 * runs 31.1 s. Gold just above the floor, the ladder wider above it.
 */
export const SUMMIT_GOLD = {
    id: "summit-gold",
    version: 1,
    courseId: "summit-line",
    name: "Summit Gold",
    tagline: "One line. Two stops. Race your ghost.",
    mode: "time-trial",
    required: ["cheese", "lettuce"],
    seedPolicy: "fixed",
    fixedSeed: 7,
    allowedVehicles: ["classic-snowboard"],
    forcedVehicle: "classic-snowboard",
    startZ: 0,
    finishZ: 548,
    gold: 33,
    silver: 40,
    bronze: 52,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * Rocket Reheat — the full order, delivered hot.
 *
 * The rocket chair is mandatory and fuel is the route: every pickup refills
 * a fifth of the tank, so the detour that costs time buys back the boost
 * that wins it — the engine and the order are the same decision.
 *
 * Medals measured 2026-08-06: the rocket autopilot floors ~28 s holding the
 * throttle open. Gold demands the fuel loop actually work for the rider.
 */
export const ROCKET_REHEAT = {
    id: "rocket-reheat",
    version: 1,
    courseId: "summit-line",
    name: "Rocket Reheat",
    tagline: "Full order. Full throttle. Watch the tank.",
    mode: "rocket-rush",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["rocket-chair"],
    forcedVehicle: "rocket-chair",
    startZ: 0,
    finishZ: 548,
    gold: 31,
    silver: 40,
    bronze: 54,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/** @type {Record<string, object>} every event, keyed by id. */
export const EVENTS = {
    [SUMMIT_STACK.id]: SUMMIT_STACK,
    [SUMMIT_GOLD.id]: SUMMIT_GOLD,
    [ROCKET_REHEAT.id]: ROCKET_REHEAT,
};

for (const event of Object.values(EVENTS)) {
    const course = COURSES[event.courseId];
    const problems = validateEvent(event, course);
    if (problems.length) {
        throw new Error(
            `event "${event.id}" failed validation:\n - ` + problems.join("\n - ")
        );
    }
    if (!course.events.includes(event.id)) {
        throw new Error(
            `event "${event.id}" is not listed on course "${course.id}"`
        );
    }
}
for (const course of Object.values(COURSES)) {
    for (const id of course.events) {
        if (!EVENTS[id]) {
            throw new Error(`course "${course.id}" lists missing event "${id}"`);
        }
    }
}

/** @param {string} id @returns {object} throws on an unknown id. */
export function getEvent(id) {
    const e = EVENTS[id];
    if (!e) throw new Error(`unknown event "${id}"`);
    return e;
}

/** The course an event runs on. */
export function courseForEvent(eventId) {
    return getCourse(getEvent(eventId).courseId);
}
