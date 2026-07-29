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

    // -------------------------------------------------------------- terrain
    await loading.phase("baking heightfield", 0.34);
    const terrain = new Terrain(scene, sky, shadows);
    terrain.mesh.renderingGroupId = 1;
    await terrain.build();
    onChange("showTerrain", (v) => (terrain.mesh.isVisible = v));
    depthPass.registerCaster(terrain.mesh, terrain.makePrepassMaterial());

    await loading.phase("placing character", 0.62);

    const character = new CharacterController(terrain);
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

    // Airborne snow: footfall kick now, the surf plume and spell spray later.
    const spray = new SprayField(scene, terrain, sky, shadows);

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
        rocker.setActive(usingRocker);
        contact.setEnabled(show);
        contact.setRockerActive(usingRocker);
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
    onChange(["showCharacter", "heroStyle"], applyHeroStyle);
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

    // The rig needs ground heights to keep the spring arm above the snow.
    rig.groundAt = (x, z) => terrain.heightAt(x, z);

    const post = new PostChain(scene, rig.camera, depthPass, sky);

    const overlay = new Overlay({ rig, character });
    const courseHud = new CourseHud(character);
    initInput(canvas, { onToggleOverlay: () => overlay.toggle() });

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
    rocker.update();
    rocker.sync(rig.camera.position);
    await rocker.warmUp();
    applyHeroStyle();
    spray.update(0, rig.camera.position);
    await spray.warmUp();
    await wake.warmUp();
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
        const dt = S.freezeTime ? 0 : dtMs / 1000;
        time += dt;

        pollInput();

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
        if (usingRocker) rocker.update();
        contact.update(dt);
        const tChar = performance.now();

        _vel.copyFrom(character.velocity);
        rig.update(dt, character.position, _vel, character.lean, character.speed01);

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

    const api = {
        engine, scene, rig, character, figure, contact, spray, wake, spells,
        rocker, overlay, courseHud, terrain, sky, shadows, post, depthPass,
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
