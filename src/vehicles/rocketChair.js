/**
 * The rocket chair, mounted under the rider.
 *
 * Additive, not a rewrite. `RockerKaki` already solves the hard problem — the
 * board's attitude against the slope, its sink into the trench it cuts, the
 * sastrugi crest lift, and the rider hanging off it as a passenger — and it
 * exposes `boardRoot`, the node that carries all of that. So the rocket chair
 * hangs off the same node as a sibling of the classic board, and switching
 * vehicles is showing one and hiding the other.
 *
 * That choice is worth stating plainly, because the obvious alternative was to
 * generalise `RockerKaki` into a vehicle host. It is a 950-line file that the
 * committed smoke tools assert against by node name, it carries the only copy
 * of the board-attitude solve, and its comments record four separate bugs that
 * were paid for in that geometry. Hanging a second model off a node it already
 * publishes costs one `setEnabled` and cannot regress the hero; refactoring it
 * would have put the playable character at risk to make a second vehicle
 * marginally tidier.
 *
 * What this leaves is one real constraint: the rider does not move. She sits
 * where `visualRoot` puts her, which is on top of the classic board. So seating
 * her in the chair is done by moving the *chair* until its seat pan is under
 * her, rather than by moving her into the chair — and `seatOffset` below is
 * that measurement, not a fudge.
 */

import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { S } from "../core/settings.js";
import { ShadedAsset } from "../render/shadedAsset.js";
import { ROCKET_CHAIR } from "./vehicleProfiles.js";

const _v = new Vector3();

/** How far the rider settles into the seat pan, in model units. */
const SEAT_SETTLE = 0.045;

export class RocketChair {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("../render/sky.js").Sky} deps.sky
     * @param {import("../render/shadows.js").ShadowSystem} deps.shadows
     * @param {import("../render/depthPass.js").DepthPass} deps.depthPass
     * @param {import("../character/rockerKaki.js").RockerKaki} deps.rocker
     */
    constructor({ scene, sky, shadows, depthPass, rocker }) {
        this.scene = scene;
        this.rocker = rocker;
        this.profile = ROCKET_CHAIR;

        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "rocketChair",
        });

        /**
         * The mount, between the board's attitude and the model.
         *
         * A node of its own rather than writing the asset root directly,
         * because the asset root is where the grounding offset lives and the
         * mount is where the calibration lives. Keeping them apart means the
         * seat can be tuned without disturbing the height the board rides at.
         */
        this.mount = new TransformNode("rocketChairMount", scene);
        this.mount.parent = rocker.boardRoot;

        /** @type {Record<string, TransformNode>} */
        this.anchors = {};

        this.available = false;
        this.active = false;
    }

    async load() {
        const ok = await this.asset.load(this.profile.url);
        if (!ok) return false;

        this.asset.root.parent = this.mount;
        this._buildAnchors();
        this._measureClassicBase();
        this.applyScale();
        this.setActive(false);
        this.available = true;
        return true;
    }

    /**
     * How far below `boardRoot` the classic board's running surface sits.
     *
     * `boardRoot` is not the snow. It carries the board's attitude, the
     * sastrugi crest lift and the sink into the trench, and then the board's
     * own asset node puts the base somewhere below it — measured at 0.238 m
     * under the shipped settings. A vehicle that grounds its contact patches at
     * `boardRoot` therefore hovers by exactly that much, which is what the
     * first render of this chair showed.
     *
     * Rather than re-derive the offset from `rockerKaki`'s internals, it is
     * measured off the board that already sits correctly, in the frame it sits
     * in, and stored per unit of `boardScale` so the chair tracks the setting.
     * Measured here at load, while the classic board is still visible and
     * `boardRoot` is still at identity: once the chair is active the board is
     * hidden, and bounds read off a disabled hierarchy are not trustworthy.
     */
    _measureClassicBase() {
        const rocker = this.rocker;
        if (!rocker.boardAvailable) {
            this._classicBasePerScale = 0;
            return;
        }
        rocker.boardRoot.computeWorldMatrix(true);
        rocker.boardAsset.computeWorldMatrix(true);
        const bounds = rocker.boardAsset.getHierarchyBoundingVectors(true);
        const rootY = rocker.boardRoot.getAbsolutePosition().y;
        const scale = S.boardScale ?? 1;
        this._classicBasePerScale = (bounds.min.y - rootY) / Math.max(scale, 1e-6);
    }

    async warmUp() {
        this.asset.setActive(true);
        await this.asset.warmUp();
        this.asset.setActive(false);
    }

    /**
     * Materialise every attachment point as a real node.
     *
     * They are nodes rather than raw vectors so the exhaust, the cargo pull and
     * the camera target can each read a world position that already carries the
     * board's pitch, roll and sink for this frame. A vector plus a mental note
     * about which frame it is in is how an exhaust ends up firing out of the
     * side of a board on a traverse.
     */
    _buildAnchors() {
        for (const [name, p] of Object.entries(this.profile.anchors)) {
            if (name === "exhaustDirection") continue;
            const node = new TransformNode("rocketChair_" + name, this.scene);
            node.parent = this.asset.root;
            node.position.set(p[0], p[1], p[2]);
            this.anchors[name] = node;
        }
    }

    /**
     * Size the chair and ground it on its contact patches.
     *
     * Scaled by `S.boardScale` for the same reason the classic board is: the
     * two vehicles have the same authored length, so sharing the setting keeps
     * their footprints — and therefore the trench, which `boardSpec.js` derives
     * from that footprint — directly comparable.
     *
     * `S.rocketChairScale` is a second multiplier on top, and it exists because
     * the rider is a 2.58 m chibi and the chair is a piece of furniture built
     * for a person. Whether one number can reconcile those is a question for a
     * render, not for an assertion here; the setting is where the answer goes.
     */
    applyScale() {
        const scale = (S.boardScale ?? 1) * (S.rocketChairScale ?? 1);
        this.scale = scale;
        this.asset.root.scaling.setAll(scale);
        // Lift by the contact-patch height, not by the bounding box. The lowest
        // point on this model is a fin hanging below the deck; grounding on it
        // floats the running surface clear of the snow it should be cutting.
        // Land the contact patches where the classic board's base lands, not at
        // the parent's origin — see `_measureClassicBase`.
        const base = (this._classicBasePerScale ?? 0) * (S.boardScale ?? 1);
        this.asset.root.position.set(0, base - this.profile.contactY * scale, 0);
        this.mount.position.set(0, 0, 0);

        /**
         * How far above the contact plane the rider's feet go.
         *
         * The seat pan, less a little for settling into it. Derived from the
         * measured anchors rather than tuned, so changing the chair's size
         * moves the rider with it — the failure this would otherwise have is
         * a rider who fits the chair at one scale and floats above it at
         * every other.
         */
        this.seatLift = base
            + (this.profile.anchors.seatAnchor[1] - SEAT_SETTLE) * scale
            - this.profile.contactY * scale;
        if (this.active) this.rocker.vehicleDeckHeight = this.seatLift;
    }

    /**
     * Show the chair and take the classic board away, or the reverse.
     *
     * The classic board is hidden rather than unloaded. It is the fallback the
     * brief asks for and the thing Free Ride Lab rides, and a fallback that has
     * to be re-imported before it can be used is not one.
     */
    setActive(active) {
        this.active = !!active && (this.available || !!this.asset.available);
        this.asset.setActive(this.active);
        // `setBoardVisible` is RockerKaki's own switch and already handles the
        // trench following what is actually against the snow.
        this.rocker.setBoardVisible(!this.active && S.showBoard !== false);
        // Hiding the board is not enough on its own: without a board,
        // RockerKaki drops the rider to snow level, which would leave her
        // sitting through the chair rather than in it.
        this.rocker.vehicleDeckHeight = this.active ? this.seatLift : null;
    }

    /** World position of a named anchor, for this frame. */
    anchorPosition(name, out = _v) {
        const node = this.anchors[name];
        if (!node) return out.setAll(0);
        node.computeWorldMatrix(true);
        return out.copyFrom(node.getAbsolutePosition());
    }

    sync(cameraPos) {
        if (!this.active) return;
        this.asset.sync(cameraPos);
    }

    get beautyMaterials() {
        return this.asset.beautyMaterials;
    }

    dispose() {
        this.asset.dispose();
        for (const node of Object.values(this.anchors)) node.dispose();
        this.mount.dispose();
    }
}
