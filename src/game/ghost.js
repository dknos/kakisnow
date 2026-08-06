/**
 * The best run, replayed alongside the current one.
 *
 * `BurgerBook` has been recording a ghost since the first completion — the
 * rider's position every quarter second, stored with the seed that produced the
 * route. This is the half that reads it back.
 *
 * ------------------------------------------------------------------ the seed
 *
 * A ghost is only shown when its seed matches the run being ridden. The route
 * is a function of the seed, so a ghost from a different one took a different
 * line to different pickups, and racing it would be racing a different course.
 * That check is why the seed is stored beside the samples rather than inferred.
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

/** Matches `GHOST_INTERVAL` in burgerRun.js. Samples are meaningless without it. */
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
     * Arm a ghost for this run, if the book has one for this exact seed.
     *
     * @param {object|null} stored the event's `bestGhost`
     * @param {number} seed the seed actually being ridden
     */
    arm(stored, seed) {
        this.samples = null;
        this.seed = null;
        this.delta = 0;
        this.hasDelta = false;
        if (!stored || stored.seed !== seed || !Array.isArray(stored.samples)) {
            this.asset.setActive(false);
            return false;
        }
        if (stored.samples.length < 6) {
            this.asset.setActive(false);
            return false;
        }
        this.samples = stored.samples;
        this.seed = seed;
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
        const f = Math.min(time / SAMPLE_INTERVAL, n - 1);
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
                const ghostTime = (k - 1 + frac) * SAMPLE_INTERVAL;
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
