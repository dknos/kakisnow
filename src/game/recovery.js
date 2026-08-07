/**
 * Safe spots — where a rider stands back up.
 *
 * A ring of breadcrumbs, dropped while the riding is good and spent when it
 * goes wrong. Recording continuously and filtering hard beats deriving a
 * respawn at crash time: by the moment a rider needs recovering they are, by
 * definition, somewhere bad, and the last place that was demonstrably fine is
 * exactly the answer. The rules for "fine" are the brief's list — grounded,
 * stable, in bounds, off the jump lips and landings, clear of anything solid
 * — each one because respawning into the hazard that caused the crash is the
 * one outcome worse than the crash.
 */

import { protectedSpans } from "./ingredientPlacement.js";

/** Seconds between breadcrumbs, and how many are kept. */
const DROP_INTERVAL = 0.7;
const RING_SIZE = 10;
/** How clear of solid obstacles a spot has to be, metres. */
const OBSTACLE_CLEARANCE = 1.6;

export class SafeSpots {
    /**
     * @param {object} course the active course definition
     */
    constructor(course) {
        this.course = course;
        this._spans = protectedSpans(course.terrain);
        /** @type {{x:number,z:number,facing:number}[]} newest last */
        this._ring = [];
        this._acc = 0;
        /** @type {null|import("./collisionWorld.js").CollisionWorld} */
        this.world = null;
    }

    setCourse(course) {
        this.course = course;
        this._spans = protectedSpans(course.terrain);
        this.clear();
    }

    clear() {
        this._ring.length = 0;
        this._acc = 0;
    }

    /**
     * Consider dropping a breadcrumb. Called every frame; cheap by cadence.
     * @param {number} dt
     * @param {import("../character/controller.js").CharacterController} c
     */
    update(dt, c) {
        this._acc += dt;
        if (this._acc < DROP_INTERVAL) return;
        this._acc = 0;

        if (!c.grounded || c.crashed || c.airborne) return;
        // A rider barely moving may be wedged against something; a rider at
        // speed on the ground is demonstrably riding.
        if (c.speed < 2) return;

        const { x, z } = c.position;
        const t = this.course.terrain;
        if (Math.abs(x) > t.laneFeather + 12) return;
        if (z < this.course.startZ - 10 || z > this.course.baseCampZ) return;
        for (const s of this._spans) {
            if (z >= s.from && z <= s.to) return;
        }
        if (this.world) {
            const near = this.world.nearest(x, c.position.y + 0.7, z,
                OBSTACLE_CLEARANCE, null);
            if (near && !near.collider.data?.soft) return;
        }

        this._ring.push({ x, z, facing: c.facing });
        if (this._ring.length > RING_SIZE) this._ring.shift();
    }

    /**
     * The spot to stand up at: the newest breadcrumb, or the course start if
     * the run never produced one (a crash out of the gate).
     * @returns {{x:number, z:number, facing:number}}
     */
    recover() {
        if (this._ring.length) return this._ring[this._ring.length - 1];
        return { x: 0, z: this.course.startZ, facing: 0 };
    }
}
