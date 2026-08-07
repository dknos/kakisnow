/**
 * The avalanche — a number with a voice, not a fluid.
 *
 * One scalar (`wallZ`, the front's along-course position) advances behind
 * the rider: a base pace tuned near the course's expected speed, plus a
 * rubber band that reels it in when the rider stretches the lead and eases
 * when they are about to be caught — tension is the product, not execution.
 * Everything else is presentation for that scalar: a pooled spray curtain
 * across the front, a rumble whose gain is proximity, and the HUD's metre
 * count. Caught means crashed — the tumble-and-recover the rider already
 * knows — and the wall resets a relief window back, because the brief's rule
 * for this course is intense, never arbitrary.
 *
 * Pause-safe and reset-safe by construction: the wall only moves on the
 * simulation dt the director feeds it, and every run's countdown calls
 * `reset`.
 */

export class Avalanche {
    /**
     * @param {{emit:Function}} spray the shared pooled field
     */
    constructor(spray) {
        this.spray = spray;
        this.cfg = null;
        this.wallZ = -Infinity;
        this.active = false;
        this._emitAcc = 0;
    }

    /** Arm for a course, or disarm with null. */
    configure(cfg) {
        this.cfg = cfg ?? null;
        this.active = false;
    }

    /** A fresh run: the wall starts its authored lead behind the gate. */
    reset(startZ) {
        if (!this.cfg) return;
        this.wallZ = startZ - this.cfg.startBehind;
        this.active = true;
        this._emitAcc = 0;
    }

    stop() {
        this.active = false;
    }

    /**
     * Advance the front and dress it.
     * @param {number} dt simulation seconds
     * @param {{x:number,y:number,z:number}} rider
     * @returns {{distance:number, caught:boolean}|null}
     */
    update(dt, rider, terrain) {
        if (!this.active || !this.cfg) return null;
        const c = this.cfg;

        const lead = rider.z - this.wallZ;
        // The rubber band: ahead of the intended lead the wall hurries,
        // behind it the wall relents — but never below half pace and never
        // above the cap, so it stays a chase rather than a scripted loss.
        const stretch = (lead - c.lead) * c.catchup;
        const pace = Math.min(c.maxPace, Math.max(c.basePace * 0.5,
            c.basePace + stretch));
        this.wallZ += pace * dt;

        // The curtain: a line of heavy grains across the front, from the
        // shared pool. Metered by simulation time so a paused mountain does
        // not keep snowing sideways.
        this._emitAcc += dt;
        if (this._emitAcc >= 0.045 && dt > 0) {
            this._emitAcc = 0;
            for (let i = 0; i < 9; i++) {
                const x = rider.x + (Math.random() * 2 - 1) * 26;
                const z = this.wallZ + (Math.random() * 2 - 1) * 3;
                const y = terrain.heightAt(x, z);
                this.spray.emit(
                    x, y + 0.4 + Math.random() * 2.6, z,
                    (Math.random() * 2 - 1) * 2.5,
                    2.2 + Math.random() * 3.5,
                    6 + Math.random() * 5,
                    0.5 + Math.random() * 0.5,
                    0.7 + Math.random() * 0.5,
                    0, 3.2
                );
            }
        }

        const distance = rider.z - this.wallZ;
        return { distance, caught: distance < 4 };
    }
}
