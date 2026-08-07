/**
 * Third-person spring-arm rig — action-MMO framing.
 *
 * The arm is deliberately *not* rigid: the pivot chases the character through a
 * critically-damped spring, so hard acceleration pulls the camera back and the
 * character drifts forward in frame. FOV widens with speed, the rig banks into
 * carves, and everything eases. Nothing here snaps.
 *
 * The arm is also swept against the gameplay obstacle world and a separate
 * camera-only world for structures that must not affect the rider. A quick
 * inward correction and a slower release keep scenery from entering the lens
 * without making a thin rail turn into a visible camera tick.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scalar } from "@babylonjs/core/Maths/math.scalar.js";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
import { input } from "./input.js";
import { S } from "./settings.js";
import {
    CAMERA_ARM_MIN,
    solveCameraArmDistance,
    solveAirFrameOffset,
    shortestAngleDelta,
} from "./cameraMath.js";

// ------------------------------------------------------- module-scope scratch
const _pivot = new Vector3();
const _desired = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _tmp = new Vector3();

/** Height probes taken along the spring arm each frame. */
const ARM_SAMPLES = 5;
const CAMERA_ARM_RADIUS = 0.34;
const CAMERA_ARM_MARGIN = 0.18;
const CAMERA_CLEAR_HOLD = 0.14;

const PITCH_MIN = -0.62; // looking up
const PITCH_MAX = 1.05; // looking down
const DIST_MIN = 2.6;
const DIST_MAX = 11.0;

export class CameraRig {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {HTMLCanvasElement} canvas
     */
    constructor(scene, canvas) {
        const cam = new UniversalCamera("cam", new Vector3(0, 3, -6), scene);
        cam.minZ = 0.12;
        cam.maxZ = 4200;
        cam.fov = 1.02; // ~58deg vertical
        cam.inertia = 0;
        cam.rotation.set(0, 0, 0);
        // No attachControl — this rig drives the transform itself.

        this.camera = cam;
        this.scene = scene;

        this.yaw = 2.4;
        this.pitch = 0.17;

        /**
         * A short-lived additive bias for a course's signature jump. The
         * player's yaw/pitch remain untouched, so look input is live and the
         * exact pre-jump view returns after the landing window. Game code
         * supplies the controller/terrain-derived heading and landing aim;
         * this rig still owns the final transform, obstruction sweep, and
         * terrain clearance.
         */
        this.airborneContext = null;
        this.airYawOffset = 0;
        this.airPitchOffset = 0;

        this.distance = 6.2;
        this.distanceTarget = 6.2;
        /** Current collision-corrected distance; user zoom remains target. */
        this.obstacleDistance = this.distance;
        /** Gameplay obstacles (trees, rocks, rails, snowcats). */
        this.obstacleWorld = null;
        /** Camera-only structures (finish camp and Big Air venue). */
        this.cameraWorld = null;
        this._obstacleClearHold = 0;

        /** Smoothed pivot position (the thing the spring chases). */
        this.pivot = new Vector3(0, 0, 0);
        this.pivotVel = new Vector3(0, 0, 0);

        /** Over-the-shoulder offset, in camera space. */
        this.shoulder = 0.85;
        this.pivotHeight = 1.62;

        this.baseFov = 1.02;
        this.fov = 1.02;

        this.roll = 0;
        this.rollTarget = 0;

        /**
         * The rig's basis, republished every frame. The spells aim with the
         * same three vectors, so there is only one place the convention for
         * "forward" is written down.
         */
        this.forward = new Vector3(0, 0, 1);
        this.right = new Vector3(1, 0, 0);
        this.up = new Vector3(0, 1, 0);

        // Trauma-based shake (Squirrel Eiserloh style): shake = trauma^2, so it
        // falls off perceptually rather than linearly.
        this.trauma = 0;
        this.shakeTime = 0;

        /**
         * Height sampler, injected once the terrain exists.
         * @type {((x:number, z:number) => number)|null}
         */
        this.groundAt = null;
        /** Metres of snow the camera must keep beneath it. */
        this.groundClearance = 1.35;
        /** Eased lift currently being applied to stay above the surface. */
        this.groundLift = 0;

        this._first = true;
    }

    /** @param {number} amount 0..1 */
    addTrauma(amount) {
        this.trauma = Math.min(1, this.trauma + amount);
    }

    /**
     * Set the bounded context for a signature jump. Passing null restores the
     * player's camera over the same spring used to enter it.
     *
     * @param {{active?:boolean, heading?:number, aimYaw?:number,
     *          aimPitch?:number}|null} context
     */
    setAirborneContext(context) {
        this.airborneContext = context?.active ? context : null;
    }

    /**
     * @param {number} dt seconds
     * @param {Vector3} targetPos character world position (feet)
     * @param {Vector3} targetVel character world velocity
     * @param {number} lean signed lean amount, -1..1, for banking
     * @param {number} speed01 normalised speed for FOV widening
     * @param {number} [boost01] rocket throttle, for the extra FOV kick
     */
    update(dt, targetPos, targetVel, lean, speed01, boost01 = 0) {
        // ------------------------------------------------------------- look
        this.yaw += input.lookX;
        this.pitch = Scalar.Clamp(this.pitch + input.lookY, PITCH_MIN, PITCH_MAX);

        // A signature-jump assist is additive rather than a hidden camera
        // state. Small lateral corrections keep their meaning, but the frame
        // aims at the controller/terrain landing point supplied by the game
        // layer. The reduced-motion path is deliberately exact: no additive
        // yaw or pitch is applied, so the rider's own look input remains the
        // complete camera motion under that setting.
        const air = this.airborneContext;
        let airYawWant = 0;
        let airPitchWant = 0;
        if (air && Number.isFinite(air.heading)) {
            const aimYaw = Number.isFinite(air.aimYaw) ? air.aimYaw : air.heading;
            const maxYaw = S.reducedMotion ? 0 : 0.46;
            airYawWant = Scalar.Clamp(
                shortestAngleDelta(this.yaw, aimYaw), -maxYaw, maxYaw
            );
            if (!S.reducedMotion) {
                // The game layer gives us an absolute pitch aimed at a real
                // landing surface. Only add downward pitch, and cap the
                // assist so the player's active look remains authoritative.
                const aimPitch = Number.isFinite(air.aimPitch)
                    ? air.aimPitch : this.pitch + 0.15;
                airPitchWant = Scalar.Clamp(aimPitch - this.pitch, 0, 0.36);
            }
        }
        if (S.reducedMotion) {
            // Do not leave a stale authored offset on screen when the player
            // enables reduced motion during a jump.
            this.airYawOffset = 0;
            this.airPitchOffset = 0;
        } else {
            this.airYawOffset = solveAirFrameOffset(
                this.airYawOffset, airYawWant, dt, 5.5, 3.2
            );
            this.airPitchOffset = solveAirFrameOffset(
                this.airPitchOffset, airPitchWant, dt, 5.0, 3.2
            );
        }
        const cameraYaw = this.yaw + this.airYawOffset;
        const cameraPitch = Scalar.Clamp(
            this.pitch + this.airPitchOffset, PITCH_MIN, PITCH_MAX
        );

        // ------------------------------------------------------------- zoom
        this.distanceTarget = Scalar.Clamp(
            this.distanceTarget + input.zoomDelta * (this.distanceTarget * 0.35),
            DIST_MIN,
            DIST_MAX
        );
        // Eased zoom — expDamp is framerate-independent.
        this.distance = expDamp(this.distance, this.distanceTarget, 9, dt);

        // ------------------------------------------------------------ pivot
        _pivot.copyFrom(targetPos);
        _pivot.y += this.pivotHeight;

        // Lead the camera slightly into the direction of travel so fast motion
        // shows more of what's ahead.
        const lead = Math.min(1, speed01) * 1.35;
        _pivot.x += targetVel.x * lead * 0.09;
        _pivot.z += targetVel.z * lead * 0.09;

        if (this._first) {
            this.pivot.copyFrom(_pivot);
            this._first = false;
        } else {
            // Softer spring under acceleration = the arm stretches, then recovers.
            springDamp(this.pivot, this.pivotVel, _pivot, 7.5, 1.0, dt);
        }

        // -------------------------------------------------------------- fov
        // Speed widens it; the rocket widens it a touch more — the engine
        // should be felt in the frame, not only heard. Reduced motion keeps
        // a gentler widen and no kick at all.
        const widen = S.reducedMotion ? 0.10 : 0.19;
        const kick = S.reducedMotion ? 0 : boost01 * 0.06;
        const fovWant = this.baseFov * (1 + speed01 * widen + kick);
        this.fov = expDamp(this.fov, fovWant, 3.2, dt);

        // ------------------------------------------------------------- bank
        this.rollTarget = -lean * 0.085;
        this.roll = expDamp(this.roll, this.rollTarget, 5.0, dt);

        // ------------------------------------------------------------ shake
        // Scaled where trauma becomes displacement rather than where it is
        // added, so landings, carving and anything future obey the one player
        // slider without each call site knowing about it.
        this.trauma = Math.max(0, this.trauma - dt * 1.15);
        this.shakeTime += dt;
        const shakeScale = S.reducedMotion ? 0 : S.shakeScale;
        const shake = this.trauma * this.trauma * shakeScale;

        // ------------------------------------------------------ compose xform
        const cp = Math.cos(cameraPitch);
        _fwd.set(
            Math.sin(cameraYaw) * cp,
            -Math.sin(cameraPitch),
            Math.cos(cameraYaw) * cp
        );
        _right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
        Vector3.CrossToRef(_right, _fwd, _up);
        _up.normalize();

        this.forward.copyFrom(_fwd);
        this.right.copyFrom(_right);
        this.up.copyFrom(_up);

        _desired.copyFrom(this.pivot);
        _desired.addInPlace(_tmp.copyFrom(_fwd).scaleInPlace(-this.distance));
        _desired.addInPlace(_tmp.copyFrom(_right).scaleInPlace(this.shoulder));
        _desired.addInPlace(_tmp.copyFrom(_up).scaleInPlace(0.22));

        // ------------------------------------------------------ solid arm solve
        // The camera has a small radius rather than being a point. This catches
        // the near edge of a tree, post, rail or arch before it is already in
        // the lens. CollisionWorld returns a shared result object, so only the
        // scalar `t` is copied and no per-frame object is retained or created.
        const armX = _desired.x - this.pivot.x;
        const armY = _desired.y - this.pivot.y;
        const armZ = _desired.z - this.pivot.z;
        const armLength = Math.hypot(armX, armY, armZ);
        let hitT = Infinity;
        if (armLength > 1e-5) {
            if (this.obstacleWorld) {
                const hit = this.obstacleWorld.sweepSphere(
                    this.pivot.x, this.pivot.y, this.pivot.z,
                    _desired.x, _desired.y, _desired.z,
                    CAMERA_ARM_RADIUS
                );
                if (hit && hit.t < hitT) hitT = hit.t;
            }
            if (this.cameraWorld) {
                const hit = this.cameraWorld.sweepSphere(
                    this.pivot.x, this.pivot.y, this.pivot.z,
                    _desired.x, _desired.y, _desired.z,
                    CAMERA_ARM_RADIUS
                );
                if (hit && hit.t < hitT) hitT = hit.t;
            }
        }

        // Zooming inward should never wait for the release spring. When a
        // thin obstacle flickers between adjacent sampled frames, hold the
        // compressed arm briefly before the slow outward relaxation begins.
        this.obstacleDistance = Math.min(this.obstacleDistance, this.distance);
        const hitDistance = Number.isFinite(hitT)
            ? Math.max(CAMERA_ARM_MIN, armLength * hitT - CAMERA_ARM_MARGIN)
            : Infinity;
        if (Number.isFinite(hitT)) {
            this._obstacleClearHold = CAMERA_CLEAR_HOLD;
        } else if (this._obstacleClearHold > 0) {
            this._obstacleClearHold = Math.max(0, this._obstacleClearHold - dt);
        }
        const heldDistance = Number.isFinite(hitT)
            ? hitDistance
            : (this._obstacleClearHold > 0 ? this.obstacleDistance : Infinity);
        this.obstacleDistance = solveCameraArmDistance(
            this.obstacleDistance, this.distance, heldDistance, dt
        );

        if (this.obstacleDistance < this.distance - 1e-4 && armLength > 1e-5) {
            const scale = this.obstacleDistance / armLength;
            _desired.x = this.pivot.x + armX * scale;
            _desired.y = this.pivot.y + armY * scale;
            _desired.z = this.pivot.z + armZ * scale;
        }

        // ---- keep the arm out of the snow --------------------------------
        // The lift rises quickly and relaxes slowly: snapping down the instant a
        // crest passes under the arm reads as a jolt, while being slow to rise
        // means a frame or two actually inside the snow.
        if (this.groundAt) {
            // Worst case over the whole arm, not just the eye: a crest between
            // the player and the camera can fill the view while the eye itself
            // is legally above the snow.
            let need = 0;
            for (let i = 0; i <= ARM_SAMPLES; i++) {
                const t = i / ARM_SAMPLES;
                const x = this.pivot.x + (_desired.x - this.pivot.x) * t;
                const z = this.pivot.z + (_desired.z - this.pivot.z) * t;
                const y = this.pivot.y + (_desired.y - this.pivot.y) * t;
                // Clearance eases in along the arm so it does not shove the
                // camera up merely for being near the player's own feet.
                const gh = this.groundAt(x, z) + this.groundClearance * (0.35 + 0.65 * t);
                const d = gh - y;
                if (d > need) need = d;
            }

            this.groundLift = expDamp(
                this.groundLift, need, need > this.groundLift ? 26 : 4.5, dt
            );
            _desired.y += this.groundLift;
        }

        if (shake > 0.0001) {
            const t = this.shakeTime * 26;
            _desired.x += (noise1(t) * 2 - 1) * shake * 0.16;
            _desired.y += (noise1(t + 31.7) * 2 - 1) * shake * 0.16;
            _desired.z += (noise1(t + 71.3) * 2 - 1) * shake * 0.10;
        }

        const cam = this.camera;
        cam.position.copyFrom(_desired);
        cam.fov = this.fov;
        cam.rotation.set(
            cameraPitch + (shake > 0.0001 ? (noise1(this.shakeTime * 31 + 11) * 2 - 1) * shake * 0.02 : 0),
            cameraYaw + (shake > 0.0001 ? (noise1(this.shakeTime * 29 + 53) * 2 - 1) * shake * 0.02 : 0),
            this.roll + (shake > 0.0001 ? (noise1(this.shakeTime * 23 + 97) * 2 - 1) * shake * 0.05 : 0)
        );
    }

    /** Flat camera-space forward on the XZ plane, for movement. Writes to `out`. */
    getFlatForward(out) {
        out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        return out;
    }

    getFlatRight(out) {
        out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        return out;
    }
}

// ------------------------------------------------------------------ helpers

/** Framerate-independent exponential approach. */
export function expDamp(cur, target, rate, dt) {
    return target + (cur - target) * Math.exp(-rate * dt);
}

/**
 * Semi-implicit damped spring toward `target`, mutating `pos` and `vel`.
 * @param {Vector3} pos @param {Vector3} vel @param {Vector3} target
 * @param {number} freq natural frequency (rad/s-ish)
 * @param {number} damping 1 = critical
 */
function springDamp(pos, vel, target, freq, damping, dt) {
    const k = freq * freq;
    const c = 2 * damping * freq;
    // Clamp dt so a hitch can't blow the integrator up.
    const h = Math.min(dt, 1 / 45);
    vel.x += (k * (target.x - pos.x) - c * vel.x) * h;
    vel.y += (k * (target.y - pos.y) - c * vel.y) * h;
    vel.z += (k * (target.z - pos.z) - c * vel.z) * h;
    pos.x += vel.x * h;
    pos.y += vel.y * h;
    pos.z += vel.z * h;
}

/** Cheap smooth 1D value noise for shake. Deterministic, no allocation. */
function noise1(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

function hash1(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
}
