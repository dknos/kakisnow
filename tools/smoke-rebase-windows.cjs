const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

/**
 * Every capture tool here photographs the snow study, not the game.
 *
 * Snow-Burgers boots to its title screen, and that screen carries a 90%
 * darkening scrim over the whole viewport — which does not fail these tools'
 * assertions, because they read numbers out of `KAKISNOW`, but does make every
 * frame they save a dark title card. Measured at a mean brightness of 22 out of
 * 255 before this was added.
 *
 * `?mode=free-ride` is the original open mountain with no game interface over
 * it, which is the state all of these were written against.
 */
function freeRide(target) {
  const u = new URL(target);
  if (!u.searchParams.has("mode")) u.searchParams.set("mode", "free-ride");
  return u.toString();
}

const url = freeRide(process.argv[2] || "http://127.0.0.1:4195");
const out = path.resolve(process.argv[3] || "screenshots/_scratch/rebase-smoke");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-rebase-"));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-gpu-blocklist",
      "--enable-precise-memory-info",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  const messages = [];
  const errors = [];
  const validationWarnings = [];
  page.on("console", (message) => {
    const entry = `${message.type()}: ${message.text()}`;
    messages.push(entry);
    if (message.type() === "error") errors.push(entry);
    if (/GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Destroyed texture|Validation Error/i.test(entry)) {
      validationWarnings.push(entry);
    }
  });
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    errors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(out, "00-loading.png") });
  await page.waitForFunction(() => Boolean(window.KAKISNOW?.scene), null, {
    timeout: 240_000,
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(out, "01-beauty.png") });
  const rockerPose = await page.evaluate(() => {
    const app = window.KAKISNOW;
    let bestX = 0;
    let bestZ = 0;
    let bestH = app.terrain.heightAt(0, 0);
    let bestScore = Number.POSITIVE_INFINITY;
    for (let z = -30; z <= 30; z += 3) {
      for (let x = -30; x <= 30; x += 3) {
        const h = app.terrain.heightAt(x, z);
        const sx = Math.abs(app.terrain.heightAt(x + 0.6, z) -
          app.terrain.heightAt(x - 0.6, z));
        const sz = Math.abs(app.terrain.heightAt(x, z + 0.6) -
          app.terrain.heightAt(x, z - 0.6));
        const score = sx + sz - h * 0.012;
        if (score < bestScore) {
          bestScore = score;
          bestX = x;
          bestZ = z;
          bestH = h;
        }
      }
    }
    app.character.position.set(bestX, bestH, bestZ);
    app.character.velocity.setAll(0);
    app.character.prevVelocity.setAll(0);
    app.character.facing = 0.35;
    app.rig._first = true;
    app.rig.groundLift = 0;
    app.rig.yaw = app.character.facing + Math.PI - 0.28;
    app.rig.pitch = 0.12;
    app.rig.distance = 6.2;
    app.rig.distanceTarget = 6.2;
    app.setHeroStyle("rockerkaki");
    return { x: bestX, y: bestH, z: bestZ, score: bestScore };
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, "02-rockerkaki.png") });
  await page.keyboard.press("F1");
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, "03-overlay.png") });
  await page.keyboard.press("F1");
  const runtime = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    return {
      userAgent: navigator.userAgent,
      adapter: adapter?.info || null,
      width: window.KAKISNOW.engine.getRenderWidth(),
      height: window.KAKISNOW.engine.getRenderHeight(),
      meshes: window.KAKISNOW.scene.meshes.map((mesh) => ({
        name: mesh.name,
        visible: mesh.isVisible,
        enabled: mesh.isEnabled(),
        vertices: mesh.getTotalVertices(),
        indices: mesh.getTotalIndices(),
      })),
      stats: {
        drawCalls: window.KAKISNOW.perfStats.drawCalls,
        triangles: window.KAKISNOW.perfStats.triangles,
      },
    };
  });
  const report = {
    url, rockerPose, runtime, errors, validationWarnings, messages,
  };
  fs.writeFileSync(
    path.join(out, "smoke-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  if (errors.length || validationWarnings.length) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(profile, { recursive: true, force: true });
  });
