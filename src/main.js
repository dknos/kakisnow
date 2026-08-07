/**
 * KAKISNOW — entry point and frame orchestration.
 *
 * WebGPU only, by design. No WebGL path, no feature-detect branches: if the
 * adapter isn't there we say so once and stop.
 */

import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";

import { registerShaders } from "./shaders/registry.js";
import { S, onChange, set as setSetting } from "./core/settings.js";
import {
    sample, checkSpike, stats, mark, installDrawCounter, endFrameDraws,
} from "./core/perf.js";
import { initInput, pollInput, endFrame, input } from "./core/input.js";
import {
    initTouch, setTouchVisible, shouldShowTouch, setTouchPauseHandler,
} from "./core/touchInput.js";
import { initPlayerSettings } from "./core/playerSettings.js";
import { PauseSystem, suppressGameplayInput } from "./game/pauseSystem.js";
import { CameraRig } from "./core/camera.js";
import { CharacterController } from "./character/controller.js";
import { Character } from "./character/character.js";
import { RockerKaki } from "./character/rockerKaki.js";
import { SnowContact } from "./character/snowContact.js";
import { SprayField } from "./vfx/particles.js";
import { SurfWake } from "./vfx/surfWake.js";
import { SpellSystem } from "./spells/spellSystem.js";
import { Overlay } from "./ui/overlay.js";
import { CourseHud } from "./ui/courseHud.js";
import { GameDirector, Mode } from "./game/gameDirector.js";
import { bootIntent } from "./game/bootIntent.js";
import { COURSES, DEFAULT_COURSE_ID, setActiveCourse } from "./game/courses/index.js";
import { EVENTS, getEvent } from "./game/courses/eventRegistry.js";
import { RocketChair } from "./vehicles/rocketChair.js";
import { audio as gameAudio } from "./audio/audio.js";
import { Sky } from "./render/sky.js";
import { ShadowSystem } from "./render/shadows.js";
import { Terrain } from "./terrain/terrain.js";
import { DepthPass } from "./render/depthPass.js";
import { PostChain } from "./post/postChain.js";
import { whenReady } from "./core/gpuUtil.js";
import * as loading from "./core/loading.js";

// ------------------------------------------------------- module-scope scratch
const _vel = new Vector3();

async function boot() {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("view"));

    if (!navigator.gpu) {
        loading.fail("WebGPU is not available in this browser.");
        return;
    }

    await loading.phase("creating device", 0.05);

    const engine = new WebGPUEngine(canvas, {
        antialias: false, // TAA handles edges; MSAA here would just cost bandwidth
        stencil: false,
        powerPreference: "high-performance",
        enableAllFeatures: true,
        setMaximumLimits: true,
    });

    try {
        await engine.initAsync();
    } catch (err) {
        console.error(err);
        loading.fail("WebGPU device initialisation failed.");
        return;
    }

    // The heightfield is R32F and is filtered in the vertex shader, which needs
    // this feature. Every desktop GPU that can run this demo has it.
    const filterable = engine.getCaps().textureFloatLinearFiltering;
    if (!filterable) {
        console.warn("[kakisnow] float32-filterable unavailable; height will step");
    }

    const applyScale = () => engine.setHardwareScalingLevel(1 / S.resolutionScale);
    applyScale();
    onChange("resolutionScale", applyScale);
    window.addEventListener("resize", () => engine.resize());

    installDrawCounter(engine);
    registerShaders();
    // Saved player settings land before anything derives one-shot state from
    // them; the resolutionScale listener above is already armed, so a stored
    // quality preset re-scales the swapchain the moment it hydrates.
    initPlayerSettings();

    await loading.phase("building scene", 0.12);

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
    scene.autoClear = true;
    // Do NOT clear depth between rendering groups. Babylon clears depth before
    // every group by default; here group 1 is the opaque scene and group 2 is
    // the alpha-blended water and spray, which must depth-test against it.
    scene.setRenderingAutoClearDepthStencil(1, false);
    scene.setRenderingAutoClearDepthStencil(2, false);
    // No stock lights: every material here computes its own lighting.
    scene.ambientColor = new Color3(0, 0, 0);

    const rig = new CameraRig(scene, canvas);
    // Summit Line runs downhill along +Z; start behind the rider looking into it.
    rig.yaw = 0;
    scene.activeCamera = rig.camera;

    // ------------------------------------------------------------------ sky
    await loading.phase("integrating atmosphere", 0.2);
    const sky = new Sky(scene);
    sky.mesh.renderingGroupId = 0;
    await sky.solve();

    // -------------------------------------------------------------- shadows
    const shadows = new ShadowSystem(scene);

    // The camera-space depth prepass. It is a custom render target, and the
    // scene renders those in registration order — so creating it here, after
    // the cascades and before anything that draws, is the whole of the
    // scheduling.
    const depthPass = new DepthPass(scene);

    // --------------------------------------------------------------- course
    // Which course this boot bakes, and which event scores it. Query params
    // rather than only menus for the same reason `?mode=` exists: the
    // committed tools drive this build headlessly and cannot press buttons.
    // An unknown id falls back rather than failing the boot — a stale
    // bookmark should not brick the game.
    const bootParams = new URLSearchParams(location.search);
    const courseParam = bootParams.get("course");
    const course = setActiveCourse(
        courseParam && COURSES[courseParam] ? courseParam : DEFAULT_COURSE_ID
    );
    const eventParam = bootParams.get("event");
    const eventDef =
        eventParam && EVENTS[eventParam] &&
        EVENTS[eventParam].courseId === course.id
            ? getEvent(eventParam)
            : getEvent(course.events[0]);

    // The course's weather and light, applied before the sky solves and the
    // heightfield bakes: every value is an existing `S` key, so the overlay
    // can still push any of them around afterwards — the course just chooses
    // where the sliders start. This is how midnight happens.
    for (const [k, v] of Object.entries(course.atmosphere ?? {})) {
        setSetting(k, v);
    }

    // -------------------------------------------------------------- terrain
    await loading.phase("baking heightfield", 0.34);
    const terrain = new Terrain(scene, sky, shadows);
    terrain.mesh.renderingGroupId = 1;
    await terrain.build(course);
    onChange("showTerrain", (v) => (terrain.mesh.isVisible = v));
    depthPass.registerCaster(terrain.mesh, terrain.makePrepassMaterial());

    await loading.phase("placing character", 0.62);

    const character = new CharacterController(terrain);
    // Big Air's headline table is the one authored launch in the game whose
    // identity must survive a mild carve. The assist is data-driven from that
    // existing ski-jump span and is absent on every other course, preserving
    // the ordinary natural-takeoff feel everywhere else.
    if (course.id === "big-air-basin") {
        character.setTakeoffAssist({
            jump: course.terrain.skiJumps?.[0] ?? null,
            laneHalf: course.terrain.laneHalf,
        });
    }
    character.position.set(0, 0, 0);
    character.position.y = terrain.heightAt(0, 0);

    // The figure: skeleton, garment simulation, shell fur.
    const figure = new Character(scene, terrain, sky, shadows, character);
    figure.registerPrepass(depthPass);

    // Project-owner hero. RockerKaki is the playable default; the articulated
    // Snowbound figure stays warm and selectable from the F1 overlay.
    await loading.phase("preparing hero", 0.68);
    const rocker = new RockerKaki({
        scene, terrain, sky, shadows, depthPass, controller: character,
    });
    await rocker.load();

    // The second vehicle. It hangs off the node RockerKaki already uses to
    // carry the board's attitude, so switching is showing one and hiding the
    // other — the classic board stays loaded and stays the fallback.
    // Airborne snow: footfall kick now, the surf plume and spell spray later.
    // Also the rocket's exhaust, which rides this same pool rather than
    // standing up a second particle system that would have to be warmed
    // separately.
    const spray = new SprayField(scene, terrain, sky, shadows);

    // The second vehicle. It hangs off the node RockerKaki already uses to
    // carry the board's attitude, so switching is showing one and hiding the
    // other — the classic board stays loaded and stays the fallback.
    const rocketChair = new RocketChair({
        scene, sky, shadows, depthPass, rocker,
        controller: character, spray,
    });
    await rocketChair.load();

    // Feet and the surf groove write into the terrain state buffer through here.
    const contact = new SnowContact(character, terrain.deform, figure.figure, spray);

    let usingRocker = false;
    let usingSnowbound = false;
    /** @type {SpellSystem|null} */
    let spells = null;
    const applyHeroStyle = () => {
        const show = S.showCharacter !== false;
        const rockerStyle = S.heroStyle === "rockerkaki" && rocker.available;
        usingRocker = show && rockerStyle;
        usingSnowbound = show && !rockerStyle;
        figure.setVisible(usingSnowbound);
        // Before `setActive`: it enables every hero mesh and then defers to the
        // board's own flag, so the flag has to be current when it asks.
        rocker.setBoardVisible(S.showBoard !== false);
        rocker.setActive(usingRocker);
        contact.setEnabled(show);
        contact.setRockerActive(usingRocker);
        // The trench follows what is actually against the snow. Without a board
        // that is the rider herself, and a snowboard track behind a character
        // visibly not on one is worse than no track at all.
        contact.setBoardActive(usingRocker && rocker.boardVisible);
        if (spells) {
            spells.setFigureHandsEnabled(usingSnowbound);
            spells.setConsumersEnabled(
                figure.lightConsumers, usingSnowbound
            );
            spells.setConsumersEnabled(
                rocker.beautyMaterials, usingRocker
            );
        }
    };
    onChange(["showCharacter", "heroStyle", "showBoard"], applyHeroStyle);
    // Resizing the board moves the mesh and the trench together — `boardSpec`
    // is the one place both read their geometry from, so this is the only hook
    // the slider needs.
    onChange("boardScale", () => {
        rocker.applyBoardScale();
        rocketChair.applyScale();
    });
    onChange("rocketChairScale", () => rocketChair.applyScale());
    // After `applyHeroStyle`, always: that function ends by handing the board's
    // visibility back to `S.showBoard`, which would put the classic board back
    // underneath the chair.
    const applyVehicle = () => {
        rocketChair.setActive(S.vehicle === "rocket-chair" && usingRocker);
    };
    onChange(["vehicle", "showBoard", "showCharacter", "heroStyle"], applyVehicle);
    applyHeroStyle();

    // The breaking wave, its bow crest and the plume it sheds.
    const wake = new SurfWake(scene, sky, shadows, character, spray, terrain);
    onChange("showWake", (v) => wake.setEnabled(v));
    wake.registerPrepass(depthPass);

    // The five spells, the water body they bend and the ice they leave. Every
    // one of them writes into the same terrain state buffer the feet and the
    // wake do, and lights the snow through the same four-slot pool.
    spells = new SpellSystem(
        scene, sky, shadows, terrain, character, figure.figure, rig, spray
    );
    // Every surface a spell can light.
    spells.addConsumers(
        terrain.material, figure.bodyMat, figure.clothMat,
        wake.material, spray.material
    );
    for (let i = 0; i < rocker.beautyMaterials.length; i++) {
        spells.addConsumers(rocker.beautyMaterials[i]);
    }
    applyHeroStyle();
    spells.registerPrepass(depthPass);

    // ----------------------------------------------------------- game layer
    // Snow-Burgers: the order, the five ingredients, the grill and the score.
    // It owns no rendering of its own — every model it places goes through the
    // same custom sun, cascades, prepass and fog as the hero — and it is a
    // mode, so Free Ride Lab turns all of it off and hands the mountain back.
    await loading.phase("stocking the grill", 0.72);
    const game = new GameDirector({
        scene, sky, shadows, depthPass, terrain,
        controller: character, rig, spray, rocketChair,
        course, event: eventDef,
        setHintVisible: loading.setHintVisible,
    });
    await game.load();

    // A pickup standing in a spell's light has to answer to it the way the snow
    // does. Its meshes carry the same `rocker` material as the hero, so they
    // join the same four-slot pool with no special case — but only once the
    // models are actually loaded, because before that there are no materials to
    // register.
    for (const material of game.lightConsumers) spells.addConsumers(material);

    // The rig needs ground heights to keep the spring arm above the snow.
    rig.groundAt = (x, z) => terrain.heightAt(x, z);

    const post = new PostChain(scene, rig.camera, depthPass, sky);

    const overlay = new Overlay({ rig, character });
    const courseHud = new CourseHud(character, course);
    initInput(canvas, { onToggleOverlay: () => overlay.toggle() });
    initTouch(canvas);
    onChange("touchControls", () => setTouchVisible(shouldShowTouch()));

    // The pause veil. It owns Escape, gamepad Start, the touch corner button,
    // and the focus/pointer-lock safety nets; the render loop below reads
    // `pause.active` as a second reason for the dt=0 the freeze-time toggle
    // already proved safe everywhere.
    const pause = new PauseSystem({ director: game, canvas });
    setTouchPauseHandler(() => pause.toggle());

    // ------------------------------------------------------------- warm-up
    // Everything that can compile, compiles here — behind the loading screen.
    await loading.phase("compiling pipelines", 0.78);
    shadows.update(rig.camera, sky.sunDir);
    sky.render(rig, 0);
    await terrain.warmUp();
    terrain.update(rig.camera.position, character.position, 0);
    figure.setVisible(true);
    figure.update(0);
    figure.sync(rig.camera.position);
    await figure.warmUp();
    rocker.setActive(true);
    rocker.update(0);
    rocker.sync(rig.camera.position);
    await rocker.warmUp();
    applyHeroStyle();
    spray.update(0, rig.camera.position);
    await spray.warmUp();
    await wake.warmUp();
    // Every ingredient and the reward burger, compiled here rather than on the
    // frame a pickup first enters view at nineteen metres a second.
    await game.warmUp();
    await rocketChair.warmUp();
    applyVehicle();
    await spells.warmUp(
        character.position.x + 3, character.position.y, character.position.z + 3
    );
    await whenReady(sky.material, "sky material", [sky.mesh, false]);
    await depthPass.warmUp();
    post.update(0, 0, rig.distance);
    const passes = post.passes;
    for (let i = 0; i < passes.length; i++) {
        await whenReady(passes[i], "post:" + passes[i].name);
    }

    await loading.phase("warming render targets", 0.92);
    // A few real frames so every render target is allocated and every pipeline
    // has actually been bound at least once. Manual renders must still own a
    // Babylon frame: without begin/endFrame the WebGPU upload and swapchain
    // command encoders can cross a browser presentation boundary, which Chrome
    // correctly reports as a destroyed-swap-texture submission.
    // Exercise the non-default Snowbound hero once. Compiling a material while
    // hidden is not enough: this forces both hero variants through real beauty,
    // cascade, and prepass submits before the loading screen can disappear.
    figure.setVisible(true);
    rocker.setActive(false);
    for (let i = 0; i < 3; i++) {
        engine.beginFrame();
        try {
            scene.render();
        } finally {
            engine.endFrame();
        }
        await loading.nextFrame();
        if (i === 0) applyHeroStyle();
    }
    applyHeroStyle();
    // Only now: the spell meshes had to be standing *through* those frames for
    // their render pipelines to exist. See `WaterBody.warmUp`.
    spells.finishWarmUp();

    // ------------------------------------------------------------- run loop
    let prev = performance.now();
    let time = 0;

    engine.runRenderLoop(() => {
        const now = performance.now();
        let dtMs = now - prev;
        prev = now;
        if (dtMs > 100) dtMs = 100;
        // One dt for the whole frame. Paused and frozen are two reasons for
        // the same zero: rendering continues, simulated time does not.
        const dt = (S.freezeTime || pause.active) ? 0 : dtMs / 1000;
        time += dt;

        pollInput(dt);
        // In the poll-to-controller window, like everything that overrides
        // input: the gamepad Start edge is polled here, and a paused frame
        // zeroes the struct so held keys steer nothing and nothing pressed
        // during the veil can fire on resume.
        pause.update();
        if (pause.active) suppressGameplayInput();
        // Between the poll and the controller, because holding a rider at a
        // start gate means overwriting the input struct the controller is
        // about to read — see `GameDirector.beforePhysics`.
        game.beforePhysics();
        // Before the controller too: it is the controller that integrates the
        // thrust, and a throttle written after it would be a frame late.
        rocketChair.beforePhysics(dt);

        // Per-system CPU timings are labelled explicitly: Chrome's current
        // command-encoder timestamp path returns zero on this WebGPU backend,
        // so the overlay does not present that unsupported value as GPU cost.
        const tFrame = performance.now();

        character.update(dt, rig);
        terrain.heightfield.clampToPlayArea(character.position);
        // Pose and simulate before the contact pass: the footprints are stamped
        // at the boot's actual planted position, which only exists once the
        // figure has been solved.
        if (usingSnowbound) figure.update(dt);
        if (usingRocker) rocker.update(dt);
        contact.update(dt);
        // After the physics: the swept pickup test spans the movement the
        // controller just produced, and the finish is caught on the frame it
        // is crossed rather than the one after.
        game.update(dt);
        // After the physics: the plume leaves the nozzle where the nozzle
        // actually is this frame, with the board's pitch and roll already in
        // the anchors it is measured from.
        rocketChair.update(dt);
        const tChar = performance.now();

        _vel.copyFrom(character.velocity);
        rig.update(
            dt, character.position, _vel,
            character.lean, character.speed01, character.boost
        );

        // Jitters the projection and republishes everything the screen-space
        // passes derive from the camera. Must be after the rig has moved and
        // before anything reads `scene.getTransformMatrix()` — which the depth
        // prepass and the beauty pass both do.
        post.update(dt, character.streak01, rig.distance);
        sky.update();
        sky.render(rig, time);
        shadows.update(rig.camera, sky.sunDir);
        // After the shadow refit, so the water and the ice carry this frame's
        // cascade matrices; before the terrain, so the brushes every spell
        // writes are in the staging array when the simulation pass runs.
        spells.update(dt, rig.camera.position);
        const tSpells = performance.now();
        terrain.update(rig.camera.position, character.position, dt);
        const tTerrain = performance.now();
        // After the shadow refit, so the figure's uniforms carry this frame's
        // cascade matrices rather than last frame's.
        if (usingSnowbound) figure.sync(rig.camera.position);
        if (usingRocker) rocker.sync(rig.camera.position);
        rocketChair.sync(rig.camera.position);
        game.sync(rig.camera.position);
        // Before the spray: the wake decides where its own lip is, and the
        // grains it sheds have to be in the pool before the pool is uploaded.
        wake.update(dt, rig.camera.position);
        spray.update(dt, rig.camera.position);
        const tVfx = performance.now();

        scene.render();
        post.endFrame();
        const tRender = performance.now();

        mark("cpu character", tChar - tFrame);
        mark("cpu spells", tSpells - tChar);
        mark("cpu terrain", tTerrain - tSpells);
        mark("cpu wake+spray", tVfx - tTerrain);
        mark("cpu submit", tRender - tVfx);
        mark("cpu total", tRender - tFrame);
        endFrameDraws();
        sample(dtMs);
        checkSpike(dtMs);
        overlay.update(dtMs, engine);
        courseHud.update(dt);

        endFrame();
    });

    await loading.done();
    setTimeout(() => overlay.resetSpikes(), 800);

    // Which mode the build opens in.
    //
    // A query parameter rather than only a menu click, because the committed
    // capture and smoke tools drive this build headlessly and none of them can
    // press a button. `?mode=free-ride` is the original open mountain with no
    // game interface over it, which is what those tools were written against.
    onChange("audio", (v) => gameAudio.setEnabled(v));
    onChange("masterVolume", (v) => gameAudio.setVolume(v));
    onChange("musicVolume", (v) => gameAudio.setBusVolume("music", v));
    onChange("sfxVolume", (v) => gameAudio.setBusVolume("sfx", v));
    onChange("ambienceVolume", (v) => gameAudio.setBusVolume("ambience", v));
    onChange("uiVolume", (v) => gameAudio.setBusVolume("ui", v));
    gameAudio.setVolume(S.masterVolume);
    gameAudio.setBusVolume("music", S.musicVolume);
    gameAudio.setBusVolume("sfx", S.sfxVolume);
    gameAudio.setBusVolume("ambience", S.ambienceVolume);
    gameAudio.setBusVolume("ui", S.uiVolume);
    gameAudio.setEnabled(S.audio !== false);

    const intent = bootIntent({
        requestedMode: bootParams.get("mode"),
        eventParam,
        eventRegistry: EVENTS,
        courseId: course.id,
    });
    game.selectMode(
        intent === "free-ride" ? Mode.FREE_RIDE
            : intent === "burger-run" ? Mode.BURGER_RUN
            : Mode.TITLE
    );

    const api = {
        engine, scene, rig, character, figure, contact, spray, wake, spells,
        rocker, overlay, courseHud, terrain, sky, shadows, post, depthPass,
        game: game.api,
        rocketChair,
        pause,
        S, input, perfStats: stats, set: setSetting,
        setHeroStyle(style) {
            setSetting("heroStyle", style === "rockerkaki" ? "rockerkaki" : "snowbound");
        },
    };
    globalThis.KAKISNOW = api;
    // Kept as a narrow compatibility bridge for the committed capture tools.
    // New integrations should use the canonical `KAKISNOW` console handle.
    globalThis.__KAKISNOW_DEBUG__ = api;
    globalThis.__KAKISNOW__ = { ready: true, product: "KAKISNOW" };
}

boot().catch((err) => {
    console.error(err);
    loading.fail("Startup failed — see console.");
});
