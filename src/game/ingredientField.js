/**
 * The ingredients as they exist in the world: placed, animated, and collected.
 *
 * One `ShadedAsset` per ingredient, positioned from the route the placement
 * system chose, bobbing and turning where it stands until the rider sweeps
 * through it.
 *
 * ------------------------------------------------------------- the swept test
 *
 * A pickup is not a sphere the player's position is tested against once a
 * frame. At the controller's terminal speed of 19.5 m/s a 60 Hz frame advances
 * the rider 33 cm, which a 2.6 m radius swallows comfortably — but the frame
 * rate is not guaranteed, the rocket vehicle raises the speed, and a single
 * long frame during a shader compile or a tab restore is exactly when a player
 * is most annoyed to ride through a pickup and not get it. So the test is the
 * distance from the *segment* between last frame's position and this one, which
 * makes the result independent of both frame rate and speed.
 *
 * Horizontally it is a radius; vertically it is a band, generous upward so a
 * pickup can be taken off a jump and only slightly downward so one cannot be
 * taken from underneath a lip.
 *
 * ------------------------------------------------------------------ collection
 *
 * Collection is a one-way latch per run. `collected` is set before the flight
 * animation starts, not after it ends, so a second frame inside the radius
 * cannot score twice — and because the latch is on the run rather than on the
 * mesh, a crash and a respawn do not hand the ingredient back.
 *
 * Allocation per frame: none.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scalar } from "@babylonjs/core/Maths/math.scalar.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";

import { ShadedAsset } from "../render/shadedAsset.js";
import { INGREDIENTS } from "./ingredients.js";
import { shouldShowIngredientGuide } from "./ingredientGuide.js";
import { S } from "../core/settings.js";
import { accessibilityCuesEnabled } from "../ui/accessibilityFeedback.js";

/**
 * The pickup site: a groomed pad and four route stakes.
 *
 * An ingredient alone on open snow reads as a floating collectible whatever
 * else is done to it — the first capture of this system is committed as
 * `screenshots/snow-burgers/ingredients/tomato.webp` and shows exactly that,
 * correctly lit and still obviously a prop. What makes a pickup look placed
 * rather than spawned is evidence that somebody put it there, so the site is
 * groomed snow with markers around it, in the ingredient's own colour.
 *
 * Built procedurally rather than authored because four primitives at a known
 * size cost nothing to ship and nothing to load, and because they have to
 * scale with the ingredient rather than with an art file.
 */
const PAD_RADIUS = 1.55;
const PAD_HEIGHT = 0.16;
const STAKE_HEIGHT = 1.35;
const STAKE_COUNT = 4;

/** Horizontal reach of the pickup, metres. Forgiving, not automatic. */
const PICKUP_RADIUS = 2.6;
/** How far above the anchor a pickup can still be taken. */
const PICKUP_ABOVE = 3.2;
/** How far below. Small: a pickup should not be collectable from under a lip. */
const PICKUP_BELOW = 1.4;

/** Seconds the collected model takes to reach the rider. */
const FLIGHT_TIME = 0.42;

const _seg = new Vector3();
const _rel = new Vector3();
const _tmp = new Vector3();

export class IngredientField {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("../render/sky.js").Sky} deps.sky
     * @param {import("../render/shadows.js").ShadowSystem} deps.shadows
     * @param {import("../render/depthPass.js").DepthPass} deps.depthPass
     * @param {import("../character/controller.js").CharacterController} deps.controller
     * @param {import("../vfx/particles.js").SprayField} deps.spray
     */
    constructor({ scene, sky, shadows, depthPass, controller, spray }) {
        this.scene = scene;
        this.controller = controller;
        this.spray = spray;

        /** @type {Map<string, ShadedAsset>} */
        this.assets = new Map();
        /**
         * The pickup sites — the pad and stakes each ingredient stands on.
         *
         * Kept apart from the ingredient itself because they behave
         * differently: the ingredient is collected and flies away, and the site
         * stays where it was. One asset holding both would have to un-collect
         * the pad.
         * @type {Map<string, ShadedAsset>}
         */
        this.sites = new Map();
        /**
         * Live state per placed ingredient, one entry per ingredient in the
         * current order. Rebuilt by `place`, never allocated during a run.
         * @type {Array<object>}
         */
        this.items = [];

        /** Called with the ingredient id when one is taken. */
        this.onCollect = null;

        this.scene = scene;
        this._deps = { scene, sky, shadows, depthPass };
        this._prev = new Vector3();
        this._hasPrev = false;
        this._time = 0;
    }

    /**
     * Load every ingredient model the game can place.
     *
     * All of them, once, at boot — not the four a particular order needs. An
     * order variant that swaps the onion in must not pay a GLB parse mid-run,
     * and retrying a run must not re-parse anything at all. Six megabytes of
     * decoded mesh held for the session is the cheaper side of that trade.
     *
     * @param {string[]} ids
     */
    async load(ids) {
        for (const id of ids) {
            const def = INGREDIENTS[id];
            if (!def) throw new Error("unknown ingredient " + id);
            const asset = new ShadedAsset({ ...this._deps, name: "ingredient_" + id });
            const ok = await asset.load(def.url);
            if (!ok) {
                console.warn(`[snow-burgers] ingredient ${id} failed to load`);
                continue;
            }
            this.assets.set(id, asset);
            this.sites.set(id, this._buildSite(id, def));
        }
        return this.assets.size;
    }

    /**
     * Build one pickup site.
     *
     * The pad is a shallow disc of groomed snow, kept white so it reads as
     * snow that has been worked rather than as a coloured platform; the stakes
     * carry the ingredient's colour, which is the same value the order card and
     * the HUD chip use, so a player learns one association rather than three.
     *
     * @param {string} id
     * @param {import("./ingredients.js").IngredientDefinition} def
     */
    _buildSite(id, def) {
        const site = new ShadedAsset({ ...this._deps, name: "site_" + id });
        const colour = new Color3(def.colour[0], def.colour[1], def.colour[2]);

        const pad = CreateCylinder(
            "site_" + id + "_pad",
            { diameter: PAD_RADIUS * 2, height: PAD_HEIGHT, tessellation: 28 },
            this.scene
        );
        pad.parent = site.root;
        // Half its height, so the disc's top is the snow line rather than
        // hovering a pad's thickness above it.
        pad.position.y = PAD_HEIGHT * 0.5 - 0.06;
        // Slightly brighter than the snow it sits in and much smoother:
        // groomed snow is packed snow, and packed snow is shinier.
        site.adopt(pad, { colour: new Color3(0.94, 0.96, 1.0), roughness: 0.42 });

        for (let i = 0; i < STAKE_COUNT; i++) {
            const a = (i / STAKE_COUNT) * Math.PI * 2 + Math.PI * 0.25;
            const stake = CreateBox(
                "site_" + id + "_stake" + i,
                { width: 0.075, depth: 0.075, height: STAKE_HEIGHT },
                this.scene
            );
            stake.parent = site.root;
            stake.position.set(
                Math.cos(a) * PAD_RADIUS * 0.92,
                STAKE_HEIGHT * 0.5 - 0.1,
                Math.sin(a) * PAD_RADIUS * 0.92
            );
            // Leaned outward, the way a marker driven into snow ends up.
            stake.rotation.z = -Math.cos(a) * 0.09;
            stake.rotation.x = Math.sin(a) * 0.09;
            site.adopt(stake, { colour, roughness: 0.55 });
        }

        // Optional high-contrast route beacon: a faceted pole plus a small
        // crossbar gives the site a silhouette/pattern that survives colour
        // vision differences and whiteout fog. It is built once with the site
        // and merely enabled/disabled at runtime, so the run path allocates
        // nothing. The ordinary stakes remain the quiet default.
        const guide = CreateCylinder(
            "site_" + id + "_guide",
            { diameter: 0.18, height: STAKE_HEIGHT * 1.9, tessellation: 6 },
            this.scene
        );
        guide.parent = site.root;
        guide.position.y = STAKE_HEIGHT * 0.92 - 0.1;
        site.adopt(guide, { colour: new Color3(0.98, 0.98, 1), roughness: 0.4 });
        const flag = CreateBox("site_" + id + "_guide_flag", {
            width: 0.72, depth: 0.08, height: 0.12,
        }, this.scene);
        flag.parent = guide;
        flag.position.set(0.28, STAKE_HEIGHT * 0.72, 0);
        site.adopt(flag, { colour: new Color3(0.98, 0.98, 1), roughness: 0.4 });
        site.routeGuide = guide;
        site.routeFlag = flag;

        site.available = true;
        site.setActive(false);
        return site;
    }

    /** Compile every ingredient pipeline behind the loading screen. */
    async warmUp() {
        for (const site of this.sites.values()) {
            site.setActive(true);
            await site.warmUp();
            site.setActive(false);
        }
        for (const asset of this.assets.values()) {
            // A pipeline is only created when a material is bound with a mesh
            // that is actually being drawn, so the asset has to be enabled for
            // the duration of the compile and put back afterwards.
            asset.setActive(true);
            await asset.warmUp();
            asset.setActive(false);
        }
    }

    /**
     * Position the collectibles for a run.
     *
     * @param {Array<{ingredient:string,x:number,y:number,z:number,approach:number}>} placements
     */
    place(placements) {
        this.items.length = 0;
        for (const asset of this.assets.values()) asset.setActive(false);
        for (const site of this.sites.values()) site.setActive(false);

        for (const p of placements) {
            const asset = this.assets.get(p.ingredient);
            const def = INGREDIENTS[p.ingredient];
            if (!asset || !def) continue;

            asset.setActive(true);
            asset.root.position.set(p.x, p.y + def.lift, p.z);
            asset.root.rotation.y = p.approach;
            asset.root.scaling.setAll(1);

            const site = this.sites.get(p.ingredient);
            if (site) {
                site.setActive(true);
                site.routeGuide?.setEnabled(accessibilityCuesEnabled(S));
                site.routeFlag?.setEnabled(accessibilityCuesEnabled(S));
                // The pad sits on the snow, not on the ingredient's lift.
                site.root.position.set(p.x, p.y, p.z);
                site.root.rotation.y = p.approach;
            }

            this.items.push({
                id: p.ingredient,
                def,
                asset,
                anchor: new Vector3(p.x, p.y, p.z),
                // Phase offset so five ingredients do not bob in lockstep.
                phase: (p.x * 0.37 + p.z * 0.11) % (Math.PI * 2),
                collected: false,
                flight: 0,
                collectedAt: 0,
            });
        }
        this._hasPrev = false;
        return this.items.length;
    }

    /** Put every ingredient back, for an instant retry on the same route. */
    reset() {
        for (const item of this.items) {
            item.collected = false;
            item.flight = 0;
            item.collectedAt = 0;
            item.asset.setActive(true);
            item.asset.root.scaling.setAll(1);
            item.asset.root.position.set(
                item.anchor.x, item.anchor.y + item.def.lift, item.anchor.z
            );
            const site = this.sites.get(item.id);
            const showGuide = shouldShowIngredientGuide(item, accessibilityCuesEnabled(S));
            site?.routeGuide?.setEnabled(showGuide);
            site?.routeFlag?.setEnabled(showGuide);
        }
        this._hasPrev = false;
    }

    /** Hide everything — between runs, and in Free Ride Lab. */
    clear() {
        this.items.length = 0;
        for (const asset of this.assets.values()) asset.setActive(false);
        for (const site of this.sites.values()) site.setActive(false);
    }

    /**
     * @param {number} dt
     * @param {number} runTime seconds since the countdown ended; drives the idle
     *   animation so it is identical for a given time in a replay
     * @param {boolean} live whether pickups can currently be taken
     */
    update(dt, runTime, live) {
        this._time = runTime;
        const pos = this.controller.position;

        if (!this._hasPrev) {
            this._prev.copyFrom(pos);
            this._hasPrev = true;
        }

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];

            if (item.collected) {
                if (item.flight > 0) this._advanceFlight(item, dt, pos);
                continue;
            }

            // Idle: a slow turn and a shallow bob, driven by run time rather
            // than wall time so a replay reproduces the exact frame.
            const t = runTime + item.phase;
            item.asset.root.rotation.y += item.def.spin * dt;
            item.asset.root.position.y =
                item.anchor.y + item.def.lift + Math.sin(t * 1.6) * item.def.bob;

            if (live && this._sweptHit(item, pos)) this._collect(item, pos);
        }

        this._prev.copyFrom(pos);
    }

    /** Distance from the rider's swept segment to the pickup, in the XZ plane. */
    _sweptHit(item, pos) {
        const a = item.anchor;
        const centreY = a.y + item.def.lift;

        // Segment from last frame's position to this one, in XZ.
        _seg.set(pos.x - this._prev.x, 0, pos.z - this._prev.z);
        _rel.set(a.x - this._prev.x, 0, a.z - this._prev.z);
        const segLenSq = _seg.x * _seg.x + _seg.z * _seg.z;
        const t = segLenSq > 1e-9
            ? Scalar.Clamp((_rel.x * _seg.x + _rel.z * _seg.z) / segLenSq, 0, 1)
            : 0;

        const closestX = this._prev.x + _seg.x * t;
        const closestZ = this._prev.z + _seg.z * t;
        const dx = a.x - closestX;
        const dz = a.z - closestZ;
        if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) return false;

        // Vertically, interpolate the rider's own height along the same
        // parameter: taking the current height would let a rider who has
        // already landed collect something they passed under while airborne.
        const riderY = this._prev.y + (pos.y - this._prev.y) * t;
        const dy = riderY - centreY;
        return dy < PICKUP_ABOVE && dy > -PICKUP_BELOW;
    }

    _collect(item, pos) {
        // Latch first. Everything below can take as long as it likes; nothing
        // can score this ingredient twice once this line has run.
        item.collected = true;
        item.flight = FLIGHT_TIME;
        item.collectedAt = this._time;

        this._burst(item);

        if (this.onCollect) this.onCollect(item.id, item);
    }

    /**
     * A short burst of snow and ingredient-coloured grains.
     *
     * Emitted into the shared pooled spray field rather than a system of its
     * own: the pool is already allocated, already warmed up and already drawn
     * in the correct rendering group against the depth prepass, and a second
     * particle system would be a second first-use pipeline compile at exactly
     * the moment the brief forbids one.
     */
    _burst(item) {
        if (!this.spray) return;
        const a = item.anchor;
        const y = a.y + item.def.lift;
        for (let i = 0; i < 22; i++) {
            const ang = (i / 22) * Math.PI * 2 + item.phase;
            const up = 1.6 + (i % 5) * 0.5;
            const out = 2.2 + (i % 3) * 0.9;
            this.spray.emit(
                a.x, y, a.z,
                Math.cos(ang) * out, up, Math.sin(ang) * out,
                0.055 + (i % 4) * 0.012,
                0.5 + (i % 3) * 0.16,
                i % 3 === 0 ? 1 : 0,
                1.4
            );
        }
    }

    /**
     * Carry the collected model to the rider and retire it.
     *
     * It is pulled toward the rider's *current* position each frame rather than
     * along a path fixed at the moment of pickup, so at speed it reads as being
     * swept up rather than left behind — which is what actually happens to
     * something a snowboard hits at twenty metres a second.
     */
    _advanceFlight(item, dt, riderPos) {
        item.flight = Math.max(0, item.flight - dt);
        const k = 1 - item.flight / FLIGHT_TIME;
        const ease = k * k * (3 - 2 * k);

        const root = item.asset.root;
        _tmp.set(riderPos.x, riderPos.y + 1.1, riderPos.z);
        root.position.x = Scalar.Lerp(root.position.x, _tmp.x, ease * 0.55 + 0.1);
        root.position.y = Scalar.Lerp(root.position.y, _tmp.y, ease * 0.55 + 0.1);
        root.position.z = Scalar.Lerp(root.position.z, _tmp.z, ease * 0.55 + 0.1);
        root.rotation.y += item.def.spin * 7 * dt;
        const s = Math.max(0.001, 1 - ease);
        root.scaling.setAll(s);

        if (item.flight <= 0) item.asset.setActive(false);
    }

    /** Upload this frame's lighting for every visible ingredient. */
    sync(cameraPos) {
        for (const item of this.items) {
            item.asset.sync(cameraPos);
            // The site stays lit after the ingredient is gone: it is still
            // standing there, and a pad that goes black on pickup is worse
            // than no pad.
            const site = this.sites.get(item.id);
            const showGuide = shouldShowIngredientGuide(item, accessibilityCuesEnabled(S));
            site?.routeGuide?.setEnabled(showGuide);
            site?.routeFlag?.setEnabled(showGuide);
            site?.sync(cameraPos);
        }
    }

    /** How many of the placed ingredients have been taken. */
    get collectedCount() {
        let n = 0;
        for (const item of this.items) if (item.collected) n++;
        return n;
    }

    /** The ids still on the mountain, in route order. */
    get outstanding() {
        const out = [];
        for (const item of this.items) if (!item.collected) out.push(item.id);
        return out;
    }

    /** The nearest uncollected ingredient, for the HUD's recovery pointer. */
    nearestOutstanding(from) {
        let best = null;
        let bestSq = Infinity;
        for (const item of this.items) {
            if (item.collected) continue;
            const dx = item.anchor.x - from.x;
            const dz = item.anchor.z - from.z;
            const d = dx * dx + dz * dz;
            if (d < bestSq) { bestSq = d; best = item; }
        }
        return best;
    }

    dispose() {
        for (const asset of this.assets.values()) asset.dispose();
        for (const site of this.sites.values()) site.dispose();
        this.assets.clear();
        this.sites.clear();
        this.items.length = 0;
    }
}
