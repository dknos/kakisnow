/**
 * The Burger Book — what survives a page reload.
 *
 * Deliberately small. It holds the records a player would be annoyed to lose
 * and nothing else: how many burgers they have finished, their best run, and
 * whether they have already sat through the assembly cinematic once.
 *
 * Versioned from the first release rather than from the first time the shape
 * changes, because the alternative is reading an unlabelled object and guessing
 * — and a save whose shape cannot be identified is a save that has to be
 * thrown away. `migrate` is where a future schema change goes.
 *
 * Every read is defensive. `localStorage` can be unavailable entirely (a
 * privacy mode, a sandboxed frame), can hold something another tool wrote, and
 * can hold a truncated string from a tab that died mid-write. None of those may
 * take the game down: a corrupt save is discarded and play continues with a
 * fresh book, which is a strictly better outcome than a boot failure over a
 * high score.
 */

const KEY = "snow-burgers.book";
export const SCHEMA_VERSION = 1;

/** @returns {object} a book with every field present at its zero value. */
export function emptyBook() {
    return {
        version: SCHEMA_VERSION,
        burgers: 0,
        runs: 0,
        seenAssembly: false,
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
        /** @type {null|{version:number, seed:number, samples:number[]}} */
        bestGhost: null,
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
 * There is only one version so far, so this is a guard rather than a ladder:
 * anything that is not the current version and is not recognised is rejected.
 * When version 2 exists, its step goes here and the rejection moves down.
 */
function migrate(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.version !== SCHEMA_VERSION) return null;
    const book = emptyBook();
    book.burgers = Number.isFinite(raw.burgers) ? raw.burgers : 0;
    book.runs = Number.isFinite(raw.runs) ? raw.runs : 0;
    book.seenAssembly = raw.seenAssembly === true;
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
            out.bestGhost = validGhost(e.bestGhost) ? e.bestGhost : null;
            book.events[id] = out;
        }
    }
    return book;
}

function validGhost(g) {
    return (
        g && typeof g === "object" &&
        g.version === SCHEMA_VERSION &&
        Number.isFinite(g.seed) &&
        Array.isArray(g.samples) &&
        g.samples.length > 0 &&
        g.samples.every(Number.isFinite)
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

    /** Record a finished run. Returns which records it broke. */
    record(eventId, result, ghost) {
        const e = this.event(eventId);
        const broke = { time: false, style: false, integrity: false, stars: false };

        this.book.runs++;
        if (result.completed) {
            this.book.burgers++;
            e.completions++;
            if (e.bestTime === null || result.time < e.bestTime) {
                broke.time = true;
                e.bestTime = result.time;
                e.bestSeed = result.seed;
                e.bestMedal = result.medal;
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

    /** Wipe the book. Exposed for the overlay and for repeatable QA runs. */
    reset() {
        this.book = emptyBook();
        const s = storage();
        try { s?.removeItem(KEY); } catch { /* nothing to do */ }
    }
}
