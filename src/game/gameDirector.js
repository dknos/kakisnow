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
import { S, set as setSetting } from "../core/settings.js";
import { ShadedAsset } from "../render/shadedAsset.js";
import { IngredientField } from "./ingredientField.js";
import { BurgerRun, RunState, SUMMIT_STACK } from "./burgerRun.js";
import { BurgerBook } from "./burgerBook.js";
import { BurgerBaseCamp } from "./baseCamp.js";
import { JumpVenue } from "./venue.js";
import { MountainDressing } from "./environment.js";
import { INGREDIENT_IDS, INGREDIENTS, BURGER_MODEL } from "./ingredients.js";
import { activeCourse, COURSES } from "./courses/index.js";
import { getEvent } from "./courses/eventRegistry.js";
import { SnowBurgersUi, formatTime } from "../ui/snowBurgersUi.js";
import { FUEL_PER_INGREDIENT } from "../vehicles/rocketThrust.js";
import { audio } from "../audio/audio.js";
import { GhostPlayback, formatDelta } from "./ghost.js";
import { TrickTracker } from "./trickScore.js";
import { SafeSpots } from "./recovery.js";
import { CollisionWorld } from "./collisionWorld.js";
import { RailField } from "./railField.js";
import { SurfaceStrips } from "./surfaceStrips.js";
import { Snowcats } from "./snowcats.js";
import { Avalanche } from "./avalanche.js";
import { RecipeTapes } from "./secrets.js";
import { tourState, completionStats } from "./progression.js";

import { Mode } from "./modes.js";
import { shouldShowHint } from "../ui/hintVisibility.js";
import { predictLandingAim } from "../core/cameraMath.js";
import {
    BigAirFlightTelemetry,
    isBigAirCourse,
} from "./bigAirFlight.js";
export { Mode };

/** Seconds the burger assembly plays before the results screen. */
const ASSEMBLY_TIME = 3.4;
/** Its shortened form, once the player has seen it. */
const ASSEMBLY_TIME_SEEN = 1.5;

const _burgerPos = new Vector3();

/** The five casts, named for the flair notice. Keys match `SPELL_KEYS`. */
const SPELL_NAMES = {
    1: "sweep", 2: "ribbon", 3: "bloom", 4: "crystallize", 5: "vortex",
};

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
        /** The course being played and the event scoring it. */
        this.course = deps.course ?? activeCourse();
        this.eventDef = deps.event ?? SUMMIT_STACK;
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
            course: this.course,
            event: this.eventDef,
        });

        /** Conifers, rocks and ice off the racing line. */
        this.dressing = new MountainDressing({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
            terrain: deps.terrain,
            course: this.course,
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
            course: this.course,
        });

        /** The jump venue: stands, flags, gantry, judges' tower, lift. */
        this.venue = new JumpVenue({
            scene: deps.scene,
            sky: deps.sky,
            shadows: deps.shadows,
            depthPass: deps.depthPass,
            terrain: deps.terrain,
            course: this.course,
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
        /** The legacy control line is a director decision, not a timer. */
        this._hintMode = Mode.TITLE;
        /** Written by the pause system; read by anything that must not creep. */
        this.paused = false;
        /** What the rider was on before the Rocket Board Test borrowed them. */
        this._vehicleBeforeTest = null;
        this._assembly = 0;
        this._assemblyTotal = ASSEMBLY_TIME;
        this._alertShown = null;
        /** Rig state on entering the assembly, restored when it ends. */
        this._camEntry = new Vector3();
        this._camEntryDistance = this.rig.distance;

        audio.init();
        this._lastCount = -1;

        // ------------------------------------------------------- game feel
        /** Trick accounting. Reset at every gate. */
        this.tracker = new TrickTracker();
        /** Where a rider stands back up. */
        this.safeSpots = new SafeSpots(this.course);
        /** Solid things. Filled from the dressing's records after load. */
        this.collision = new CollisionWorld();
        /**
         * Render-only occluders for the camera. Finish and venue structures
         * should block the spring arm without changing the rider's collision
         * or recovery rules.
         */
        this.cameraCollision = new CollisionWorld();
        /** Grind rails: meshes plus their segment colliders. */
        this.rails = new RailField({
            scene: deps.scene, sky: deps.sky, shadows: deps.shadows,
            depthPass: deps.depthPass, terrain: deps.terrain,
            collision: this.collision,
        });
        /** Ice and packed strips: one source for physics, audio and the eye. */
        this.surfaces = new SurfaceStrips({
            scene: deps.scene, sky: deps.sky, shadows: deps.shadows,
            depthPass: deps.depthPass, terrain: deps.terrain,
        });
        /** The wall, where a course brings one. */
        this.avalanche = new Avalanche(deps.spray);
        this.avalanche.configure(this.course.avalanche ?? null);
        /** Recipe Tapes: the course's three liner notes. */
        this.tapes = new RecipeTapes({
            scene: deps.scene, sky: deps.sky, shadows: deps.shadows,
            depthPass: deps.depthPass, terrain: deps.terrain,
            book: this.book,
        });
        this.tapes.onFound = (count, total) => {
            audio.checkpoint();
            this.ui.showNotice(`recipe tape ${count}/${total}`);
            this._refreshTitleMenu();
        };
        /** The groomers, where a course fields them. */
        this.snowcats = new Snowcats({
            scene: deps.scene, sky: deps.sky, shadows: deps.shadows,
            depthPass: deps.depthPass, terrain: deps.terrain,
            collision: this.collision,
        });
        this._scrapeCool = 0;
        this._wasAirborne = false;
        this._comboSettle = 0;
        this._crashHandled = false;
        this._nearMissPoints = 0;
        /** Which spells this run has already paid flair for, and the pot. */
        this._flairCast = new Set();
        this._flairPoints = 0;
        /** The one obstacle currently being tracked for a near miss. */
        this._nearId = 0;
        this._nearDz = 0;
        this._nearCool = 0;
        /** Controller-authoritative metrics for Big Air's signature flight. */
        this.bigAirFlight = new BigAirFlightTelemetry({
            lipZ: this.course.terrain?.skiJumps?.[0]?.lipZ,
        });
        // Reused scalar aim state for the signature-flight camera. The aim is
        // refreshed a few times per flight, not every frame, so the terrain
        // truth remains cheap even on a dense custom height field.
        this._bigAirAimCool = 0;
        this._bigAirAimValid = false;
        this._bigAirAimX = 0;
        this._bigAirAimY = 0;
        this._bigAirAimZ = 0;
        this._bigAirAimInput = {
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
            groundAt: (x, z) => this.terrain.heightAt(x, z),
        };
        this._bigAirAimOutput = {};

        this.ui = new SnowBurgersUi({
            onSelectMode: (m) => { audio.ui("confirm"); this.selectMode(m); },
            onSelectEvent: (id) => { audio.ui("confirm"); this.startEvent(id); },
            onSelectCourse: (id) => { audio.ui("confirm"); this.travelTo(id); },
            onContinue: () => { audio.ui("confirm"); this.continueLast(); },
            onDropIn: () => { audio.ui("confirm"); this.run.dropIn(); },
            onRetry: () => { audio.ui("confirm"); this.run.retry(); },
            onNextOrder: () => { audio.ui("confirm"); this.startBurgerRun(); },
            onMenu: () => { audio.ui(); this.selectMode(Mode.TITLE); },
            onBook: () => { audio.ui("confirm"); this.openBurgerBook(); },
            onCredits: () => { audio.ui("confirm"); this.openCredits(); },
            onBookEvent: (eventId, courseId) => { audio.ui("confirm"); this.startBookEvent(eventId, courseId); },
            onSaveAction: (action, payload) => { audio.ui("confirm"); this.handleSaveAction(action, payload); },
            onScreenVisibilityChange: () => this.syncHintVisibility(),
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

        this._refreshTitleMenu();
    }

    /**
     * Keep the legacy control hint in lockstep with game mode and screens.
     * Labs may show it during active riding, while title/order/results/pause
     * and settings always own the screen and suppress it.
     */
    syncHintVisibility() {
        const screenVisible = this.ui?.anyScreenVisible?.() ?? true;
        this.deps.setHintVisible?.(shouldShowHint(this._hintMode, screenVisible));
    }

    /**
     * The title is the booted course's menu: Continue where the player left
     * off, this course's events, the labs, and the other mountains with
     * their tour locks. Rebuilt whenever the records move, because the
     * records are what unlock things.
     */
    _refreshTitleMenu() {
        const tour = tourState(this.book.book);
        const last = this.book.book.lastSelected;
        const continueEntry =
            last && COURSES[last.courseId] && this._eventExists(last.eventId)
                ? {
                    courseId: last.courseId,
                    eventId: last.eventId,
                    name: getEvent(last.eventId).name,
                    courseTitle: COURSES[last.courseId].title,
                }
                : null;
        this.ui.setTitleMenu({
            course: this.course,
            continueEntry,
            completion: completionStats(this.book.book),
            events: this.course.events.map((id) => getEvent(id)),
            otherCourses: Object.values(COURSES)
                .filter((c) => c.id !== this.course.id)
                .map((c) => ({
                    id: c.id,
                    title: c.title,
                    subtitle: c.subtitle,
                    locked: !tour[c.id]?.unlocked,
                    reason: tour[c.id]?.reason ?? "",
                })),
        });
    }

    _eventExists(id) {
        try { return !!getEvent(id); } catch { return false; }
    }

    /** Open the persistent book as a player-facing desk, not a debug panel. */
    openBurgerBook() {
        if (this.mode !== Mode.TITLE) this.selectMode(Mode.TITLE);
        this.ui.showBurgerBook(this.book.book, this.course.id);
        audio.setMusicState("menu", { immediate: true });
    }

    openCredits() {
        if (this.mode !== Mode.TITLE) this.selectMode(Mode.TITLE);
        this.ui.showCredits();
        audio.setMusicState("credits", { immediate: true });
    }

    startBookEvent(eventId, courseId) {
        const event = getEvent(eventId);
        if (!event || event.courseId !== courseId) return;
        if (!tourState(this.book.book)[courseId]?.unlocked) return;
        if (event.courseId === this.course.id) {
            this.startEvent(eventId);
            return;
        }
        this.book.setLastSelected(courseId, eventId);
        const url = new URL(location.href);
        url.searchParams.set("course", courseId);
        url.searchParams.set("event", eventId);
        url.searchParams.set("mode", "burger-run");
        location.assign(url.toString());
    }

    handleSaveAction(action, payload = null) {
        if (action === "export") {
            const blob = new Blob([this.book.exportSave()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "snow-burgers-save.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            this.ui.showNotice("save exported");
            return;
        }
        if (action === "clear-ghosts") {
            this.ui.showSaveConfirm("clear-ghosts");
            return;
        }
        if (action === "reset") {
            this.ui.showSaveConfirm("reset");
            return;
        }
        if (action === "confirm") {
            if (payload === "clear-ghosts") {
                this.book.clearGhosts();
                this.ui.showBurgerBook(this.book.book, this.course.id);
            } else if (payload === "reset") {
                this.book.reset();
                this._refreshTitleMenu();
                this.selectMode(Mode.TITLE);
            }
            return;
        }
        if (action === "import") {
            const outcome = this.book.importSave(payload ?? "");
            if (!outcome.ok) {
                this.ui.showBookMessage(outcome.error);
                return;
            }
            this._refreshTitleMenu();
            this.ui.showBurgerBook(this.book.book, this.course.id);
            return;
        }
    }

    /** Continue: same course starts it; another course travels with intent. */
    continueLast() {
        const last = this.book.book.lastSelected;
        if (!last) return;
        if (last.courseId === this.course.id) {
            this.startEvent(last.eventId);
            return;
        }
        const url = new URL(location.href);
        url.searchParams.set("course", last.courseId);
        url.searchParams.set("event", last.eventId);
        url.searchParams.set("mode", "burger-run");
        location.assign(url.toString());
    }

    /**
     * Travel to another course.
     *
     * A parameterized reboot through the exact pipeline that booted this one:
     * the loading screen is the authored loader, every course-scoped resource
     * is torn down by the page itself, and stale colliders, listeners and
     * render targets are impossible by construction. The in-session re-bake
     * exists (`heightfield.bake(course)`, `deform.clear()`) but is not
     * player-facing until it can beat this on both safety and feel.
     */
    travelTo(courseId) {
        if (!COURSES[courseId]) return;
        this.book.setLastSelected(courseId, COURSES[courseId].events[0]);
        const url = new URL(location.href);
        url.searchParams.set("course", courseId);
        url.searchParams.delete("event");
        url.searchParams.delete("mode");
        location.assign(url.toString());
    }

    /** Load every model the game layer places. Behind the loading screen. */
    async load() {
        // The camp is grounded on terrain heights, so it cannot be raised until
        // the bake has been read back — which it has by the time this runs.
        this.camp.build();
        await this.camp.load();
        await this.dressing.load();
        this.dressing.build();
        // Grounds on the same readback the camp does, and marches the stand
        // rows up the bowl wall by sampling it.
        await this.venue.load();
        this.venue.build();
        this.cameraCollision.clear();
        this.camp.buildCameraCollision(this.cameraCollision);
        this.venue.buildCameraCollision(this.cameraCollision);
        const loaded = await this.field.load(INGREDIENT_IDS);
        const burgerOk = await this.burger.load(BURGER_MODEL);
        if (!burgerOk) {
            console.warn("[snow-burgers] the reward burger failed to load");
        }
        this._buildCollision();
        // After the collision world exists: the rails register segments into
        // it, and like the camp they ground on the finished terrain readback.
        this.rails.build(this.course);
        this.surfaces.build(this.course);
        this.snowcats.build(this.course);
        // Gameplay colliders cover trees, rocks, rails and moving snowcats;
        // the separate world covers finish/venue structures without making any
        // of those render-only props player-solid.
        this.rig.obstacleWorld = this.collision;
        this.rig.cameraWorld = this.cameraCollision;
        this.tapes.build(this.course);
        return { ingredients: loaded, burger: burgerOk };
    }

    /**
     * Stand the collision world up from the dressing's records.
     *
     * The dressing merges its props into a handful of draw calls, so the
     * per-prop positions survive only as the record array it now keeps. The
     * colliders are primitives on purpose — a capsule the trunk's width
     * collides better than the tree's own triangles would, and for a tenth
     * of the cost.
     */
    _buildCollision() {
        this.collision.clear();
        for (const p of this.dressing.propRecords ?? []) {
            if (p.soft) {
                this.collision.addSphere({
                    x: p.x, y: p.y + p.height * 0.4, z: p.z,
                    r: p.radius, kind: p.family, data: { soft: true },
                });
            } else if (p.family === "rock") {
                this.collision.addSphere({
                    x: p.x, y: p.y + p.height * 0.35, z: p.z,
                    r: p.radius, kind: "rock", data: null,
                });
            } else {
                this.collision.addCapsule({
                    ax: p.x, ay: p.y, az: p.z,
                    bx: p.x, by: p.y + p.height, bz: p.z,
                    r: p.radius,
                    kind: p.family === "ice" ? "ice" : "tree",
                    data: null,
                });
            }
        }
        this.controller.world = this.collision;
        this.safeSpots.world = this.collision;
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
        await this.rails.warmUp();
        await this.surfaces.warmUp();
        await this.snowcats.warmUp();
        await this.tapes.warmUp();
        await this.venue.warmUp();
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
        out.push(...this.rails.beautyMaterials);
        out.push(...this.surfaces.beautyMaterials);
        out.push(...this.snowcats.beautyMaterials);
        out.push(...this.tapes.beautyMaterials);
        out.push(...this.venue.beautyMaterials);
        return out;
    }

    // ------------------------------------------------------------------ modes

    selectMode(mode) {
        const prev = this.mode;
        this.mode = mode;
        this._hintMode = mode;
        this.rig.setAirborneContext(null);
        this.syncHintVisibility();
        // Leaving the Rocket Board Test hands back what it borrowed. Without
        // this the test leaked `vehicle=rocket-chair` and an infinite tank
        // into whatever mode came next.
        if (prev === Mode.ROCKET_TEST && mode !== Mode.ROCKET_TEST) {
            if (this.rocketChair) {
                this.rocketChair.thrust.infinite = false;
                this.rocketChair.thrust.reset();
            }
            setSetting("vehicle", this._vehicleBeforeTest ?? "classic-snowboard");
            this._vehicleBeforeTest = null;
        }
        // The engine's voice is only driven inside a run; leaving one mid-
        // throttle used to freeze the rocket bus at its last gain. Same for
        // the board bed and the grind loop. If the new mode drives them, the
        // next frame's update re-opens them.
        audio.updateRocket(0, 0, true);
        audio.avalancheUpdate(0);
        this.avalanche.stop();
        this.ui.setAvalanche(null);
        audio.updateBoard({
            speed01: 0, carve: 0, grounded: true, airborne: false,
            wind01: 0, surfaceHardness: 0,
        });
        audio.grindEnd();
        this.dressing.setActive(true);
        // The venue is scenery, not game state: it stands in every mode the
        // mountain is visible in, including the free-ride lab.
        this.venue.setActive(true);
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
                audio.setMusicState("run", { immediate: true });
                audio.updateMusic(0, 0, 0, 0);
                break;
            case Mode.ROCKET_TEST:
                this._startRocketTest();
                audio.setMusicState("run", { immediate: true });
                audio.updateMusic(0, 0, 0, 0);
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
                audio.setMusicState("menu", { immediate: true });
                audio.updateMusic(0, 0, 0, 0);
                break;
        }
        this.syncHintVisibility();
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
        if (this._vehicleBeforeTest === null) {
            this._vehicleBeforeTest = S.vehicle;
        }
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

    /**
     * Switch to another of this course's events and take its order.
     * The registry validated the reference at load; an id from a stale menu
     * still gets a loud throw rather than a silent wrong ruleset.
     */
    startEvent(eventId) {
        const ev = getEvent(eventId);
        if (ev.courseId !== this.course.id) {
            console.warn(`[snow-burgers] event ${eventId} is not on ${this.course.id}`);
            return;
        }
        this.eventDef = ev;
        this.run.event = ev;
        this.book.setLastSelected(this.course.id, ev.id);
        this.selectMode(Mode.BURGER_RUN);
    }

    startBurgerRun() {
        this.mode = Mode.BURGER_RUN;
        this.burger.setActive(false);
        this.camp.setActive(true);
        this._setCourseHudVisible(false);
        // The event's vehicle rules apply at the order, not mid-run: a forced
        // vehicle is fitted here, and a vehicle the event does not allow is
        // swapped for the first one it does.
        const ev = this.run.event;
        if (ev.forcedVehicle) {
            setSetting("vehicle", ev.forcedVehicle);
        } else if (ev.allowedVehicles?.length &&
                   !ev.allowedVehicles.includes(S.vehicle)) {
            setSetting("vehicle", ev.allowedVehicles[0]);
        }
        // A run starts with a full tank whether or not a thrusting vehicle is
        // fitted, so switching vehicles between attempts never inherits the
        // last one's fuel.
        if (this.rocketChair) {
            this.rocketChair.thrust.reset();
            this.rocketChair.thrust.infinite = false;
        }
        // A fixed-seed event rides the same mountain forever — that is the
        // whole point of it; everything else rolls fresh.
        const seed = this.run.begin(
            ev.seedPolicy === "fixed" ? ev.fixedSeed : null
        );
        this.ui.resetCollected();
        this.ui.setOrderSlots(this.run.event.required);
        this.ui.showOrder(
            this.run.event,
            this.run.placements.map((p) => ({
                ...p,
                zoneName: this.course.zones[p.ingredient]?.name ?? "",
            }))
        );
        return seed;
    }

    /**
     * The pause menu's restart: same event, same seed, back to the start.
     *
     * Per mode, because "restart" means different things: a Burger Run goes
     * back to its gate on the same route, the Rocket Board Test re-seats the
     * rider at the summit with a fresh infinite tank, and Free Ride simply
     * returns to the top of the mountain.
     */
    restartCurrent() {
        switch (this.mode) {
            case Mode.BURGER_RUN:
                // The reward may be mid-rise if the pause came during the
                // assembly; a restart must not leave a giant burger standing.
                this.burger.setActive(false);
                this.ui.resetCollected();
                this.run.restart();
                break;
            case Mode.ROCKET_TEST:
                this._startRocketTest();
                break;
            case Mode.FREE_RIDE: {
                const c = this.controller;
                c.position.set(0, 0, 0);
                c.position.y = this.terrain.heightAt(0, 0);
                c.velocity.setAll(0);
                c.verticalVelocity = 0;
                c.facing = 0;
                break;
            }
            default:
                break;
        }
    }

    /** The pause menu's quit. A quit discards the run — nothing is recorded. */
    quitToTitle() {
        this.selectMode(Mode.TITLE);
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

        // The five spells ride WITH the run. An earlier revision gated them
        // off scored courses as "course editing" — wrongly: spells write
        // deformation marks and transient meshes, never the heightfield the
        // physics grounds on, so a cast cannot move a route or a time. What
        // it can do is look incredible at nineteen metres a second, which is
        // the whole reason this hero bends water. Casting even pays a little
        // flair (see _updateFeel) — once per spell per run, so the reward is
        // spectacle, not a macro. Only the held states below still silence
        // them, the same way they silence everything else.

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
            input.spellPressed = 0;
            input.spellHeld2 = false;
        } else if (this.run.state !== RunState.RUN) {
            input.moveX = 0;
            input.moveZ = 0;
            input.moving = false;
            input.surf = false;
            input.jumpPressed = false;
            input.spellPressed = 0;
            input.spellHeld2 = false;
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
        // Surface truth applies in every mode — visual ice that behaved like
        // powder in the lab would make the lab a liar.
        const c = this.controller;
        c.surfaceHardness = this.surfaces.hardnessAt(c.position.x, c.position.z);
        // The groomers work the scored modes and park for the lab — the snow
        // study never asked for company. Their diesel is proximity-driven,
        // audible well before the machine is in the line.
        const catProx = this.snowcats.update(
            this.mode === Mode.FREE_RIDE ? 0 : dt, c.position
        );
        if (this.mode !== Mode.FREE_RIDE) audio.snowcatUpdate(catProx);
        // Tapes collect everywhere the board rides — the labs included; a
        // secret that only counts during a scored run is homework.
        this.tapes.update(c.position);

        if (this.mode === Mode.FREE_RIDE) {
            // Only what safety demands: a crashed rider must stand back up in
            // the lab too, or a tree is a softlock. Everything else — toasts,
            // combos, board audio — stays out; Free Ride Lab is the original
            // snow study and keeps sounding like it.
            this._updateRecovery(false);
            this._updateRideMusic(c.speed01, 0, 0, 0);
            return;
        }
        if (this.mode === Mode.ROCKET_TEST) {
            this._updateFeel(dt);
            if (this.rocketChair) this.ui.setFuel(this.rocketChair.thrust.level, true);
            this._updateEngineAudio();
            this._updateRideMusic(c.speed01, 0, 0, 0);
            return;
        }
        if (this.mode !== Mode.BURGER_RUN) return;

        this._updateFeel(dt);
        this._updateBigAirCamera(dt);
        const state = this.run.state;
        // The run reads telemetry rather than the vehicle, so a run on the
        // classic board scores against a `null` and the results screen says
        // "not fitted" instead of printing a zero. Tricks report the same
        // way — banked total plus the near-miss bonus, best, count.
        this.run.rocketTelemetry =
            this.rocketChair?.active ? this.rocketChair.thrust.telemetry() : null;
        this.run.trickTelemetry = {
            total: this.tracker.total + this._nearMissPoints + this._flairPoints,
            best: this.tracker.best,
            count: this.tracker.trickCount,
        };
        this.run.update(dt);
        this.field.update(dt, this.run.time, state === RunState.RUN);
        this._updateEngineAudio();
        let avalancheMusic = 0;

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
            case RunState.RUN: {
                const ava = this.avalanche.update(
                    dt, this.controller.position, this.terrain
                );
                if (ava) {
                    this.ui.setAvalanche(ava.distance);
                    avalancheMusic = Math.max(0, 1 - ava.distance / 70);
                    audio.avalancheUpdate(avalancheMusic);
                    if (ava.caught && !this.controller.crashed) {
                        // Caught: exactly one crash, and the wall grants the
                        // relief window the reset gives it.
                        this.controller.forceCrash();
                        this.avalanche.wallZ -= 60;
                    }
                }
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
            }
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

        if (state === RunState.RUN && this.run.state === RunState.RUN) {
            // Read tracker scalars directly so this bridge does not call the
            // allocating `open` getter in the frame loop.
            const trickMusic = this.tracker._comboCount > 0
                ? Math.min(1, this.tracker._comboScore / 600) : 0;
            const bigAirMusic = isBigAirCourse(this.course)
                ? (this.bigAirFlight.inFlight ? 1
                    : this.bigAirFlight.hold > 0 ? 0.55 : 0)
                : 0;
            this._updateRideMusic(
                c.speed01, trickMusic, avalancheMusic, bigAirMusic
            );
        }
    }

    /**
     * The moment-to-moment feel: tricks, grades, combos, crashes, near
     * misses, and the board's voice. Runs in the ridden modes — Burger Run
     * and the Rocket Board Test — every frame, paused frames included
     * (dt is zero then and every term is dt- or event-driven).
     */
    _updateFeel(dt) {
        const c = this.controller;

        this.bigAirFlight.tick(dt);

        // ------------------------------------------------------- air + land
        if (c.airborne && !this._wasAirborne) {
            this.tracker.beginAir({ onKicker: this._nearKicker(c.position.z) });
            if (isBigAirCourse(this.course) && this.bigAirFlight.shouldBegin(c)) {
                this.bigAirFlight.begin(c, this.run.vehicleId ?? S.vehicle);
            }
            audio.jump(Math.min(1, Math.max(0, c.verticalVelocity) / 8));
        }
        if (c.airborne) {
            this.bigAirFlight.observe(c, dt);
            // The tracker's pitch convention is negative-nose-down; the
            // controller's flip is positive-nose-down (Babylon's +X). One
            // negation, here, at the single point the two meet.
            this.tracker.addRotation(c.trickDSpin, -c.trickDFlip, dt);
            this.tracker.setGrab(c.grabDir);
        }
        if (c.landed) {
            const grade = c.landingGrade ?? "clean";
            const res = this.tracker.land(grade);
            const flight = isBigAirCourse(this.course)
                ? this.bigAirFlight.finish(c, res)
                : null;
            if (flight) this.run.flightTelemetry = flight;
            this.ui.flashGrade(grade);
            audio.land(grade, Math.min(1, c.landingImpact / 1.5));
            // A perfect landing stamps the snow: one compact ring of powder
            // out of the shared pool, gone in half a second.
            if (grade === "perfect" && this.deps.spray) {
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2;
                    this.deps.spray.emit(
                        c.position.x + Math.cos(a) * 0.5,
                        c.position.y + 0.12,
                        c.position.z + Math.sin(a) * 0.5,
                        Math.cos(a) * 5.2, 1.4, Math.sin(a) * 5.2,
                        0.26, 0.5, 0, 5.2
                    );
                }
            }
            if (res && res.score > 0) {
                this.ui.showTrick(res);
                audio.trickBank(Math.min(1, res.score / 400));
            } else if (res) {
                this.ui.showTrick(res); // a crashed trick still gets named
            }
            // Only a SCORED landing restarts the settle clock. The course is
            // corduroy over dunes — plain micro-airs land constantly, and a
            // combo that re-armed on every one of them would never bank.
            if (res) this._comboSettle = 1.2;
        }
        if (this._comboSettle > 0 && c.grounded && !c.crashed) {
            this._comboSettle -= dt;
            if (this._comboSettle <= 0 && this.tracker.open) this.tracker.bank();
        }
        this.ui.setCombo(this.tracker.open);
        this._wasAirborne = c.airborne;

        // ------------------------------------------------------------ rails
        if (c.grindStarted) {
            audio.grindStart();
            // Whatever rotation was in the air banks as a landing on steel.
            const res = this.tracker.land("clean");
            if (res && res.score > 0) this.ui.showTrick(res);
        }
        if (c.grinding) {
            this.tracker.addRailTime(dt);
            audio.grindUpdate(Math.min(1, c.speed01 + 0.25));
        }
        if (c.grindEnded) {
            audio.grindEnd();
            const res = this.tracker.endRail(c.grindEnded.clean);
            if (res && res.score > 0) {
                this.ui.showTrick(res);
                audio.trickBank(Math.min(1, res.score / 400));
                this._comboSettle = 1.2;
            }
        }

        // ---------------------------------------------------------- scrapes
        this._scrapeCool = Math.max(0, this._scrapeCool - dt);
        if ((c.scraped || c.brushedSoft) && this._scrapeCool <= 0) {
            this._scrapeCool = 0.16;
            audio.scrape(c.scraped ? 0.65 : 0.25);
        }

        // ------------------------------------------------------------ crash
        if (c.crashed && !this._crashHandled) {
            this._crashHandled = true;
            audio.crash();
            this.tracker.loseCombo("crash");
            this.ui.setCombo(null);
        } else if (!c.crashed) {
            this._crashHandled = false;
        }

        this._updateRecovery(true);
        this.safeSpots.update(dt, c);

        // ------------------------------------------------------ near misses
        this._nearCool = Math.max(0, this._nearCool - dt);
        if (c.speed > 10 && !c.crashed && this._nearCool <= 0) {
            const near = this.collision.nearest(
                c.position.x, c.position.y + 0.7, c.position.z, 2.6, null
            );
            if (near && !near.collider.data?.soft &&
                near.collider.kind !== "rail") {
                const dz = (near.collider.z ?? near.collider.az ?? 0) - c.position.z;
                if (near.collider.id === this._nearId) {
                    // Tracked from ahead to behind without a scrape: that is
                    // a near miss, once, and worth a little style.
                    if (this._nearDz > 0.4 && dz < -0.4 &&
                        !c.scraped && !c.brushedSoft) {
                        this._nearMissPoints += 15;
                        audio.nearMiss();
                        this._nearCool = 1.2;
                        this._nearId = 0;
                    } else {
                        this._nearDz = dz;
                    }
                } else {
                    this._nearId = near.collider.id;
                    this._nearDz = dz;
                }
            } else {
                this._nearId = 0;
            }
        }

        // ------------------------------------------------------------ flair
        // Water bending at speed is the hero's whole deal, and a run that
        // casts deserves to hear it counted. Once per distinct spell per
        // run: five keys, five small bonuses, and a macro earns nothing.
        if (this.mode === Mode.BURGER_RUN && this.run.state === RunState.RUN &&
            input.spellPressed && S.showSpells &&
            !this._flairCast.has(input.spellPressed)) {
            this._flairCast.add(input.spellPressed);
            this._flairPoints += 25;
            this.ui.showNotice(
                `flair +25 \u00b7 ${SPELL_NAMES[input.spellPressed] ?? "cast"}`
            );
        }

        // ------------------------------------------------------------ gusts
        // The wind owns parts of some mountains. Grounded only — airborne the
        // rider is already the wind's.
        if (c.grounded && !c.crashed) {
            for (const g of this.course.gusts ?? []) {
                if (c.position.z >= g.zFrom && c.position.z <= g.zTo &&
                    c.position.x >= g.xFrom && c.position.x <= g.xTo) {
                    c.velocity.x += g.push * dt;
                }
            }
        }

        // ---------------------------------------------------------- tutoring
        this._updateTutor();

        // -------------------------------------------------------- the voice
        audio.updateBoard({
            speed01: c.speed01,
            carve: c.carve,
            grounded: c.grounded,
            airborne: c.airborne,
            wind01: Math.min(1, c.speed01 * (c.airborne ? 1.0 : 0.7)),
            surfaceHardness: c.surfaceHardness,
        });
    }

    /**
     * Give the camera a bounded down-course context only for Big Air's
     * authored flight (plus its brief landing read). The rider's input still
     * owns `rig.yaw`; CameraRig applies this as a reversible additive offset.
     */
    _updateBigAirCamera(dt) {
        if (!isBigAirCourse(this.course) || this.run.state !== RunState.RUN) {
            this.rig.setAirborneContext(null);
            this.ui.setBigAirFlight?.(null);
            this._bigAirAimValid = false;
            return;
        }
        const c = this.controller;
        const speed = Math.hypot(c.velocity.x, c.velocity.z);
        const heading = speed > 0.1
            ? Math.atan2(c.velocity.x, c.velocity.z)
            : c.facing;
        const active = this.bigAirFlight.framingActive;
        if (active) this._refreshBigAirLandingAim(c, heading, dt);
        const aimDx = this._bigAirAimX - c.position.x;
        const aimDz = this._bigAirAimZ - c.position.z;
        const aimDistance = Math.hypot(aimDx, aimDz);
        const aimYaw = this._bigAirAimValid && aimDistance > 1e-3
            ? Math.atan2(aimDx, aimDz) : heading;
        const aimPitch = this._bigAirAimValid && aimDistance > 1e-3
            ? Math.atan2(c.position.y + 1.62 - this._bigAirAimY, aimDistance)
            : NaN;
        this.rig.setAirborneContext({
            active,
            heading,
            aimYaw,
            aimPitch,
        });
        this.ui.setBigAirFlight?.(this.bigAirFlight.snapshot());
    }

    /**
     * Refresh a reusable, controller/terrain-authoritative landing target.
     * During flight this finds the first ballistic crossing of the actual
     * terrain. During the short post-touchdown read it looks down the current
     * line at the next runout surface, which keeps the result visible without
     * taking control away.
     */
    _refreshBigAirLandingAim(c, heading, dt) {
        this._bigAirAimCool = Math.max(0, this._bigAirAimCool - Math.max(0, dt));
        if (this._bigAirAimCool > 0) return;
        this._bigAirAimCool = 0.12;

        if (c.airborne) {
            const aimInput = this._bigAirAimInput;
            aimInput.x = c.position.x;
            aimInput.y = c.position.y;
            aimInput.z = c.position.z;
            aimInput.vx = c.velocity.x;
            aimInput.vy = c.verticalVelocity;
            aimInput.vz = c.velocity.z;
            const aim = predictLandingAim(aimInput, this._bigAirAimOutput);
            if (aim.valid) {
                this._bigAirAimX = aim.x;
                this._bigAirAimY = aim.y;
                this._bigAirAimZ = aim.z;
                this._bigAirAimValid = true;
                return;
            }
        }

        // A touchdown has already supplied the exact contact surface through
        // controller.groundY. Extend the current line a modest distance for a
        // readable landing/runout target; no cinematic turn is added.
        const distance = Math.min(32, Math.max(16, Math.hypot(c.velocity.x, c.velocity.z) * 0.8));
        const dx = Math.sin(heading) * distance;
        const dz = Math.cos(heading) * distance;
        this._bigAirAimX = c.position.x + dx;
        this._bigAirAimZ = c.position.z + dz;
        this._bigAirAimY = this.terrain.heightAt(this._bigAirAimX, this._bigAirAimZ) + 0.55;
        this._bigAirAimValid = Number.isFinite(this._bigAirAimY);
    }

    /**
     * The first-run prompts: one short line at a time, each dismissed
     * forever by the action it asks for. Summit Stack only — the classic is
     * the onboarding; every later event assumes a rider who has served once.
     * Never a wall of text, never a repeat: the book remembers.
     */
    _updateTutor() {
        if (this.mode !== Mode.BURGER_RUN ||
            this.run.event.id !== "summit-stack" ||
            this.run.state !== RunState.RUN) {
            this.ui.setTutor(null);
            return;
        }
        const t = this.book.book.tutorial;
        const c = this.controller;
        if (!t.steer) {
            if (Math.abs(c.carve) > 0.3) this.book.markTutorial("steer");
            else this.ui.setTutor("steer with the mouse \u00b7 a / d to carve");
            return;
        }
        if (!t.jump) {
            if (c.airborne && c.airTime > 0.2) this.book.markTutorial("jump");
            else this.ui.setTutor("space to jump \u00b7 hold it off a lip");
            return;
        }
        if (!t.trick) {
            if (this.tracker.trickCount > 0) this.book.markTutorial("trick");
            else this.ui.setTutor("q / e to spin in the air \u00b7 land square");
            return;
        }
        if (!t.collect) {
            if (Object.keys(this.run.splits).length > 0) {
                this.book.markTutorial("collect");
            } else {
                this.ui.setTutor("ride through the order \u00b7 chips top right");
            }
            return;
        }
        if (!t.finish) {
            if (Object.keys(this.run.splits).length >=
                this.run.event.required.length) {
                this.ui.setTutor("full order \u00b7 the grill is at the bottom");
                // Dismisses with the run itself; the assembly marks it.
            } else {
                this.ui.setTutor(null);
            }
            return;
        }
        this.ui.setTutor(null);
    }

    /**
     * Stand a rider back up, at the price the mode charges.
     *
     * Two doors in: the tumble ran out (`needsRecovery`), or the player asked
     * (R / east button) — the same safe spot answers both, but only the ask
     * is billed the full penalty; the crash already cost its tumble.
     */
    _updateRecovery(scored) {
        const c = this.controller;
        const manual = input.recoverPressed && !c.needsRecovery && !c.crashed &&
            (this.mode !== Mode.BURGER_RUN || this.run.state === RunState.RUN);
        if (!c.needsRecovery && !manual) return;

        const spot = this.safeSpots.recover();
        const y = this.terrain.heightAt(spot.x, spot.z);
        c.finishCrash(spot.x, y, spot.z, spot.facing);
        this.rig.yaw = spot.facing;

        if (manual) this.tracker.loseCombo("recover");
        if (scored && this.mode === Mode.BURGER_RUN &&
            this.run.state === RunState.RUN) {
            const penalty = manual ? 2.0 : 1.0;
            this.run.time += penalty;
            this.ui.showNotice(`+${penalty.toFixed(1)}s · recovered`);
        }
    }

    /** Is this z on one of the course's kickers, lip to landing? */
    _nearKicker(z) {
        for (const j of this.course.terrain.jumps) {
            if (z > j.lip - 6 && z < j.lip + j.drop + 10) return true;
        }
        return false;
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

    /**
     * Feed the held procedural score without constructing a telemetry object.
     * State priority makes a signature moment win over generic speed, while
     * all four scalar lanes are still passed to the audio engine for shaping.
     */
    _updateRideMusic(speed01, trick01, avalanche01, bigAir01) {
        let state = "run";
        if (bigAir01 > 0.05) state = "big-air";
        else if (avalanche01 > 0.08) state = "avalanche";
        else if (trick01 > 0.05) state = "trick";
        else if (speed01 > 0.72) state = "speed";
        audio.setMusicState(state);
        audio.updateMusic(speed01, trick01, avalanche01, bigAir01);
    }

    /** Upload this frame's lighting for anything the game layer drew. */
    sync(cameraPos) {
        if (this.mode !== Mode.BURGER_RUN) {
            this.camp.sync(cameraPos);
            this.dressing.sync(cameraPos);
            this.rails.sync(cameraPos);
            this.surfaces.sync(cameraPos);
            this.snowcats.sync(cameraPos);
            this.tapes.sync(cameraPos);
            this.venue.sync(cameraPos);
            return;
        }
        this.field.sync(cameraPos);
        this.camp.sync(cameraPos);
        this.dressing.sync(cameraPos);
        this.rails.sync(cameraPos);
        this.surfaces.sync(cameraPos);
        this.snowcats.sync(cameraPos);
        this.tapes.sync(cameraPos);
        this.venue.sync(cameraPos);
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

            // Ahead and just off the rider's shoulder, in camera space. The
            // old centre-line placement hid the reward behind the rider and
            // the run-out rise; this offset keeps both the hero and the burger
            // in the same frame without changing the finish trigger.
            //
            // Standing it on the grill's counter was the obvious idea and the
            // wrong one: the rig orbits the rider, so framing something off to
            // the side means swinging the camera around them, and at the finish
            // that swing puts it inside the arch. The committed frame from that
            // attempt is a flat brown rectangle — the inside of the banner.
            //
            // Putting the reward just off the camera's forward line composes
            // better than swinging around the rider: the burger shares the
            // frame with the arch, grill and lodge while the hero remains the
            // visual anchor.
            const side = this.rig.right;
            const view = this.rig.forward;
            _burgerPos.set(
                c.position.x + side.x * 1.9 + view.x * 1.9,
                0,
                c.position.z + side.z * 1.9 + view.z * 1.9
            );
            _burgerPos.y = this.terrain.heightAt(_burgerPos.x, _burgerPos.z) + 0.55;
            this.burger.root.position.copyFrom(_burgerPos);
            this._camEntry.set(this.rig.yaw, this.rig.pitch, this.rig.distanceTarget);
            this._camEntryDistance = this.rig.distance;
            // Stage the reward: the ride camera stays the finish camera (two
            // committed attempts at a dedicated one photographed the inside
            // of the arch), but it can at least lean in — the burger was the
            // report's own "small in frame" limitation.
            this.rig.distanceTarget = 4.8;
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
        // The order should read on the first presentation frame, not spend
        // most of the ceremony as a one-pixel seed. A quadratic ease-out keeps
        // the reveal gentle at the start and reaches a useful silhouette well
        // before the repeatable ceremony ends.
        const ease = 1 - (1 - t) * (1 - t);

        this.burger.root.scaling.setAll(Scalar.Lerp(0.01, 1, ease));
        this.burger.root.position.y = _burgerPos.y + ease * 0.5;
        if (!S.reducedMotion) this.burger.root.rotation.y += dt * 0.8;

        // A small, repeatable presentation lift gives the completed order a
        // readable silhouette while reduced motion retains the player's entry
        // pitch and avoids adding another camera movement.
        if (!S.reducedMotion) {
            this.rig.pitch = Scalar.Lerp(
                this.rig.pitch, 0.24, 1 - Math.exp(-dt * 4.2)
            );
        }

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
        if (next === RunState.ORDER) {
            audio.setMusicState("order", { immediate: true });
            audio.updateMusic(0, 0, 0, 0);
        }
        // The countdown is the first frame the player is looking at the
        // mountain rather than at a card, so every full-screen panel and its
        // scrim goes here, before the 3 appears rather than when the clock
        // starts.
        if (next === RunState.COUNTDOWN) {
            // A retry/restart must not carry a high-speed, trick, avalanche,
            // or Big Air phrase into the new gate. The first order's drop gets
            // the normal crossfade; every later reset is immediate.
            audio.setMusicState("countdown", { immediate: prev !== RunState.ORDER });
            audio.updateMusic(0, 0, 0, 0);
            this.ui.hideScreens();
            this.bigAirFlight.reset();
            this.run.flightTelemetry = null;
            this._bigAirAimCool = 0;
            this._bigAirAimValid = false;
            // Full tank at every gate, however the rider got there — first
            // drop, retry from the results, or a restart out of the pause
            // menu. This is where "a run starts with a full tank" is actually
            // enforced; doing it only when an order is taken let a retry
            // inherit the last attempt's dregs.
            if (this.rocketChair && this.mode === Mode.BURGER_RUN) {
                this.rocketChair.thrust.reset();
            }
            // Every countdown names the vehicle for this attempt — it is part
            // of the ghost's identity, and reading it any later would let an
            // overlay switch mid-run relabel a record.
            this.run.vehicleId = S.vehicle;
            // A fresh gate is a fresh score, fresh breadcrumbs — and the
            // wall back at its starting distance.
            this.avalanche.reset(this.course.startZ);
            this.tracker.reset();
            this._nearMissPoints = 0;
            this._flairCast.clear();
            this._flairPoints = 0;
            this._comboSettle = 0;
            this.safeSpots.clear();
            this.ui.setCombo(null);
            // One beep per whole second, latched — and re-latched per gate, or
            // the second run's countdown plays only the beeps the first one
            // didn't.
            this._lastCount = -1;
            // Arm the ghost here rather than when an order is taken, because
            // this is the one place both paths pass through. Taking a new
            // order rolls a fresh seed, and a stored ghost belongs to the seed
            // that produced it — so the run that actually races a ghost is the
            // retry, and a retry never goes through the order screen.
            // The full identity has to match, not just the seed: a ghost set
            // on the rocket chair is not a line a classic board can race.
            if (S.showGhost === false) this.ghost.clear();
            else this.ghost.arm(this.book.event(this.run.event.id).bestGhost, {
                seed: this.run.seed,
                courseId: this.course.id,
                courseVersion: this.course.version,
                eventId: this.run.event.id,
                eventVersion: this.run.event.version,
                vehicleId: this.run.vehicleId,
            });
        }
        if (next === RunState.RUN) {
            audio.setMusicState("run");
            this.ui.setHud(true);
            this.ui.setSubtitle(this.run.event.name);
            this.ui.setClock(0);
        }
        if (next === RunState.ASSEMBLY) {
            audio.setMusicState("finish");
            audio.updateMusic(0, 0, 0, 0);
            this.book.markTutorial("finish");
            this.ui.setTutor(null);
            // The wall does not follow the rider into the cinematic.
            this.avalanche.stop();
            this.ui.setAvalanche(null);
            audio.avalancheUpdate(0);
            this._assembly = 0;
            // Whatever is still open banks at the line — crossing the finish
            // IS the successful settle.
            this.tracker.bank();
            this.ui.setCombo(null);
        }
        if (next === RunState.RESULTS) {
            audio.setMusicState("results");
            audio.updateMusic(0, 0, 0, 0);
            if (this.run.result?.completed) audio.finish();
            this._refreshTitleMenu();
            // Hand the camera back the way it was found, or the next run starts
            // with the finish sequence's framing still applied.
            this.rig.yaw = this._camEntry.x;
            this.rig.pitch = this._camEntry.y;
            this.rig.distanceTarget = this._camEntry.z || this.rig.distanceTarget;
            this.rig.distance = this._camEntryDistance;
            this.rig.obstacleDistance = this.rig.distance;
            this.burger.setActive(false);
            this.ghost.clear();
            this.ui.showResults(this.run.result, this.book.event(this.run.event.id));
            this._maybeShowCompletion();
        }
        if (next === RunState.ORDER || next === RunState.IDLE) {
            if (next === RunState.IDLE) {
                audio.setMusicState("menu", { immediate: true });
                audio.updateMusic(0, 0, 0, 0);
            }
            this.ui.setHud(false);
            this.ui.setCountdown(null);
        }
        if (prev === RunState.RESULTS && next === RunState.COUNTDOWN) {
            this.ui.resetCollected();
        }
    }

    /**
     * The first completion of the six main deliveries earns the crown. The
     * state itself is derived from records; only the seen bit is persisted so
     * reloads do not replay a long ceremony. A 100% book has a distinct final
     * badge and takes precedence when both milestones land together.
     */
    _maybeShowCompletion() {
        const stats = completionStats(this.book.book);
        const fullNew = stats.hundredPercent && !this.book.book.seenHundredPercent;
        const tourNew = stats.tourComplete && !this.book.book.seenTourComplete;
        if (!fullNew && !tourNew) return;
        if (tourNew) this.book.book.seenTourComplete = true;
        if (fullNew) this.book.book.seenHundredPercent = true;
        this.book.save();
        audio.setMusicState("tour-complete", { immediate: true });
        this.ui.showTourComplete(stats, { hundredPercent: fullNew });
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
                        ? `${this.course.zones[nearest.id].name} is ` +
                          `${Math.abs(back)} m back up the hill`
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
                        sub: `${this.course.zones[nearest.id].name} · ` +
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
        const director = this;
        return {
            director: this,
            run: this.run,
            field: this.field,
            rocketChair: this.rocketChair,
            book: this.book,
            ui: this.ui,
            Mode,
            RunState,
            /**
             * The event actually being run. A getter, not a snapshot: the
             * autopilot aims at `event.finishZ`, and a frozen copy of the
             * first event sent it circling short of every other course's
             * gate — three collected orders that never crossed a line.
             */
            get event() {
                return director.run.event;
            },
            /** Read-only score diagnostics for browser playthrough evidence. */
            music: () => audio.getMusicDiagnostics(),
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
