/**
 * Course and event validation.
 *
 * Returns a list of problems rather than throwing, so a test can assert on
 * the specific complaint and the registry can aggregate before it throws.
 * Every rule here exists because the silent version of the failure was worse:
 * a zone in a landing is a coin-toss pickup, an unordered checkpoint list
 * respawns a rider backwards, an event pointing at a missing zone strands a
 * run that can never finish.
 */

/** The playable clamp radius — mirrors PLAY_RADIUS in heightfield.js. */
const PLAY_LIMIT = 620;

/**
 * @param {object} c a course definition
 * @returns {string[]} problems; empty means valid
 */
export function validateCourse(c) {
    const p = [];
    if (!c || typeof c !== "object") return ["course is not an object"];

    if (typeof c.id !== "string" || !c.id) p.push("missing id");
    if (!Number.isFinite(c.version)) p.push("missing version");
    if (typeof c.title !== "string" || !c.title) p.push("missing title");

    if (!Number.isFinite(c.startZ)) p.push("missing startZ");
    if (!Number.isFinite(c.finishZ)) p.push("missing finishZ");
    if (Number.isFinite(c.startZ) && Number.isFinite(c.finishZ) &&
        c.finishZ <= c.startZ) {
        p.push(`finishZ ${c.finishZ} is not downhill of startZ ${c.startZ}`);
    }
    if (!Number.isFinite(c.baseCampZ) || c.baseCampZ <= c.finishZ) {
        p.push("baseCampZ must sit past the finish");
    }
    if (Math.max(Math.abs(c.startZ ?? 0), Math.abs(c.baseCampZ ?? 0)) >
        PLAY_LIMIT - 20) {
        p.push(`course exceeds the ${PLAY_LIMIT} m play radius`);
    }

    const t = c.terrain;
    if (!t || typeof t !== "object") {
        p.push("missing terrain block");
        return p;
    }
    if (!t.gate || ![t.gate.zInFrom, t.gate.zInTo, t.gate.zOutFrom, t.gate.zOutTo]
        .every(Number.isFinite)) {
        p.push("terrain.gate needs zInFrom/zInTo/zOutFrom/zOutTo");
    } else {
        if (t.gate.zInFrom >= t.gate.zInTo) p.push("gate fade-in is inverted");
        if (t.gate.zOutFrom >= t.gate.zOutTo) p.push("gate fade-out is inverted");
        if (t.gate.zInTo > c.startZ) {
            p.push("gate is still fading in at the start gate");
        }
        if (t.gate.zOutFrom < c.finishZ) {
            p.push("gate starts fading out before the finish");
        }
    }
    if (!(t.laneHalf > 0) || !(t.laneFeather > t.laneHalf)) {
        p.push("lane needs 0 < laneHalf < laneFeather");
    }

    for (const [i, j] of (t.jumps ?? []).entries()) {
        if (![j.lip, j.runIn, j.drop, j.height].every(Number.isFinite) ||
            j.runIn <= 0 || j.drop <= 0 || j.height <= 0) {
            p.push(`jump ${i} is malformed`);
        }
    }
    for (const [i, q] of (t.pipes ?? []).entries()) {
        if (![q.from, q.to, q.featherIn, q.featherOut, q.wallFrom, q.wallTo,
              q.amp, q.pack, q.packFalloff, q.gateXFrom, q.gateXTo]
            .every(Number.isFinite)) {
            p.push(`pipe ${i} is missing a field`);
            continue;
        }
        if (q.from >= q.to) p.push(`pipe ${i} span is inverted`);
        if (q.wallFrom >= q.wallTo) p.push(`pipe ${i} wall profile is inverted`);
        if (q.gateXFrom >= q.gateXTo) p.push(`pipe ${i} lateral gate is inverted`);
    }

    if (!c.zones || typeof c.zones !== "object" || !Object.keys(c.zones).length) {
        p.push("course has no ingredient zones");
    } else {
        for (const [id, z] of Object.entries(c.zones)) {
            if (z.id !== id) p.push(`zone "${id}" carries mismatched id "${z.id}"`);
            if (!Array.isArray(z.z) || !Array.isArray(z.x) ||
                !(z.z[0] < z.z[1]) || !(z.x[0] < z.x[1])) {
                p.push(`zone "${id}" has malformed bounds`);
                continue;
            }
            if (z.z[0] < c.startZ || z.z[1] > c.finishZ) {
                p.push(`zone "${id}" leaves the course along z`);
            }
            if (Math.max(Math.abs(z.x[0]), Math.abs(z.x[1])) > t.laneFeather) {
                p.push(`zone "${id}" leaves the lane feather along x`);
            }
            if (!(z.maxSlope > 0)) p.push(`zone "${id}" needs a maxSlope`);
            if (!Number.isFinite(z.risk)) p.push(`zone "${id}" needs a risk`);
        }
    }

    if (!Array.isArray(c.features) || c.features.length < 2) {
        p.push("course needs at least a start and finish feature");
    } else {
        for (let i = 1; i < c.features.length; i++) {
            if (c.features[i].z <= c.features[i - 1].z) {
                p.push(`feature "${c.features[i].label}" is out of downhill order`);
            }
        }
    }

    if (!Array.isArray(c.events) || !c.events.length) {
        p.push("course offers no events");
    }
    if (!c.dressing || typeof c.dressing.seed !== "number") {
        p.push("dressing needs a deterministic seed");
    }

    return p;
}

/** Vehicles that exist. Mirrors vehicleProfiles.js without importing it. */
const KNOWN_VEHICLES = ["classic-snowboard", "rocket-chair"];

/**
 * @param {object} e an event definition
 * @param {object} course the course it claims to belong to
 * @returns {string[]} problems; empty means valid
 */
export function validateEvent(e, course) {
    const p = [];
    if (!e || typeof e !== "object") return ["event is not an object"];

    if (typeof e.id !== "string" || !e.id) p.push("missing id");
    if (!Number.isFinite(e.version)) p.push("missing version");
    if (!course || e.courseId !== course.id) {
        p.push(`event "${e.id}" points at course "${e.courseId}"`);
        return p;
    }
    if (typeof e.name !== "string" || !e.name) p.push("missing name");

    const MODES = ["delivery", "time-trial", "style-delivery", "rocket-rush", "final"];
    if (!MODES.includes(e.mode)) p.push(`unknown mode "${e.mode}"`);

    if (!Array.isArray(e.required)) {
        p.push("required must be an array (empty is legal for score events)");
    } else {
        for (const id of e.required) {
            if (!course.zones[id]) {
                p.push(`required ingredient "${id}" has no zone on ${course.id}`);
            }
        }
    }

    for (const v of e.allowedVehicles ?? []) {
        if (!KNOWN_VEHICLES.includes(v)) p.push(`unknown vehicle "${v}"`);
    }
    if (e.forcedVehicle && !KNOWN_VEHICLES.includes(e.forcedVehicle)) {
        p.push(`unknown forced vehicle "${e.forcedVehicle}"`);
    }

    if (!e.medals ||
        !(e.medals.gold < e.medals.silver && e.medals.silver < e.medals.bronze)) {
        p.push("medals must satisfy gold < silver < bronze (seconds)");
    }

    if (e.seedPolicy !== "random" && e.seedPolicy !== "fixed") {
        p.push(`unknown seedPolicy "${e.seedPolicy}"`);
    }
    if (e.seedPolicy === "fixed" && !Number.isFinite(e.fixedSeed)) {
        p.push("fixed seedPolicy needs fixedSeed");
    }

    return p;
}
