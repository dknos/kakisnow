/**
 * The best run, replayed alongside the current one.
 *
 * `BurgerBook` has been recording a ghost since the first completion — the
 * rider's position at a fixed cadence, stored with the cadence itself and the
 * identity of the run that produced it. This is the half that reads it back.
 *
 * -------------------------------------------------------------- the identity
 *
 * A ghost is only shown when its whole identity matches the run being ridden:
 * seed, course and its revision, event and its revision, vehicle. The route is
 * a function of the seed, the terrain is a function of the course revision,
 * the pickups of the event layout, the pace of the vehicle — a ghost that
 * differs on any of them rode a different run, and racing it would be racing
 * a different course. The rule itself (`ghostMatches`) lives in burgerBook.js,
 * because this module pulls Babylon mesh builders and cannot load under bare
 * Node, and a compatibility rule that cannot be unit-tested is a rule that
 * silently rots.
 *
 * ------------------------------------------------------------- the difference
 *
 * The marker says where; the number says how far behind. They answer different
 * questions and a player uses both — the marker for the next fifty metres, the
 * number for whether the run is worth finishing.
 *
 * The number is a time difference, not a distance: it is how long ago the ghost
 * passed the point the player is at now, found by walking the samples for the
 * first one past the player's along-course position. Distance behind would be
 * meaningless on a course where the two took different lines.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";

import { ShadedAsset } from "../render/shadedAsset.js";
import { ghostMatches } from "./burgerBook.js";

/**
 * Fallback only. A v2 ghost carries its own `interval` and playback always
 * uses the stored one — a ghost recorded at a different cadence than today's
 * recorder must still replay at the cadence it was recorded at.
 */
const SAMPLE_INTERVAL = 0.25;

export class GhostPlayback {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("../render/sky.js").Sky} deps.sky
     * @param {import("../render/shadows.js").ShadowSystem} deps.shadows
     * @param {import("../render/depthPass.js").DepthPass} deps.depthPass
     */
    constructor(deps) {
        this.asset = new ShadedAsset({ ...deps, name: "ghost" });

        // A slim pale marker rather than a second rider. A translucent copy of
        // the hero would need an alpha-blended variant of her whole material
        // stack and would still be mistaken for the player at speed; a post is
        // unmistakably a marker and costs one primitive.
        const post = CreateCylinder(
            "ghostPost", { diameter: 0.34, height: 2.6, tessellation: 12 }, deps.scene
        );
        post.parent = this.asset.root;
        post.position.y = 1.3;
        this.asset.adopt(post, { colour: new Color3(0.62, 0.78, 0.95), roughness: 0.3 });
        this.asset.available = true;
        this.asset.setActive(false);

        /** @type {number[]|null} flat x,y,z triples */
        this.samples = null;
        this.seed = null;
        /** Seconds between samples, taken from the armed ghost. */
        this.interval = SAMPLE_INTERVAL;
        this.active = false;
        /** Seconds the ghost is ahead (negative) or behind (positive). */
        this.delta = 0;
        this.hasDelta = false;
    }

    async warmUp() {
        this.asset.setActive(true);
        await this.asset.warmUp();
        this.asset.setActive(false);
    }

    /**
     * Arm a ghost for this run, if the book has one for this exact run.
     *
     * @param {object|null} stored the event's `bestGhost`
     * @param {object} expect the identity of the run actually being ridden:
     *     {seed, courseId, courseVersion, eventId, eventVersion, vehicleId}
     */
    arm(stored, expect) {
        this.samples = null;
        this.seed = null;
        this.interval = SAMPLE_INTERVAL;
        this.delta = 0;
        this.hasDelta = false;
        if (!ghostMatches(stored, expect)) {
            this.asset.setActive(false);
            return false;
        }
        // Fewer than two seconds of samples is not a race, it is a flicker at
        // the start gate.
        if (stored.samples.length < 6) {
            this.asset.setActive(false);
            return false;
        }
        this.samples = stored.samples;
        this.seed = stored.seed;
        this.interval = stored.interval;
        this.asset.setActive(true);
        return true;
    }

    clear() {
        this.samples = null;
        this.active = false;
        this.hasDelta = false;
        this.asset.setActive(false);
    }

    /**
     * @param {number} time seconds into the current run
     * @param {number} playerZ the player's along-course position
     */
    update(time, playerZ) {
        if (!this.samples) return;
        const n = this.samples.length / 3;

        // Where the ghost is now. Past the end it stops rather than vanishing:
        // a ghost that disappears the moment it finishes takes away the one
        // piece of information a player behind it still wants.
        const f = Math.min(time / this.interval, n - 1);
        const i = Math.floor(f);
        const j = Math.min(i + 1, n - 1);
        const t = f - i;
        const a = i * 3;
        const b = j * 3;
        this.asset.root.position.set(
            this.samples[a] + (this.samples[b] - this.samples[a]) * t,
            this.samples[a + 1] + (this.samples[b + 1] - this.samples[a + 1]) * t,
            this.samples[a + 2] + (this.samples[b + 2] - this.samples[a + 2]) * t
        );
        this.active = true;

        // When the ghost reached where the player is now. Linear scan from the
        // start each frame would be wasteful on a long run, so it walks forward
        // from where it left off and only resets when the run does.
        this.hasDelta = false;
        for (let k = 0; k < n; k++) {
            if (this.samples[k * 3 + 2] >= playerZ) {
                const prevZ = k > 0 ? this.samples[(k - 1) * 3 + 2] : this.samples[2];
                const thisZ = this.samples[k * 3 + 2];
                const span = thisZ - prevZ;
                const frac = span > 1e-6 ? (playerZ - prevZ) / span : 0;
                const ghostTime = (k - 1 + frac) * this.interval;
                this.delta = time - ghostTime;
                this.hasDelta = true;
                return;
            }
        }
    }

    sync(cameraPos) {
        if (this.asset.active) this.asset.sync(cameraPos);
    }

    get beautyMaterials() {
        return this.asset.beautyMaterials;
    }

    dispose() {
        this.asset.dispose();
    }
}

/** `+1.24` / `-0.36`, for the HUD. */
export function formatDelta(seconds) {
    const s = Math.abs(seconds);
    return (seconds >= 0 ? "+" : "−") + s.toFixed(2);
}
