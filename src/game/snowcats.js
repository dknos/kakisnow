/**
 * Snowcats: the resort's moving hazard.
 *
 * Each one patrols a straight groomer line, ping-ponging between two points
 * at walking pace — slow enough to read three turns out, predictable enough
 * to plan around, solid enough to respect. The body is primitives through a
 * ShadedAsset (the base camp's recipe); the collider is one box the world
 * re-learns every frame it moves; the voice is a diesel hum whose gain the
 * director drives from proximity, so the machine is audible before it is in
 * the line — the brief's own fairness rule for anything that moves.
 *
 * Pause-safe by construction: everything advances on the simulation dt, and
 * a zero dt is a parked cat.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";

import { ShadedAsset } from "../render/shadedAsset.js";

const BODY = new Color3(0.72, 0.28, 0.12);   // groomer red — visible at night
const TRACKS = new Color3(0.14, 0.14, 0.15);
const CAB_WARM = new Color3(1.0, 0.78, 0.42); // the lit cab, painted warm

/** Body half-extents for the collider, metres. */
const HX = 1.7;
const HY = 1.3;
const HZ = 2.9;

export class Snowcats {
    constructor({ scene, sky, shadows, depthPass, terrain, collision }) {
        this.terrain = terrain;
        this.collision = collision;
        this.scene = scene;
        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "snowcats",
        });
        this.asset.available = true;
        /** @type {{ax,az,bx,bz,speed,t,dir,root,colliderId,x,z,ry}[]} */
        this.cats = [];
    }

    /** @param {object} course */
    build(course) {
        for (const def of course.snowcats ?? []) {
            const root = CreateBox("snowcatBody", {
                width: HX * 2, height: 1.5, depth: HZ * 2,
            }, this.scene);
            this.asset.adopt(root, { colour: BODY, roughness: 0.5 });

            const tracks = CreateBox("snowcatTracks", {
                width: HX * 2 + 0.5, height: 0.7, depth: HZ * 2 + 0.4,
            }, this.scene);
            tracks.parent = root;
            tracks.position.y = -0.9;
            this.asset.adopt(tracks, { colour: TRACKS, roughness: 0.9 });

            const cab = CreateBox("snowcatCab", {
                width: HX * 1.5, height: 0.9, depth: 1.4,
            }, this.scene);
            cab.parent = root;
            cab.position.set(0, 1.05, 1.4);
            // Painted warm rather than emissive — the renderer has no
            // emissive channel, but a warm face under a cold moon still
            // reads as the lit cab it stands for.
            this.asset.adopt(cab, { colour: CAB_WARM, roughness: 0.3 });

            const cat = {
                ...def,
                t: 0.5,
                dir: 1,
                root,
                x: 0, z: 0, ry: 0,
                colliderId: 0,
            };
            this._place(cat);
            this.cats.push(cat);
        }
        this.asset.setActive(this.cats.length > 0);
    }

    _place(cat) {
        const x = cat.ax + (cat.bx - cat.ax) * cat.t;
        const z = cat.az + (cat.bz - cat.az) * cat.t;
        cat.x = x;
        cat.z = z;
        cat.ry = Math.atan2((cat.bx - cat.ax) * cat.dir, (cat.bz - cat.az) * cat.dir);
        const y = this.terrain.heightAt(x, z);
        cat.root.position.set(x, y + 1.25, z);
        cat.root.rotation.y = cat.ry;
        if (cat.colliderId) this.collision.remove(cat.colliderId);
        cat.colliderId = this.collision.addBox({
            x, y: y + 1.1, z, hx: HX, hy: HY, hz: HZ, ry: cat.ry,
            kind: "snowcat", data: null,
        });
    }

    /**
     * Advance the patrols and answer how close the nearest cat is.
     * @param {number} dt simulation seconds
     * @param {{x:number,z:number}} riderPos
     * @returns {number} proximity 0..1 — 1 at arm's length, 0 past 60 m
     */
    update(dt, riderPos) {
        let nearest01 = 0;
        for (const cat of this.cats) {
            if (dt > 0) {
                const len = Math.hypot(cat.bx - cat.ax, cat.bz - cat.az) || 1;
                cat.t += (cat.dir * cat.speed * dt) / len;
                if (cat.t >= 1) { cat.t = 1; cat.dir = -1; }
                else if (cat.t <= 0) { cat.t = 0; cat.dir = 1; }
                this._place(cat);
            }
            const d = Math.hypot(cat.x - riderPos.x, cat.z - riderPos.z);
            nearest01 = Math.max(nearest01, Math.max(0, 1 - d / 60));
        }
        return nearest01;
    }

    async warmUp() {
        if (!this.cats.length) return;
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
