/**
 * The rocket's throttle and its tank.
 *
 * Small on purpose. The thrust itself lives in `CharacterController`, because
 * that is where velocity lives and a second thing integrating the rider is how
 * two systems end up disagreeing about how fast they are going. What this owns
 * is the decision — how much throttle the engine is actually giving, and
 * whether there is anything left to burn.
 *
 * ----------------------------------------------------------------- the ramp
 *
 * Input is a switch on a keyboard and a continuous axis on a pad, and neither
 * should be what the engine does. A rocket that reaches full thrust on the
 * frame a key goes down reads as a teleport, and one that stops dead on key-up
 * loses the run-out that makes a boost feel like it had mass. So the throttle
 * chases the request through a frame-rate-independent ease, faster up than
 * down, and the flame and the sound both read that rather than the key.
 *
 * ------------------------------------------------------------------ the fuel
 *
 * A full tank is about four seconds of continuous thrust, which is short
 * enough that holding it down the whole mountain is not a strategy and long
 * enough that one committed straightaway is. Ingredients refill a fifth of it
 * each, so the order and the engine are the same decision: the detour that
 * costs time also buys the boost that wins it back.
 */

import { Scalar } from "@babylonjs/core/Maths/math.scalar.js";

/** Tank size, in seconds of full thrust. */
export const FUEL_CAPACITY = 4.0;
/** Fraction of a tank each ingredient restores. */
export const FUEL_PER_INGREDIENT = 0.2;
/** Fraction restored by a clean landing off a real jump. */
export const FUEL_PER_CLEAN_LANDING = 0.04;

const RAMP_UP = 7.5;
const RAMP_DOWN = 9.5;
/** Below this the engine is off rather than very quietly on. */
const CUTOFF = 0.02;

export class RocketThrust {
    constructor() {
        /** 0..1, what the engine is actually giving. */
        this.throttle = 0;
        /** 0..1, what the player asked for. */
        this.request = 0;
        /** Seconds of full thrust remaining. */
        this.fuel = FUEL_CAPACITY;
        this.infinite = false;

        /** Set true for one frame when the engine lights. */
        this.ignited = false;
        /** Set true for one frame when it shuts down. */
        this.shutdown = false;
        this.running = false;

        // ------------------------------------------------------- telemetry
        this.fuelBurned = 0;
        this.boostSeconds = 0;
        this.groundedBoostSeconds = 0;
        this.airborneBoostSeconds = 0;
        this.boostDistance = 0;
        this.wastedAirborne = 0;
        this.maxSpeed = 0;
        this.refills = 0;
    }

    reset() {
        this.throttle = 0;
        this.request = 0;
        this.fuel = FUEL_CAPACITY;
        this.ignited = false;
        this.shutdown = false;
        this.running = false;
        this.fuelBurned = 0;
        this.boostSeconds = 0;
        this.groundedBoostSeconds = 0;
        this.airborneBoostSeconds = 0;
        this.boostDistance = 0;
        this.wastedAirborne = 0;
        this.maxSpeed = 0;
        this.refills = 0;
    }

    /** @param {number} fraction of a tank */
    refill(fraction) {
        if (fraction <= 0) return;
        this.fuel = Math.min(FUEL_CAPACITY, this.fuel + FUEL_CAPACITY * fraction);
        this.refills++;
    }

    /**
     * @param {number} dt
     * @param {number} request 0..1 from the input layer
     * @param {import("../character/controller.js").CharacterController} controller
     */
    update(dt, request, controller) {
        this.ignited = false;
        this.shutdown = false;
        this.request = Scalar.Clamp(request, 0, 1);

        // An empty tank is a request of zero, not a hard cut: the throttle
        // still ramps down through the same ease, so running dry sounds and
        // looks like an engine dying rather than a switch.
        const want = this.fuel > 0 ? this.request : 0;
        const rate = want > this.throttle ? RAMP_UP : RAMP_DOWN;
        // Frame-rate independent, and guarded against the zero timestep
        // `S.freezeTime` produces — the same trap the controller's acceleration
        // divide already documents.
        this.throttle = dt > 0
            ? this.throttle + (want - this.throttle) * (1 - Math.exp(-rate * dt))
            : this.throttle;
        if (this.throttle < CUTOFF) this.throttle = 0;

        const wasRunning = this.running;
        this.running = this.throttle > 0;
        if (this.running && !wasRunning) this.ignited = true;
        if (!this.running && wasRunning) this.shutdown = true;

        if (this.running && !this.infinite) {
            const burn = this.throttle * dt;
            this.fuel = Math.max(0, this.fuel - burn);
            this.fuelBurned += burn;
        }

        if (this.running) {
            this.boostSeconds += dt;
            if (controller.grounded) {
                this.groundedBoostSeconds += dt;
                this.boostDistance += controller.speed * dt;
            } else {
                this.airborneBoostSeconds += dt;
                // Thrust held in the air while already travelling flat out is
                // the one genuinely wasteful use of the tank, and the results
                // screen says so.
                if (controller.speed > 24) this.wastedAirborne += dt;
            }
        }
        if (controller.speed > this.maxSpeed) this.maxSpeed = controller.speed;
    }

    /** 0..1, for the fuel gauge. */
    get level() {
        return this.fuel / FUEL_CAPACITY;
    }

    /**
     * Rocket Efficiency, 0..100, for the results screen.
     *
     * Useful boost is distance covered on the ground with the engine lit;
     * waste is thrust held in the air at a speed where it was buying nothing.
     * A run that never lights the engine scores zero rather than a hundred —
     * not using a system is not efficiency, and reporting it as full marks
     * would make the safest run the best-rated one.
     */
    efficiency() {
        if (this.boostSeconds <= 0.01) return 0;
        const useful = this.boostDistance;
        const waste = this.wastedAirborne;
        const perSecond = useful / Math.max(this.boostSeconds, 0.01);
        // 22 m/s of ground travel per second of thrust is a well-spent tank.
        const rate = Scalar.Clamp(perSecond / 22, 0, 1);
        const wasteFactor = Scalar.Clamp(1 - waste / Math.max(this.boostSeconds, 0.01), 0, 1);
        return Math.round(100 * rate * (0.35 + 0.65 * wasteFactor));
    }

    telemetry() {
        return {
            efficiency: this.efficiency(),
            fuelBurned: +this.fuelBurned.toFixed(2),
            boostSeconds: +this.boostSeconds.toFixed(2),
            groundedBoostSeconds: +this.groundedBoostSeconds.toFixed(2),
            airborneBoostSeconds: +this.airborneBoostSeconds.toFixed(2),
            boostDistance: +this.boostDistance.toFixed(1),
            wastedAirborne: +this.wastedAirborne.toFixed(2),
            maxSpeed: +this.maxSpeed.toFixed(2),
            refills: this.refills,
            fuelRemaining: +this.fuel.toFixed(2),
        };
    }
}
