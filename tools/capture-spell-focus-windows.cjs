const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

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

const url = freeRide(readArgument("--url", "http://127.0.0.1:5173"));
const output = path.resolve(readArgument("--out", "screenshots/_scratch/spell-focus"));
const spell = Number(readArgument("--spell", "1"));
const cameraOffset = Number(readArgument("--camera-offset", "0"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-spell-focus-"));
fs.mkdirSync(output, { recursive: true });

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
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.stack || error.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => window.__KAKISNOW__?.ready === true, null, { timeout: 240_000 });
  await page.waitForTimeout(1800);
  await page.evaluate(offset => {
    const controller = window.__KAKISNOW_DEBUG__.controller;
    controller.cameraYaw = controller.facing + offset;
  }, cameraOffset);
  await page.waitForTimeout(500);
  await page.keyboard.press(`Digit${spell}`);

  const waits = [250, 500, 500, 750, 1000];
  const frames = [];
  for (let index = 0; index < waits.length; index += 1) {
    await page.waitForTimeout(waits[index]);
    const elapsed = waits.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
    const filename = `spell-${spell}-${String(elapsed).padStart(4, "0")}ms.png`;
    await page.screenshot({ path: path.join(output, filename) });
    frames.push(await page.evaluate(() => {
      const debug = window.__KAKISNOW_DEBUG__;
      return {
        player: {
          x: debug.controller.position.x,
          y: debug.controller.position.y,
          z: debug.controller.position.z,
          facing: debug.controller.facing,
        },
        camera: {
          x: debug.camera.position.x,
          y: debug.camera.position.y,
          z: debug.camera.position.z,
          rotationX: debug.camera.rotation.x,
          rotationY: debug.camera.rotation.y,
        },
        spellMeshes: debug.scene.meshes
          .filter(mesh => mesh.name.startsWith("spell-") || mesh.name.startsWith("crystal-"))
          .map(mesh => {
            const positions = mesh.getVerticesData("position");
            const bounds = mesh.getBoundingInfo();
            return {
              name: mesh.name,
              enabled: mesh.isEnabled(),
              visible: mesh.isVisible,
              vertices: mesh.getTotalVertices(),
              position: [mesh.position.x, mesh.position.y, mesh.position.z],
              firstVertex: positions ? [positions[0], positions[1], positions[2]] : null,
              boundsMin: [
                bounds.boundingBox.minimumWorld.x,
                bounds.boundingBox.minimumWorld.y,
                bounds.boundingBox.minimumWorld.z,
              ],
              boundsMax: [
                bounds.boundingBox.maximumWorld.x,
                bounds.boundingBox.maximumWorld.y,
                bounds.boundingBox.maximumWorld.z,
              ],
            };
          }),
      };
    }));
  }

  const report = { spell, frames, errors };
  fs.writeFileSync(path.join(output, `spell-${spell}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  if (errors.length > 0) process.exitCode = 1;
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      console.error(`Could not remove temporary profile: ${error.message}`);
    }
  });
