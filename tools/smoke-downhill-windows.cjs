const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:5173";
const output = path.resolve(process.argv[3] || "screenshots/_scratch/downhill");
const faceOnly = process.argv.includes("--face-only");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-downhill-"));
fs.mkdirSync(output, { recursive: true });
let context = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-gpu-blocklist",
      "--enable-precise-memory-info",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  const consoleErrors = [];
  const gpuErrors = [];
  const errorPattern =
    /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost/i;

  page.on("console", message => {
    const line = `${message.type()}: ${message.text()}`;
    if (message.type() === "error") consoleErrors.push(line);
    if (errorPattern.test(line)) gpuErrors.push(line);
  });
  page.on("pageerror", error => consoleErrors.push(error.stack || error.message));
  page.on("requestfailed", request => {
    consoleErrors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.scene),
    null,
    { timeout: 240_000 },
  );
  await page.waitForTimeout(1200);

  const rig = await page.evaluate(() => {
    const rocker = window.KAKISNOW.rocker;
    const skinned = rocker.meshes.find(mesh => Boolean(mesh.skeleton));
    return {
      rigged: rocker.rigged,
      boneCount: rocker.rigBoneCount,
      boneNames: rocker.rigBoneNames,
      jointDrivers: rocker._rigJoints.size,
      hasIndices: skinned?.isVerticesDataPresent("matricesIndices") || false,
      hasWeights: skinned?.isVerticesDataPresent("matricesWeights") || false,
      animationGroups: window.KAKISNOW.scene.animationGroups.map(group => group.name),
    };
  });
  assert(rig.rigged, "RockerKaki GLB did not load a skeleton");
  // Blender retains a tenth, non-deforming root control; export_def_bones keeps
  // the runtime skin palette to the nine bones that actually influence vertices.
  assert(rig.boneCount === 9, `expected 9 deform bones, got ${rig.boneCount}`);
  assert(rig.jointDrivers === 8, `expected 8 runtime pose joints, got ${rig.jointDrivers}`);
  assert(rig.hasIndices && rig.hasWeights, "skinning vertex attributes are missing");
  assert(rig.animationGroups.includes("RockerBreath"), "Blender action is missing");

  const topology = await page.evaluate(() => {
    const terrain = window.KAKISNOW.terrain;
    const sample = (x, z) => Number(terrain.heightAt(x, z).toFixed(3));
    const zs = [0, 62, 76, 82, 89, 186, 205, 214, 223, 280, 320, 360, 410, 440, 472, 480, 520];
    return {
      centre: Object.fromEntries(zs.map(z => [z, sample(0, z)])),
      profile: Array.from({ length: 261 }, (_, index) => {
        const z = index * 2;
        return [z, sample(0, z)];
      }),
      pipes: [
        { z: 320, left: sample(-21, 320), centre: sample(0, 320), right: sample(21, 320) },
        { z: 430, left: sample(-21, 430), centre: sample(0, 430), right: sample(21, 430) },
      ],
      minHeight: terrain.heightfield.minHeight,
      maxHeight: terrain.heightfield.maxHeight,
    };
  });
  fs.writeFileSync(
    path.join(output, "topology.json"),
    `${JSON.stringify(topology, null, 2)}\n`,
  );

  const profileDrops = topology.profile.slice(1).map((point, index) =>
    topology.profile[index][1] - point[1]
  );
  assert(
    Math.max(...profileDrops) < 1.8,
    `course contains a cliff-like 2 m drop: ${Math.max(...profileDrops).toFixed(2)} m`
  );
  for (const pipe of topology.pipes) {
    assert(pipe.left > pipe.centre + 4, `left wall is too low at z=${pipe.z}`);
    assert(pipe.right > pipe.centre + 4, `right wall is too low at z=${pipe.z}`);
  }

  const setPose = (z, options = {}) => page.evaluate(({ z, options }) => {
    const app = window.KAKISNOW;
    const ch = app.character;
    const y = app.terrain.heightAt(options.x || 0, z);
    ch.position.set(options.x || 0, y, z);
    ch.velocity.set(0, 0, options.speed || 0);
    ch.prevVelocity.copyFrom(ch.velocity);
    ch.acceleration.setAll(0);
    ch.facing = 0;
    ch.groundY = y;
    ch.grounded = true;
    ch.airborne = false;
    ch.verticalVelocity = 0;
    ch.airTime = 0;
    ch.jumpCount = 0;
    ch.landed = false;
    ch.landingImpact = 0;
    app.rocker._landingPose = 0;
    app.input.surf = Boolean(options.surf);
    ch.surf = options.surf ? 1 : 0;
    app.rig._first = true;
    app.rig.groundLift = 0;
    app.rig.yaw = options.yaw ?? 0;
    app.rig.pitch = options.pitch || 0.20;
    app.rig.distance = options.distance || 10.5;
    app.rig.distanceTarget = app.rig.distance;
  }, { z, options });

  if (faceOnly) {
    await setPose(10, {
      yaw: Math.PI, pitch: 0.04, distance: 5.4,
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(output, "face-rest.png") });

    await setPose(10, {
      yaw: Math.PI, pitch: 0.04, distance: 5.4,
    });
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, "face-air.png") });

    const faceReport = await page.evaluate(() => ({
      meshes: window.KAKISNOW.rocker.meshes.map(mesh => mesh.name),
      pose: window.KAKISNOW.rocker.rigPose,
      skeletons: window.KAKISNOW.scene.skeletons.map(skeleton => ({
        name: skeleton.name,
        bones: skeleton.bones.map(bone => bone.name),
      })),
    }));
    fs.writeFileSync(
      path.join(output, "face-report.json"),
      `${JSON.stringify(faceReport, null, 2)}\n`,
    );
    assert(
      faceReport.meshes.length === 1 && faceReport.meshes[0] === "RockerKaki",
      `unexpected under-character geometry: ${faceReport.meshes.join(", ")}`
    );
    console.log(JSON.stringify(faceReport, null, 2));
    return;
  }

  await setPose(36, { speed: 10, surf: true, pitch: 0.24, distance: 8.8 });
  await page.waitForTimeout(120);
  const ridePoseA = await page.evaluate(() => {
    const rocker = window.KAKISNOW.rocker;
    const arm = rocker._rigJoints.get("arm.L").node.rotationQuaternion;
    return {
      arm: [arm.x, arm.y, arm.z, arm.w],
      rootY: rocker.assetRoot.position.y,
      visualRoll: rocker.visualRoot.rotation.z,
    };
  });
  await page.screenshot({ path: path.join(output, "01-ride-motion-a.png") });
  await page.waitForTimeout(260);
  const ridePoseB = await page.evaluate(() => {
    const rocker = window.KAKISNOW.rocker;
    const arm = rocker._rigJoints.get("arm.L").node.rotationQuaternion;
    return {
      arm: [arm.x, arm.y, arm.z, arm.w],
      rootY: rocker.assetRoot.position.y,
      visualRoll: rocker.visualRoot.rotation.z,
    };
  });
  await page.screenshot({ path: path.join(output, "01-ride-motion-b.png") });
  const poseAngle = (a, b) => {
    const dot = Math.min(1, Math.abs(
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
    ));
    return 2 * Math.acos(dot);
  };
  const rideAnimation = {
    armRadians: poseAngle(ridePoseA.arm, ridePoseB.arm),
    rootTravel: Math.abs(ridePoseA.rootY - ridePoseB.rootY),
    rollTravel: Math.abs(ridePoseA.visualRoll - ridePoseB.visualRoll),
  };
  assert(rideAnimation.rootTravel > 0.015, "grounded ride bounce is visually static");
  assert(rideAnimation.rollTravel > 0.025, "grounded ride body is visually static");

  await setPose(36, { pitch: 0.24, distance: 10.8 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, "01-first-hit.png") });

  await page.keyboard.press("Space");
  await page.waitForTimeout(310);
  const spaceJump = await page.evaluate(() => {
    const ch = window.KAKISNOW.character;
    const rocker = window.KAKISNOW.rocker;
    return {
      grounded: ch.grounded,
      airborne: ch.airborne,
      clearance: ch.position.y - ch.groundY,
      verticalVelocity: ch.verticalVelocity,
      hud: document.getElementById("course-feature")?.textContent || "",
      rigPose: rocker.rigPose,
      visualPitch: rocker.visualRoot.rotation.x,
      visualYaw: rocker.visualRoot.rotation.y,
      visualRoll: rocker.visualRoot.rotation.z,
    };
  });
  assert(spaceJump.airborne, "Space did not put the rider airborne");
  assert(spaceJump.clearance > 0.8, "Space jump clearance is not visually readable");
  assert(spaceJump.visualPitch < -0.12, "air pose did not pitch the rider visibly");
  await page.screenshot({ path: path.join(output, "02-space-air.png") });
  await page.waitForFunction(() =>
    window.KAKISNOW.character.grounded
      && window.KAKISNOW.rocker._landingPose > 0.1,
  null, { timeout: 4_000 });
  const landingAnimation = await page.evaluate(() => ({
    pose: window.KAKISNOW.rocker._landingPose,
    state: window.KAKISNOW.rocker.rigPose,
  }));
  assert(landingAnimation.pose > 0.1, "landing compression was not held visibly");
  await page.screenshot({ path: path.join(output, "02b-landing-compression.png") });

  await setPose(32, { speed: 15, surf: true, pitch: 0.16, distance: 9.5 });
  await page.waitForFunction(() => {
    const ch = window.KAKISNOW.character;
    return ch.position.z > 50 && !ch.grounded;
  }, null, { timeout: 12_000 });
  // Let the ballistic path separate visibly from the lip; the first airborne
  // frame is intentionally only millimetres above the reconstructed surface.
  await page.waitForTimeout(180);
  const naturalJump = await page.evaluate(() => {
    const ch = window.KAKISNOW.character;
    return {
      z: ch.position.z,
      y: ch.position.y,
      groundY: ch.groundY,
      clearance: ch.position.y - ch.groundY,
      verticalVelocity: ch.verticalVelocity,
      speed: ch.speed,
      jumpCount: ch.jumpCount,
    };
  });
  assert(naturalJump.clearance > 0.03, "ramp takeoff remained glued to terrain");
  await page.screenshot({ path: path.join(output, "03-natural-takeoff.png") });

  await setPose(316, { pitch: 0.18, distance: 10.8 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, "04-north-pipe.png") });

  // A real end-to-end traverse catches the reported failure mode: on the old
  // artificial cliffs, slope assist could reverse and then strand the rider.
  await setPose(0, { speed: 12, surf: true, pitch: 0.18, distance: 10.2 });
  const traverse = [];
  let stalledSamples = 0;
  let maxStalledSamples = 0;
  let previousZ = 0;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500);
    const sample = await page.evaluate(() => {
      const ch = window.KAKISNOW.character;
      const forwardX = Math.sin(ch.facing);
      const forwardZ = Math.cos(ch.facing);
      return {
        z: ch.position.z,
        y: ch.position.y,
        speed: ch.speed,
        forwardSpeed: ch.velocity.x * forwardX + ch.velocity.z * forwardZ,
        grounded: ch.grounded,
        jumpCount: ch.jumpCount,
      };
    });
    traverse.push(sample);
    assert(
      sample.forwardSpeed > -0.25,
      `rider reversed during traverse at z=${sample.z.toFixed(1)}`
    );
    if (sample.z - previousZ < 0.4) stalledSamples++;
    else stalledSamples = 0;
    maxStalledSamples = Math.max(maxStalledSamples, stalledSamples);
    previousZ = sample.z;
    if (sample.z >= 520) break;
  }
  const traverseResult = {
    finishZ: traverse.at(-1).z,
    minForwardSpeed: Math.min(...traverse.map(sample => sample.forwardSpeed)),
    maxStalledSeconds: maxStalledSamples * 0.5,
    jumps: traverse.at(-1).jumpCount,
    samples: traverse.length,
  };
  assert(traverseResult.finishZ >= 520, "full course traverse did not reach the runout");
  assert(traverseResult.maxStalledSeconds < 1.5, "rider became stuck during traverse");

  const runtime = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    const app = window.KAKISNOW;
    return {
      adapter: adapter?.info || null,
      fps: app.engine.getFps(),
      render: [app.engine.getRenderWidth(), app.engine.getRenderHeight()],
      hero: app.S.heroStyle,
      hud: {
        feature: document.getElementById("course-feature")?.textContent || "",
        distance: document.getElementById("course-distance")?.textContent || "",
      },
    };
  });

  const topologySummary = {
    centre: topology.centre,
    pipes: topology.pipes,
    minHeight: topology.minHeight,
    maxHeight: topology.maxHeight,
    maxTwoMetreDrop: Math.max(...profileDrops),
  };
  const report = {
    url,
    topology: topologySummary,
    rig,
    rideAnimation,
    spaceJump,
    landingAnimation,
    naturalJump,
    traverse: traverseResult,
    runtime,
    consoleErrors,
    gpuErrors,
  };
  fs.writeFileSync(
    path.join(output, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));

  assert(consoleErrors.length === 0, `browser errors: ${consoleErrors.join("\n")}`);
  assert(gpuErrors.length === 0, `WebGPU errors: ${gpuErrors.join("\n")}`);
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    const close = context ? context.close().catch(() => {}) : Promise.resolve();
    return close.then(() => {
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
      } catch {
        // Chrome can retain its Windows crash-report directory briefly after exit.
      }
    });
  });
