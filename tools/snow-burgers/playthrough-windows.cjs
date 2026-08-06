/**
 * A complete Burger Run, played by a robot, through the installed Windows Chrome.
 *
 * The thing this proves is that the loop closes. A build can boot, load every
 * model, place a valid route and still not be a game — the pickups might not
 * trigger at speed, the finish might not detect, the assembly might not hand
 * over to the results screen. None of that is visible from a screenshot of the
 * start gate, and none of it is reachable from a unit test, because the run
 * depends on the GPU-baked heightfield and on the real controller integrating
 * against it.
 *
 * So this drives an actual descent: it steers toward the nearest ingredient it
 * has not collected, takes each one at whatever speed the mountain gives it,
 * turns for the grill once the order is full, and reports what the game
 * thought happened. It photographs each pickup and the finish on the way past.
 *
 * The autopilot steers the way a player does, through `rig.yaw` — the
 * controller derives its steering from the angle between its facing and the
 * rig, so writing the rig is writing the stick. It does not teleport, does not
 * write velocities, and does not touch the run state. A route it cannot ride is
 * a route a player cannot ride, which is the point.
 *
 * Usage, from WSL against a dev server on the Windows loopback:
 *
 *   npm run dev &
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/snow-burgers/playthrough-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/snow-burgers/playthrough --seeds 3
 *
 * Exits non-zero if any run fails to complete, or if the page reports a
 * WebGPU validation error or an uncaught exception at any point.
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
const output = path.resolve(arg("--out", "screenshots/snow-burgers/playthrough"));
const seedCount = Number(arg("--seeds", "3"));
const firstSeed = Number(arg("--first-seed", "1"));
const timeLimit = Number(arg("--limit", "150"));
const viewport = { width: 2560, height: 1440 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-play-"));
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

  page.on("console", (message) => {
    const line = `${message.type()}: ${message.text()}`;
    if (message.type() === "error") errors.push(line);
    if (validationPattern.test(line)) validation.push(line);
  });
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    errors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.game),
    null,
    { timeout: 300_000 },
  );

  const shots = [];
  const shot = async (name) => {
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    shots.push(name);
  };

  await shot("00-title");

  /**
   * Install the autopilot inside the page.
   *
   * It lives on the page rather than being stepped from Node because a steering
   * decision taken over a websocket round trip is a steering decision taken
   * several frames late, and at nineteen metres a second that is several metres
   * of error per correction — which would make this measure the latency of the
   * harness rather than the reachability of the route.
   */
  await page.evaluate(() => {
    window.__autopilot = {
      stop() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
      },
      start() {
        const k = window.KAKISNOW;
        const g = k.game;
        this.stop();
        this.log = [];
        const tick = () => {
          const c = k.character;
          const outstanding = g.field.items.filter((i) => !i.collected);

          // Aim at the next ingredient; once the order is full, at the gate.
          let tx = 0;
          let tz = g.event.finishZ + 30;
          if (outstanding.length) {
            // The nearest one that is still ahead. Turning back for something
            // already passed is a recovery behaviour and not what this is
            // measuring, so it is left to the alert the HUD raises.
            let best = null;
            let bestD = Infinity;
            for (const item of outstanding) {
              const dz = item.anchor.z - c.position.z;
              if (dz < 2) continue;
              const d = dz * dz + Math.pow(item.anchor.x - c.position.x, 2);
              if (d < bestD) { bestD = d; best = item; }
            }
            if (best) { tx = best.anchor.x; tz = best.anchor.z; }
          }

          k.rig.yaw = Math.atan2(tx - c.position.x, tz - c.position.z);
          this.raf = requestAnimationFrame(tick);
        };
        tick();
      },
    };
  });

  const runs = [];
  let failures = 0;

  for (let n = 0; n < seedCount; n++) {
    const seed = firstSeed + n;
    const label = String(seed).padStart(3, "0");

    const started = await page.evaluate((seed) => {
      const g = window.KAKISNOW.game;
      g.selectMode("burger-run");
      const actual = g.start(seed);
      window.__autopilot.start();
      return {
        seed: actual,
        state: g.run.state,
        placements: g.run.placements.map((p) => ({
          ingredient: p.ingredient,
          x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
          zone: p.zone,
        })),
      };
    }, seed);

    // Poll the run rather than sleep a fixed time: the whole question is how
    // long the mountain takes, and a fixed wait would either cut a slow run
    // short or spend the difference doing nothing on a fast one.
    const seen = new Set();
    const startedAt = Date.now();
    let state = "run";
    let last = null;

    while (Date.now() - startedAt < timeLimit * 1000) {
      last = await page.evaluate(() => {
        const g = window.KAKISNOW.game;
        const c = window.KAKISNOW.character;
        return {
          state: g.run.state,
          time: g.run.time,
          collected: Object.keys(g.run.splits),
          z: +c.position.z.toFixed(1),
          x: +c.position.x.toFixed(1),
          speed: +c.speed.toFixed(1),
          blocked: g.run.blockedReason,
          result: g.run.result,
        };
      });
      state = last.state;

      for (const id of last.collected) {
        if (seen.has(id)) continue;
        seen.add(id);
        await shot(`${label}-pickup-${seen.size}-${id}`);
      }

      if (state === "assembly" && !seen.has("__assembly")) {
        seen.add("__assembly");
        // Not on the transition frame. The burger starts at one-hundredth
        // scale and eases up, so a shot taken the instant the state changes
        // photographs an empty finish line and would read as the reward
        // failing to appear — which is exactly what the first version of this
        // tool recorded.
        await page.waitForTimeout(900);
        await shot(`${label}-assembly`);
      }
      if (state === "results") {
        await shot(`${label}-results`);
        break;
      }
      await page.waitForTimeout(120);
    }

    await page.evaluate(() => window.__autopilot.stop());

    const result = last?.result ?? null;
    const ok = state === "results" && result?.completed === true;
    if (!ok) failures++;

    runs.push({
      seed: started.seed,
      ok,
      finalState: state,
      placements: started.placements,
      collected: last?.collected ?? [],
      lastZ: last?.z ?? null,
      blocked: last?.blocked ?? null,
      result: result && {
        completed: result.completed,
        time: +result.time.toFixed(2),
        medal: result.medal,
        style: result.style,
        integrity: result.integrity,
        stars: result.stars,
        grade: result.grade,
        splits: result.splits,
        detail: result.detail,
      },
    });

    process.stderr.write(
      `seed ${started.seed}: ${ok ? "COMPLETED" : "FAILED"} ` +
      `state=${state} collected=${(last?.collected ?? []).length}/4 ` +
      (result ? `time=${result.time.toFixed(2)}s ${result.grade} ${result.stars}★` : "") +
      `\n`
    );

    // Back to the title so the next seed starts from the same place.
    await page.evaluate(() => window.KAKISNOW.game.selectMode("title"));
    await page.waitForTimeout(250);
  }

  const report = {
    tool: "tools/snow-burgers/playthrough-windows.cjs",
    url,
    viewport,
    seeds: seedCount,
    runs,
    screenshots: shots,
    consoleErrors: errors,
    webgpuValidation: validation,
    ok: failures === 0 && errors.length === 0 && validation.length === 0,
  };
  fs.writeFileSync(
    path.join(output, "playthrough-report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );

  process.stderr.write(
    `\n${runs.length - failures}/${runs.length} runs completed · ` +
    `${errors.length} console errors · ${validation.length} WebGPU validation\n` +
    `report: ${path.join(output, "playthrough-report.json")}\n`
  );
  for (const e of errors.slice(0, 12)) process.stderr.write("  error: " + e + "\n");
  for (const v of validation.slice(0, 6)) process.stderr.write("  gpu:   " + v + "\n");

  await context.close();
  process.exit(report.ok ? 0 : 1);
})().catch(async (err) => {
  console.error(err);
  if (context) await context.close().catch(() => {});
  process.exit(1);
});
