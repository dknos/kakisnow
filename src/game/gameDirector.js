/**
 * The game layer's one entry point.
 *
 * Owns the modes, holds the run, the ingredient field, the book and the
 * interface together, and is the only thing `main.js` has to call. Everything
 * below it is a plain object with no knowledge of the renderer; everything
 * above it is the renderer with no knowledge of burgers.
 *
 * ------------------------------------------------------------------- the modes
 *
 *   BURGER RUN        the game: order, countdown, four pickups, grill, results
 *   FREE RIDE LAB     the original open mountain, unchanged and unscored
 *   ROCKET BOARD TEST reserved for the second vehicle; selecting it says so
 *
 * Free Ride Lab is not a stripped Burger Run. It is this project as it was
 * before the game layer existed — the ingredient field is cleared, the run
 * clock never starts, and nothing in `update` below does anything at all. That
 * is deliberate: the snow study is the reason the game looks like this, and it
 * has to stay reachable in the state it was in.
 *
 * ------------------------------------------------------------- input ownership
 *
 * The controller reads the shared `input` struct, which `pollInput()` rewrites
 * from held keys every frame. So a countdown or a cinematic cannot hold the
 * rider by setting a flag somewhere — it has to zero that struct, after the
 * poll and before the controller reads it. `update` is called in exactly that
 * gap, which is the whole reason it sits where it does in the frame.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scalar } from "@babylonjs/core/Maths/math.scalar.js";

import { input } from "../core/input.js";
import { set as setSetting } from "../core/settings.js";
import { ShadedAsset } from "../render/shadedAsset.js";
import { IngredientField } from "./ingredientField.js";
import { BurgerRun, RunState, SUMMIT_STACK } from "./burgerRun.js";
import { BurgerBook } from "./burgerBook.js";
import { BurgerBaseCamp } from "./baseCamp.js";
import { MountainDressing } from "./environment.js";
import { INGREDIENT_IDS, INGREDIENTS, BURGER_MODEL } from "./ingredients.js";
import { ZONES, BASE_CAMP_Z } from "./ingredientPlacement.js";
import { SnowBurgersUi, formatTime } from "../ui/snowBurgersUi.js";
import { FUEL_PER_INGREDIENT } from "../vehicles/rocketThrust.js";
import { audio } from "../audio/audio.js";
import { GhostPlayback, formatDelta } from "./ghost.js";

export const Mode = {
    TITLE: "title",
    BURGER_RUN: "burger-run",
    FREE_RIDE: "free-ride",
    ROCKET_TEST: "rocket-test",
};

/** Seconds the burger assembly plays before the results screen. */
const ASSEMBLY_TIME = 3.4;
/** Its shortened form, once the player has seen it. */
const ASSEMBLY_TIME_SEEN = 1.5;

const _burgerPos = new Vector3();

export class GameDirector {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("../render/sky.js").Sky} deps.sky
     * @param {import("../render/shadows.js").ShadowSystem} deps.shadows
     * @param {import("../render/depthPass.js").DepthPass} deps.depthPass
     * @param {import("../terrain/terrain.js").Terrain} deps.terrain
     * @param {import("../character/controller.js").CharacterController} deps.controller
     * @param {import("../core/camera.js").CameraRig} deps.rig
     * @param {import("../vfx/particles.js").SprayField} deps.spray
     */
    constructor(deps) {
        this.deps = deps;
        this.terrain = deps.terrain;
        this.controller = deps.controller;
        this.rig = deps.rig;
        /** The thrusting vehicle, if one is fitted. May be absent. */
        this.rocketChair = deps.rocketChair ?? null;

        this.book = new BurgerBook();
        this.field = new IngredientField({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
            controller: deps.controller,
            spray: deps.spray,
        });
        this.run = new BurgerRun({
            controller: deps.controller,
            field: this.field,
            book: this.book,
            terrain: deps.terrain,
        });

        /** Conifers, rocks and ice off the racing line. */
        this.dressing = new MountainDressing({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
            terrain: deps.terrain,
        });

        /** The best run for this seed, replayed alongside. */
        this.ghost = new GhostPlayback({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
        });

        /** The finish: arch, grill, order board and lodge. */
        this.camp = new BurgerBaseCamp({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
            terrain: deps.terrain,
        });

        /** The reward model, loaded once and reused for every completion. */
        this.burger = new ShadedAsset({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
            name: "burgerComplete",
        });

        this.mode = Mode.TITLE;
        this._assembly = 0;
        this._assemblyTotal = ASSEMBLY_TIME;
        this._alertShown = null;
        /** Rig state on entering the assembly, restored when it ends. */
        this._camEntry = new Vector3();

        audio.init();
        this._lastCount = -1;

        this.ui = new SnowBurgersUi({
            onSelectMode: (m) => { audio.ui("confirm"); this.selectMode(m); },
            onDropIn: () => { audio.ui("confirm"); this.run.dropIn(); },
            onRetry: () => { audio.ui("confirm"); this.run.retry(); },
            onNextOrder: () => { audio.ui("confirm"); this.startBurgerRun(); },
            onMenu: () => { audio.ui(); this.selectMode(Mode.TITLE); },
        });

        this.field.onCollect = (id) => {
            this.run.noteCollected(id);
            this.ui.markCollected(id);
            audio.pickup(id);
            // The order and the engine are the same decision: the detour that
            // costs time also buys back the boost that wins it.
            this.rocketChair?.thrust.refill(FUEL_PER_INGREDIENT);
        };
        this.run.onStateChange = (next, prev) => this._onRunState(next, prev);
    }

    /** Load every model the game layer places. Behind the loading screen. */
    async load() {
        // The camp is grounded on terrain heights, so it cannot be raised until
        // the bake has been read back — which it has by the time this runs.
        this.camp.build();
        await this.dressing.load();
        this.dressing.build();
        const loaded = await this.field.load(INGREDIENT_IDS);
        const burgerOk = await this.burger.load(BURGER_MODEL);
        if (!burgerOk) {
            console.warn("[snow-burgers] the reward burger failed to load");
        }
        return { ingredients: loaded, burger: burgerOk };
    }

    /**
     * Compile every game pipeline before the loading screen lifts.
     *
     * This is the whole of the brief's no-first-pickup-hitch requirement. A
     * WebGPU render pipeline is built the first time a material is bound with a
     * mesh that is actually drawn, and without this the first time that happens
     * is the frame a pickup enters view at nineteen metres a second.
     */
    async warmUp() {
        await this.dressing.warmUp();
        await this.ghost.warmUp();
        await this.camp.warmUp();
        await this.field.warmUp();
        this.burger.setActive(true);
        await this.burger.warmUp();
        this.burger.setActive(false);
    }

    /** The materials the spell system should light. */
    get lightConsumers() {
        const out = [];
        for (const asset of this.field.assets.values()) {
            out.push(...asset.beautyMaterials);
        }
        for (const site of this.field.sites.values()) {
            out.push(...site.beautyMaterials);
        }
        out.push(...this.burger.beautyMaterials);
        out.push(...this.camp.beautyMaterials);
        out.push(...this.ghost.beautyMaterials);
        out.push(...this.dressing.beautyMaterials);
        return out;
    }

    // ------------------------------------------------------------------ modes

    selectMode(mode) {
        this.mode = mode;
        this.dressing.setActive(true);
        switch (mode) {
            case Mode.BURGER_RUN:
                this.startBurgerRun();
                break;
            case Mode.FREE_RIDE:
                this.run.stop();
                this.camp.setActive(false);
                this.burger.setActive(false);
                this.ghost.clear();
                this.ui.hideAll();
                this._setCourseHudVisible(true);
                break;
            case Mode.ROCKET_TEST:
                this._startRocketTest();
                break;
            case Mode.TITLE:
            default:
                this.mode = Mode.TITLE;
                this.run.stop();
                this.camp.setActive(false);
                this.burger.setActive(false);
                this.ghost.clear();
                this.ui.showTitle();
                this._setCourseHudVisible(false);
                break;
        }
    }

    /**
     * Rocket Board Test: the Summit Line, the rocket chair, and no consequences.
     *
     * Deliberately not a Burger Run with the ingredients turned off. There is
     * no clock, no order and nothing recorded, the tank never empties, and the
     * run never ends — the point is to be able to hold the throttle down over
     * the same terrain for as long as it takes to decide whether the vehicle is
     * any good, which is a thing a scored run actively prevents.
     */
    _startRocketTest() {
        this.mode = Mode.ROCKET_TEST;
        this.run.stop();
        this.burger.setActive(false);
        this.ui.hideAll();
        this._setCourseHudVisible(true);
        if (!this.rocketChair?.available) {
            this.ui.setHud(true);
            this.ui.setAlert({
                main: "Rocket Board Test unavailable",
                sub: "the rocket chair model did not load",
            });
            return;
        }
        this.camp.setActive(true);
        setSetting("vehicle", "rocket-chair");
        this.rocketChair.thrust.reset();
        this.rocketChair.thrust.infinite = true;
        const c = this.controller;
        c.position.set(0, 0, 0);
        c.position.y = this.terrain.heightAt(0, 0);
        c.velocity.setAll(0);
        c.verticalVelocity = 0;
        c.facing = 0;
        this.ui.setHud(true);
        this.ui.setFuel(1, true);
        this.ui.setAlert({
            main: "Rocket Board Test",
            sub: "hold left shift or the right trigger · infinite fuel · F1 for settings",
        });
    }

    startBurgerRun() {
        this.mode = Mode.BURGER_RUN;
        this.burger.setActive(false);
        this.camp.setActive(true);
        this._setCourseHudVisible(false);
        // A run starts with a full tank whether or not a thrusting vehicle is
        // fitted, so switching vehicles between attempts never inherits the
        // last one's fuel.
        if (this.rocketChair) {
            this.rocketChair.thrust.reset();
            this.rocketChair.thrust.infinite = false;
        }
        const seed = this.run.begin();
        this.ui.resetCollected();
        this.ui.setOrderSlots(this.run.event.required);
        this.ui.showOrder(
            this.run.event,
            this.run.placements.map((p) => ({
                ...p,
                zoneName: ZONES[p.ingredient]?.name ?? "",
            }))
        );
        return seed;
    }

    // ----------------------------------------------------------------- update

    /**
     * Impose the run's intent on the input the controller is about to read.
     *
     * Called between `pollInput()` and `character.update()`. It has to be
     * there and not anywhere else: `pollInput` rewrites the shared input struct
     * from held keys every frame, so a countdown that held the rider by setting
     * a flag earlier would be overwritten before the controller ever saw it.
     *
     * @param {number} dt
     */
    beforePhysics() {
        if (this.mode === Mode.ROCKET_TEST) {
            // Ride, always. There is nothing to walk to in a vehicle test.
            input.surf = true;
            return;
        }
        if (this.mode !== Mode.BURGER_RUN) return;

        // A held rider is a zeroed input struct, not a skipped controller: the
        // controller still has to run so the terrain keeps grounding it, the
        // camera keeps following, and the frame the countdown ends is not the
        // frame the physics wakes up.
        if (this.run.state === RunState.ASSEMBLY) {
            // Held, but `jumpPressed` survives: it is the skip.
            input.moveX = 0;
            input.moveZ = 0;
            input.moving = false;
            input.surf = false;
        } else if (this.run.state !== RunState.RUN) {
            input.moveX = 0;
            input.moveZ = 0;
            input.moving = false;
            input.surf = false;
            input.jumpPressed = false;
        } else {
            // Surf is the ride. On a timed run the player should not have to
            // hold a mouse button down to be going downhill.
            input.surf = true;
        }
    }

    /**
     * Advance the run against the position the controller just produced.
     *
     * After the physics rather than before it, so the swept pickup test spans
     * this frame's actual movement and the finish is detected on the frame it
     * is crossed rather than the one after.
     *
     * @param {number} dt
     */
    update(dt) {
        if (this.mode === Mode.ROCKET_TEST) {
            if (this.rocketChair) this.ui.setFuel(this.rocketChair.thrust.level, true);
            this._updateEngineAudio();
            return;
        }
        if (this.mode !== Mode.BURGER_RUN) return;

        const state = this.run.state;
        // The run reads telemetry rather than the vehicle, so a run on the
        // classic board scores against a `null` and the results screen says
        // "not fitted" instead of printing a zero.
        this.run.rocketTelemetry =
            this.rocketChair?.active ? this.rocketChair.thrust.telemetry() : null;
        this.run.update(dt);
        this.field.update(dt, this.run.time, state === RunState.RUN);
        this._updateEngineAudio();

        switch (state) {
            case RunState.ORDER:
                this.ui.setCountdown(null);
                break;
            case RunState.COUNTDOWN: {
                this.ui.setCountdown(this.run.countdown);
                // One beep per whole second, and a different one on the drop.
                const n = Math.max(0, Math.ceil(this.run.countdown));
                if (n !== this._lastCount) {
                    this._lastCount = n;
                    audio.countdown(n);
                }
                break;
            }
            case RunState.RUN:
                this.ui.setCountdown(null);
                this.ui.setClock(this.run.time);
                this.ghost.update(this.run.time, this.controller.position.z);
                this.ui.setSubtitle(
                    this.ghost.hasDelta
                        ? formatDelta(this.ghost.delta) + " vs best"
                        : this.run.event.name
                );
                this.ui.setFuel(
                    this.rocketChair?.thrust.level ?? 0,
                    !!this.rocketChair?.active
                );
                this._updateAlert();
                break;
            case RunState.ASSEMBLY:
                // Space skips it, once it has been seen. The check is inside
                // `skipAssembly`, so a first-time player cannot skip the thing
                // they have not watched and a returning one never has to.
                if (input.jumpPressed) this.skipAssembly();
                this._updateAssembly(dt);
                break;
            default:
                break;
        }
    }

    /**
     * Keep the engine's voice on the engine's throttle.
     *
     * Read from the vehicle rather than from the input, so the sound follows
     * the same ramp the thrust does — a rocket that is audibly at full power
     * while the throttle is still spooling up is the sound of a switch, not of
     * an engine.
     */
    _updateEngineAudio() {
        const rc = this.rocketChair;
        if (!rc) return;
        const th = rc.thrust;
        if (th.ignited) audio.ignite();
        if (th.shutdown) audio.shutdown();
        audio.updateRocket(
            rc.active ? th.throttle : 0,
            this.controller.speed01,
            this.controller.grounded
        );
    }

    /** Upload this frame's lighting for anything the game layer drew. */
    sync(cameraPos) {
        if (this.mode !== Mode.BURGER_RUN) {
            this.camp.sync(cameraPos);
            this.dressing.sync(cameraPos);
            return;
        }
        this.field.sync(cameraPos);
        this.camp.sync(cameraPos);
        this.dressing.sync(cameraPos);
        this.ghost.sync(cameraPos);
        this.burger.sync(cameraPos);
    }

    // ------------------------------------------------------------- the finish

    /**
     * Build the burger.
     *
     * The four ingredients are already gone — they flew to the rider when they
     * were collected — so what this stages is the reward arriving, not four
     * meshes being hidden and one popped into existence. It rises out of the
     * snow at the grill, turning, while the rider coasts to a stop.
     *
     * Short by design, and shorter still once seen: the player is expected to
     * retry this run many times, and a cinematic that cannot be got past is the
     * fastest way to make them stop.
     */
    _updateAssembly(dt) {
        const c = this.controller;

        if (this._assembly <= 0) {
            this._assemblyTotal = this.book.book.seenAssembly
                ? ASSEMBLY_TIME_SEEN
                : ASSEMBLY_TIME;
            this._assembly = this._assemblyTotal;

            // Ahead of the rider, on the line they are already travelling.
            //
            // Standing it on the grill's counter was the obvious idea and the
            // wrong one: the rig orbits the rider, so framing something off to
            // the side means swinging the camera around them, and at the finish
            // that swing puts it inside the arch. The committed frame from that
            // attempt is a flat brown rectangle — the inside of the banner.
            //
            // Putting the reward where the camera is already pointed costs
            // nothing and composes better anyway: the burger lands centre
            // frame with the arch, the grill and the lodge behind it.
            // Close enough to the rider that the run's own camera frames it.
            _burgerPos.set(c.position.x, 0, c.position.z + 4.2);
            _burgerPos.y = this.terrain.heightAt(_burgerPos.x, _burgerPos.z) + 0.55;
            this.burger.root.position.copyFrom(_burgerPos);
            this._camEntry.set(this.rig.yaw, this.rig.pitch, this.rig.distanceTarget);
            this.burger.root.scaling.setAll(0.01);
            this.burger.setActive(true);
            this.ui.setHud(false);
            this.ui.setAlert(null);
            audio.sizzle();
        }

        // Coast, do not brake. A rider stopped dead at a finish line reads as a
        // bug; one that runs out is a rider.
        // Firmer than a coast: the run-out has to finish inside the assembly,
        // or the rider drifts on into the camp with the camera behind them.
        const k = Math.max(0, 1 - dt * 3.4);
        c.velocity.x *= k;
        c.velocity.z *= k;

        this._assembly = Math.max(0, this._assembly - dt);
        const t = 1 - this._assembly / this._assemblyTotal;
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        this.burger.root.scaling.setAll(Scalar.Lerp(0.01, 1, ease));
        this.burger.root.position.y = _burgerPos.y + ease * 0.5;
        this.burger.root.rotation.y += dt * 0.8;

        // Settle the yaw down the fall line, and touch nothing else.
        //
        // Two attempts at a dedicated finish camera are committed above this
        // one, and both put the lens inside a prop: the rig orbits the rider,
        // the rider stops at the arch, and the arch is a solid object the
        // camera passes through. Swinging it sideways framed the banner;
        // pulling it in framed the beam.
        //
        // What is left is the camera the player has ridden the whole run with,
        // which cannot collide with anything the run did not already collide
        // with. The reward is brought to it instead. A camera that stages the
        // burger properly wants collision awareness in the rig, and that is a
        // change to the rig rather than to the finish.
        let delta = 0 - this.rig.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        this.rig.yaw += delta * (1 - Math.exp(-dt * 2.4));

        if (this._assembly <= 0) {
            this._assembly = 0;
            this.run.completeAssembly();
        }
    }

    /** Skip the assembly. Bound to any keypress once it has been seen. */
    skipAssembly() {
        if (this.run.state !== RunState.ASSEMBLY) return false;
        if (!this.book.book.seenAssembly) return false;
        this._assembly = 0.0001;
        return true;
    }

    _onRunState(next, prev) {
        // The countdown is the first frame the player is looking at the
        // mountain rather than at a card, so every full-screen panel and its
        // scrim goes here, before the 3 appears rather than when the clock
        // starts.
        if (next === RunState.COUNTDOWN) {
            this.ui.hideScreens();
            // Arm the ghost here rather than when an order is taken, because
            // this is the one place both paths pass through. Taking a new
            // order rolls a fresh seed, and a stored ghost belongs to the seed
            // that produced it — so the run that actually races a ghost is the
            // retry, and a retry never goes through the order screen.
            this.ghost.arm(this.book.event(this.run.event.id).bestGhost, this.run.seed);
        }
        if (next === RunState.RUN) {
            this.ui.setHud(true);
            this.ui.setSubtitle(this.run.event.name);
            this.ui.setClock(0);
        }
        if (next === RunState.ASSEMBLY) {
            this._assembly = 0;
        }
        if (next === RunState.RESULTS) {
            if (this.run.result?.completed) audio.finish();
            // Hand the camera back the way it was found, or the next run starts
            // with the finish sequence's framing still applied.
            this.rig.distanceTarget = this._camEntry.z || this.rig.distanceTarget;
            this.burger.setActive(false);
            this.ghost.clear();
            this.ui.showResults(this.run.result, this.book.event(this.run.event.id));
        }
        if (next === RunState.ORDER || next === RunState.IDLE) {
            this.ui.setHud(false);
            this.ui.setCountdown(null);
        }
        if (prev === RunState.RESULTS && next === RunState.COUNTDOWN) {
            this.ui.resetCollected();
        }
    }

    /**
     * The one line of guidance the HUD gives, and only when it is needed.
     *
     * Two cases, and nothing else: the player has crossed the finish without
     * the full order, or they are past the last pickup's zone with something
     * still outstanding. Both are recoverable and both are invisible without
     * being told, which is the bar for putting text on the screen during a run.
     */
    _updateAlert() {
        const c = this.controller;
        const missing = this.run.blockedReason;

        if (missing && missing.length) {
            const nearest = this.field.nearestOutstanding(c.position);
            const back = nearest ? Math.round(c.position.z - nearest.anchor.z) : 0;
            const key = "blocked:" + missing.join(",");
            if (this._alertShown !== key) {
                this._alertShown = key;
                this.ui.setAlert({
                    main: "Order incomplete — " +
                        missing.map((id) => INGREDIENTS[id].label).join(", "),
                    sub: nearest
                        ? `${ZONES[nearest.id].name} is ${Math.abs(back)} m back up the hill`
                        : "return up the course",
                });
            }
            return;
        }

        const outstanding = this.field.outstanding;
        if (outstanding.length) {
            const nearest = this.field.nearestOutstanding(c.position);
            if (nearest && c.position.z > nearest.anchor.z + 40) {
                const key = "passed:" + nearest.id;
                if (this._alertShown !== key) {
                    this._alertShown = key;
                    this.ui.setAlert({
                        main: INGREDIENTS[nearest.id].label + " is behind you",
                        sub: `${ZONES[nearest.id].name} · ` +
                            `${Math.round(c.position.z - nearest.anchor.z)} m back`,
                    });
                }
                return;
            }
        }

        if (this._alertShown) {
            this._alertShown = null;
            this.ui.setAlert(null);
        }
    }

    /**
     * The Summit Line trail-map HUD belongs to Free Ride Lab.
     *
     * During a run the order chips and the clock are the orientation, and two
     * competing progress readouts on one screen is one too many.
     */
    _setCourseHudVisible(visible) {
        const el = document.getElementById("course-hud");
        if (el) el.style.display = visible ? "" : "none";
    }

    /** The console/tooling handle. */
    get api() {
        return {
            director: this,
            run: this.run,
            field: this.field,
            rocketChair: this.rocketChair,
            book: this.book,
            ui: this.ui,
            Mode,
            RunState,
            event: SUMMIT_STACK,
            selectMode: (m) => this.selectMode(m),
            start: (seed) => {
                this.mode = Mode.BURGER_RUN;
                this._setCourseHudVisible(false);
                this.run.begin(seed ?? null);
                this.ui.resetCollected();
                this.ui.setOrderSlots(this.run.event.required);
                this.run.dropIn();
                return this.run.seed;
            },
            formatTime,
        };
    }
}
