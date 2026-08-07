/**
 * Recipe Tapes — three per course, hidden where a curious line goes.
 *
 * Each is a small warm cassette on a stake at an authored spot: visible
 * enough to invite the detour, off the fast line enough to cost one.
 * Collection is proximity in any riding mode — the labs included, per the
 * brief — persists immediately through the book, and answers with the
 * quietest fanfare in the game: a chime and a notice. They gate nothing;
 * they are the mountain's liner notes.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";

import { ShadedAsset } from "../render/shadedAsset.js";

const TAPE = new Color3(0.95, 0.63, 0.24);   // the one warm accent, in world
const STAKE = new Color3(0.30, 0.24, 0.18);
/** How close the board has to pass, metres. */
const COLLECT_RADIUS = 2.6;

export class RecipeTapes {
    constructor({ scene, sky, shadows, depthPass, terrain, book }) {
        this.scene = scene;
        this.terrain = terrain;
        this.book = book;
        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "recipeTapes",
        });
        this.asset.available = true;
        /** @type {{id:string, x:number, y:number, z:number, mesh:any, found:boolean}[]} */
        this.tapes = [];
        this.courseId = null;
        /** Fires on a NEW find with (index1Based, total). */
        this.onFound = null;
    }

    /** @param {object} course */
    build(course) {
        this.courseId = course.id;
        const found = new Set(this.book.book.secrets?.[course.id] ?? []);
        for (const def of course.secrets ?? []) {
            const y = this.terrain.heightAt(def.x, def.z);

            const stake = CreateCylinder("tapeStake", {
                diameter: 0.07, height: 1.5, tessellation: 8,
            }, this.scene);
            stake.position.set(def.x, y + 0.75, def.z);
            this.asset.adopt(stake, { colour: STAKE, roughness: 0.85 });

            const tape = CreateBox("recipeTape", {
                width: 0.46, height: 0.3, depth: 0.12,
            }, this.scene);
            tape.position.set(def.x, y + 1.55, def.z);
            tape.rotation.y = (def.x * 13.7 + def.z) % 1;
            this.asset.adopt(tape, { colour: TAPE, roughness: 0.35 });

            const isFound = found.has(def.id);
            if (isFound) {
                stake.setEnabled(false);
                tape.setEnabled(false);
            }
            this.tapes.push({
                id: def.id, x: def.x, y, z: def.z,
                mesh: tape, stake, found: isFound,
            });
        }
        this.asset.setActive(this.tapes.length > 0);
        // Re-hide what adopt/setActive re-enabled.
        for (const t of this.tapes) {
            if (t.found) { t.mesh.setEnabled(false); t.stake.setEnabled(false); }
        }
    }

    /** Proximity check. Cheap by count — three per course. */
    update(riderPos) {
        for (const t of this.tapes) {
            if (t.found) continue;
            const dx = riderPos.x - t.x;
            const dz = riderPos.z - t.z;
            if (dx * dx + dz * dz > COLLECT_RADIUS * COLLECT_RADIUS) continue;
            if (Math.abs(riderPos.y - t.y) > 4) continue;
            t.found = true;
            t.mesh.setEnabled(false);
            t.stake.setEnabled(false);
            const isNew = this.book.addSecret(this.courseId, t.id);
            if (isNew && this.onFound) {
                const total = this.tapes.length;
                const count = this.tapes.filter((x) => x.found).length;
                this.onFound(count, total);
            }
        }
    }

    async warmUp() {
        if (!this.tapes.length) return;
        this.asset.setActive(true);
        await this.asset.warmUp();
        for (const t of this.tapes) {
            if (t.found) { t.mesh.setEnabled(false); t.stake.setEnabled(false); }
        }
    }

    sync(cameraPos) {
        if (this.asset.active) this.asset.sync(cameraPos);
    }

    get beautyMaterials() {
        return this.asset.beautyMaterials;
    }
}
