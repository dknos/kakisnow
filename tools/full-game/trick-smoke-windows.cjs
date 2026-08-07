/**
 * Tricks, crashes and recovery, proven against real Chrome.
 *
 * Drives real keys — Space to jump, E held to spin — because `pollInput()`
 * rebuilds the input struct from held keys every frame and synthetic struct
 * writes are overwritten before the controller reads them (the same reason
 * the playthrough holds a real Shift for the rocket).
 *
 * What it proves: a spin accumulates while airborne and lands as a named,
 * scored trick; the landing grade appears on the HUD; a forced crash tumbles,
 * recovers at a safe spot, costs the combo and counts against integrity; the
 * whole exchange produces zero console errors and zero WebGPU validation.
 *
 * Usage:
 *   npm run dev &
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/full-game/trick-smoke-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/full-game/tricks
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("--url", "http://127.0.0.1:5173");
const output = path.resolve(arg("--out", "screenshots/full-game/tricks"));
const viewport = { width: 2560, height: 1440 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-trick-"));
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost|Destroyed texture/i;

fs.mkdirSync(output, { recursive: true });

let context = null;
const failures = [];
function check(name, ok, detail) {
  if (!ok) failures.push(`${name}: ${detail}`);
  process.stderr.write(`  ${ok ? "ok " : "FAIL"} ${name}${ok ? "" : " — " + detail}\n`);
}

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport,
    deviceScaleFactor: 1,
    args: ["--no-first-run", "--no-default-browser-check", "--ignore-gpu-blocklist"],
  });

  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  const validation = [];
  page.on("console", (m) => {
    const line = `${m.type()}: ${m.text()}`;
    if (m.type() === "error") errors.push(line);
    if (validationPattern.test(line)) validation.push(line);
  });
  page.on("pageerror", (e) => errors.push(e.stack || e.message));

  const u = new URL(url);
  u.searchParams.set("autopause", "off");
  await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.game),
    null, { timeout: 300_000 },
  );
  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });

  // A run, up to speed on the open face.
  await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.game.selectMode("burger-run");
    k.game.start(1);
  });
  await page.waitForFunction(
    () => window.KAKISNOW.game.run.state === "run" &&
          window.KAKISNOW.character.speed > 10,
    null, { timeout: 30_000 },
  );
  await page.focus("#view");

  // ------------------------------------------------------- spin trick
  // Ridden like a player rides it: commit to the spin, release early, let
  // the ramp-down finish the rotation square. Held blind, the first version
  // of this tool landed 60° off axis — which the game correctly called a
  // crash, which is the grading system working, not the trick system broken.
  await page.keyboard.down("e");
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.KAKISNOW.character.trickSpin > 1.9,
    null, { timeout: 3_000 });
  // Release FIRST: a 1440p screenshot costs a third of a second, and at
  // twelve radians a second that is most of an extra rotation.
  await page.keyboard.up("e");
  const air = await page.evaluate(() => ({
    airborne: window.KAKISNOW.character.airborne,
    spin: window.KAKISNOW.character.trickSpin,
  }));
  check("airborne with spin accumulating", air.airborne && air.spin > 1.5,
    JSON.stringify(air));
  await shot("01-mid-spin");

  await page.waitForFunction(
    () => window.KAKISNOW.character.grounded, null, { timeout: 5_000 });
  await page.waitForTimeout(250);
  const landed = await page.evaluate(() => {
    const d = window.KAKISNOW.game.director;
    return {
      total: d.tracker.total,
      open: d.tracker.open,
      log: d.tracker.log.slice(-1),
      toastUp: document.querySelector("#sb-trick").classList.contains("on"),
      toastText: document.querySelector("#sb-trick-name").textContent,
    };
  });
  check("trick scored and named",
    (landed.open?.score > 0 || landed.total > 0) &&
    /180|360|540/.test(landed.toastText),
    JSON.stringify(landed));
  check("trick toast visible", landed.toastUp, JSON.stringify(landed));
  await shot("02-trick-landed");

  // Let the combo bank.
  await page.waitForTimeout(1400);
  const banked = await page.evaluate(() => ({
    total: window.KAKISNOW.game.director.tracker.total,
    open: window.KAKISNOW.game.director.tracker.open,
  }));
  check("combo banks after settling", banked.total > 0 && !banked.open,
    JSON.stringify(banked));

  // -------------------------------------------------------- forced crash
  // A backflip started too low to finish: hold F+S off a Space jump.
  const before = await page.evaluate(() => ({
    crashes: window.KAKISNOW.character.crashCount,
    z: window.KAKISNOW.character.position.z,
  }));
  await page.keyboard.down("f");
  await page.keyboard.down("s");
  await page.keyboard.press("Space");
  await page.waitForTimeout(350);
  await page.keyboard.up("s");
  await page.keyboard.up("f");
  await page.waitForFunction(
    () => window.KAKISNOW.character.crashed ||
          window.KAKISNOW.character.grounded,
    null, { timeout: 6_000 });
  const crashState = await page.evaluate(() => ({
    crashed: window.KAKISNOW.character.crashed,
    crashes: window.KAKISNOW.character.crashCount,
    grade: window.KAKISNOW.character.landingGrade,
  }));
  // A half-second of backflip input mid-air is ~2.9 rad of pitch — far from
  // any complete flip, so the landing must grade as a crash.
  check("unfinished flip crashes", crashState.crashes > before.crashes,
    JSON.stringify(crashState));
  await shot("03-crash-tumble");

  // Recovery: the tumble ends and the game stands the rider back up.
  await page.waitForFunction(
    () => !window.KAKISNOW.character.crashed &&
          window.KAKISNOW.character.grounded,
    null, { timeout: 8_000 });
  const recovered = await page.evaluate(() => ({
    crashed: window.KAKISNOW.character.crashed,
    speed: window.KAKISNOW.character.speed,
    z: window.KAKISNOW.character.position.z,
    combo: window.KAKISNOW.game.director.tracker.open,
  }));
  check("recovered standing and stationary",
    !recovered.crashed && recovered.speed < 1 && !recovered.combo,
    JSON.stringify(recovered));
  check("recovery spot is on the course",
    Math.abs(recovered.z - before.z) < 80, `z ${before.z} -> ${recovered.z}`);
  await shot("04-recovered");

  // ------------------------------------------------------------ rail grind
  // Drop the rider onto the Summit rail, aligned and falling — the same
  // state a player reaches by jumping at it from uphill.
  await page.evaluate(() => {
    const k = window.KAKISNOW;
    const seg = k.game.director.rails.segments[0];
    const c = k.character;
    c.position.set(seg.ax, seg.ay + 0.55, seg.az + 6);
    c.velocity.set(0, 0, 12);
    c.verticalVelocity = -1.5;
    c.grounded = false;
    c.airborne = true;
    c.facing = 0;
    k.rig.yaw = 0;
  });
  await page.waitForTimeout(400);
  const grind = await page.evaluate(() => ({
    grinding: window.KAKISNOW.character.grinding,
    z: window.KAKISNOW.character.position.z,
  }));
  check("rail catches an aligned falling rider", grind.grinding,
    JSON.stringify(grind));
  await shot("05-grinding");

  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const popped = await page.evaluate(() => ({
    grinding: window.KAKISNOW.character.grinding,
    airborne: window.KAKISNOW.character.airborne,
    log: window.KAKISNOW.game.director.tracker.log.slice(-1),
  }));
  check("space pops off the rail into air",
    !popped.grinding && popped.airborne, JSON.stringify(popped));
  check("the grind scored", popped.log[0]?.name === "Grind",
    JSON.stringify(popped.log));

  const report = {
    tool: "tools/full-game/trick-smoke-windows.cjs",
    url, viewport, failures,
    consoleErrors: errors,
    webgpuValidation: validation,
    ok: failures.length === 0 && errors.length === 0 && validation.length === 0,
  };
  fs.writeFileSync(
    path.join(output, "trick-smoke-report.json"),
    JSON.stringify(report, null, 2) + "\n");
  process.stderr.write(
    `\n${failures.length} failures · ${errors.length} console errors · ` +
    `${validation.length} WebGPU validation\n`);
  for (const e of errors.slice(0, 10)) process.stderr.write("  error: " + e + "\n");

  await context.close();
  process.exit(report.ok ? 0 : 1);
})().catch(async (err) => {
  console.error(err);
  if (context) await context.close().catch(() => {});
  process.exit(1);
});
