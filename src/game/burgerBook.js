/**
 * The Burger Book — what survives a page reload.
 *
 * Deliberately small. It holds the records a player would be annoyed to lose
 * and nothing else: how many burgers they have finished, their best runs, the
 * courses they have opened up, and whether they have already sat through the
 * assembly cinematic once.
 *
 * Versioned from the first release rather than from the first time the shape
 * changes, because the alternative is reading an unlabelled object and guessing
 * — and a save whose shape cannot be identified is a save that has to be
 * thrown away. Version 2 exists because courses, events and vehicles became
 * separate ideas: a record and its ghost now carry the identity of what was
 * actually ridden, so a best set on one course can never be replayed against
 * another. `migrate` is the ladder that brings older shapes forward.
 *
 * Every read is defensive. `localStorage` can be unavailable entirely (a
 * privacy mode, a sandboxed frame), can hold something another tool wrote, and
 * can hold a truncated string from a tab that died mid-write. None of those may
 * take the game down: a corrupt save is discarded and play continues with a
 * fresh book, which is a strictly better outcome than a boot failure over a
 * high score. A corrupt ghost inside an otherwise healthy save costs only the
 * ghost — dropping a whole book over its least important field would invert
 * the priorities.
 */

// Big Air flight records are optional v2 fields.  Keeping them on the event
// rather than introducing a save-version bump means an existing v1/v2 book
// can gain the signature-flight record on its next completion without any
// migration ceremony.  Only the two released vehicles are accepted here so a
// rotten save cannot create arbitrary result rows or cross-contaminate a
// classic-board best with a rocket-chair best.
import { isBetterBigAirFlight } from "./bigAirFlight.js";

const KEY = "snow-burgers.book";
export const SCHEMA_VERSION = 2;

const BIG_AIR_VEHICLES = new Set(["classic-snowboard", "rocket-chair"]);
const FLIGHT_GRADES = new Set(["perfect", "clean", "sketchy", "crash"]);
const BIG_AIR_EVENT_ID = "big-air-basin-stack";

/**
 * Identity for everything a version 1 save recorded. Version 1 shipped exactly
 * one course, one event layout and one vehicle, so every v1 record can be
 * stamped with these without guessing — that certainty is what makes the v1
 * step of the ladder safe.
 */
const V1_COURSE_ID = "summit-line";
const V1_COURSE_VERSION = 1;
const V1_EVENT_VERSION = 1;
const V1_VEHICLE_ID = "classic-snowboard";
/** Matches the v1 recorder's `GHOST_INTERVAL`; v1 never wrote it down. */
const V1_GHOST_INTERVAL = 0.25;
const DEFAULT_EVENT_ID = "summit-stack";

/** @returns {object} a book with every field present at its zero value. */
export function emptyBook() {
    return {
        version: SCHEMA_VERSION,
        burgers: 0,
        runs: 0,
        seenAssembly: false,
        /** @type {string[]} course ids the player may pick from */
        unlockedCourses: [V1_COURSE_ID],
        /** @type {Record<string, string[]>} found secrets, keyed by course id */
        secrets: {},
        /** @type {Record<string, boolean>} tutorial beats already shown */
        tutorial: {},
        /** Where the menu reopens next boot. */
        lastSelected: { courseId: V1_COURSE_ID, eventId: DEFAULT_EVENT_ID },
        /** @type {Record<string, object>} keyed by event id */
        events: {},
    };
}

function emptyEvent() {
    return {
        completions: 0,
        bestTime: null,
        bestStyle: 0,
        bestIntegrity: 0,
        bestRocket: 0,
        bestStars: 0,
        bestMedal: null,
        bestSeed: null,
        // Identity of the record: which course revision and event layout the
        // best was set on, and what it was ridden with. A best from an old
        // course revision is history, not a target, and the UI needs to be
        // able to tell the difference.
        courseId: V1_COURSE_ID,
        courseVersion: V1_COURSE_VERSION,
        eventVersion: V1_EVENT_VERSION,
        /** @type {string|null} what the best time was ridden on */
        bestVehicle: null,
        /** @type {null|object} a v2 ghost, see `validGhost` */
        bestGhost: null,
        /** @type {Record<string, object>} optional Big Air PBs by vehicle */
        bestBigAirFlights: {},
    };
}

function storage() {
    try {
        const s = globalThis.localStorage;
        // Probe rather than trust: Safari's private mode exposes the object and
        // throws on write, which is not something a feature check catches.
        const probe = "__sb_probe__";
        s.setItem(probe, "1");
        s.removeItem(probe);
        return s;
    } catch {
        return null;
    }
}

/**
 * Bring an older save forward.
 *
 * A ladder, not a guard: each step lifts one version onto the next shape, and
 * whatever comes out the top goes through the same defensive v2 read as a
 * native v2 save — the steps only reshape, they are not trusted to sanitise.
 * Anything unrecognised (including versions from a future build) is rejected
 * whole, because misreading a save is worse than discarding it.
 */
function migrate(raw) {
    if (!raw || typeof raw !== "object") return null;
    let data = raw;
    if (data.version === 1) data = stepV1toV2(data);
    if (!data || typeof data !== "object") return null;
    if (data.version !== SCHEMA_VERSION) return null;
    return readV2(data);
}

/**
 * v1 → v2. Stamps every record and ghost with the only identity v1 could
 * have meant (see the constants above). Purely a reshape — the result still
 * passes through `readV2`, so junk in a v1 field is caught there rather than
 * being guarded twice.
 */
function stepV1toV2(raw) {
    const out = {
        ...emptyBook(),
        burgers: raw.burgers,
        runs: raw.runs,
        seenAssembly: raw.seenAssembly,
    };
    if (raw.events && typeof raw.events === "object") {
        for (const [id, e] of Object.entries(raw.events)) {
            if (!e || typeof e !== "object") continue;
            out.events[id] = {
                ...e,
                courseId: V1_COURSE_ID,
                courseVersion: V1_COURSE_VERSION,
                eventVersion: V1_EVENT_VERSION,
                bestVehicle: V1_VEHICLE_ID,
                bestGhost: stepV1Ghost(e.bestGhost, id),
            };
        }
    }
    return out;
}

/**
 * Upgrade a v1 ghost ({version:1, seed, samples}) or drop it. The event id it
 * was filed under is the only place its event identity exists, so it is
 * passed in rather than read off the ghost.
 */
function stepV1Ghost(g, eventId) {
    const ok =
        g && typeof g === "object" &&
        g.version === 1 &&
        Number.isFinite(g.seed) &&
        Array.isArray(g.samples) &&
        g.samples.length > 0 &&
        g.samples.every(Number.isFinite);
    if (!ok) return null;
    return {
        version: 2,
        seed: g.seed,
        interval: V1_GHOST_INTERVAL,
        courseId: V1_COURSE_ID,
        courseVersion: V1_COURSE_VERSION,
        eventId,
        eventVersion: V1_EVENT_VERSION,
        vehicleId: V1_VEHICLE_ID,
        samples: g.samples,
    };
}

/** Field-by-field defensive read of a v2-shaped object into a fresh book. */
function readV2(raw) {
    const book = emptyBook();
    book.burgers = Number.isFinite(raw.burgers) ? raw.burgers : 0;
    book.runs = Number.isFinite(raw.runs) ? raw.runs : 0;
    book.seenAssembly = raw.seenAssembly === true;
    // The empty book already holds the home course, so even a save whose
    // unlock list rotted cannot lock the player out of everything.
    if (Array.isArray(raw.unlockedCourses)) {
        for (const id of raw.unlockedCourses) {
            if (typeof id === "string" && !book.unlockedCourses.includes(id)) {
                book.unlockedCourses.push(id);
            }
        }
    }
    if (raw.secrets && typeof raw.secrets === "object") {
        for (const [courseId, list] of Object.entries(raw.secrets)) {
            if (!Array.isArray(list)) continue;
            const clean = [];
            for (const s of list) {
                if (typeof s === "string" && !clean.includes(s)) clean.push(s);
            }
            book.secrets[courseId] = clean;
        }
    }
    if (raw.tutorial && typeof raw.tutorial === "object") {
        for (const [id, seen] of Object.entries(raw.tutorial)) {
            if (seen === true) book.tutorial[id] = true;
        }
    }
    if (
        raw.lastSelected && typeof raw.lastSelected === "object" &&
        typeof raw.lastSelected.courseId === "string" &&
        typeof raw.lastSelected.eventId === "string"
    ) {
        book.lastSelected = {
            courseId: raw.lastSelected.courseId,
            eventId: raw.lastSelected.eventId,
        };
    }
    if (raw.events && typeof raw.events === "object") {
        for (const [id, e] of Object.entries(raw.events)) {
            if (!e || typeof e !== "object") continue;
            const out = emptyEvent();
            out.completions = Number.isFinite(e.completions) ? e.completions : 0;
            out.bestTime = Number.isFinite(e.bestTime) ? e.bestTime : null;
            out.bestStyle = Number.isFinite(e.bestStyle) ? e.bestStyle : 0;
            out.bestIntegrity = Number.isFinite(e.bestIntegrity) ? e.bestIntegrity : 0;
            out.bestRocket = Number.isFinite(e.bestRocket) ? e.bestRocket : 0;
            out.bestStars = Number.isFinite(e.bestStars) ? e.bestStars : 0;
            out.bestMedal = typeof e.bestMedal === "string" ? e.bestMedal : null;
            out.bestSeed = Number.isFinite(e.bestSeed) ? e.bestSeed : null;
            out.courseId = typeof e.courseId === "string" ? e.courseId : V1_COURSE_ID;
            out.courseVersion = Number.isFinite(e.courseVersion)
                ? e.courseVersion : V1_COURSE_VERSION;
            out.eventVersion = Number.isFinite(e.eventVersion)
                ? e.eventVersion : V1_EVENT_VERSION;
            out.bestVehicle = typeof e.bestVehicle === "string" ? e.bestVehicle : null;
            out.bestGhost = validGhost(e.bestGhost) ? e.bestGhost : null;
            out.bestBigAirFlights = readBestBigAirFlights(e.bestBigAirFlights);
            book.events[id] = out;
        }
    }
    return book;
}

/**
 * Read one Big Air flight into a bounded, fresh value.  This is intentionally
 * stricter than the generic result display: flight records cross a reload and
 * are therefore untrusted save data.  Every number is finite and bounded,
 * every string is length-limited, and the record key is derived from the
 * vehicle instead of trusted from storage.
 */
function sanitizeBigAirFlight(raw, vehicleHint = null) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.vehicle === "string" && vehicleHint && raw.vehicle !== vehicleHint) {
        // The map key is the identity when reading a save. A rocket record
        // copied under the classic key must never become a classic PB.
        return null;
    }
    const vehicle = typeof raw.vehicle === "string" ? raw.vehicle : vehicleHint;
    if (!BIG_AIR_VEHICLES.has(vehicle)) return null;
    const number = (value, max) => Number.isFinite(value)
        ? Math.min(max, Math.max(0, value)) : null;
    const airtime = number(raw.airtime, 30);
    const distance = number(raw.distance, 1000);
    const maxHeight = number(raw.maxHeight, 500);
    const maxClearance = number(raw.maxClearance, 500);
    const trickScore = number(raw.trickScore, 10_000_000);
    if (airtime === null || distance === null || maxHeight === null ||
        maxClearance === null || trickScore === null) return null;
    const trick = typeof raw.trick === "string"
        ? raw.trick.slice(0, 80) : null;
    const landingGrade = FLIGHT_GRADES.has(raw.landingGrade)
        ? raw.landingGrade : null;
    return {
        vehicle,
        airtime,
        distance,
        maxHeight,
        maxClearance,
        trick,
        trickScore,
        landingGrade,
        recordKey: `big-air-basin:${vehicle}`,
    };
}

function readBestBigAirFlights(raw) {
    const clean = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
    for (const vehicle of BIG_AIR_VEHICLES) {
        const flight = sanitizeBigAirFlight(raw[vehicle], vehicle);
        if (flight) clean[vehicle] = flight;
    }
    return clean;
}

function cloneFlight(flight) {
    return flight ? { ...flight } : null;
}

function validGhost(g) {
    return (
        g && typeof g === "object" &&
        g.version === SCHEMA_VERSION &&
        Number.isFinite(g.seed) &&
        Number.isFinite(g.interval) &&
        g.interval > 0 &&
        typeof g.courseId === "string" &&
        Number.isFinite(g.courseVersion) &&
        typeof g.eventId === "string" &&
        Number.isFinite(g.eventVersion) &&
        typeof g.vehicleId === "string" &&
        Array.isArray(g.samples) &&
        g.samples.length > 0 &&
        g.samples.length % 3 === 0 &&
        g.samples.every(Number.isFinite)
    );
}

/**
 * Should this stored ghost race this run?
 *
 * The route is a function of the seed, the course revision decides the
 * terrain the samples were recorded over, the event layout decides where the
 * pickups were, and the vehicle decides what pace is comparable. A mismatch
 * on any one of them means the ghost rode a different run, and racing it
 * would be a lie — so the match is strict on every field, no partial credit.
 *
 * Lives here rather than in ghost.js because ghost.js pulls Babylon mesh
 * builders and cannot load outside a browser; this module can, so the rule
 * stays testable.
 *
 * @param {object|null} stored a candidate `bestGhost`
 * @param {object} expect {seed, courseId, courseVersion, eventId,
 *                         eventVersion, vehicleId} of the run being ridden
 */
export function ghostMatches(stored, expect) {
    if (!validGhost(stored)) return false;
    if (!expect || typeof expect !== "object") return false;
    return (
        stored.seed === expect.seed &&
        stored.courseId === expect.courseId &&
        stored.courseVersion === expect.courseVersion &&
        stored.eventId === expect.eventId &&
        stored.eventVersion === expect.eventVersion &&
        stored.vehicleId === expect.vehicleId
    );
}

export class BurgerBook {
    constructor() {
        this.book = this.load();
    }

    load() {
        const s = storage();
        if (!s) return emptyBook();
        let raw;
        try {
            raw = JSON.parse(s.getItem(KEY) ?? "null");
        } catch {
            console.warn("[snow-burgers] save was not valid JSON; starting a new book");
            return emptyBook();
        }
        const migrated = migrate(raw);
        if (raw && !migrated) {
            console.warn("[snow-burgers] save was not a readable version; starting a new book");
        }
        return migrated ?? emptyBook();
    }

    save() {
        const s = storage();
        if (!s) return false;
        try {
            s.setItem(KEY, JSON.stringify(this.book));
            return true;
        } catch (err) {
            // A quota failure is not worth interrupting a run over.
            console.warn("[snow-burgers] could not save:", err);
            return false;
        }
    }

    event(id) {
        if (!this.book.events[id]) this.book.events[id] = emptyEvent();
        return this.book.events[id];
    }

    /**
     * Record a finished run. Returns which records it broke.
     *
     * @param {object} [meta] {courseId, courseVersion, eventVersion,
     *     vehicleId} of the run — stamped onto the record when a new best
     *     time lands, so the record knows what it was set on. A caller that
     *     predates the meta argument gets the v1 identity, which is exactly
     *     what such a caller was recording.
     */
    record(eventId, result, ghost, meta) {
        const e = this.event(eventId);
        const broke = {
            time: false, style: false, integrity: false, stars: false,
            /** True only when this run improves its vehicle's Big Air PB. */
            bigAir: false,
        };

        // Older v2 event objects may have been kept in memory by a host that
        // constructed them before this optional field existed.  Repair just
        // this field, preserving every other record rather than replacing the
        // event or forcing a schema migration.
        if (!e.bestBigAirFlights || typeof e.bestBigAirFlights !== "object" ||
            Array.isArray(e.bestBigAirFlights)) {
            e.bestBigAirFlights = {};
        }

        // The registry event id is the trust boundary.  Do not let an
        // arbitrary caller-supplied meta object manufacture a Big Air record
        // on an ordinary event.
        const isBigAirResult = eventId === BIG_AIR_EVENT_ID && result?.completed === true;
        const candidate = isBigAirResult
            ? sanitizeBigAirFlight(result?.bigAirFlight) : null;
        if (candidate) {
            const previous = sanitizeBigAirFlight(
                e.bestBigAirFlights[candidate.vehicle], candidate.vehicle
            );
            const improved = isBetterBigAirFlight(candidate, previous);
            if (improved) {
                e.bestBigAirFlights[candidate.vehicle] = candidate;
                broke.bigAir = true;
            }
            // `record()` is the save boundary, so publish both sides of the
            // comparison on the result before the caller assigns records.
            // The current best is the persisted winner; `candidate` remains
            // available when a repeat attempt did not beat it.
            if (result && typeof result === "object") {
                result.bigAirBest = {
                    vehicle: candidate.vehicle,
                    isNew: improved,
                    previous: cloneFlight(previous),
                    current: cloneFlight(improved ? candidate : previous),
                    candidate: cloneFlight(candidate),
                };
            }
        }

        this.book.runs++;
        if (result.completed) {
            this.book.burgers++;
            e.completions++;
            if (e.bestTime === null || result.time < e.bestTime) {
                broke.time = true;
                e.bestTime = result.time;
                e.bestSeed = result.seed;
                e.bestMedal = result.medal;
                const m = meta && typeof meta === "object" ? meta : {};
                e.courseId = typeof m.courseId === "string" ? m.courseId : V1_COURSE_ID;
                e.courseVersion = Number.isFinite(m.courseVersion)
                    ? m.courseVersion : V1_COURSE_VERSION;
                e.eventVersion = Number.isFinite(m.eventVersion)
                    ? m.eventVersion : V1_EVENT_VERSION;
                e.bestVehicle = typeof m.vehicleId === "string"
                    ? m.vehicleId : V1_VEHICLE_ID;
                if (ghost && validGhost(ghost)) e.bestGhost = ghost;
            }
        }
        if (result.style > e.bestStyle) { broke.style = true; e.bestStyle = result.style; }
        if (result.integrity > e.bestIntegrity) {
            broke.integrity = true;
            e.bestIntegrity = result.integrity;
        }
        if (result.rocket > e.bestRocket) e.bestRocket = result.rocket;
        if (result.stars > e.bestStars) { broke.stars = true; e.bestStars = result.stars; }

        this.save();
        return broke;
    }

    markAssemblySeen() {
        if (this.book.seenAssembly) return;
        this.book.seenAssembly = true;
        this.save();
    }

    /** Open a course. Idempotent — unlocking twice writes nothing new. */
    unlockCourse(id) {
        if (typeof id !== "string") return;
        if (this.book.unlockedCourses.includes(id)) return;
        this.book.unlockedCourses.push(id);
        this.save();
    }

    isCourseUnlocked(id) {
        return this.book.unlockedCourses.includes(id);
    }

    /**
     * Note a found secret. Returns whether it was new, because the UI only
     * celebrates a first find.
     */
    addSecret(courseId, secretId) {
        if (!this.book.secrets[courseId]) this.book.secrets[courseId] = [];
        const list = this.book.secrets[courseId];
        if (list.includes(secretId)) return false;
        list.push(secretId);
        this.save();
        return true;
    }

    /** Remember where the menu should reopen. */
    setLastSelected(courseId, eventId) {
        this.book.lastSelected = { courseId, eventId };
        this.save();
    }

    /** A tutorial beat has been shown; never show it again. */
    markTutorial(id) {
        if (this.book.tutorial[id] === true) return;
        this.book.tutorial[id] = true;
        this.save();
    }

    /** Wipe the book. Exposed for the overlay and for repeatable QA runs. */
    reset() {
        this.book = emptyBook();
        const s = storage();
        try { s?.removeItem(KEY); } catch { /* nothing to do */ }
    }
}
