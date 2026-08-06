/**
 * Burger Base Camp — the bottom of the mountain, and what the run is for.
 *
 * A finish arch across the lane, a grill beside it, an order board, and two
 * lodge huts set back off the piste. Built from primitives and shaded through
 * `ShadedAsset.adopt`, the same way the pickup sites are, so every surface here
 * takes the scene's own sun, cascades, prepass and aerial fog rather than a
 * material of its own.
 *
 * ----------------------------------------------------------------- primitives
 *
 * Nothing here is an imported model, and that is a decision rather than a
 * shortcut. The camp is read at speed, from above, through fog, for about two
 * seconds at the end of a run — boxes and cylinders at the right size, in the
 * right colours, with correct shadows are indistinguishable from authored
 * geometry at that distance, and they cost nothing to download, nothing to
 * parse and nothing to keep in memory. The two assets that *are* imported here
 * are the ones the player actually looks at closely: the ingredients and the
 * finished burger.
 *
 * ------------------------------------------------------------------ grounding
 *
 * Every piece is grounded on the terrain under its own footprint rather than on
 * one height for the whole camp. The Summit Line's run-out is not flat, and a
 * camp built on a single plane has one post buried and the one beside it
 * standing on air.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";

import { ShadedAsset } from "../render/shadedAsset.js";
import { BASE_CAMP_Z } from "./ingredientPlacement.js";

/** The brand's one warm value, matching the interface. */
const WARM = new Color3(0.95, 0.63, 0.24);
const TIMBER = new Color3(0.16, 0.13, 0.12);
const STEEL = new Color3(0.30, 0.32, 0.36);
const SNOW = new Color3(0.94, 0.96, 1.0);
const LODGE = new Color3(0.34, 0.22, 0.16);

/**
 * How far downhill of the gate the camp itself stands.
 *
 * The rider crosses the finish still carrying most of twenty metres a second
 * and coasts for several seconds afterwards, with the follow camera seven
 * metres behind them the whole way. A camp built where they come to rest is a
 * camp the camera ends up inside — the first version put the grill and the
 * lodges within a few metres of the gate, and the committed assembly frames
 * from that attempt are a flat brown rectangle and a flat amber one.
 *
 * Only the arch stands on the line, because the arch is the line.
 */

/** Half the gap between the arch posts. Wide enough to ride through at speed. */
const ARCH_HALF = 11;
const ARCH_HEIGHT = 7.2;

export class BurgerBaseCamp {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("../render/sky.js").Sky} deps.sky
     * @param {import("../render/shadows.js").ShadowSystem} deps.shadows
     * @param {import("../render/depthPass.js").DepthPass} deps.depthPass
     * @param {import("../terrain/terrain.js").Terrain} deps.terrain
     */
    constructor({ scene, sky, shadows, depthPass, terrain }) {
        this.scene = scene;
        this.terrain = terrain;
        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "baseCamp",
        });
        /** Where the assembly sequence should stand the finished burger. */
        this.grillPosition = new Vector3(0, 0, 0);
        /**
         * The lodge, imported rather than built.
         *
         * Everything else here is primitives, because everything else here is
         * read at speed from a distance. The lodge is the one structure the
         * player actually comes to rest beside, and a box with a rotated box
         * on top does not survive being looked at — so this is a real 8.5 m
         * hut with real timber and real snow on its roof, and it is the only
         * imported thing in the camp.
         */
        this.hut = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "campHut",
        });
        this.hutB = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "campHutB",
        });
        /**
         * The village, placed as one group.
         *
         * The file already arranges its cabins the way a hamlet sits on a
         * slope, so it goes down as authored rather than being cut up and
         * re-scattered — rebuilding a layout that already exists is work spent
         * to arrive back where it started. It sits well downhill and off to
         * the side, where it reads as somewhere the run leads to.
         */
        this.village = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "campVillage",
        });
        this.built = false;
    }

    /**
     * Raise the camp.
     *
     * Called once the terrain bake has been read back, because every piece is
     * grounded on a height that does not exist before then.
     */
    build() {
        if (this.built) return;
        const g = (x, z) => this.terrain.heightAt(x, z);

        // ------------------------------------------------------- finish arch
        //
        // Fourteen metres uphill of the trigger, not on it. The rider is meant
        // to pass *under* the gate and come to rest beyond it — an arch
        // standing exactly where they stop is an arch the follow camera, seven
        // metres behind them, spends the whole assembly sequence inside. Three
        // committed frames from earlier attempts show the inside of this beam
        // and this banner.
        const archZ = BASE_CAMP_Z - 14;
        for (const side of [-1, 1]) {
            const x = side * ARCH_HALF;
            this._box(`archPost${side}`, x, g(x, archZ), archZ,
                0.62, ARCH_HEIGHT, 0.62, TIMBER, 0.6);
        }
        // The beam spans the two posts at the height of the shorter one, so it
        // sits on both rather than floating off the downhill side.
        const beamY = Math.min(g(-ARCH_HALF, archZ), g(ARCH_HALF, archZ)) + ARCH_HEIGHT;
        this._boxAt("archBeam", 0, beamY - 0.42, archZ, ARCH_HALF * 2 + 1.2, 0.84, 0.8,
            TIMBER, 0.6);
        // The banner under it, in the one warm colour the whole product uses.
        this._boxAt("archBanner", 0, beamY - 1.55, archZ - 0.08,
            ARCH_HALF * 2 - 1.4, 1.5, 0.16, WARM, 0.5);

        // ------------------------------------------------------------- grill
        //
        // Off to the rider's right and slightly past the arch, so crossing the
        // line puts it in frame rather than behind them.
        const gx = 11.5;
        const gz = BASE_CAMP_Z + 26;
        const gy = g(gx, gz);
        this.grillPosition.set(gx - 1.6, gy, gz + 1.2);
        this._box("grillBody", gx, gy, gz, 3.4, 1.15, 2.0, STEEL, 0.35, 0.5);
        this._box("grillHood", gx, gy + 1.15, gz - 0.15, 3.6, 0.9, 1.7, TIMBER, 0.4);
        this._cyl("grillFlue", gx + 1.3, gy + 2.05, gz - 0.2, 0.26, 2.2, STEEL, 0.4, 0.6);
        for (const s of [-1, 1]) {
            this._cyl(`grillLeg${s}`, gx + s * 1.4, gy - 0.2, gz, 0.14, 1.0, STEEL, 0.4, 0.6);
        }
        // A serving counter, which is what makes it a stall rather than a box.
        this._box("grillCounter", gx - 2.6, gy, gz + 0.6, 1.6, 1.0, 2.4, TIMBER, 0.55);
        this._box("grillCounterTop", gx - 2.6, gy + 1.0, gz + 0.6, 1.9, 0.14, 2.7, WARM, 0.45);

        // -------------------------------------------------------- order board
        const bx = -13.5;
        const bz = BASE_CAMP_Z + 24;
        const by = g(bx, bz);
        for (const s of [-1, 1]) {
            this._box(`boardPost${s}`, bx + s * 1.5, by, bz, 0.24, 3.0, 0.24, TIMBER, 0.6);
        }
        this._boxAt("orderBoard", bx, by + 3.2, bz, 3.8, 2.2, 0.18, TIMBER, 0.55);
        this._boxAt("orderBoardFace", bx, by + 3.2, bz - 0.11, 3.4, 1.8, 0.06, WARM, 0.5);

        // ------------------------------------------------------- finish line
        // A stripe across the snow at the gate, so the line is a line.
        this._boxAt("finishStripe", 0, g(0, BASE_CAMP_Z) + 0.03, BASE_CAMP_Z,
            ARCH_HALF * 2, 0.06, 0.7, WARM, 0.45);

        this.asset.available = this.asset.meshes.length > 0;
        this.asset.setActive(false);
        this.built = true;
    }

    /**
     * Import the lodge and stand it beside the piste.
     *
     * Two copies of one model rather than two models: a second hut costs a
     * second import and a second set of pipelines, and at this distance the
     * difference between two huts and one hut twice is a rotation.
     */
    async load() {
        const url = (import.meta.env?.BASE_URL ?? "/")
            + "assets/models/snow-burgers/camp-hut.glb";
        const base = (import.meta.env?.BASE_URL ?? "/")
            + "assets/models/snow-burgers/";
        const placements = [
            { asset: this.hut, url, x: -30, z: BASE_CAMP_Z + 40, scale: 1.5, ry: 0.5 },
            { asset: this.hutB, url, x: 27, z: BASE_CAMP_Z + 52, scale: 1.15, ry: -1.9 },
            {
                asset: this.village, url: base + "camp-village.glb",
                x: -78, z: BASE_CAMP_Z + 96, scale: 1.0, ry: 0.35,
            },
        ];
        for (const p of placements) {
            if (!await p.asset.load(p.url)) continue;
            p.asset.root.scaling.setAll(p.scale);
            p.asset.root.rotation.y = p.ry;
            p.asset.root.position.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
            p.asset.setActive(false);
        }
        return this.hut.available;
    }

    async warmUp() {
        if (!this.built) return;
        this.asset.setActive(true);
        await this.asset.warmUp();
        this.asset.setActive(false);
        for (const h of [this.hut, this.hutB, this.village]) {
            if (!h.available) continue;
            h.setActive(true);
            await h.warmUp();
            h.setActive(false);
        }
    }

    setActive(active) {
        this.asset.setActive(active);
        this.hut.setActive(active);
        this.hutB.setActive(active);
        this.village.setActive(active);
    }

    sync(cameraPos) {
        this.asset.sync(cameraPos);
        this.hut.sync(cameraPos);
        this.hutB.sync(cameraPos);
        this.village.sync(cameraPos);
    }

    get beautyMaterials() {
        return [
            ...this.asset.beautyMaterials,
            ...this.hut.beautyMaterials,
            ...this.hutB.beautyMaterials,
            ...this.village.beautyMaterials,
        ];
    }

    // ------------------------------------------------------------- builders

    /** A box standing on the ground at (x, groundY, z). */
    _box(name, x, groundY, z, w, h, d, colour, roughness, metallic = 0) {
        return this._boxAt(name, x, groundY + h * 0.5, z, w, h, d, colour, roughness, metallic);
    }

    /** A box centred at (x, y, z). */
    _boxAt(name, x, y, z, w, h, d, colour, roughness, metallic = 0) {
        const mesh = CreateBox(name, { width: w, height: h, depth: d }, this.scene);
        mesh.parent = this.asset.root;
        mesh.position.set(x, y, z);
        this.asset.adopt(mesh, { colour, roughness, metallic });
        return mesh;
    }

    _cyl(name, x, groundY, z, radius, height, colour, roughness, metallic = 0) {
        const mesh = CreateCylinder(
            name, { diameter: radius * 2, height, tessellation: 16 }, this.scene
        );
        mesh.parent = this.asset.root;
        mesh.position.set(x, groundY + height * 0.5, z);
        this.asset.adopt(mesh, { colour, roughness, metallic });
        return mesh;
    }

    /**
     * A hut: walls, a snow-loaded roof, and a lit window.
     *
     * The roof is a rotated box rather than a prism because at this distance
     * the silhouette is the whole of it, and a box turned forty-five degrees
     * reads as a pitched roof from every angle the player ever sees it from.
     */
    _hut(name, x, z, w, h, d) {
        const y = this.terrain.heightAt(x, z);
        this._box(name + "Walls", x, y, z, w, h, d, LODGE, 0.7);
        const roof = CreateBox(
            name + "Roof",
            { width: w * 0.78, height: w * 0.78, depth: d * 1.12 },
            this.scene
        );
        roof.parent = this.asset.root;
        roof.position.set(x, y + h + w * 0.27, z);
        roof.rotation.z = Math.PI * 0.25;
        this.asset.adopt(roof, { colour: SNOW, roughness: 0.5 });
        // One warm window, which is the cheapest thing that makes a hut read as
        // occupied rather than as a crate.
        this._boxAt(name + "Window", x - w * 0.5 - 0.02, y + h * 0.62, z,
            0.08, h * 0.28, d * 0.3, WARM, 0.4);
    }

    dispose() {
        this.asset.dispose();
        this.hut.dispose();
        this.hutB.dispose();
        this.village.dispose();
    }
}
