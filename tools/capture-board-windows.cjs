/**
 * Board and trench capture, driven through the installed Windows Chrome.
 *
 * The thing this has to prove is heading-dependent, so it cannot be proved by
 * one screenshot. The brush that cuts the trench is elongated, and an
 * elongation that is mirrored rather than merely offset looks correct at 45
 * degrees and wrong everywhere else. So the run drives the same straight
 * descent twice, at two headings ninety degrees apart, and photographs the
 * groove from behind each time. A groove that follows the board in both is the
 * evidence; a groove that follows it in one is the bug.
 *
 * Usage, from WSL against a dev server on the Windows loopback:
 *
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/capture-board-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/_scratch/board
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
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

const url = freeRide(arg("--url", "http://127.0.0.1:5173"));
const output = path.resolve(arg("--out", "screenshots/_scratch/board"));
const viewport = { width: 2560, height: 1440 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-board-"));
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost|Destroyed texture/i;

fs.mkdirSync(output, { recursive: true });

let context = null;

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport,
    deviceScaleFactor: 1,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-gpu-blocklist",
      "--disable-frame-rate-limit",
      "--disable-gpu-vsync",
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  const validation = [];
  const warnings = [];

  page.on("console", message => {
    const line = `${message.type()}: ${message.text()}`;
    if (message.type() === "error") errors.push(line);
    if (message.type() === "warning") warnings.push(line);
    if (validationPattern.test(line)) validation.push(line);
  });
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("requestfailed", request => {
    errors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.rocker),
    null,
    { timeout: 300_000 },
  );

  const shots = [];
  const shot = async (name) => {
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    shots.push(name);
  };

  /**
   * Drop the rider on fresh snow with a still camera.
   *
   * Every reset lands somewhere new. The terrain state buffer has no clear —
   * it scrolls with the player and zeroes what wraps in — so a run that started
   * where the last one finished would photograph the last run's trench and
   * call it this one's. Teleporting well past the 80 m window is the clear.
   */
  let plot = 0;
  const reset = (facing, yaw, pitch, distance, at) => page.evaluate(
    ({ facing, yaw, pitch, distance, x, z }) => {
      const k = window.KAKISNOW;
      k.input.surf = false;
      if (window.__drive) cancelAnimationFrame(window.__drive);
      window.__drive = 0;
      k.character.position.set(x, 0, z);
      k.character.position.y = k.terrain.heightAt(x, z);
      k.character.velocity.set(0, 0, 0);
      k.character.facing = facing;
      k.character.surf = 0;
      k.character.carve = 0;
      k.character.lean = 0;
      k.rig.yaw = yaw;
      k.rig.pitch = pitch;
      k.rig.distance = distance;
      k.rig.distanceTarget = distance;
    },
    {
      facing, yaw, pitch, distance,
      x: at ? at[0] : (plot % 4) * 170 - 255,
      z: at ? at[1] : Math.floor(plot++ / 4) * 170 - 170,
    },
  );

  /** Hold the surf, and hold a constant steering offset while it runs. */
  const drive = (steer) => page.evaluate((steer) => {
    const k = window.KAKISNOW;
    k.input.surf = true;
    if (window.__drive) cancelAnimationFrame(window.__drive);
    const tick = () => {
      k.rig.yaw = k.character.facing + steer;
      window.__drive = requestAnimationFrame(tick);
    };
    tick();
  }, steer);

  /** Stop dead so the groove behind is the groove that was just cut. */
  const halt = () => page.evaluate(() => {
    const k = window.KAKISNOW;
    k.input.surf = false;
    if (window.__drive) cancelAnimationFrame(window.__drive);
    window.__drive = 0;
    k.character.velocity.set(0, 0, 0);
  });

  /** Look back down the rider's own track. */
  const lookBack = (pitch, distance) => page.evaluate(
    ({ pitch, distance }) => {
      const k = window.KAKISNOW;
      k.rig.yaw = k.character.facing + Math.PI;
      k.rig.pitch = pitch;
      k.rig.distance = distance;
      k.rig.distanceTarget = distance;
    },
    { pitch, distance },
  );

  const readState = () => page.evaluate(() => {
    const k = window.KAKISNOW;
    const r = k.rocker;
    const round = v => Number(v.toFixed(3));

    // Where the two objects actually are, in world metres. Eyeballing a
    // screenshot cannot tell a board that is too small from one that is too far
    // away, and both of those look like "the board is wrong".
    const boardNames = new Set();
    r.boardAsset.getChildMeshes(false).forEach(m => boardNames.add(m.uniqueId));
    const box = (meshes) => {
      let lo = [1e9, 1e9, 1e9];
      let hi = [-1e9, -1e9, -1e9];
      meshes.forEach(m => {
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        lo = [Math.min(lo[0], b.minimumWorld.x), Math.min(lo[1], b.minimumWorld.y),
              Math.min(lo[2], b.minimumWorld.z)];
        hi = [Math.max(hi[0], b.maximumWorld.x), Math.max(hi[1], b.maximumWorld.y),
              Math.max(hi[2], b.maximumWorld.z)];
      });
      return {
        min: lo.map(round), max: hi.map(round),
        size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map(round),
      };
    };
    const drawn = r.meshes.filter(m => m.getTotalVertices() > 0);
    const geometry = {
      board: box(drawn.filter(m => boardNames.has(m.uniqueId))),
      rider: box(drawn.filter(m => !boardNames.has(m.uniqueId))),
      groundY: round(k.character.groundY),
      playerY: round(k.character.position.y),
    };

    return {
      geometry,
      heroTriangles: r.triangles,
      boardAvailable: r.boardAvailable,
      boardSink: Number(r.boardSink.toFixed(4)),
      boardPitchDeg: Number((r.boardRoot.rotation.x * 57.2958).toFixed(2)),
      boardRollDeg: Number((r.boardRoot.rotation.z * 57.2958).toFixed(2)),
      boardLocalY: Number(r.boardRoot.position.y.toFixed(4)),
      deckHeight: Number(r._deckHeight.toFixed(4)),
      facingDeg: Number((k.character.facing * 57.2958).toFixed(2)),
      speed: Number(k.character.speed.toFixed(2)),
      carve: Number(k.character.carve.toFixed(3)),
      grounded: k.character.grounded,
    };
  });

  const states = {};

  // ---------------------------------------------------- the board, up close
  await reset(0, 2.35, 0.30, 7.0);
  await page.waitForTimeout(1400);
  await shot("01-board-three-quarter");
  states.rest = await readState();

  await reset(0, Math.PI * 0.5, 0.10, 6.5);
  await page.waitForTimeout(1400);
  await shot("02-board-side");

  await reset(0, 0.5, 0.95, 8.0);
  await page.waitForTimeout(1400);
  await shot("03-board-from-above");

  // The hardest case, and the one every visitor sees first: the Summit Line
  // start sits on a 43-degree face. Conforming the board to that is correct and
  // conforming the rider rigidly to the board is not, so this is the shot that
  // decides whether the two are separated by the right amount.
  await reset(0, 2.1, 0.16, 7.0, [0, 0]);
  await page.waitForTimeout(1600);
  await shot("08-start-steep-face");
  states.steep = await readState();

  // ------------------------------------------- the trench, at two headings
  for (const [name, facing] of [["04-trench-heading-0", 0],
                                ["05-trench-heading-90", Math.PI * 0.5]]) {
    await reset(facing, facing, 0.24, 7.5);
    await page.waitForTimeout(600);
    await drive(0);
    await page.waitForTimeout(3800);
    states[name] = await readState();
    await halt();
    await lookBack(0.42, 11);
    await page.waitForTimeout(1400);
    await shot(name);
  }

  // ------------------------------------------------------------- a carve
  await reset(0, 0, 0.24, 7.5);
  await page.waitForTimeout(600);
  await drive(0);
  await page.waitForTimeout(1800);
  await drive(0.62);
  await page.waitForTimeout(1700);
  states.carve = await readState();
  await shot("06-carve-behind");
  await halt();
  await lookBack(0.46, 13);
  await page.waitForTimeout(1400);
  await shot("07-carve-trench");

  // ------------------------------------------------------ takeoff and landing
  // The board's mark on the way down is not the trench: the whole effective
  // edge arrives at once and prints its own footprint. That brush changed
  // shape, and nothing above would show it going wrong.
  await reset(0, 0, 0.22, 8.0);
  await page.waitForTimeout(600);
  await drive(0);
  await page.waitForTimeout(2200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(260);
  states.air = await readState();
  await shot("09-airborne");
  // Back on the snow before photographing what the landing left.
  await page.waitForFunction(
    () => window.KAKISNOW.character.grounded === true,
    null,
    { timeout: 10_000 },
  );
  states.landed = await readState();
  await page.waitForTimeout(240);
  await halt();
  await lookBack(0.40, 10);
  await page.waitForTimeout(1400);
  await shot("10-landing-slap");

  const report = {
    url,
    when: new Date().toISOString(),
    shots,
    states,
    errors,
    validation,
    warnings: warnings.filter(w => /kakisnow/i.test(w)),
  };
  fs.writeFileSync(
    path.join(output, "board-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));

  if (errors.length || validation.length) {
    process.exitCode = 1;
  }
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  });
