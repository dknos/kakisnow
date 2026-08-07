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

    for (const [i, g] of (t.ridges ?? []).entries()) {
        if (![g.zFrom, g.zTo, g.featherZ, g.xCentre, g.halfWidth, g.featherX,
              g.height].every(Number.isFinite)) {
            p.push(`ridge ${i} is missing a field`);
            continue;
        }
        if (g.zFrom >= g.zTo) p.push(`ridge ${i} span is inverted`);
        if (!(g.halfWidth > 0) || !(g.featherX > 0) || !(g.featherZ > 0)) {
            p.push(`ridge ${i} needs positive widths and feathers`);
        }
        if (g.height === 0) p.push(`ridge ${i} has zero height`);
    }

    for (const [i, s] of (t.skiJumps ?? []).entries()) {
        const fields = ["fadeInFrom", "holdFrom", "lipZ", "inrunLen", "inrunDrop",
            "tableLen", "lipRise", "hillLen", "hillDrop", "outrunLen",
            "outrunDrop", "closeLen", "gateXFrom", "gateXTo", "bowl"];
        const missing = fields.filter(k => !Number.isFinite(s[k]));
        if (missing.length) {
            p.push(`ski jump ${i} is missing ${missing.join(", ")}`);
            continue;
        }
        if (s.fadeInFrom >= s.holdFrom) p.push(`ski jump ${i} fade-in is inverted`);
        // The profile must not start before the gate has finished opening, or
        // the in-run begins as a step out of the natural field.
        if (s.holdFrom > s.lipZ - s.inrunLen) {
            p.push(`ski jump ${i} in-run starts before its gate is open`);
        }
        if (!(s.tableLen > 0) || !(s.inrunLen > s.tableLen)) {
            p.push(`ski jump ${i} needs 0 < tableLen < inrunLen`);
        }
        if (!(s.lipRise > 0)) {
            p.push(`ski jump ${i} has no lip rise, so it has no takeoff`);
        }
        // A hill that does not fall below the lip is a drop onto flat ground.
        if (!(s.hillDrop > s.lipRise)) {
            p.push(`ski jump ${i} landing hill does not fall below its lip`);
        }
        for (const k of ["hillLen", "outrunLen", "closeLen"]) {
            if (!(s[k] > 0)) p.push(`ski jump ${i} needs a positive ${k}`);
        }
        if (s.gateXFrom >= s.gateXTo) {
            p.push(`ski jump ${i} lateral gate is inverted`);
        }
    }

    for (const [i, g] of (c.gusts ?? []).entries()) {
        if (![g.zFrom, g.zTo, g.xFrom, g.xTo, g.push].every(Number.isFinite) ||
            g.zFrom >= g.zTo || g.xFrom >= g.xTo || g.push === 0) {
            p.push(`gust ${i} is malformed`);
        }
    }
    if (c.avalanche) {
        const a = c.avalanche;
        if (![a.startBehind, a.lead, a.basePace, a.catchup, a.maxPace]
            .every(Number.isFinite) ||
            a.basePace <= 0 || a.maxPace < a.basePace || a.startBehind <= 0) {
            p.push("avalanche block is malformed");
        }
    }

    for (const [i, sc] of (c.snowcats ?? []).entries()) {
        if (![sc.ax, sc.az, sc.bx, sc.bz, sc.speed].every(Number.isFinite) ||
            !(sc.speed > 0)) {
            p.push(`snowcat ${i} is malformed`);
        } else if (sc.speed > 4) {
            p.push(`snowcat ${i} is too fast to read (${sc.speed} m/s)`);
        }
    }

    for (const [i, r] of (c.rails ?? []).entries()) {
        if (![r.ax, r.az, r.bx, r.bz, r.height].every(Number.isFinite) ||
            !(r.height > 0)) {
            p.push(`rail ${i} is malformed`);
        }
    }

    for (const [i, sf] of (c.surfaces ?? []).entries()) {
        if (![sf.zFrom, sf.zTo, sf.xFrom, sf.xTo, sf.hardness]
            .every(Number.isFinite)) {
            p.push(`surface ${i} is missing a field`);
            continue;
        }
        if (sf.zFrom >= sf.zTo || sf.xFrom >= sf.xTo) {
            p.push(`surface ${i} rectangle is inverted`);
        }
        if (sf.hardness < 0 || sf.hardness > 1) {
            p.push(`surface ${i} hardness must be 0..1`);
        }
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

    const secrets = c.secrets ?? [];
    if (secrets.length !== 3) {
        p.push(`course carries ${secrets.length} recipe tapes; the tour promises 3`);
    }
    const tapeIds = new Set();
    for (const [i, tp] of secrets.entries()) {
        if (typeof tp.id !== "string" || ![tp.x, tp.z].every(Number.isFinite)) {
            p.push(`secret ${i} is malformed`);
            continue;
        }
        if (tapeIds.has(tp.id)) p.push(`secret id "${tp.id}" repeats`);
        tapeIds.add(tp.id);
        if (Math.hypot(tp.x, tp.z) > PLAY_LIMIT - 10) {
            p.push(`secret "${tp.id}" is outside the play radius`);
        }
    }

    /**
     * The venue block, if there is one.
     *
     * Every other course subsystem fails loudly at module load; this one used
     * to fail as a frozen tab, because `venue.js` walks `for (let z = zFrom;
     * z <= zTo; z += spacing)` and a spacing of zero — or a mistyped key,
     * which reads as `undefined` and then `NaN` — is an infinite loop inside
     * the loading screen.
     */
    if (c.venue) {
        const v = c.venue;
        const positive = (obj, keys, label) => {
            for (const k of keys) {
                if (!(obj[k] > 0)) p.push(`${label} needs a positive ${k}`);
            }
        };
        if (v.stands) {
            const s = v.stands;
            positive(s, ["spacing", "rise", "tiers", "innerX", "outerX"], "venue.stands");
            if (!(s.zFrom < s.zTo)) p.push("venue.stands span is inverted");
            if (!(s.innerX < s.outerX)) p.push("venue.stands x range is inverted");
        }
        if (v.flags) {
            positive(v.flags, ["spacing", "halfWidth"], "venue.flags");
            if (!(v.flags.zFrom < v.flags.zTo)) p.push("venue.flags span is inverted");
        }
        if (v.gantry) {
            positive(v.gantry, ["halfWidth", "bays"], "venue.gantry");
            if (!Number.isFinite(v.gantry.z)) p.push("venue.gantry needs a z");
        }
        if (v.judges &&
            ![v.judges.x, v.judges.z].every(Number.isFinite)) {
            p.push("venue.judges needs x and z");
        }
        for (const [i, w] of (v.windsocks ?? []).entries()) {
            if (![w.x, w.z].every(Number.isFinite)) {
                p.push(`venue.windsocks[${i}] needs x and z`);
            }
        }
        for (const [i, l] of (v.lights ?? []).entries()) {
            if (![l.x, l.z].every(Number.isFinite)) {
                p.push(`venue.lights[${i}] needs x and z`);
            }
        }
        if (v.lift) {
            positive(v.lift, ["pylons", "height", "chairs"], "venue.lift");
            if (!Number.isFinite(v.lift.x)) p.push("venue.lift needs an x");
            if (!(v.lift.zFrom < v.lift.zTo)) p.push("venue.lift span is inverted");
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

    for (const key of ["styleTarget", "integrityTarget"]) {
        if (e[key] !== undefined &&
            !(Number.isFinite(e[key]) && e[key] > 0 && e[key] <= 100)) {
            p.push(`${key} must be a number in 1..100`);
        }
    }
    if (e.trickTarget !== undefined &&
        !(Number.isFinite(e.trickTarget) && e.trickTarget > 0)) {
        p.push("trickTarget must be a positive number");
    }

    if (e.seedPolicy !== "random" && e.seedPolicy !== "fixed") {
        p.push(`unknown seedPolicy "${e.seedPolicy}"`);
    }
    if (e.seedPolicy === "fixed" && !Number.isFinite(e.fixedSeed)) {
        p.push("fixed seedPolicy needs fixedSeed");
    }

    return p;
}
