/**
 * Scalar spring-arm correction kept separate from Babylon so the obstruction
 * contract can be tested without constructing a renderer or a WebGPU device.
 *
 * `hitDistance` is the first safe camera-centre distance along the arm. A
 * missing hit is represented by `Infinity`. The arm retracts quickly when a
 * solid enters the path and relaxes slowly after it clears; the asymmetry is
 * what keeps a thin rail from making the camera chatter in and out.
 */

export const CAMERA_ARM_MIN = 1.35;
export const CAMERA_ARM_IN_RATE = 26;
export const CAMERA_ARM_OUT_RATE = 3.2;

/**
 * Resolve one frame of spring-arm distance.
 *
 * @param {number} current current corrected arm distance
 * @param {number} desired unoccluded arm distance
 * @param {number} hitDistance safe distance, or Infinity when clear
 * @param {number} dt seconds
 * @returns {number} corrected distance, never below CAMERA_ARM_MIN
 */
export function solveCameraArmDistance(current, desired, hitDistance, dt) {
    const wanted = Number.isFinite(hitDistance)
        ? Math.min(desired, Math.max(CAMERA_ARM_MIN, hitDistance))
        : desired;
    const target = Math.max(CAMERA_ARM_MIN, wanted);
    const rate = target < current ? CAMERA_ARM_IN_RATE : CAMERA_ARM_OUT_RATE;
    const h = Math.min(Math.max(dt, 0), 0.1);
    return target + (current - target) * Math.exp(-rate * h);
}

/**
 * Keep a bounded signature-jump camera bias separate from the player's look.
 * The returned offset is an additive camera-space bias, so releasing the
 * context naturally restores the exact input-driven yaw and pitch. This is
 * intentionally pure: the render rig remains the owner of vectors and
 * obstruction correction, while this helper only describes the timing of the
 * framing assist.
 *
 * @param {number} current current additive offset
 * @param {number} target target additive offset, already bounded by caller
 * @param {number} dt seconds
 * @param {number} enterRate rate while entering/holding
 * @param {number} exitRate rate while restoring
 */
export function solveAirFrameOffset(
    current, target, dt, enterRate = 5.5, exitRate = 3.2
) {
    const h = Math.min(Math.max(dt, 0), 0.1);
    const rate = Math.abs(target) > Math.abs(current) ? enterRate : exitRate;
    return target + (current - target) * Math.exp(-rate * h);
}

/** Smallest signed angular difference, in radians. */
export function shortestAngleDelta(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/**
 * Predict the first down-course terrain crossing of an airborne controller.
 *
 * This is a scalar helper on purpose: the Big Air camera can refresh the aim
 * without constructing Babylon vectors or allocating a temporary path. The
 * `groundAt` callback is the same terrain height query used by the controller,
 * so the framed surface is physics truth rather than a venue-only guess.
 * Writes into `out` when supplied and returns it; the small object fallback is
 * convenient for deterministic tests and one-shot tooling.
 *
 * @param {{x:number,y:number,z:number,vx:number,vy:number,vz:number,
 *          groundAt:(x:number,z:number)=>number}} input
 * @param {{x:number,y:number,z:number,time:number,valid:boolean}} [out]
 */
export function predictLandingAim(input, out = {}) {
    const result = out;
    result.valid = false;
    if (!input || typeof input.groundAt !== "function") return result;
    const x = Number(input.x), y = Number(input.y), z = Number(input.z);
    const vx = Number(input.vx), vy = Number(input.vy), vz = Number(input.vz);
    if (![x, y, z, vx, vy, vz].every(Number.isFinite)) return result;

    const gravity = 18.5;
    const start = 0.08;
    const step = 0.16;
    const maxSteps = 20;
    let previousT = start;
    let previousGap = ballisticGap(input, previousT, gravity);
    for (let i = 1; i <= maxSteps; i++) {
        const t = start + step * i;
        const gap = ballisticGap(input, t, gravity);
        if (previousGap > 0 && gap <= 0) {
            const span = previousGap - gap;
            const hitT = span > 1e-6
                ? previousT + (t - previousT) * previousGap / span
                : t;
            result.time = hitT;
            result.x = x + vx * hitT;
            result.z = z + vz * hitT;
            result.y = Number(input.groundAt(result.x, result.z)) + 0.55;
            result.valid = Number.isFinite(result.y);
            return result;
        }
        previousT = t;
        previousGap = gap;
    }
    return result;
}

function ballisticGap(input, t, gravity) {
    const x = input.x + input.vx * t;
    const z = input.z + input.vz * t;
    return input.y + input.vy * t - 0.5 * gravity * t * t - input.groundAt(x, z);
}
