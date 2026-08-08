/**
 * Final camera/cinematic acceptance matrix for Snow-Burgers.
 *
 * This drives the shipped WebGPU renderer in Windows Chrome.  The small amount
 * of direct staging is deliberate and disclosed in the report: it puts the
 * real rider/camera at a named finish, rail, hazard, or signature jump so the
 * matrix can cover the authored camera states without making a synthetic
 * renderer or waiting for a full six-minute descent per scene.
 *
 * Usage (from WSL):
 *   "/mnt/c/Program Files/nodejs/node.exe" \
 *     tools/snow-burgers/capture-camera-matrix-windows.cjs \
 *     --url http://127.0.0.1:5190 \
 *     --out reports/final-gauntlet/final-camera
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const baseUrl = arg("--url", "http://127.0.0.1:5190");
const output = path.resolve(arg("--out", "reports/final-gauntlet/final-camera"));
const executablePath = arg(
  "--chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
);
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost|Destroyed texture/i;

// 16:9 and exact 21:9 capture surfaces.  A native 3440x1440 run is already
// retained in the prior B4 evidence; this matrix uses the exact aspect ratio
// so the acceptance claim is not rounded by a 21.5:9 desktop mode.
const viewports = [
  { id: "16x9", width: 1280, height: 720 },
  { id: "21x9", width: 2560, height: 1080 },
];

const finishes = [
  { course: "summit-line", event: "summit-stack", name: "Summit Line" },
  { course: "pinecone-pass", event: "timber-melt", name: "Pinecone Pass" },
  { course: "glacier-gorge", event: "blue-plate", name: "Glacier Gorge" },
  { course: "midnight-resort", event: "night-shift", name: "Midnight Resort" },
  { course: "whiteout-ridge", event: "avalanche-special", name: "Whiteout Ridge" },
  { course: "big-air-basin", event: "big-air-basin-stack", name: "Big Air Basin" },
];

const railAreas = [
  { course: "summit-line", event: "summit-stack", name: "Summit first rail", x: 9, z: 136, yaw: 0 },
  { course: "pinecone-pass", event: "timber-melt", name: "Pinecone creek rail", x: -13, z: 190, yaw: 0 },
  { course: "midnight-resort", event: "night-shift", name: "Midnight steel rail", x: 18, z: 153, yaw: 0 },
  { course: "whiteout-ridge", event: "avalanche-special", name: "Whiteout barrier rail", x: -22, z: 187, yaw: 0 },
  { course: "big-air-basin", event: "big-air-basin-stack", name: "Big Air venue rail", x: 16, z: 153, yaw: 0 },
];

fs.mkdirSync(output, { recursive: true });
const screenshotsDir = path.join(output, "captures");
fs.mkdirSync(screenshotsDir, { recursive: true });

const errors = [];
const validation = [];
const failedRequests = [];
const scenarioResults = [];
const viewportResults = [];
let context = null;
let page = null;

function writeJson(name, value) {
  fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function finiteRecord(record) {
  return Object.values(record).every((value) => finite(value));
}

function summarizeSamples(samples) {
  let maxCameraSpeed = 0;
  let maxYawRate = 0;
  let maxPitchRate = 0;
  let maxDistanceRate = 0;
  let belowTerrain = 0;
  let nonFinite = 0;
  let solidIntersections = 0;
  let oscillationWindows = 0;
  let maxObstacleCompression = 0;
  let previous = null;
  let signs = [];
  for (const sample of samples) {
    if (!sample.finite) nonFinite++;
    if (sample.belowTerrain) belowTerrain++;
    if (sample.solidIntersection) solidIntersections++;
    maxObstacleCompression = Math.max(
      maxObstacleCompression,
      Math.max(0, sample.distance - sample.obstacleDistance),
    );
    if (previous) {
      const dt = Math.max(1e-4, sample.t - previous.t);
      const dx = sample.camera.x - previous.camera.x;
      const dy = sample.camera.y - previous.camera.y;
      const dz = sample.camera.z - previous.camera.z;
      maxCameraSpeed = Math.max(maxCameraSpeed, Math.hypot(dx, dy, dz) / dt);
      maxYawRate = Math.max(maxYawRate, Math.abs(sample.rotation.yaw - previous.rotation.yaw) / dt);
      maxPitchRate = Math.max(maxPitchRate, Math.abs(sample.rotation.pitch - previous.rotation.pitch) / dt);
      maxDistanceRate = Math.max(maxDistanceRate, Math.abs(sample.distance - previous.distance) / dt);
      const delta = sample.distance - previous.distance;
      if (Math.abs(delta) > 0.004) {
        const sign = Math.sign(delta);
        signs.push(sign);
        if (signs.length > 8) signs.shift();
        if (signs.length >= 6) {
          let alternating = true;
          for (let i = 1; i < signs.length; i++) {
            if (signs[i] === signs[i - 1]) alternating = false;
          }
          if (alternating) oscillationWindows++;
        }
      }
    }
    previous = sample;
  }
  return {
    frameCount: samples.length,
    maxCameraSpeedMps: +maxCameraSpeed.toFixed(3),
    maxYawRateRadS: +maxYawRate.toFixed(3),
    maxPitchRateRadS: +maxPitchRate.toFixed(3),
    maxDistanceRateMps: +maxDistanceRate.toFixed(3),
    maxObstacleCompressionM: +maxObstacleCompression.toFixed(3),
    belowTerrainFrames: belowTerrain,
    nonFiniteFrames: nonFinite,
    solidIntersectionFrames: solidIntersections,
    alternatingDistanceWindows: oscillationWindows,
    // These are screening thresholds, not a claim that an arm may never move
    // quickly. Obstruction correction is expected to retract; only violent
    // one-frame pops above these limits fail this matrix.
    violentSnap: maxCameraSpeed > 140 || maxYawRate > 16 || maxPitchRate > 16 || maxDistanceRate > 90,
    ok: nonFinite === 0 && belowTerrain === 0 && solidIntersections === 0 &&
      maxCameraSpeed <= 140 && maxYawRate <= 16 && maxPitchRate <= 16 &&
      maxDistanceRate <= 90,
  };
}

(async () => {
  try {
    context = await chromium.launchPersistentContext(
      fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-camera-matrix-")),
      {
        executablePath,
        headless: true,
        viewport: viewports[0],
        deviceScaleFactor: 1,
        args: [
          "--no-first-run",
          "--no-default-browser-check",
          "--ignore-gpu-blocklist",
          "--disable-frame-rate-limit",
          "--disable-gpu-vsync",
        ],
      },
    );
    page = context.pages()[0] || await context.newPage();

    page.on("console", (message) => {
      const line = `${message.type()}: ${message.text()}`;
      if (message.type() === "error") errors.push(line);
      if (validationPattern.test(line)) validation.push(line);
    });
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    page.on("requestfailed", (request) => {
      const line = `${request.url()} ${request.failure()?.errorText || ""}`.trim();
      failedRequests.push(line);
    });

    async function ready(url, viewport) {
      process.stderr.write(`boot ${viewport.id} ${url}\n`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForFunction(
        () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.game),
        null,
        { timeout: 300_000 },
      );
      await page.waitForTimeout(450);
      await page.waitForFunction(
        () => !document.querySelector("#boot"),
        null,
        { timeout: 60_000 },
      );
      process.stderr.write(`ready ${viewport.id}\n`);
    }

    async function startRun(scenario) {
      await page.evaluate(({ event }) => {
        const app = window.KAKISNOW;
        app.set("reducedMotion", false);
        app.game.start(7);
        app.game.run.event = app.game.run.event || event;
      }, scenario);
      await page.waitForFunction(() => window.KAKISNOW?.game?.run?.state === "run", null, { timeout: 15_000 });
      process.stderr.write(`run ${scenario.event}\n`);
    }

    async function stage({ x = 0, z, speed = 0, yaw = 0, distance = 11 }) {
      return page.evaluate(({ x, z, speed, yaw, distance }) => {
        const app = window.KAKISNOW;
        const c = app.character;
        const y = app.terrain.heightAt(x, z);
        c.position.set(x, y, z);
        c.prevPosition?.copyFrom?.(c.position);
        c.velocity.set(0, 0, speed);
        c.prevVelocity?.copyFrom?.(c.velocity);
        c.acceleration.setAll(0);
        c.facing = yaw;
        c.groundY = y;
        c.grounded = true;
        c.airborne = false;
        c.crashed = false;
        c.verticalVelocity = 0;
        c.airTime = 0;
        c.jumpCount = 0;
        c.surf = speed ? 1 : 0;
        app.input.surf = Boolean(speed);
        app.rig._first = true;
        app.rig.groundLift = 0;
        app.rig.yaw = yaw;
        app.rig.pitch = 0.1;
        app.rig.distance = distance;
        app.rig.distanceTarget = distance;
        app.rig.obstacleDistance = distance;
        return { x, z, y: +y.toFixed(3), speed, distance };
      }, { x, z, speed, yaw, distance });
    }

    async function sampleFrames(label, count = 120, interval = 40) {
      const samples = [];
      for (let i = 0; i < count; i++) {
        const sample = await page.evaluate(() => {
          const app = window.KAKISNOW;
          const rig = app.rig;
          const c = app.character;
          const camera = rig.camera;
          const terrainY = app.terrain.heightAt(camera.position.x, camera.position.z);
          const nearestObstacle = rig.obstacleWorld?.nearest(
            camera.position.x, camera.position.y, camera.position.z, 0.5,
          );
          const nearestCameraOnly = rig.cameraWorld?.nearest(
            camera.position.x, camera.position.y, camera.position.z, 0.5,
          );
          const obstacle = nearestObstacle && nearestCameraOnly
            ? (nearestObstacle.distSq < nearestCameraOnly.distSq ? nearestObstacle : nearestCameraOnly)
            : (nearestObstacle || nearestCameraOnly);
          const record = {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw: camera.rotation.y,
            pitch: camera.rotation.x,
            roll: camera.rotation.z,
            distance: rig.distance,
            obstacleDistance: rig.obstacleDistance,
            lift: rig.groundLift,
            terrainY,
            playerZ: c.position.z,
            state: app.game.run.state,
            bigAirInFlight: app.game.director.bigAirFlight?.inFlight ?? false,
            bigAirFraming: app.game.director.bigAirFlight?.framingActive ?? false,
            avalancheDistance: app.game.director.avalanche?.active
              ? c.position.z - app.game.director.avalanche.wallZ : null,
            snowcatProximity: app.game.director.snowcats?.cats?.length
              ? Math.max(...app.game.director.snowcats.cats.map((cat) =>
                Math.max(0, 1 - Math.hypot(cat.x - c.position.x, cat.z - c.position.z) / 60))): 0,
            nearestObstacleSurfaceM: obstacle ? Math.sqrt(obstacle.distSq) : null,
            nearestObstacleKind: obstacle?.collider?.kind ?? null,
          };
          const finiteFields = [
            record.x, record.y, record.z, record.yaw, record.pitch, record.roll,
            record.distance, record.obstacleDistance, record.lift, record.terrainY,
            record.playerZ,
          ];
          return {
            t: performance.now() / 1000,
            camera: { x: record.x, y: record.y, z: record.z },
            rotation: { yaw: record.yaw, pitch: record.pitch, roll: record.roll },
            distance: record.distance,
            obstacleDistance: record.obstacleDistance,
            lift: record.lift,
            terrainY: record.terrainY,
            state: record.state,
            bigAirInFlight: record.bigAirInFlight,
            bigAirFraming: record.bigAirFraming,
            avalancheDistance: record.avalancheDistance,
            snowcatProximity: record.snowcatProximity,
            nearestObstacleSurfaceM: record.nearestObstacleSurfaceM,
            nearestObstacleKind: record.nearestObstacleKind,
            finite: finiteFields.every(Number.isFinite),
            belowTerrain: Number.isFinite(record.terrainY) && record.y < record.terrainY - 0.25,
            solidIntersection: Number.isFinite(record.nearestObstacleSurfaceM) &&
              record.nearestObstacleSurfaceM < 0.30,
          };
        });
        samples.push(sample);
        await page.waitForTimeout(interval);
      }
      const summary = summarizeSamples(samples);
      const frame = samples[Math.max(0, samples.length - 1)];
      const safeLabel = label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
      const shot = `${safeLabel}.png`;
      await page.screenshot({ path: path.join(screenshotsDir, shot) });
      return { label, summary, samples, screenshot: path.join("captures", shot), finalFrame: frame };
    }

    async function recordScenario({ id, name, course, event, viewport, setup, frames = 100, interval = 40, reducedMotion = false }) {
      process.stderr.write(`begin ${id} ${viewport.id}\n`);
      const query = new URL(baseUrl);
      query.searchParams.set("course", course);
      query.searchParams.set("event", event);
      query.searchParams.set("mode", "burger-run");
      await ready(query.toString(), viewport);
      await startRun({ event });
      await page.evaluate((value) => window.KAKISNOW.set("reducedMotion", value), reducedMotion);
      const placement = await setup();
      process.stderr.write(`sample ${id} ${frames}x${interval}ms\n`);
      const sampled = await sampleFrames(`${viewport.id}-${id}`, frames, interval);
      const result = {
        id, name, course, event, viewport: viewport.id, width: viewport.width, height: viewport.height,
        reducedMotion, staging: placement,
        ...sampled,
      };
      scenarioResults.push(result);
      process.stderr.write(`${result.summary.ok ? "PASS" : "FAIL"} ${viewport.id} ${name} (${result.summary.frameCount} frames)\n`);
      return result;
    }

    // All six base-camp finishes at 16:9.  A complete order is seeded into the
    // real run record, then the camera is placed five metres before the
    // registry finish and allowed to cross it through the normal update loop.
    for (const finish of finishes) {
      process.stderr.write(`scenario finish-${finish.course}\n`);
      await recordScenario({
        id: `finish-${finish.course}`,
        name: `${finish.name} finish`,
        course: finish.course,
        event: finish.event,
        viewport: viewports[0],
        frames: 75,
        setup: async () => {
          return page.evaluate(() => {
            const app = window.KAKISNOW;
            const run = app.game.run;
            for (const id of run.event.required) run.splits[id] = 0.01;
            const z = run.event.finishZ - 5;
            const c = app.character;
            const y = app.terrain.heightAt(0, z);
            c.position.set(0, y, z);
            c.prevPosition?.copyFrom?.(c.position);
            c.velocity.set(0, 0, 8);
            c.prevVelocity?.copyFrom?.(c.velocity);
            c.groundY = y;
            c.grounded = true;
            c.airborne = false;
            c.crashed = false;
            c.verticalVelocity = 0;
            c.surf = 1;
            app.input.surf = true;
            app.rig._first = true;
            app.rig.distance = 7.5;
            app.rig.distanceTarget = 7.5;
            return { method: "real run update after direct finish staging", finishZ: run.event.finishZ, z, y };
          });
        },
      });
    }

    // Rail arm cases: rider is staged just beyond each real authored rail so
    // the rear spring arm passes the collider; no render-only obstacle is made.
    for (const rail of railAreas) {
      process.stderr.write(`scenario rail-${rail.course}-${rail.z}\n`);
      await recordScenario({
        id: `rail-${rail.course}-${rail.z}`,
        name: rail.name,
        course: rail.course,
        event: rail.event,
        viewport: viewports[0],
        frames: 100,
        setup: () => stage({ x: rail.x, z: rail.z, yaw: rail.yaw, speed: 0, distance: 11 }),
      });
    }

    // Midnight snowcat: the real patrol remains live while the rider is held
    // on the authored crossing line. The report records measured proximity
    // and the collider kind visible to the camera query.
    await recordScenario({
      id: "snowcat-pass-midnight",
      name: "Midnight Resort snowcat proximity/pass",
      course: "midnight-resort",
      event: "night-shift",
      viewport: viewports[0],
      frames: 180,
      interval: 40,
      setup: () => stage({ x: 0, z: 240, speed: 0, distance: 8 }),
    });

    // Whiteout pressure is staged by moving the authored avalanche wall close
    // behind a real run. The wall, HUD, particles, captions, audio bus, and
    // camera all remain the production systems; only its scalar lead is set so
    // a short matrix run samples the proximity window.
    await recordScenario({
      id: "avalanche-proximity-whiteout",
      name: "Whiteout Ridge avalanche proximity",
      course: "whiteout-ridge",
      event: "avalanche-special",
      viewport: viewports[0],
      frames: 130,
      setup: async () => {
        const staged = await stage({ x: 0, z: -180, speed: 10, distance: 8 });
        await page.evaluate(() => {
          const app = window.KAKISNOW;
          app.game.director.avalanche.wallZ = app.character.position.z - 18;
        });
        return { ...staged, wallLeadSetM: 18, method: "real avalanche update after wall lead staging" };
      },
    });

    // Signature Big Air: real physics from the authored in-run to the real
    // landing hill. This is the only staging that supplies a high launch speed;
    // no telemetry, camera transform, or landing result is synthesized.
    await recordScenario({
      id: "big-air-flight",
      name: "Big Air Basin takeoff and landing",
      course: "big-air-basin",
      event: "big-air-basin-stack",
      viewport: viewports[0],
      frames: 190,
      interval: 35,
      setup: () => stage({ x: 0, z: 260, speed: 26, distance: 9 }),
    });

    // Reduced motion gets a separate full signature-flight sample: this
    // proves the additive air framing and trauma remain disabled in the real
    // renderer while the landing stays visible.
    await recordScenario({
      id: "big-air-reduced-motion",
      name: "Big Air reduced-motion flight",
      course: "big-air-basin",
      event: "big-air-basin-stack",
      viewport: viewports[0],
      frames: 160,
      interval: 35,
      reducedMotion: true,
      setup: () => stage({ x: 0, z: 260, speed: 26, distance: 11 }),
    });

    // Exact 21:9 coverage: finish, rail, Big Air, and reduced-motion catches
    // the wide-frame camera and landing context without duplicating all 6
    // expensive course bakes. The prior B4 native-ultrawide capture remains
    // linked by the final memo for the 3440x1440 visual reference.
    const summit21 = finishes[0];
    await recordScenario({
      id: "finish-summit-21x9",
      name: "Summit Line finish wide frame",
      course: summit21.course,
      event: summit21.event,
      viewport: viewports[1],
      frames: 75,
      setup: async () => page.evaluate(() => {
        const app = window.KAKISNOW;
        const run = app.game.run;
        for (const id of run.event.required) run.splits[id] = 0.01;
        const z = run.event.finishZ - 5;
        const y = app.terrain.heightAt(0, z);
        const c = app.character;
        c.position.set(0, y, z); c.prevPosition?.copyFrom?.(c.position);
        c.velocity.set(0, 0, 8); c.prevVelocity?.copyFrom?.(c.velocity);
        c.groundY = y; c.grounded = true; c.airborne = false; c.crashed = false;
        c.verticalVelocity = 0; c.surf = 1; app.input.surf = true;
        app.rig._first = true; app.rig.distance = 7.5; app.rig.distanceTarget = 7.5;
        return { method: "real run update after direct finish staging", finishZ: run.event.finishZ, z, y };
      }),
    });
    await recordScenario({
      id: "big-air-21x9",
      name: "Big Air landing wide frame",
      course: "big-air-basin",
      event: "big-air-basin-stack",
      viewport: viewports[1],
      frames: 190,
      interval: 35,
      setup: () => stage({ x: 0, z: 260, speed: 26, distance: 9 }),
    });
    await recordScenario({
      id: "big-air-reduced-motion-21x9",
      name: "Big Air reduced-motion wide frame",
      course: "big-air-basin",
      event: "big-air-basin-stack",
      viewport: viewports[1],
      frames: 120,
      interval: 35,
      reducedMotion: true,
      setup: () => stage({ x: 0, z: 260, speed: 26, distance: 11 }),
    });

    // Zoom cases use the real camera spring on a live Summit run.  They are
    // kept separate from obstruction cases so a requested close view cannot
    // be mistaken for an arm collision correction.
    async function zoomScenario(id, target) {
      const r = await recordScenario({
        id, name: `Summit ${target} zoom`, course: "summit-line", event: "summit-stack",
        viewport: viewports[0], frames: 120,
        setup: async () => {
          const placed = await stage({ x: 0, z: 20, speed: 8, distance: target });
          await page.evaluate((value) => {
            const app = window.KAKISNOW;
            app.rig.distanceTarget = value;
          }, target);
          return { ...placed, zoomTarget: target, method: "real camera distance spring" };
        },
      });
      return r;
    }
    await zoomScenario("zoom-near", 2.6);
    await zoomScenario("zoom-far", 11);

    const report = {
      tool: "tools/snow-burgers/capture-camera-matrix-windows.cjs",
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      executablePath,
      viewports,
      coverage: {
        allSixFinishes16x9: finishes.map((f) => f.name),
        railAreas: railAreas.map((r) => r.name),
        snowcat: "Midnight Resort authored snowcat patrol",
        avalanche: "Whiteout Ridge authored avalanche scalar and renderer",
        bigAir: "classic-board authored takeoff and landing plus reduced motion",
        zoom: [2.6, 11],
        exactAspectRatios: ["16:9", "21:9"],
      },
      thresholds: {
        belowTerrainM: 0.25,
        solidIntersectionM: 0.30,
        violentCameraSpeedMps: 140,
        violentYawRateRadS: 16,
        violentPitchRateRadS: 16,
        violentDistanceRateMps: 90,
      },
      scenarios: scenarioResults,
      consoleErrors: errors,
      webgpuValidationErrors: validation,
      failedRequests,
      ok: scenarioResults.every((entry) => entry.summary.ok) &&
        errors.length === 0 && validation.length === 0 && failedRequests.length === 0,
    };
    writeJson("camera-matrix-report.json", report);
    await context.close();
    context = null;
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    const report = {
      tool: "tools/snow-burgers/capture-camera-matrix-windows.cjs",
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      error: error.stack || error.message,
      scenarios: scenarioResults,
      consoleErrors: errors,
      webgpuValidationErrors: validation,
      failedRequests,
      ok: false,
    };
    writeJson("camera-matrix-report.json", report);
    if (context) await context.close().catch(() => {});
    console.error(error.stack || error.message);
    process.exit(1);
  }
})();
