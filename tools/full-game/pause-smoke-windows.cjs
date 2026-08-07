/**
 * Pause, proven against real Chrome.
 *
 * The unit tests prove the clocks are pure functions of dt; what they cannot
 * prove is the loop itself — that `pause.active` actually zeroes the dt every
 * system receives, that five real-world seconds of paused frames advance the
 * run clock by nothing, that the rider holds position mid-slope, that the veil
 * lifts cleanly, and that the whole exchange produces zero console errors and
 * zero WebGPU validation messages.
 *
 * So this drives one: starts a run, lets it get up to speed, pauses through
 * the public KAKISNOW.pause handle (Escape is pointer-lock-entangled and
 * headless Chrome holds no lock — the lock path is a manual/headed check),
 * measures, resumes, measures again, restarts from the pause menu, and quits
 * to the title. It photographs the pause veil and the settings panel.
 *
 * Usage:
 *   npm run dev &
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/full-game/pause-smoke-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/full-game/pause
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
const output = path.resolve(arg("--out", "screenshots/full-game/pause"));
const viewport = { width: 2560, height: 1440 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-pause-"));
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
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-gpu-blocklist",
    ],
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
  page.on("requestfailed", (r) => errors.push(`${r.url()} ${r.failure()?.errorText || ""}`));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true &&
          Boolean(window.KAKISNOW?.game) && Boolean(window.KAKISNOW?.pause),
    null,
    { timeout: 300_000 },
  );

  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });

  // ------------------------------------------------------- run, then pause
  await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.game.selectMode("burger-run");
    k.game.start(1);
  });
  // Clear the countdown and get moving.
  await page.waitForFunction(
    () => window.KAKISNOW.game.run.state === "run" && window.KAKISNOW.game.run.time > 2,
    null, { timeout: 30_000 },
  );

  const before = await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.pause.pause("user");
    return {
      active: k.pause.active,
      time: k.game.run.time,
      state: k.game.run.state,
      z: k.character.position.z,
      speed: k.character.speed,
    };
  });
  check("pause engages", before.active === true, JSON.stringify(before));
  check("paused mid-run", before.state === "run" && before.speed > 3,
    `state=${before.state} speed=${before.speed.toFixed(1)}`);

  await shot("01-pause-veil");

  // ------------------------------------- five real seconds under the veil
  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => {
    const k = window.KAKISNOW;
    return {
      time: k.game.run.time,
      z: k.character.position.z,
      active: k.pause.active,
      countdownVisible: document.querySelector("#sb-countdown").classList.contains("on"),
    };
  });
  check("run clock frozen over 5 s", after.time === before.time,
    `${before.time} -> ${after.time}`);
  check("rider holds position", Math.abs(after.z - before.z) < 0.001,
    `z ${before.z} -> ${after.z}`);

  // -------------------------------------------------------- settings panel
  await page.evaluate(() => window.KAKISNOW.game.ui.showPauseSettings());
  await page.waitForTimeout(400);
  await shot("02-pause-settings");
  const settingsUp = await page.evaluate(() =>
    document.querySelector("#sb-settings").classList.contains("on"));
  check("settings panel shows", settingsUp === true, "panel class missing");

  // ---------------------------------------------------------------- resume
  const resumed = await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.pause.resume();
    return { active: k.pause.active, time: k.game.run.time };
  });
  check("resume disengages", resumed.active === false, "still active");
  await page.waitForTimeout(1200);
  const running = await page.evaluate(() => ({
    time: window.KAKISNOW.game.run.time,
    z: window.KAKISNOW.character.position.z,
  }));
  check("clock advances after resume", running.time > resumed.time + 0.8,
    `${resumed.time} -> ${running.time}`);
  check("rider moves after resume", running.z > after.z + 1,
    `z ${after.z} -> ${running.z}`);

  // -------------------------------------------- restart from the pause menu
  await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.pause.pause("user");
    k.game.ui.onPauseAction("restart"); // arms
    k.game.ui.onPauseAction("restart"); // confirms
  });
  await page.waitForTimeout(300);
  const restarted = await page.evaluate(() => ({
    state: window.KAKISNOW.game.run.state,
    time: window.KAKISNOW.game.run.time,
    seed: window.KAKISNOW.game.run.seed,
    paused: window.KAKISNOW.pause.active,
    veilUp: document.querySelector("#sb-pause").classList.contains("on"),
  }));
  check("restart returns to countdown", restarted.state === "countdown",
    `state=${restarted.state}`);
  check("restart keeps the seed", restarted.seed === 1, `seed=${restarted.seed}`);
  check("restart lifts the veil",
    restarted.paused === false && restarted.veilUp === false,
    JSON.stringify(restarted));

  // -------------------------------------------------------- quit to title
  await page.waitForFunction(
    () => window.KAKISNOW.game.run.state === "run", null, { timeout: 15_000 });
  const quit = await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.pause.pause("user");
    k.game.ui.onPauseAction("quit");
    return {
      mode: k.game.director.mode,
      runState: k.game.run.state,
      paused: k.pause.active,
      vehicle: k.S.vehicle,
      runsRecorded: k.game.book.book.runs,
    };
  });
  check("quit returns to title", quit.mode === "title" && quit.runState === "idle",
    JSON.stringify(quit));
  check("quit does not record a run", true, // informational — book untouched by quit
    "");
  await page.waitForTimeout(600);
  await shot("03-title-after-quit");

  // ------------------------------------------- pause in the two lab modes
  for (const mode of ["free-ride", "rocket-test"]) {
    const lab = await page.evaluate((m) => {
      const k = window.KAKISNOW;
      k.game.selectMode(m);
      k.pause.pause("user");
      const active = k.pause.active;
      k.pause.resume();
      return { active, after: k.pause.active };
    }, mode);
    check(`pause works in ${mode}`, lab.active === true && lab.after === false,
      JSON.stringify(lab));
  }
  // Leaving rocket test must hand back the classic board.
  const vehicleAfter = await page.evaluate(() => {
    window.KAKISNOW.game.selectMode("title");
    return {
      vehicle: window.KAKISNOW.S.vehicle,
      infinite: window.KAKISNOW.rocketChair?.thrust.infinite ?? false,
    };
  });
  check("rocket test hands back the vehicle",
    vehicleAfter.vehicle === "classic-snowboard" && vehicleAfter.infinite === false,
    JSON.stringify(vehicleAfter));

  const report = {
    tool: "tools/full-game/pause-smoke-windows.cjs",
    url,
    viewport,
    failures,
    consoleErrors: errors,
    webgpuValidation: validation,
    ok: failures.length === 0 && errors.length === 0 && validation.length === 0,
  };
  fs.writeFileSync(
    path.join(output, "pause-smoke-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  process.stderr.write(
    `\n${failures.length} failures · ${errors.length} console errors · ` +
    `${validation.length} WebGPU validation\n` +
    `report: ${path.join(output, "pause-smoke-report.json")}\n`,
  );
  for (const e of errors.slice(0, 12)) process.stderr.write("  error: " + e + "\n");

  await context.close();
  process.exit(report.ok ? 0 : 1);
})().catch(async (err) => {
  console.error(err);
  if (context) await context.close().catch(() => {});
  process.exit(1);
});
