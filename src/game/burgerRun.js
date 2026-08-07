/**
 * Burger Run — the run's state machine, its order, its clock and its score.
 *
 * One event so far, THE SUMMIT STACK: take an order for four ingredients, drop
 * in at the summit, collect them on the way down, and reach the grill at Burger
 * Base Camp with all four.
 *
 * ------------------------------------------------------------------ the states
 *
 *   IDLE        nothing running; the menu is up, or Free Ride Lab has the world
 *   ORDER       the order card is up and the player has not dropped in
 *   COUNTDOWN   3-2-1, rider held at the gate
 *   RUN         the clock is going and pickups are live
 *   ASSEMBLY    all four collected and the finish crossed; the burger is built
 *   RESULTS     scored, recorded, waiting on retry / next / menu
 *
 * The transitions are one-way except for retry, which re-enters COUNTDOWN with
 * the same seed. Every one of them is driven by `update`, so there is no path
 * into a state that the run clock does not know about.
 *
 * ------------------------------------------------------------------ the scoring
 *
 * What is measured here is what this game can actually observe. The controller
 * exposes speed, carve, air time, jump count, landing impact and grounding; it
 * has no trick system, no obstacle collision and no crash state, so there are
 * no trick scores and no crash counts, and inventing either would mean printing
 * a number on the results screen that nothing produced. Style is air, carve,
 * commitment to speed, and the risk of the line the route chose. Stack
 * Integrity is landing violence. Both say so on the results screen.
 *
 * Rocket Efficiency is present and reads zero until a vehicle supplies it; it
 * belongs to the rocket chair and is wired when that vehicle is.
 */

import { Scalar } from "@babylonjs/core/Maths/math.scalar.js";

import { selectRoute } from "./ingredientPlacement.js";
import { SUMMIT_LINE } from "./courses/summitLine.js";
import { SUMMIT_STACK } from "./courses/eventRegistry.js";

// Re-exported where it has always lived: the tools ABI reaches it through
// `game.api.event`, and gameDirector imports it from here.
export { SUMMIT_STACK };

export const RunState = {
    IDLE: "idle",
    ORDER: "order",
    COUNTDOWN: "countdown",
    RUN: "run",
    ASSEMBLY: "assembly",
    RESULTS: "results",
};

const COUNTDOWN_SECONDS = 3.2;

/** How often the ghost samples the rider, seconds. */
const GHOST_INTERVAL = 0.25;

export class BurgerRun {
    /**
     * @param {object} deps
     * @param {import("../character/controller.js").CharacterController} deps.controller
     * @param {import("./ingredientField.js").IngredientField} deps.field
     * @param {import("./burgerBook.js").BurgerBook} deps.book
     * @param {{heightAt(x:number,z:number):number, normalAt(x:number,z:number,out:any):any}} deps.terrain
     */
    constructor({ controller, field, book, terrain, course, event }) {
        this.controller = controller;
        this.field = field;
        this.book = book;
        this.terrain = terrain;

        /** The course being ridden and the rules being scored against. Both
         *  come from the registries; the defaults keep old constructions —
         *  the unit tests, mostly — on the original game. */
        this.course = course ?? SUMMIT_LINE;
        this.event = event ?? SUMMIT_STACK;
        /** Written by the director at each gate; part of the ghost identity. */
        this.vehicleId = "classic-snowboard";
        this.state = RunState.IDLE;
        this.seed = 1;

        this.time = 0;
        this.countdown = 0;
        /** @type {Record<string, number>} pickup times, seconds into the run */
        this.splits = {};
        /** @type {object[]} the route this run is riding */
        this.placements = [];

        /** @type {null|object} filled when the run is scored */
        this.result = null;
        /** Set for one frame when a run is scored, for the UI to react to. */
        this.justFinished = false;
        /** Why a finish attempt was refused, for the HUD to explain. */
        this.blockedReason = null;

        // ------------------------------------------------------------ style
        this._airTime = 0;
        this._carveIntegral = 0;
        this._speedIntegral = 0;
        this._landings = 0;
        this._hardLandings = 0;
        this._worstLanding = 0;
        this._pipeTime = 0;
        this._distance = 0;
        this._lastZ = 0;

        // ------------------------------------------------------------ ghost
        this._ghost = [];
        this._ghostAcc = 0;

        /** Supplied by a vehicle that burns fuel. Zero means "not measured". */
        this.rocketTelemetry = null;
        /**
         * Supplied by the game layer's trick tracker, the same way the rocket
         * reports: the run scores what it is handed and never owns a system.
         * @type {null|{total:number, best:{name:string,score:number}|null, count:number}}
         */
        this.trickTelemetry = null;
        /** Controller crash count at the gate, so a run counts only its own. */
        this._crashBase = 0;

        this.onStateChange = null;
    }

    // -------------------------------------------------------------- lifecycle

    /**
     * Choose a route and show the order.
     *
     * The seed is the run's identity: the same seed rides the same mountain, so
     * a best time is comparable to the ghost that set it. A missing seed picks
     * one from the clock, which is the only place in the game layer a
     * non-deterministic value enters — and it enters once, is recorded, and
     * everything downstream is a function of it.
     */
    begin(seed = null) {
        this.seed = seed ?? ((Date.now() ^ (performance.now() * 1000)) >>> 0);
        const route = selectRoute(
            this.event.required, this.terrain, this.seed, this.course
        );

        if (!route.ok) {
            // Should not happen: the validator sweeps 100 seeds against this
            // terrain. If it ever does, take the next seed rather than start a
            // run the player cannot finish.
            console.warn(
                `[snow-burgers] seed ${this.seed} produced no route (${route.reason}); ` +
                "advancing the seed"
            );
            return this.begin((this.seed + 1) >>> 0);
        }

        this.placements = route.placements;
        this.field.place(this.placements);
        this._resetRun();
        this._setState(RunState.ORDER);
        return this.seed;
    }

    /** Leave the order card and start the countdown. */
    dropIn() {
        if (this.state !== RunState.ORDER && this.state !== RunState.RESULTS) return;
        this._resetRun();
        this.field.reset();
        this._placeAtGate();
        this.countdown = COUNTDOWN_SECONDS;
        this._setState(RunState.COUNTDOWN);
    }

    /** Restart the same route immediately. */
    retry() {
        this.dropIn();
    }

    /**
     * Restart from anywhere in a live run — the pause menu's restart.
     *
     * `dropIn` deliberately only answers the order card and the results
     * screen, because those are the places a button exists. A pause can happen
     * mid-countdown, mid-run or mid-assembly, and from all of those "restart"
     * means the same thing: same seed, same route, back to the gate.
     */
    restart() {
        if (this.state === RunState.IDLE) return;
        this._resetRun();
        this.field.reset();
        this._placeAtGate();
        this.countdown = COUNTDOWN_SECONDS;
        this._setState(RunState.COUNTDOWN);
    }

    /** Take a new order — a new seed on the same event. */
    nextOrder() {
        this.begin(null);
    }

    /** Drop out of the game loop entirely, for Free Ride Lab. */
    stop() {
        this.field.clear();
        this._setState(RunState.IDLE);
    }

    // ----------------------------------------------------------------- update

    /**
     * @param {number} dt
     * @returns {void}
     */
    update(dt) {
        this.justFinished = false;

        switch (this.state) {
            case RunState.COUNTDOWN:
                this._updateCountdown(dt);
                break;
            case RunState.RUN:
                this._updateRun(dt);
                break;
            default:
                break;
        }
    }

    _updateCountdown(dt) {
        this.countdown -= dt;
        // Held at the gate until the clock starts. Zeroing velocity every frame
        // rather than once is what makes the hold survive the slope: gravity
        // and slope assist are integrated by the controller regardless of what
        // the game layer wants, and a single reset would let the rider creep.
        this.controller.velocity.setAll(0);
        this.controller.verticalVelocity = 0;
        if (this.countdown <= 0) {
            this.countdown = 0;
            this._lastZ = this.controller.position.z;
            this._crashBase = this.controller.crashCount;
            this._setState(RunState.RUN);
        }
    }

    _updateRun(dt) {
        const c = this.controller;
        this.time += dt;

        // ------------------------------------------------------------ style
        const dz = c.position.z - this._lastZ;
        this._lastZ = c.position.z;
        this._distance += Math.abs(dz);

        if (c.airborne) this._airTime += dt;
        this._carveIntegral += Math.abs(c.carve) * c.speed01 * dt;
        this._speedIntegral += c.speed01 * dt;
        if (this._inPipe(c.position.z)) this._pipeTime += dt;

        if (c.landed) {
            this._landings++;
            // `landingImpact` runs 0.2 to 1.5, and a normal fast landing sits
            // well under 1. Only the violent end counts against Stack
            // Integrity: the brief is explicit that a sketchy landing should
            // not be punished, and on this course every landing is sketchy.
            if (c.landingImpact > 1.05) this._hardLandings++;
            if (c.landingImpact > this._worstLanding) {
                this._worstLanding = c.landingImpact;
            }
        }

        // ------------------------------------------------------------ ghost
        this._ghostAcc += dt;
        if (this._ghostAcc >= GHOST_INTERVAL) {
            this._ghostAcc -= GHOST_INTERVAL;
            this._ghost.push(
                +c.position.x.toFixed(2),
                +c.position.y.toFixed(2),
                +c.position.z.toFixed(2)
            );
        }

        // ----------------------------------------------------------- finish
        if (c.position.z >= this.event.finishZ) this._reachFinish();
    }

    /** Note a pickup. Called by the ingredient field's collect callback. */
    noteCollected(id) {
        if (this.state !== RunState.RUN) return;
        if (this.splits[id] !== undefined) return; // the field latches too
        this.splits[id] = this.time;
    }

    // ----------------------------------------------------------------- finish

    _reachFinish() {
        const missing = this.event.required.filter((id) => this.splits[id] === undefined);
        if (missing.length) {
            // Do not award, do not trap, do not erase. The player keeps every
            // ingredient they have and the HUD says which one is missing and
            // where it is; the clock keeps running because going back for it is
            // the cost.
            this.blockedReason = missing;
            return;
        }
        this.blockedReason = null;
        this._setState(RunState.ASSEMBLY);
    }

    /**
     * The assembly sequence has played (or been skipped). Score and record.
     */
    completeAssembly() {
        if (this.state !== RunState.ASSEMBLY) return;
        this.result = this._score(true);
        // The ghost carries its full identity — course, event, versions,
        // vehicle, sampling interval — so playback validates data instead of
        // trusting two constants to stay equal by hand.
        const ghost = {
            version: 2,
            seed: this.seed,
            interval: GHOST_INTERVAL,
            courseId: this.course.id,
            courseVersion: this.course.version,
            eventId: this.event.id,
            eventVersion: this.event.version,
            vehicleId: this.vehicleId,
            samples: this._ghost,
        };
        this.result.records = this.book.record(
            this.event.id, this.result, ghost, this._recordMeta()
        );
        this.book.markAssemblySeen();
        this.justFinished = true;
        this._setState(RunState.RESULTS);
    }

    /** Abandon the run and score it as incomplete. */
    abandon() {
        if (this.state !== RunState.RUN && this.state !== RunState.COUNTDOWN) return;
        this.result = this._score(false);
        this.result.records = this.book.record(
            this.event.id, this.result, null, this._recordMeta()
        );
        this.justFinished = true;
        this._setState(RunState.RESULTS);
    }

    _recordMeta() {
        return {
            courseId: this.course.id,
            courseVersion: this.course.version,
            eventVersion: this.event.version,
            vehicleId: this.vehicleId,
        };
    }

    // ---------------------------------------------------------------- scoring

    _score(completed) {
        const ev = this.event;
        const time = this.time;

        let medal = !completed ? null
            : time <= ev.gold ? "gold"
            : time <= ev.silver ? "silver"
            : time <= ev.bronze ? "bronze"
            : null;

        // Style, 0..100. Every term is something the controller actually
        // produced during the run, normalised against a run length so a slow
        // run cannot accumulate a high score by taking longer. Tricks joined
        // the roster when the trick system did: 55 points a second is a
        // committed line, and the term saturates there.
        const span = Math.max(time, 1);
        const air = Scalar.Clamp((this._airTime / span) / 0.16, 0, 1);
        const carve = Scalar.Clamp((this._carveIntegral / span) / 0.22, 0, 1);
        const pace = Scalar.Clamp((this._speedIntegral / span) / 0.78, 0, 1);
        const pipe = Scalar.Clamp((this._pipeTime / span) / 0.2, 0, 1);
        const risk = this._routeRisk();
        const trickTotal = this.trickTelemetry?.total ?? 0;
        const tricks = Scalar.Clamp((trickTotal / span) / 55, 0, 1);
        const style = Math.round(
            100 * (air * 0.20 + carve * 0.20 + pace * 0.20 +
                   pipe * 0.10 + risk * 0.10 + tricks * 0.20)
        );

        // A style event's medal has two locks: the clock above and the style
        // score here. The run still completes and records — only the metal
        // asks for both.
        if (medal && ev.styleTarget && style < ev.styleTarget) medal = null;

        // Stack Integrity, 0..100. Starts whole and is reduced by violence —
        // and a crash is the most violent thing a stack can experience.
        const crashes = Math.max(
            0, this.controller.crashCount - this._crashBase
        );
        const perLanding = this._landings ? this._hardLandings / this._landings : 0;
        const integrity = Math.round(
            100 * Scalar.Clamp(
                1 - perLanding * 0.55 - Math.max(0, this._worstLanding - 1.2) * 0.3
                  - crashes * 0.18,
                0, 1
            )
        );

        const rocket = this.rocketTelemetry ? this.rocketTelemetry.efficiency : 0;

        // Overall, one to five. Completion is the gate: an incomplete run is
        // one star whatever else it did, because the objective is a burger.
        let stars = 1;
        if (completed) {
            const medalScore = medal === "gold" ? 1 : medal === "silver" ? 0.7 : medal === "bronze" ? 0.4 : 0.15;
            const blend = medalScore * 0.45 + (style / 100) * 0.35 + (integrity / 100) * 0.2;
            stars = Scalar.Clamp(Math.round(1 + blend * 4), 1, 5);
        }

        return {
            event: ev.id,
            eventName: ev.name,
            seed: this.seed,
            completed,
            time,
            // The event's own ladder rides along so the results screen draws
            // its time bar against the thresholds this run was scored with,
            // instead of a hardcoded copy that drifts.
            medals: { gold: ev.gold, silver: ev.silver, bronze: ev.bronze },
            splits: { ...this.splits },
            collected: this.event.required.filter((id) => this.splits[id] !== undefined),
            missing: this.event.required.filter((id) => this.splits[id] === undefined),
            medal,
            style,
            integrity,
            rocket,
            stars,
            grade: GRADES[stars - 1],
            trickScore: trickTotal,
            trickCount: this.trickTelemetry?.count ?? 0,
            bestTrick: this.trickTelemetry?.best ?? null,
            crashes,
            detail: {
                airTime: +this._airTime.toFixed(2),
                airShare: +(this._airTime / span).toFixed(3),
                carve: +carve.toFixed(3),
                pace: +pace.toFixed(3),
                pipeTime: +this._pipeTime.toFixed(2),
                routeRisk: +risk.toFixed(3),
                landings: this._landings,
                hardLandings: this._hardLandings,
                worstLanding: +this._worstLanding.toFixed(2),
                distance: +this._distance.toFixed(1),
            },
            // Named so the results screen can say what it did not measure
            // rather than print a zero and let it read as a bad score. The
            // trick system exists now, so tricks are a number, not an excuse.
            notMeasured: this.rocketTelemetry ? [] : ["rocket efficiency"],
        };
    }

    /** Mean authored risk of the zones this run's route actually used. */
    _routeRisk() {
        if (!this.placements.length) return 0;
        let sum = 0;
        for (const p of this.placements) {
            sum += this.course.zones[p.ingredient]?.risk ?? 0;
        }
        return sum / this.placements.length;
    }

    /** Inside a pipe's true span — the scored window, not the feathered bowl. */
    _inPipe(z) {
        for (const p of this.course.terrain.pipes) {
            if (z >= p.from && z <= p.to) return true;
        }
        return false;
    }

    // --------------------------------------------------------------- internals

    _resetRun() {
        this.time = 0;
        this.countdown = 0;
        this.splits = {};
        this.result = null;
        this.blockedReason = null;
        this._airTime = 0;
        this._carveIntegral = 0;
        this._speedIntegral = 0;
        this._landings = 0;
        this._hardLandings = 0;
        this._worstLanding = 0;
        this._pipeTime = 0;
        this._distance = 0;
        this._ghost = [];
        this._ghostAcc = 0;
    }

    /**
     * Put the rider on the start gate.
     *
     * Height comes from the terrain rather than from a stored number: the
     * heightfield is baked from settings the overlay can change, so a hardcoded
     * start Y would bury or float the rider the moment anyone moved
     * `macroHeightScale`.
     */
    _placeAtGate() {
        const c = this.controller;
        c.position.set(0, 0, this.event.startZ);
        c.position.y = this.terrain.heightAt(0, this.event.startZ);
        c.velocity.setAll(0);
        c.verticalVelocity = 0;
        c.facing = 0;
        c.grounded = true;
        c.airborne = false;
        c.airTime = 0;
    }

    _setState(next) {
        if (this.state === next) return;
        const prev = this.state;
        this.state = next;
        if (this.onStateChange) this.onStateChange(next, prev);
    }
}

const GRADES = [
    "Frozen Failure",
    "Sloppy Stack",
    "Lodge Special",
    "Summit Stack",
    "Five-Star Powder Burger",
];
