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
import { SUMMIT_LINE } from "./courses/summitLine.js";

// ------------------------------------------------------------------ course facts
// One source of truth: the course definition. These exports are views of the
// Summit Line for everything that predates multi-course — the unit tests, the
// placement validator, the dressing and the camp all keep reading them here,
// and the same numbers now feed the bake itself, so they cannot drift from
// the shader again. Course-aware callers pass a definition to the functions
// below instead.

/** @type {{lip:number, runIn:number, drop:number, height:number}[]} */
export const JUMPS = SUMMIT_LINE.terrain.jumps;

/** @type {{from:number, to:number, wallFrom:number, wallTo:number}[]} */
export const PIPES = SUMMIT_LINE.terrain.pipes;

export const COURSE_FINISH_Z = SUMMIT_LINE.finishZ;
/** The finish gate at Burger Base Camp, clear of the last kicker's landing. */
export const BASE_CAMP_Z = SUMMIT_LINE.baseCampZ;
/** Full-strength lane half-width. */
export const LANE_HALF = SUMMIT_LINE.terrain.laneHalf;

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
/**
 * The steepest ground crash recovery may stand a rider up on, as a gradient.
 * About 25°, which is inside what every other course's run-out already is.
 */
const RESPAWN_MAX_SLOPE = 0.47;

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

/**
 * The Summit Line's zones, as data on its course definition. Zone behaviour
 * that used to be keyed on ingredient ids is now flags on the zone itself:
 * `pipeZone` grants the softer wall rule, `excludeInnerX` carves an annulus
 * (the onion's detour — the middle of its span belongs to the patty).
 * @type {Record<string, Zone>}
 */
export const ZONES = SUMMIT_LINE.zones;

// ------------------------------------------------------------------ anchor rules

/** Clearance the pedestal needs above the surface it is checked against. */
const CLEARANCE_SAMPLES = 8;
const CLEARANCE_RADIUS = 2.2;
/** Reject an anchor whose local surface varies by more than this across the pad. */
const MAX_LOCAL_RELIEF = 0.55;
/** Keep selected anchors apart so two pickups never read as one cluster. */
const MIN_SEPARATION = 22;

/**
 * Lateral route limits.
 *
 * At the controller's `SURF_MAX` of 19.5 m/s and `SURF_TURN` of 2.35 rad/s a
 * carve turns inside about 8.3 m, so a heading change of 40° is comfortable and
 * anything under it is physically reachable without braking. The selector is
 * intentionally stricter: 0.66 is about 33.4°, leaving roughly 6.6° of heading
 * reserve for imperfect anticipation, analogue noise, and pickup visibility.
 * Both are expressed as lateral shift / along-course gap.
 */
export const PHYSICAL_MAX_LATERAL_RATIO = 0.84;
export const ROUTE_MAX_LATERAL_RATIO = 0.66;

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

/**
 * Spans of z that no pickup may occupy, with the reason.
 *
 * Takes the whole terrain block rather than the jumps array, because a course
 * can carry more than one kind of thing you must not stand a tomato on: the
 * kind-4 jumping hill is a hundred and twenty metres of falling snow that no
 * `jumps` entry describes. `SafeSpots` reads the same list, so this is also
 * what stops crash recovery from breadcrumbing the takeoff table and
 * respawning a rider into the air.
 */
export function protectedSpans(terrain = SUMMIT_LINE.terrain) {
    const spans = [];
    for (const s of terrain.skiJumps ?? []) {
        spans.push({
            from: s.lipZ - s.inrunLen - APPROACH_MARGIN,
            to: s.lipZ,
            reason: `in-run to the table at z=${s.lipZ}`,
        });
        // Only the steep part of the hill, not all 120 m of it.
        //
        // `SafeSpots` refuses to drop a breadcrumb inside a protected span, so
        // the length of this one is the size of the rewind a crash costs. What
        // the rule is for is not standing a rider up somewhere they will
        // immediately fall over again — and past the knoll this hill is
        // shallower than several courses' run-outs.
        //
        // The cubic falloff has slope 3·hillDrop·(1−v)²/hillLen, so the point
        // it drops under RESPAWN_MAX_SLOPE solves in closed form: 45 m down a
        // 120 m hill on Big Air Basin, protected span 300→361 with the margin.
        //
        // The measured consequence, and it is the intended one. Touchdown is
        // z=348, so blowing the landing rewinds to the last crumb before the
        // in-run span at 180 — the top of the in-run, with another run at the
        // jump. Crashing further down the hill costs about one breadcrumb
        // interval, ~13 m. Failing the jump should cost you the jump; failing
        // the run-out should not.
        const k = Math.min(
            1, (RESPAWN_MAX_SLOPE * s.hillLen) / (3 * s.hillDrop)
        );
        const steepLen = s.hillLen * (1 - Math.sqrt(k));
        spans.push({
            from: s.lipZ,
            to: s.lipZ + steepLen + LANDING_MARGIN,
            reason: `landing hill below the table at z=${s.lipZ}`,
        });
    }
    for (const j of terrain.jumps ?? []) {
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

/**
 * Protected spans, cached per terrain block. Keyed by reference: course
 * definitions are module singletons, so identity is exactly right, and a
 * synthetic test course simply pays the derivation once.
 */
const _spansCache = new Map();

function spansFor(terrain) {
    let spans = _spansCache.get(terrain);
    if (!spans) {
        spans = protectedSpans(terrain);
        _spansCache.set(terrain, spans);
    }
    return spans;
}

function inProtectedSpan(z, terrain) {
    for (const s of spansFor(terrain)) if (z >= s.from && z <= s.to) return s;
    return null;
}

/** True where the halfpipe wall is steep enough that a pickup would sit on it. */
function onPipeWall(x, z, pipes) {
    for (const p of pipes) {
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
 * @param {object} [course] the course whose jumps/pipes shape the exclusions
 * @returns {{anchors: object[], rejected: object[]}}
 */
export function candidatesFor(zone, field, seed = 1, course = SUMMIT_LINE) {
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

            const reason = rejectReason(zone, x, z, field, course);
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
                visibility: onPipeWall(x, z, course.terrain.pipes) ? 150 : 110,
                protectedRadius: MIN_SEPARATION * 0.5,
            });
        }
    }

    return { anchors, rejected };
}

/** @returns {string|null} why this position is unusable, or null if it is fine. */
function rejectReason(zone, x, z, field, course) {
    const { pipes } = course.terrain;

    if (zone.excludeInnerX && Math.abs(x) < zone.excludeInnerX) {
        return "inside the lane, which belongs to the fast line";
    }

    // The whole terrain block, not `jumps` — `protectedSpans` reads more than
    // one primitive kind now, and handing it the bare array returns an empty
    // list rather than an error, which would silently un-protect every jump on
    // every course.
    const span = inProtectedSpan(z, course.terrain);
    if (span) return span.reason;

    if (!zone.pipeZone && onPipeWall(x, z, pipes)) {
        return "on a halfpipe wall";
    }
    // A pipe zone's ingredients live in the pipe, but still not up its wall.
    if (zone.pipeZone && onPipeWall(x, z, pipes)) {
        for (const p of pipes) {
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
 * @param {object} [course] the course whose zones and finish shape the route
 * @returns {{ok: boolean, placements: object[], reason?: string, attempts: number}}
 */
export function selectRoute(ids, field, seed, course = SUMMIT_LINE) {
    const zones = course.zones;
    const pools = ids.map((id) => {
        const zone = zones[id];
        if (!zone) throw new Error("no zone for ingredient " + id);
        return candidatesFor(zone, field, seed, course).anchors;
    });

    for (let i = 0; i < ids.length; i++) {
        if (!pools[i].length) {
            return {
                ok: false,
                placements: [],
                attempts: 0,
                reason: `no valid anchor in ${zones[ids[i]].name}`,
            };
        }
    }

    const next = rng(seed);
    // Five-ingredient finals include a deliberate off-line onion detour. The
    // stricter release safety budget rejects more random combinations than the
    // old physical-limit check, so give the tiny fixed pools enough attempts
    // to find their safe combination without weakening that budget.
    const MAX_ATTEMPTS = 256;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const chosen = pools.map((pool) => pool[(next() * pool.length) | 0]);
        const problem = routeProblem(chosen, course);
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
function routeProblem(chosen, course) {
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
        if (Math.abs(b.x - a.x) > dz * ROUTE_MAX_LATERAL_RATIO) {
            return (
                `${a.zone} → ${b.zone} needs ${Math.abs(b.x - a.x).toFixed(1)} m ` +
                `of lateral shift in ${dz.toFixed(1)} m of run`
            );
        }
    }
    const last = chosen[chosen.length - 1];
    if (last.z >= course.baseCampZ) {
        return "the final pickup is at or past the finish gate";
    }
    return null;
}
