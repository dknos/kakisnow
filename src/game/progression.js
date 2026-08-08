import { COURSES } from "./courses/index.js";

/** The six deliveries that make the Burger Tour's first ending. */
export const MAIN_TOUR_DELIVERY_IDS = Object.freeze([
    "summit-stack",
    "timber-melt",
    "blue-plate",
    "night-shift",
    "avalanche-special",
    "big-air-basin-stack",
]);

function registryEventIds() {
    return Object.values(COURSES).flatMap((course) => course.events ?? []);
}

function registryTapeEntries() {
    return Object.values(COURSES).flatMap((course) =>
        (course.secrets ?? []).map((tape) => ({ course, tape }))
    );
}

/**
 * Registry-derived collection and ending state. This is intentionally a pure
 * read: records remain the save truth, while the UI gets its totals from the
 * same course/event/tape registries that build the mountain.
 */
export function completionStats(book = {}) {
    const events = book.events ?? {};
    const eventIds = registryEventIds();
    const tapes = registryTapeEntries();
    const completedEventIds = eventIds.filter((id) =>
        (events[id]?.completions ?? 0) > 0
    );
    const medalEventIds = eventIds.filter((id) =>
        typeof events[id]?.bestMedal === "string" && events[id].bestMedal.length > 0
    );
    const foundTapes = tapes.filter(({ course, tape }) =>
        (book.secrets?.[course.id] ?? []).includes(tape.id)
    );
    const mainCompleted = MAIN_TOUR_DELIVERY_IDS.filter((id) =>
        (events[id]?.completions ?? 0) > 0
    );
    const tourComplete = mainCompleted.length === MAIN_TOUR_DELIVERY_IDS.length;
    const hundredPercent = completedEventIds.length === eventIds.length &&
        medalEventIds.length === eventIds.length &&
        foundTapes.length === tapes.length;
    const totalStars = Object.values(events).reduce((sum, event) =>
        sum + (Number.isFinite(event?.bestStars) ? Math.max(0, event.bestStars) : 0), 0);
    const unlockedCourses = Object.values(tourState(book))
        .filter((state) => state.unlocked).length;
    // 100% is the complete set of event completions, medals, and tapes. The
    // denominator is registry-derived, so adding a registered event or tape
    // cannot leave a stale hand-written percentage in the book.
    const completionUnits = eventIds.length * 2 + tapes.length;
    const completionPercent = completionUnits
        ? Math.floor(((completedEventIds.length + medalEventIds.length + foundTapes.length) /
            completionUnits) * 100)
        : 0;
    return {
        courseTotal: Object.keys(COURSES).length,
        eventTotal: eventIds.length,
        tapeTotal: tapes.length,
        completedEvents: completedEventIds.length,
        medalEvents: medalEventIds.length,
        foundTapes: foundTapes.length,
        mainCompleted: mainCompleted.length,
        mainTotal: MAIN_TOUR_DELIVERY_IDS.length,
        tourComplete,
        hundredPercent,
        completedEventIds,
        medalEventIds,
        mainCompletedIds: mainCompleted,
        unlockedCourses,
        totalStars,
        burgersServed: Number.isFinite(book.burgers) ? Math.max(0, book.burgers) : 0,
        runs: Number.isFinite(book.runs) ? Math.max(0, book.runs) : 0,
        completionPercent: Math.min(100, completionPercent),
    };
}

/**
 * A compact view-model for Burger Book pages. It deliberately contains only
 * registry rows and saved measurements so screens cannot drift into a second
 * hand-maintained event list.
 */
export function burgerBookPages(book = {}) {
    const events = book.events ?? {};
    return Object.values(COURSES).map((course) => ({
        id: course.id,
        title: course.title,
        subtitle: course.subtitle,
        unlocked: !!tourState(book)[course.id]?.unlocked,
        events: (course.events ?? []).map((id) => {
            const saved = events[id] ?? {};
            return {
                id,
                completions: Number.isFinite(saved.completions) ? saved.completions : 0,
                medal: typeof saved.bestMedal === "string" ? saved.bestMedal : null,
                bestTime: Number.isFinite(saved.bestTime) ? saved.bestTime : null,
                bestVehicle: typeof saved.bestVehicle === "string" ? saved.bestVehicle : null,
                style: Number.isFinite(saved.bestStyle) ? saved.bestStyle : 0,
                integrity: Number.isFinite(saved.bestIntegrity) ? saved.bestIntegrity : 0,
                trick: saved.bestTrick && typeof saved.bestTrick === "object" &&
                    Number.isFinite(saved.bestTrick.score)
                    ? { name: saved.bestTrick.name, score: saved.bestTrick.score }
                    : null,
                rocket: Number.isFinite(saved.bestRocket) ? saved.bestRocket : 0,
                ghost: !!saved.bestGhost,
                bigAir: saved.bestBigAirFlights && Object.keys(saved.bestBigAirFlights).length > 0,
            };
        }),
        tapes: (course.secrets ?? []).map((tape) => ({
            id: tape.id,
            found: (book.secrets?.[course.id] ?? []).includes(tape.id),
        })),
    }));
}

/**
 * The Burger Tour — which mountains a book has earned.
 *
 * Derived from the records every time it is asked, never stored: a stored
 * unlock can rot (a schema slip, an imported save), but records are ground
 * truth and the chain recomputes from them in microseconds. The book's own
 * `unlockedCourses` list still counts — as a manual override lane for QA and
 * for anything a future build grants directly — but the tour itself is a
 * pure function of what the player has actually done.
 *
 * The cadence is the brief's: finish the Summit to reach the forest, medal
 * in the forest to reach the ice, gather stars for the night park, and
 * finish every mountain's main delivery to face the storm. Requirements sit
 * deliberately low — better medals are for cosmetics and pride, not gates.
 */

/**
 * @param {object} book the BurgerBook's plain data (`book.book`)
 * @returns {Record<string, {unlocked: boolean, reason: string}>}
 */
export function tourState(book) {
    const ev = (id) => book.events?.[id] ?? {};
    const stars = Object.values(book.events ?? {})
        .reduce((sum, e) => sum + (e.bestStars ?? 0), 0);
    const done = (id) => (ev(id).completions ?? 0) > 0;
    const medal = (id) => ev(id).bestMedal != null;
    const manual = (id) => book.unlockedCourses?.includes(id) ?? false;

    return {
        "summit-line": {
            unlocked: true,
            reason: "",
        },
        "pinecone-pass": {
            unlocked: manual("pinecone-pass") || done("summit-stack"),
            reason: "serve The Summit Stack",
        },
        "glacier-gorge": {
            unlocked: manual("glacier-gorge") ||
                medal("timber-melt") || medal("branch-manager"),
            reason: "medal on Pinecone Pass",
        },
        "midnight-resort": {
            unlocked: manual("midnight-resort") || stars >= 8,
            reason: `earn 8 stars in total (${Math.min(stars, 8)}/8)`,
        },
        "whiteout-ridge": {
            unlocked: manual("whiteout-ridge") ||
                (done("summit-stack") && done("timber-melt") &&
                 done("blue-plate") && done("night-shift")),
            reason: "serve every mountain's main order",
        },
        "big-air-basin": {
            unlocked: manual("big-air-basin") ||
                medal("blue-plate") || medal("handle-with-care"),
            reason: "medal on Glacier Gorge",
        },
    };
}

/**
 * Every course must appear above, and this is why it throws rather than
 * warns.
 *
 * The title menu lists `Object.values(COURSES)` and reads `tour[c.id]
 * ?.unlocked`. A course with no entry therefore renders as LOCKED with an
 * empty reason and no condition that could ever open it — a mountain that
 * exists, is listed, and cannot be reached by any play. Big Air Basin shipped
 * in exactly that state until this ran. The chain is hand-written on purpose,
 * so the check has to be the thing that notices a new course was added to the
 * registry and not to the tour.
 *
 * @param {Record<string, object>} courses the course registry
 */
export function assertTourCoversCourses(courses) {
    const tour = tourState({});
    const missing = Object.keys(courses).filter((id) => !(id in tour));
    if (missing.length) {
        throw new Error(
            `course(s) missing from the Burger Tour, so nothing can unlock ` +
            `them: ${missing.join(", ")}`
        );
    }
    const extra = Object.keys(tour).filter((id) => !(id in courses));
    if (extra.length) {
        throw new Error(`tour gates courses that do not exist: ${extra.join(", ")}`);
    }
}
