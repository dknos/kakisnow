/**
 * Where the ingredients go, and the proof that a run can collect all of them.
 *
 * Pickups are not scattered. Each ingredient owns an authored zone on the
 * Summit Line, a stratified set of candidate anchors is generated inside that
 * zone, every candidate is validated against the actual baked terrain, and one
 * survivor per ingredient is chosen from a seed. The same seed always produces
 * the same run.
 *
 * ------------------------------------------------------------------ the terrain
 *
 * This module never computes a terrain height itself. It takes a `field`
 * object — `heightAt(x, z)` and `normalAt(x, z, out)` — because the only
 * authoritative heights in this project come from reading back the GPU
 * heightfield bake, and `DECISIONS.md` is explicit about why re-implementing
 * that noise in JavaScript would drift: f32 GPU maths against f64 JS maths
 * disagree by centimetres, and a pickup placed by the second one floats or
 * sinks against the surface drawn by the first.
 *
 * That injection is also what makes this testable. A synthetic field with
 * known slopes exercises every rejection rule without a GPU, and the real
 * 100-seed sweep runs in the browser against the real bake — see
 * `tools/snow-burgers/validate-placement-windows.cjs`.
 *
 * ------------------------------------------------------------------ the course
 *
 * The zone bounds below are read off `src/shaders/heightBake.fragment.wgsl`,
 * which is where the course actually is. Summit Line runs downhill along +Z
 * from roughly z = 0 to the finish at z = 520, inside a lane that is full
 * strength to |x| = 34 and feathers out by |x| = 68:
 *
 *   z  50, 184, 496   jump lips, each with a run-in before it and a drop after
 *   z 292 – 370       halfpipe A, walls rising from |x| = 5 to |x| = 21
 *   z 410 – 450       halfpipe B, same cross-section
 *
 * The protected spans are derived from those numbers rather than typed
 * separately, so a change to the course shape moves the exclusions with it.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

// ------------------------------------------------------------------ course facts
// Mirrors `summitLine()` in heightBake.fragment.wgsl. Kept as data so the
// protected spans below are derived rather than asserted.

/** @type {{lip:number, runIn:number, drop:number}[]} */
export const JUMPS = [
    { lip: 50, runIn: 22, drop: 20 },
    { lip: 184, runIn: 26, drop: 24 },
    { lip: 496, runIn: 26, drop: 24 },
];

/** @type {{from:number, to:number, wallFrom:number, wallTo:number}[]} */
export const PIPES = [
    { from: 292, to: 370, wallFrom: 5, wallTo: 21 },
    { from: 410, to: 450, wallFrom: 5, wallTo: 21 },
];

export const COURSE_FINISH_Z = 520;
/** The finish gate at Burger Base Camp, clear of the last kicker's landing. */
export const BASE_CAMP_Z = 548;
/** Full-strength lane half-width. */
export const LANE_HALF = 34;

/**
 * How far past a lip a landing stays protected.
 *
 * The drop in the height bake is where the ramp's back side finishes, not where
 * the rider does. A takeoff at speed carries well beyond it, and a pickup
 * sitting in that span is one the player meets mid-air with no ability to steer
 * — which is the difference between a route decision and a coin toss.
 */
const LANDING_MARGIN = 16;
/** How far before a lip the approach stays clear, so the run-in is readable. */
const APPROACH_MARGIN = 10;

// --------------------------------------------------------------------- zones

/**
 * @typedef {object} Zone
 * @property {string} id
 * @property {string} name        shown on the HUD and the route signage
 * @property {[number,number]} z  along-course span
 * @property {[number,number]} x  lateral span; negative to positive
 * @property {number} maxSlope    reject anchors steeper than this, radians
 * @property {number} risk        0..1, feeds the results screen's route rating
 * @property {string} note        what the zone is for, in one line
 */

/** @type {Record<string, Zone>} */
export const ZONES = {
    cheese: {
        id: "cheese",
        name: "Cheese Chute",
        // Between the first hit's landing and the ridgeline hit's approach.
        z: [92, 140],
        x: [-26, 26],
        maxSlope: 0.62,
        risk: 0.25,
        note: "Upper mountain. First real line choice, taken at speed.",
    },
    patty: {
        id: "patty",
        name: "Patty Bowl",
        // The open span between the ridgeline landing and the first pipe gate.
        z: [224, 262],
        x: [-30, 30],
        maxSlope: 0.58,
        risk: 0.35,
        note: "Wide powder bowl. Several approaches, all of them fast.",
    },
    tomato: {
        id: "tomato",
        name: "Tomato Pipe",
        // Inside halfpipe A, held near the centre so the approach is a
        // transfer rather than a wall-scrape.
        z: [300, 366],
        x: [-13, 13],
        maxSlope: 0.70,
        risk: 0.55,
        note: "In the north pipe. Rewards a transfer, punishes a lazy line.",
    },
    lettuce: {
        id: "lettuce",
        name: "Lettuce Ledge",
        z: [412, 458],
        x: [-18, 18],
        maxSlope: 0.66,
        risk: 0.45,
        note: "Lower technical line through the south pipe.",
    },
    onion: {
        id: "onion",
        name: "Onion Outrun",
        // Deliberately off the lane. The onion is the variant-order ingredient,
        // and what makes it a decision rather than a chore is that collecting
        // it costs a detour out of the fast line and back.
        z: [230, 268],
        x: [-50, 50],
        maxSlope: 0.60,
        risk: 0.70,
        note: "Outside the lane. A detour, paid for in time.",
    },
};

/**
 * The onion's zone is an annulus, not a rectangle: the middle belongs to the
 * patty. Anything inside this half-width is rejected for it.
 */
const ONION_INNER_HALF = 26;

// ------------------------------------------------------------------ anchor rules

/** Clearance the pedestal needs above the surface it is checked against. */
const CLEARANCE_SAMPLES = 8;
const CLEARANCE_RADIUS = 2.2;
/** Reject an anchor whose local surface varies by more than this across the pad. */
const MAX_LOCAL_RELIEF = 0.55;
/** Keep selected anchors apart so two pickups never read as one cluster. */
const MIN_SEPARATION = 22;

/**
 * The tightest lateral shift a rider can make between two pickups.
 *
 * At the controller's `SURF_MAX` of 19.5 m/s and `SURF_TURN` of 2.35 rad/s a
 * carve turns inside about 8.3 m, so a heading change of 40° is comfortable and
 * anything under it is reachable without braking. Expressed as a ratio of the
 * along-course gap, which is what the check actually has.
 */
const MAX_LATERAL_RATIO = 0.84;

// ------------------------------------------------------------------ determinism

/**
 * mulberry32. Small, fast, and — the reason it is here rather than
 * `Math.random` — reproducible from a seed, which is what lets a run be
 * replayed, a ghost be compared and a route be validated across 100 seeds.
 */
export function rng(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ------------------------------------------------------------------ exclusions

/** Spans of z that no pickup may occupy, with the reason. */
export function protectedSpans() {
    const spans = [];
    for (const j of JUMPS) {
        spans.push({
            from: j.lip - j.runIn - APPROACH_MARGIN,
            to: j.lip,
            reason: `approach to the lip at z=${j.lip}`,
        });
        spans.push({
            from: j.lip,
            to: j.lip + j.drop + LANDING_MARGIN,
            reason: `landing from the lip at z=${j.lip}`,
        });
    }
    return spans;
}

const SPANS = protectedSpans();

function inProtectedSpan(z) {
    for (const s of SPANS) if (z >= s.from && z <= s.to) return s;
    return null;
}

/** True where the halfpipe wall is steep enough that a pickup would sit on it. */
function onPipeWall(x, z) {
    for (const p of PIPES) {
        if (z < p.from || z > p.to) continue;
        const ax = Math.abs(x);
        if (ax > p.wallFrom && ax < p.wallTo + 6) return true;
    }
    return false;
}

// ------------------------------------------------------------------ candidates

const _n = new Vector3();

/**
 * Generate and validate every candidate anchor for one zone.
 *
 * Stratified rather than uniform: the zone is divided into a grid and one
 * jittered sample is taken per cell, so candidates cover the zone instead of
 * clumping the way independent uniform draws do. Every candidate then has to
 * survive the same checks, and the ones that fail record why — the rejection
 * reasons are what make a zone that produces nothing debuggable rather than
 * mysterious.
 *
 * @param {Zone} zone
 * @param {{heightAt(x:number,z:number):number, normalAt(x:number,z:number,out:Vector3):Vector3}} field
 * @param {number} seed
 * @returns {{anchors: object[], rejected: object[]}}
 */
export function candidatesFor(zone, field, seed = 1) {
    const next = rng(seed ^ hashString(zone.id));
    const anchors = [];
    const rejected = [];

    const zSpan = zone.z[1] - zone.z[0];
    const xSpan = zone.x[1] - zone.x[0];
    const rows = Math.max(3, Math.round(zSpan / 7));
    const cols = Math.max(3, Math.round(xSpan / 7));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const z = zone.z[0] + ((r + next()) / rows) * zSpan;
            const x = zone.x[0] + ((c + next()) / cols) * xSpan;

            const reason = rejectReason(zone, x, z, field);
            if (reason) {
                rejected.push({ x, z, reason });
                continue;
            }

            const y = field.heightAt(x, z);
            field.normalAt(x, z, _n);
            const slope = Math.acos(Math.min(1, Math.max(-1, _n.y)));

            anchors.push({
                zone: zone.id,
                x, y, z,
                normal: [_n.x, _n.y, _n.z],
                slope,
                // Downhill is +Z; the approach direction is the heading a rider
                // arrives on, which the pedestal and the route flags face.
                approach: Math.atan2(-_n.x, -_n.z),
                clearance: localRelief(x, z, field),
                risk: zone.risk,
                // How far out the beacon should be visible. Deeper in a pipe
                // means less warning, so the beacon carries further.
                visibility: onPipeWall(x, z) ? 150 : 110,
                protectedRadius: MIN_SEPARATION * 0.5,
            });
        }
    }

    return { anchors, rejected };
}

/** @returns {string|null} why this position is unusable, or null if it is fine. */
function rejectReason(zone, x, z, field) {
    if (zone.id === "onion" && Math.abs(x) < ONION_INNER_HALF) {
        return "inside the lane, which belongs to the patty";
    }

    const span = inProtectedSpan(z);
    if (span) return span.reason;

    if (zone.id !== "tomato" && zone.id !== "lettuce" && onPipeWall(x, z)) {
        return "on a halfpipe wall";
    }
    // The two pipe ingredients live in the pipe, but still not up its wall.
    if ((zone.id === "tomato" || zone.id === "lettuce") && onPipeWall(x, z)) {
        for (const p of PIPES) {
            if (z >= p.from && z <= p.to && Math.abs(x) > p.wallFrom + 3) {
                return "too far up the pipe wall to approach at speed";
            }
        }
    }

    field.normalAt(x, z, _n);
    const slope = Math.acos(Math.min(1, Math.max(-1, _n.y)));
    if (slope > zone.maxSlope) {
        return `slope ${slope.toFixed(2)} rad exceeds ${zone.maxSlope}`;
    }

    const relief = localRelief(x, z, field);
    if (relief > MAX_LOCAL_RELIEF) {
        return `local relief ${relief.toFixed(2)} m — the pad would not sit flat`;
    }

    return null;
}

/**
 * Roughness across the pedestal's footprint, measured against the local plane.
 *
 * A single height sample says nothing about whether a 2 m pad can rest here.
 * Sampling a ring is what catches a rock edge or the lip of a trench, both of
 * which read as a pickup buried on one side and floating on the other.
 *
 * The subtraction is the whole of it. Raw peak-to-trough over the ring measures
 * the slope, not the surface: the Summit Line opens on a 43-degree face, where
 * a 2.2 m radius spans two metres of perfectly smooth height and every anchor
 * on the course would be rejected as "not flat". What a pad actually cares
 * about is deviation from the plane it would be bedded into, so the plane the
 * surface normal describes is removed first and the residual is what is
 * checked. Slope is already rejected separately, by `maxSlope`.
 */
function localRelief(x, z, field) {
    const centre = field.heightAt(x, z);
    field.normalAt(x, z, _n);
    // Height the tangent plane predicts at an offset. Guarded because a
    // vertical face has n.y at zero, and that anchor is rejected on slope
    // anyway — this must not divide by it first.
    const ny = Math.max(Math.abs(_n.y), 1e-3);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < CLEARANCE_SAMPLES; i++) {
        const a = (i / CLEARANCE_SAMPLES) * Math.PI * 2;
        const dx = Math.cos(a) * CLEARANCE_RADIUS;
        const dz = Math.sin(a) * CLEARANCE_RADIUS;
        const predicted = centre - (_n.x * dx + _n.z * dz) / ny;
        const residual = field.heightAt(x + dx, z + dz) - predicted;
        if (residual < lo) lo = residual;
        if (residual > hi) hi = residual;
    }
    return hi - lo;
}

function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// ------------------------------------------------------------------ selection

/**
 * Choose one anchor per required ingredient for a run.
 *
 * The zones are already ordered downhill, so the ordering constraint is nearly
 * free; what the route check actually earns is the lateral one. Two anchors on
 * opposite edges of consecutive zones can both be individually valid and still
 * demand a turn no rider at speed can make, and the failure mode is a player
 * watching a pickup slide past the outside of their arc.
 *
 * Retries rather than gives up. A seed that produces an unreachable pair
 * reshuffles that pair, because the alternative — returning a route the player
 * cannot complete — is the one outcome this system exists to prevent.
 *
 * @param {string[]} ids required ingredient ids, downhill order
 * @param {object} field terrain height source
 * @param {number} seed
 * @returns {{ok: boolean, placements: object[], reason?: string, attempts: number}}
 */
export function selectRoute(ids, field, seed) {
    const pools = ids.map((id) => {
        const zone = ZONES[id];
        if (!zone) throw new Error("no zone for ingredient " + id);
        return candidatesFor(zone, field, seed).anchors;
    });

    for (let i = 0; i < ids.length; i++) {
        if (!pools[i].length) {
            return {
                ok: false,
                placements: [],
                attempts: 0,
                reason: `no valid anchor in ${ZONES[ids[i]].name}`,
            };
        }
    }

    const next = rng(seed);
    const MAX_ATTEMPTS = 64;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const chosen = pools.map((pool) => pool[(next() * pool.length) | 0]);
        const problem = routeProblem(chosen);
        if (!problem) {
            return {
                ok: true,
                attempts: attempt,
                placements: chosen.map((a, i) => ({ ...a, ingredient: ids[i] })),
            };
        }
        if (attempt === MAX_ATTEMPTS) {
            return { ok: false, placements: [], attempts: attempt, reason: problem };
        }
    }
    // Unreachable; the loop above always returns.
    return { ok: false, placements: [], attempts: MAX_ATTEMPTS, reason: "exhausted" };
}

/** @returns {string|null} why this set cannot be ridden in one run. */
function routeProblem(chosen) {
    for (let i = 1; i < chosen.length; i++) {
        const a = chosen[i - 1];
        const b = chosen[i];
        const dz = b.z - a.z;
        if (dz <= 0) {
            return `${a.zone} → ${b.zone} would require riding back uphill`;
        }
        if (dz < MIN_SEPARATION) {
            return `${a.zone} → ${b.zone} only ${dz.toFixed(1)} m apart`;
        }
        if (Math.abs(b.x - a.x) > dz * MAX_LATERAL_RATIO) {
            return (
                `${a.zone} → ${b.zone} needs ${Math.abs(b.x - a.x).toFixed(1)} m ` +
                `of lateral shift in ${dz.toFixed(1)} m of run`
            );
        }
    }
    const last = chosen[chosen.length - 1];
    if (last.z >= BASE_CAMP_Z) {
        return "the final pickup is at or past the finish gate";
    }
    return null;
}
