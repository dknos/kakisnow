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
import { assertTourCoversCourses } from "../progression.js";

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

/**
 * The Timber Melt — Pinecone Pass's classic delivery.
 *
 * Medals measured 2026-08-06: the autopilot rides the forest split in
 * 36.0-36.4 s. Gold sits a little wider above this floor than Summit's +3 —
 * the robot ignores trees, and a human line through the slalom does not.
 */
export const TIMBER_MELT = {
    id: "timber-melt",
    version: 1,
    courseId: "pinecone-pass",
    name: "The Timber Melt",
    tagline: "Four through the firs. Creek or ridge — pick a line.",
    mode: "delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard", "rocket-chair"],
    forcedVehicle: null,
    startZ: -80,
    finishZ: 596,
    gold: 40,
    silver: 52,
    bronze: 68,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * Branch Manager — the same delivery, but the mountain grades your style.
 *
 * The medal needs the style score too: near misses through the trees,
 * tricks off the shelf, time in the air. The target is modest on purpose —
 * the brief is explicit that the safe route must stay worth riding, so a
 * clean creek line with a few tricks clears it without collision abuse.
 */
export const BRANCH_MANAGER = {
    id: "branch-manager",
    version: 1,
    courseId: "pinecone-pass",
    name: "Branch Manager",
    tagline: "Deliver with style. The trees are watching.",
    mode: "style-delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard"],
    forcedVehicle: "classic-snowboard",
    startZ: -80,
    finishZ: 596,
    /** A medal here also needs style at or above this. */
    styleTarget: 45,
    gold: 48,
    silver: 60,
    bronze: 76,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * The Blue Plate — Glacier Gorge's delivery.
 *
 * Medals measured 2026-08-07: the autopilot runs the gorge in 39.2-40.1 s,
 * riding the slot ice without fear because it steers by writing the camera.
 * A human pays for that line in grip, so the ladder sits wider.
 */
export const BLUE_PLATE = {
    id: "blue-plate",
    version: 1,
    courseId: "glacier-gorge",
    name: "The Blue Plate",
    tagline: "Cold order, colder mountain. Mind the crevasses.",
    mode: "delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard", "rocket-chair"],
    forcedVehicle: null,
    startZ: -140,
    finishZ: 588,
    gold: 43,
    silver: 55,
    bronze: 72,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * Handle With Care — the same order, but the burger is judged.
 *
 * The medal also needs Stack Integrity at 70+: one crash (-18) and normal
 * sketchy riding still clear it, which is the brief's explicit fairness bar —
 * finishable after one ordinary mistake, unforgiving of a second.
 */
export const HANDLE_WITH_CARE = {
    id: "handle-with-care",
    version: 1,
    courseId: "glacier-gorge",
    name: "Handle With Care",
    tagline: "The stack remembers every landing.",
    mode: "delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard"],
    forcedVehicle: "classic-snowboard",
    startZ: -140,
    finishZ: 588,
    /** A medal here also needs integrity at or above this. */
    integrityTarget: 70,
    gold: 47,
    silver: 59,
    bronze: 76,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * The Night Shift — Midnight Resort's delivery, under the lights.
 *
 * Medals measured 2026-08-07: the park autopilot floors 34.4-35.1 s. Gold a
 * shade over it; the tables punish a robotic straight line less than the
 * pipe punishes a human one, so the ladder sits at the Summit convention.
 */
export const NIGHT_SHIFT = {
    id: "night-shift",
    version: 1,
    courseId: "midnight-resort",
    name: "The Night Shift",
    tagline: "Orders don't stop when the sun does.",
    mode: "delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard", "rocket-chair"],
    forcedVehicle: null,
    startZ: -40,
    finishZ: 588,
    gold: 38,
    silver: 50,
    bronze: 66,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * Park Order — deliver, but the park is the point.
 *
 * The medal also needs banked trick score: three tables, three rails and a
 * pipe are the invitation, 400 points is RSVPing to at least half of it.
 * Repetition decay is what stops one safe 180 done eleven times from
 * clearing the bar — the tracker pays novelty, not patience.
 */
export const PARK_ORDER = {
    id: "park-order",
    version: 1,
    courseId: "midnight-resort",
    name: "Park Order",
    tagline: "The tables are set. Serve something with spin on it.",
    mode: "style-delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard"],
    forcedVehicle: "classic-snowboard",
    startZ: -40,
    finishZ: 588,
    /** A medal here also needs this much banked trick score. */
    trickTarget: 400,
    gold: 46,
    silver: 58,
    bronze: 74,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * The Avalanche Special — everything this game has, at once.
 *
 * All five ingredients ahead of a wall that keeps its own schedule. Medals
 * measured 2026-08-07: the autopilot, which shops efficiently and never
 * looks back, floors 45.7-46.5 s including the onion detour — with the wall
 * live behind it. Gold sits wider over this floor than the calm courses'
 * +3: the gusts do not push a robot that steers by writing the camera.
 */
export const AVALANCHE_SPECIAL = {
    id: "avalanche-special",
    version: 1,
    courseId: "whiteout-ridge",
    name: "The Avalanche Special",
    tagline: "Five on the mountain. The mountain is coming too.",
    mode: "final",
    required: ["cheese", "onion", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard", "rocket-chair"],
    forcedVehicle: null,
    startZ: -260,
    finishZ: 588,
    gold: 52,
    silver: 66,
    bronze: 84,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * Five Alarm — the rocket final. Fuel, route, wind and the wall, all at
 * once; every pickup refills a fifth of a tank that will not last the
 * mountain otherwise. Difficult and meant to be, fair because every one of
 * its pressures keeps a schedule.
 */
export const FIVE_ALARM = {
    id: "five-alarm",
    version: 1,
    courseId: "whiteout-ridge",
    name: "Five Alarm",
    tagline: "Full order, full throttle, and the wall right behind.",
    mode: "final",
    required: ["cheese", "onion", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["rocket-chair"],
    forcedVehicle: "rocket-chair",
    startZ: -260,
    finishZ: 588,
    gold: 48,
    silver: 62,
    bronze: 80,
    get medals() {
        return { gold: this.gold, silver: this.silver, bronze: this.bronze };
    },
    unlock: null,
};

/**
 * The Big Air Stack — the pipe run, and the hill that ends it.
 *
 * Four ingredients strung down four hundred metres of halfpipe, and then a
 * takeoff the rider cannot avoid: the lane runs through the jump, so the only
 * question is how fast they arrive at it. Both vehicles are legal — the rocket
 * chair is faster into the in-run and much harder to land.
 *
 * Medals measured 2026-08-07 on the finished terrain: the autopilot floors
 * 45.34-45.40 s on the classic board and 43.32-43.39 s on the rocket chair,
 * and both vehicles are legal here, so the ladder is set off the rocket. Gold
 * sits +4.7 over that floor rather than the calm courses' +3, because the one
 * pressure this course applies is the pressure the robot is immune to: a bad
 * landing off a fifty-metre hill costs a human the crash-recovery rewind, and
 * the autopilot's landings are graded but never fatal.
 */
export const BIG_AIR_STACK = {
    id: "big-air-basin-stack",
    version: 1,
    courseId: "big-air-basin",
    name: "The Big Air Stack",
    tagline: "Four in the pipe. One in the air.",
    mode: "delivery",
    required: ["cheese", "patty", "tomato", "lettuce"],
    seedPolicy: "random",
    fixedSeed: null,
    allowedVehicles: ["classic-snowboard", "rocket-chair"],
    forcedVehicle: null,
    startZ: -300,
    finishZ: 560,
    gold: 48,
    silver: 62,
    bronze: 80,
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
    [TIMBER_MELT.id]: TIMBER_MELT,
    [BRANCH_MANAGER.id]: BRANCH_MANAGER,
    [BLUE_PLATE.id]: BLUE_PLATE,
    [HANDLE_WITH_CARE.id]: HANDLE_WITH_CARE,
    [NIGHT_SHIFT.id]: NIGHT_SHIFT,
    [PARK_ORDER.id]: PARK_ORDER,
    [AVALANCHE_SPECIAL.id]: AVALANCHE_SPECIAL,
    [FIVE_ALARM.id]: FIVE_ALARM,
    [BIG_AIR_STACK.id]: BIG_AIR_STACK,
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
// A course the tour cannot unlock is a course that is listed on the title
// screen, marked LOCKED, and reachable by nothing. Checked here rather than in
// progression.js because this module is where the registry is already known to
// be complete.
assertTourCoversCourses(COURSES);

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
