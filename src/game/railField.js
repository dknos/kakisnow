/**
 * Grind rails: the meshes, and their colliders.
 *
 * Built from the course definition's `rails` list the way the base camp is
 * built — primitives through a ShadedAsset, grounded per-end on the baked
 * terrain, sharing the one `rocker` material family everything else wears.
 * Each rail registers a segment collider (kind "rail") whose endpoints are
 * the beam's top surface; the controller's grind logic attaches to that
 * segment, so the thing ridden is exactly the thing drawn.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";

import { ShadedAsset } from "../render/shadedAsset.js";

const STEEL = new Color3(0.16, 0.17, 0.19);
/** Debarked timber — a fallen log reads at distance where thin steel cannot. */
const TIMBER = new Color3(0.38, 0.27, 0.17);
const POST_SPACING = 7;
/** Beam cross-section: wide enough to read at speed, thin enough to be a rail. */
const BEAM_W = 0.10;
const BEAM_H = 0.08;
/** A log's radius. Grindable culture says the top surface is what counts. */
const LOG_R = 0.16;

export class RailField {
    /**
     * @param {object} deps scene/sky/shadows/depthPass, terrain, and the
     *   collision world the segments register into
     */
    constructor({ scene, sky, shadows, depthPass, terrain, collision }) {
        this.scene = scene;
        this.terrain = terrain;
        this.collision = collision;
        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "rails",
        });
        this.asset.available = true;
        /** @type {{ax:number,ay:number,az:number,bx:number,by:number,bz:number}[]} */
        this.segments = [];
        this._colliderIds = [];
    }

    /**
     * Build every rail for a course. Terrain readback must have landed first
     * — the ends are grounded on `heightAt`, same rule as the camp.
     * @param {object} course
     */
    build(course) {
        this.clear();
        for (const r of course.rails ?? []) {
            const ya = this.terrain.heightAt(r.ax, r.az) + r.height;
            const yb = this.terrain.heightAt(r.bx, r.bz) + r.height;
            const dx = r.bx - r.ax;
            const dy = yb - ya;
            const dz = r.bz - r.az;
            const len = Math.hypot(dx, dy, dz);

            // The beam: steel is a thin box; a log is a cylinder laid along
            // the same line. Style comes off the course definition — a park
            // rail in a forest would be furniture from the wrong mountain.
            const log = r.style === "log";
            let beam;
            if (log) {
                beam = CreateCylinder("railLog", {
                    diameter: LOG_R * 2, height: len, tessellation: 10,
                }, this.scene);
                // Cylinder axis is Y; +90° about X lays it along +Z, and the
                // segment's own pitch subtracts from there.
                beam.rotation.y = Math.atan2(dx, dz);
                beam.rotation.x = Math.PI / 2 - Math.asin(dy / len);
            } else {
                beam = CreateBox("railBeam", {
                    width: BEAM_W, height: BEAM_H, depth: len,
                }, this.scene);
                beam.rotation.y = Math.atan2(dx, dz);
                beam.rotation.x = -Math.asin(dy / len);
            }
            beam.position.set(
                (r.ax + r.bx) / 2,
                (ya + yb) / 2 - (log ? LOG_R : BEAM_H) / 2,
                (r.az + r.bz) / 2
            );
            this.asset.adopt(beam, log
                ? { colour: TIMBER, roughness: 0.8 }
                : { colour: STEEL, roughness: 0.25, metallic: 0.85 });

            // Posts, grounded individually so the beam can bridge a dip.
            // A log gets stumps — same job, wider, timber.
            const posts = Math.max(2, Math.round(len / POST_SPACING));
            for (let i = 0; i < posts; i++) {
                const t = posts === 1 ? 0.5 : i / (posts - 1);
                const px = r.ax + dx * t;
                const pz = r.az + dz * t;
                const groundY = this.terrain.heightAt(px, pz);
                const topY = ya + dy * t - BEAM_H;
                const h = Math.max(0.2, topY - groundY + 0.35);
                const post = CreateCylinder(log ? "railStump" : "railPost", {
                    diameter: log ? 0.3 : 0.09, height: h, tessellation: 8,
                }, this.scene);
                post.position.set(px, topY - h / 2 + 0.02, pz);
                this.asset.adopt(post, log
                    ? { colour: TIMBER, roughness: 0.85 }
                    : { colour: STEEL, roughness: 0.35, metallic: 0.8 });
            }

            const seg = { ax: r.ax, ay: ya, az: r.az, bx: r.bx, by: yb, bz: r.bz };
            this.segments.push(seg);
            this._colliderIds.push(this.collision.addSegment({
                ...seg, r: 0.14, kind: "rail", data: seg,
            }));
        }
        this.asset.setActive(true);
    }

    /**
     * Drop the colliders. The meshes and their materials go with the whole
     * asset (`dispose()`) — a course switch builds a fresh RailField rather
     * than recycling this one, because `adopt` mints materials per mesh and
     * halfway-disposal is how leaks are born.
     */
    clear() {
        for (const id of this._colliderIds) this.collision.remove(id);
        this._colliderIds.length = 0;
        this.segments.length = 0;
    }

    dispose() {
        this.clear();
        this.asset.dispose();
    }

    async warmUp() {
        this.asset.setActive(true);
        await this.asset.warmUp();
    }

    sync(cameraPos) {
        if (this.asset.active) this.asset.sync(cameraPos);
    }

    get beautyMaterials() {
        return this.asset.beautyMaterials;
    }
}

/** Scratch for grind queries. */
export const _railPoint = new Vector3();
