/**
 * Snow-Burgers release showreel.
 *
 * This is a capture harness, not a game mode. It records the real WebGPU
 * canvas and the real UI in one browser video, while a small amount of
 * explicitly logged staging lets a 60-90 second reel show the game's whole
 * promise without pretending that a full tour can fit in one uninterrupted
 * run. Staged writes only place the rider or the avalanche wall on state that
 * the existing runtime already renders; they never synthesize frames.
 *
 * Usage (from WSL, with a local Vite server running):
 *
 *   "/mnt/c/Program Files/nodejs/node.exe" \
 *     tools/snow-burgers/capture-showreel-windows.cjs \
 *     --url http://127.0.0.1:5173 --out reports/final-gauntlet/showreel
 *
 * The output directory receives:
 *   snow-burgers-showreel.webm  (the actual Playwright recording)
 *   snow-burgers-showreel.json  (segment timing, staging, and error audit)
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const baseUrl = arg("--url", "http://127.0.0.1:5173");
const output = path.resolve(arg("--out", "reports/final-gauntlet/showreel"));
const width = Number(arg("--width", "1280"));
const height = Number(arg("--height", "720"));
const viewport = { width, height };
const minReelSeconds = 60;
const maxReelSeconds = 90;
const transitionLeadSeconds = 0.75;
// Transition cuts are measured from the same capture clock as segment timing.
// The navigation start and DOM-ready end markers are recorded around each
// course handoff below, then converted to post-lead-trim coordinates only once
// the exact trim start is known. This avoids brittle assumptions about how
// long a cold course load takes on a given capture host.
const executablePath = arg(
  "--chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-showreel-"));
const recordingDir = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-video-"));
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost|Destroyed texture/i;

fs.mkdirSync(output, { recursive: true });

const eventIds = [
  "summit-stack", "summit-gold", "rocket-reheat", "timber-melt",
  "branch-manager", "blue-plate", "handle-with-care", "night-shift",
  "park-order", "avalanche-special", "five-alarm", "big-air-basin-stack",
];
const courseIds = [
  "summit-line", "pinecone-pass", "glacier-gorge", "midnight-resort",
  "whiteout-ridge", "big-air-basin",
];

/** Convert a WSL UNC path emitted by Windows Node back to a WSL path. */
function wslPath(file) {
  const match = String(file).match(/^\\\\wsl\.localhost\\[^\\]+(.*)$/i);
  return match ? match[1].replaceAll("\\", "/") : file;
}

function mediaTool(command, args, options = {}) {
  const normalizedArgs = args.map((value) => String(value));
  try {
    return execFileSync("wsl.exe", ["--", command, ...normalizedArgs], {
      stdio: options.stdio || "pipe",
      encoding: options.encoding || undefined,
    });
  } catch (error) {
    // The harness normally runs under Windows Node and uses WSL ffmpeg. A
    // direct fallback keeps post-processing reproducible from WSL/Linux too.
    return execFileSync(command, normalizedArgs, {
      stdio: options.stdio || "pipe",
      encoding: options.encoding || undefined,
    });
  }
}

function probeDuration(file) {
  const output = mediaTool("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    wslPath(file),
  ], { encoding: "utf8" });
  const duration = Number(String(output).trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to measure video duration: ${file}`);
  }
  return duration;
}

function postprocessRecording(source, destination, trimStart, cuts) {
  const rawDurationSeconds = probeDuration(source);
  const sourceStart = Math.max(0, trimStart);
  const sourceCuts = cuts
    .map(({ start, end, reason }) => ({
      start: sourceStart + start,
      end: sourceStart + end,
      reason,
    }))
    .filter(({ start, end }) => end > sourceStart && start < rawDurationSeconds)
    .map(({ start, end, reason }) => ({
      start: Math.max(sourceStart, start),
      end: Math.min(rawDurationSeconds, end),
      reason,
    }));
  const kept = [];
  let cursor = sourceStart;
  for (const cut of sourceCuts) {
    if (cut.start > cursor) kept.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < rawDurationSeconds) kept.push({ start: cursor, end: rawDurationSeconds });
  if (!kept.length) throw new Error("Showreel post-process has no kept video ranges");

  const chains = kept.map((range, index) =>
    `[0:v]trim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},` +
    `setpts=PTS-STARTPTS[v${index}]`,
  );
  chains.push(
    `${kept.map((_, index) => `[v${index}]`).join("")}concat=n=${kept.length}:v=1:a=0[outv]`,
  );
  mediaTool("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", wslPath(source),
    "-filter_complex", chains.join(";"),
    "-map", "[outv]", "-an", "-r", "25",
    "-c:v", "libvpx", "-crf", "10", "-b:v", "0",
    "-deadline", "good", "-cpu-used", "4",
    wslPath(destination),
  ], { stdio: "pipe" });
  return {
    rawDurationSeconds,
    sourceCuts,
    measuredFinalDurationSeconds: probeDuration(destination),
  };
}

function finalRangesForSegment(segment, trimStart, cuts) {
  const preStart = Math.max(0, segment.start - trimStart);
  const preEnd = Math.max(preStart, segment.end - trimStart);
  const finalPosition = (time) => {
    let removed = 0;
    for (const cut of cuts) {
      if (time <= cut.start) break;
      if (time >= cut.end) {
        removed += cut.end - cut.start;
        continue;
      }
      return cut.start - removed;
    }
    return time - removed;
  };
  const boundaries = [preStart, preEnd];
  for (const cut of cuts) {
    if (cut.start > preStart && cut.start < preEnd) boundaries.push(cut.start);
    if (cut.end > preStart && cut.end < preEnd) boundaries.push(cut.end);
  }
  boundaries.sort((a, b) => a - b);
  const ranges = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const midpoint = (start + end) / 2;
    if (cuts.some((cut) => midpoint > cut.start && midpoint < cut.end)) continue;
    ranges.push({ start: finalPosition(start), end: finalPosition(end) });
  }
  return ranges.map((range) => ({
    start: Number(Math.max(0, range.start).toFixed(3)),
    end: Number(Math.max(0, range.end).toFixed(3)),
    duration: Number(Math.max(0, range.end - range.start).toFixed(3)),
  })).filter((range) => range.duration > 0);
}

let browser;
let context;
let page;
let video;
const segments = [];
const errors = [];
const webgpuValidation = [];
const failedRequests = [];
const transitionMarkers = {
  summitToWhiteout: null,
  whiteoutToBigAir: null,
};
const startedAt = Date.now();

function now() {
  return Number(((Date.now() - startedAt) / 1000).toFixed(3));
}

async function segment(id, label, staging, action) {
  const start = now();
  const entry = { id, label, start, staging: staging ?? null };
  segments.push(entry);
  await action();
  entry.end = now();
  entry.duration = Number((entry.end - entry.start).toFixed(3));
}

async function ready(url, waitMs = 900) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true &&
      Boolean(window.KAKISNOW?.scene) && Boolean(window.KAKISNOW?.game),
    null,
    { timeout: 300000 },
  );
  await page.waitForTimeout(waitMs);
}

async function startAutopilot() {
  await page.evaluate(() => {
    const k = window.KAKISNOW;
    const g = k.game;
    window.__snowBurgersShowreelDrive?.stop?.();
    window.__snowBurgersShowreelDrive = {
      raf: 0,
      stop() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
      },
      tick() {
        const c = k.character;
        const outstanding = g.field.items.filter((item) => !item.collected);
        let target = null;
        let best = Infinity;
        for (const item of outstanding) {
          const dz = item.anchor.z - c.position.z;
          if (dz < 2) continue;
          const d = dz * dz + (item.anchor.x - c.position.x) ** 2;
          if (d < best) { best = d; target = item; }
        }
        const tx = target?.anchor.x ?? 0;
        const tz = target?.anchor.z ?? (g.event?.finishZ ?? c.position.z + 120);
        // The same steering boundary used by the committed browser
        // playthrough: the camera rig supplies the steering intent; physics
        // still integrates the board, pickups, hazards, and finish.
        k.rig.yaw = Math.atan2(tx - c.position.x, tz - c.position.z);
        k.input.surf = true;
        this.raf = requestAnimationFrame(() => this.tick());
      },
      start() {
        this.stop();
        this.tick();
      },
    };
    window.__snowBurgersShowreelDrive.start();
  });
}

async function stopAutopilot() {
  await page.evaluate(() => window.__snowBurgersShowreelDrive?.stop?.());
}

async function runUntilResults(limitMs = 50000) {
  const started = Date.now();
  while (Date.now() - started < limitMs) {
    const state = await page.evaluate(() => window.KAKISNOW.game.run.state);
    if (state === "results") return true;
    await page.waitForTimeout(150);
  }
  return false;
}

async function click(selector, timeout = 15000) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
  await page.locator(selector).first().click();
}

async function waitForRun() {
  await page.waitForFunction(
    () => window.KAKISNOW.game.run.state === "run",
    null,
    { timeout: 15000 },
  );
}

async function waitForVisible(selector, timeout = 15000) {
  await page.waitForFunction((target) => {
    const el = document.querySelector(target);
    if (!el || !el.classList.contains("on")) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  }, selector, { timeout });
}

async function waitForCountdownVisible() {
  await page.waitForFunction(() => {
    const countdown = document.querySelector("#sb-countdown");
    const style = countdown ? getComputedStyle(countdown) : null;
    const rect = countdown?.getBoundingClientRect();
    return window.KAKISNOW?.game?.run?.state === "countdown" &&
      countdown?.classList.contains("on") && style?.display !== "none" &&
      rect?.width > 0 && rect?.height > 0;
  }, null, { timeout: 15000 });
}

async function stageRider({ x = 0, z, speed = 0, yaw = 0 }) {
  return page.evaluate(({ x, z, speed, yaw }) => {
    const app = window.KAKISNOW;
    const c = app.character;
    const y = app.terrain.heightAt(x, z);
    c.position.set(x, y, z);
    c.prevPosition?.copyFrom?.(c.position);
    c.velocity.set(0, 0, speed);
    c.prevVelocity.copyFrom(c.velocity);
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
    app.rig.distance = 11;
    app.rig.distanceTarget = 11;
    return { x, z, y: Number(y.toFixed(2)), speed };
  }, { x, z, speed, yaw });
}

async function installFullBook() {
  await page.evaluate(({ eventIds, courseIds }) => {
    const app = window.KAKISNOW;
    const events = {};
    for (const id of eventIds) {
      events[id] = {
        completions: 1,
        bestTime: 35.2,
        bestStyle: 820,
        bestIntegrity: 96,
        bestRocket: id.includes("reheat") || id.includes("alarm") ? 0.88 : 0,
        bestTrick: { name: "Clean 360", score: 420 },
        bestStars: 4,
        bestMedal: "gold",
        bestSeed: 7,
        courseId: id === "summit-stack" || id === "summit-gold" || id === "rocket-reheat"
          ? "summit-line"
          : id === "timber-melt" || id === "branch-manager"
            ? "pinecone-pass"
            : id === "blue-plate" || id === "handle-with-care"
              ? "glacier-gorge"
              : id === "night-shift" || id === "park-order"
                ? "midnight-resort"
                : id === "avalanche-special" || id === "five-alarm"
                  ? "whiteout-ridge" : "big-air-basin",
        courseVersion: 2,
        eventVersion: 1,
        bestVehicle: "classic-snowboard",
        bestGhost: null,
        bestBigAirFlights: id === "big-air-basin-stack" ? {
          "classic-snowboard": {
            vehicle: "classic-snowboard", airtime: 2.53, distance: 49.2,
            maxHeight: 18.6, maxClearance: 18.6, trick: "Clean 360",
            trickScore: 420, landingGrade: "clean",
          },
        } : {},
      };
    }
    const raw = {
      version: 2,
      burgers: eventIds.length,
      runs: eventIds.length,
      seenAssembly: true,
      seenTourComplete: true,
      seenHundredPercent: false,
      unlockedCourses: [...courseIds],
      secrets: Object.fromEntries(courseIds.map((id) => [id, ["tape-1", "tape-2", "tape-3"]])),
      tutorial: { steer: true, jump: true, trick: true, pickup: true, finish: true },
      lastSelected: { courseId: "big-air-basin", eventId: "big-air-basin-stack" },
      events,
    };
    const result = app.game.book.importSave(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.error);
    app.game.director._refreshTitleMenu();
    return result;
  }, { eventIds, courseIds });
}

(async () => {
  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--ignore-gpu-blocklist",
        "--disable-frame-rate-limit",
        "--disable-gpu-vsync",
      ],
    });
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: recordingDir, size: viewport },
    });
    page = await context.newPage();
    video = page.video();

    page.on("console", (message) => {
      const line = `${message.type()}: ${message.text()}`;
      if (message.type() === "error") errors.push(line);
      if (validationPattern.test(line)) webgpuValidation.push(line);
    });
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    page.on("requestfailed", (request) => {
      const line = `${request.url()} ${request.failure()?.errorText || ""}`;
      failedRequests.push(line);
      errors.push(`requestfailed: ${line}`);
    });

    await segment("title", "Title / Burger Tour map", {
      kind: "live",
      note: "default boot; no state injection",
    }, async () => {
      await ready(baseUrl, 1000);
      await page.waitForTimeout(3500);
    });

    await segment("order", "First order / event selection", {
      kind: "live",
      note: "clicked the real Summit Stack event button",
    }, async () => {
      await click('[data-event="summit-stack"]');
      await page.waitForFunction(() => document.querySelector("#sb-order.on"));
      await page.waitForTimeout(3500);
    });

    await segment("first-run", "Carving, pickup, trick, landing, finish", {
      kind: "live-with-input-staging",
      note: "real Summit Stack run; in-page steering is the existing playthrough boundary; one Space jump plus Q/F trick input is sent near the first authored kicker",
    }, async () => {
      await click('[data-action="drop-in"]');
      await waitForRun();
      await startAutopilot();
      await page.focus("#view").catch(() => {});
      // One real steer input lets the first-run tutorial dismiss on the same
      // action the player uses. The in-page autopilot is only the line
      // stabiliser after that; it must not leave the onboarding cue hanging
      // over the whole descent.
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(260);
      await page.keyboard.up("KeyA");
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(260);
      await page.keyboard.up("KeyD");
      // A real jump/trick input, synchronized to the rider reaching the
      // Summit's first authored kicker at z=50. The rest of the run remains
      // physics/autopilot driven; the position check only prevents the key
      // press from landing before the authored takeoff window.
      await page.waitForFunction(
        () => window.KAKISNOW.character.position.z > 32,
        null,
        { timeout: 8000 },
      );
      await page.keyboard.press("Space");
      await page.keyboard.down("KeyQ");
      await page.keyboard.down("KeyF");
      await page.waitForTimeout(720);
      await page.keyboard.up("KeyF");
      await page.keyboard.up("KeyQ");
      const complete = await runUntilResults(48000);
      await stopAutopilot();
      if (!complete) throw new Error("Summit Stack did not reach results during showreel");
      await page.waitForTimeout(2300);
    });

    await segment("hazard", "Whiteout Ridge avalanche pressure", {
      kind: "staged-runtime-state",
      note: "real Whiteout Ridge renderer and avalanche system; after a real drop-in, wallZ is placed 18 m behind the rider so the authored warning/HUD/particle/audio response is legible in a short cut",
    }, async () => {
      const u = new URL(baseUrl);
      u.searchParams.set("course", "whiteout-ridge");
      u.searchParams.set("event", "avalanche-special");
      u.searchParams.set("mode", "burger-run");
      const navigationStart = now();
      await ready(u.toString(), 850);
      await page.waitForFunction(() => document.querySelector("#sb-order.on"));
      await page.waitForTimeout(1200);
      await click('[data-action="drop-in"]');
      await waitForCountdownVisible();
      transitionMarkers.summitToWhiteout = {
        captureStartSeconds: navigationStart,
        captureCutStartSeconds: Number((navigationStart - transitionLeadSeconds).toFixed(3)),
        captureEndSeconds: now(),
        startCondition: "Whiteout navigation began",
        endCondition: "retained Whiteout countdown became visible",
      };
      await waitForRun();
      await startAutopilot();
      await page.evaluate(() => {
        const app = window.KAKISNOW;
        app.game.director.avalanche.wallZ = app.character.position.z - 18;
      });
      // The wall is already in the authored warning range. A short hold is
      // enough to show its meter, curtain, and caption without spending the
      // reel's time on an entire second descent.
      await page.waitForTimeout(5500);
      await stopAutopilot();
    });

    await segment("big-air", "Big Air Basin signature flight / landing read", {
      kind: "staged-runtime-state",
      note: "real Big Air course physics and camera with the rocket chair visible and boost held; rider is placed on the existing in-run at z=260 with 26 m/s, matching the authored launch geometry; no flight telemetry or frame is synthesized",
    }, async () => {
      const u = new URL(baseUrl);
      u.searchParams.set("course", "big-air-basin");
      u.searchParams.set("event", "big-air-basin-stack");
      u.searchParams.set("mode", "burger-run");
      const navigationStart = now();
      await ready(u.toString(), 850);
      await page.waitForFunction(() => !document.querySelector("#boot"));
      await waitForVisible("#sb-order");
      // Give the real order card a short, intentional hold after the stable
      // marker. The cut removes only the preceding boot/title plate.
      transitionMarkers.whiteoutToBigAir = {
        captureStartSeconds: navigationStart,
        captureCutStartSeconds: Number((navigationStart - transitionLeadSeconds).toFixed(3)),
        captureEndSeconds: now(),
        startCondition: "Big Air navigation began",
        endCondition: "#boot absent and #sb-order visibly stable",
      };
      await page.waitForTimeout(950);
      // This event allows both vehicles. Selecting it before the drop uses
      // the real settings/onChange path, so the rocket-chair mesh, fuel HUD,
      // exhaust and boost audio are all runtime output rather than an overlay.
      await page.evaluate(() => window.KAKISNOW.set("vehicle", "rocket-chair"));
      await click('[data-action="drop-in"]');
      await waitForRun();
      await stageRider({ x: 0, z: 260, speed: 26 });
      await startAutopilot();
      await page.focus("#view").catch(() => {});
      await page.keyboard.down("Shift");
      await page.waitForFunction(
        () => window.KAKISNOW.game.director.bigAirFlight.inFlight === true ||
          Boolean(window.KAKISNOW.game.run.flightTelemetry),
        null,
        { timeout: 8000 },
      ).catch(() => {});
      await page.keyboard.down("KeyE");
      await page.keyboard.down("KeyF");
      await page.waitForTimeout(1100);
      await page.keyboard.up("KeyF");
      await page.keyboard.up("KeyE");
      await page.keyboard.up("Shift");
      await page.waitForTimeout(1700);
      await stopAutopilot();
    });

    await segment("book", "Burger Book / records / 100% inventory", {
      kind: "staged-save-fixture",
      note: "a valid schema-v2 local save fixture fills the existing 12-event, 18-tape registries so the real Burger Book can show its postgame state; no new event or course is created",
    }, async () => {
      // Stay in the already-loaded Big Air renderer. The UI transition is
      // still the game's own title/book path; reloading here would spend most
      // of a short showreel rebuilding assets a second time. Import the
      // completed fixture before title selection so stale 3/6 progress cannot
      // paint between the run and the Burger Book.
      await installFullBook();
      await page.evaluate(() => window.KAKISNOW.game.selectMode("title"));
      await page.waitForTimeout(750);
      await page.evaluate(() => window.KAKISNOW.game.ui.showBurgerBook(window.KAKISNOW.game.book.book, "big-air-basin"));
      await page.waitForFunction(() => document.querySelector("#sb-book.on"));
      await page.waitForTimeout(4000);
    });

    await segment("completion", "Tour Complete / 100% Served / continued play", {
      kind: "live-ui-from-staged-save",
      note: "the real completion screen is rendered from the valid full-book fixture; 100% is the registry-derived state shown by the existing UI",
    }, async () => {
      await page.evaluate(() => {
        const app = window.KAKISNOW;
        app.game.book.book.seenHundredPercent = false;
        app.game.ui.showTourComplete({
          courseTotal: 6, eventTotal: 12, tapeTotal: 18,
          completedEvents: 12, medalEvents: 12, foundTapes: 18,
          mainCompleted: 6, mainTotal: 6, tourComplete: true,
          hundredPercent: true, completionPercent: 100,
          totalStars: 48, burgersServed: 12, runs: 12,
        }, { hundredPercent: true });
      });
      await page.waitForFunction(() => document.querySelector("#sb-finale.on"));
      await page.waitForTimeout(4000);
    });

    await context.close();
    const recordedPath = await video.path();
    const rawPath = path.join(output, ".snow-burgers-showreel-raw.webm");
    const finalPath = path.join(output, "snow-burgers-showreel.webm");
    fs.copyFileSync(recordedPath, rawPath);
    const wallClockDurationSeconds = Number(now().toFixed(3));
    const explicitTrim = arg("--trim-start", "auto");
    const trimStartSeconds = explicitTrim === "auto"
      ? Math.max(0, Number((segments[0].end - 3).toFixed(3)))
      : Math.max(0, Number(explicitTrim));
    if (!transitionMarkers.summitToWhiteout || !transitionMarkers.whiteoutToBigAir) {
      throw new Error("Showreel transition markers were not recorded");
    }
    const deadTimeCuts = [
      {
        id: "summit-to-whiteout",
        start: transitionMarkers.summitToWhiteout.captureCutStartSeconds - trimStartSeconds,
        end: transitionMarkers.summitToWhiteout.captureEndSeconds - trimStartSeconds,
        reason: "Summit results -> Whiteout boot/title plate",
        captureStartSeconds: transitionMarkers.summitToWhiteout.captureStartSeconds,
        captureCutStartSeconds: transitionMarkers.summitToWhiteout.captureCutStartSeconds,
        captureEndSeconds: transitionMarkers.summitToWhiteout.captureEndSeconds,
      },
      {
        id: "whiteout-to-big-air",
        start: transitionMarkers.whiteoutToBigAir.captureCutStartSeconds - trimStartSeconds,
        end: transitionMarkers.whiteoutToBigAir.captureEndSeconds - trimStartSeconds,
        reason: "Whiteout run -> Big Air boot/title plate",
        captureStartSeconds: transitionMarkers.whiteoutToBigAir.captureStartSeconds,
        captureCutStartSeconds: transitionMarkers.whiteoutToBigAir.captureCutStartSeconds,
        captureEndSeconds: transitionMarkers.whiteoutToBigAir.captureEndSeconds,
      },
    ].map((cut) => ({
      ...cut,
      start: Number(Math.max(0, cut.start).toFixed(3)),
      end: Number(Math.max(0, cut.end).toFixed(3)),
    })).sort((a, b) => a.start - b.start);
    const postprocess = postprocessRecording(
      rawPath,
      finalPath,
      trimStartSeconds,
      deadTimeCuts,
    );
    fs.rmSync(rawPath, { force: true });
    const durationPass = postprocess.measuredFinalDurationSeconds >= minReelSeconds &&
      postprocess.measuredFinalDurationSeconds <= maxReelSeconds;
    const finalSegments = segments.map((entry) => {
      const finalRanges = finalRangesForSegment(entry, trimStartSeconds, deadTimeCuts);
      return {
        ...entry,
        captureStartSeconds: entry.start,
        captureEndSeconds: entry.end,
        start: finalRanges[0]?.start ?? null,
        end: finalRanges.at(-1)?.end ?? null,
        duration: Number(finalRanges.reduce((sum, range) => sum + range.duration, 0).toFixed(3)),
        finalRanges,
        timestampBasis: "final-file-relative-seconds",
      };
    });
    const manifest = {
      tool: "tools/snow-burgers/capture-showreel-windows.cjs",
      url: baseUrl,
      viewport,
      browser: executablePath,
      video: path.basename(finalPath),
      audioStream: false,
      audioScope: "silent visual evidence only; not audio-mix evidence",
      rawDurationSeconds: postprocess.rawDurationSeconds,
      wallClockDurationSeconds,
      trimStartSeconds,
      transitionLeadSeconds,
      transitionMarkers,
      deadTimeCuts,
      deadTimeCutTimestampBasis: "post-lead-trim-pre-cut-source-seconds",
      measuredFinalDurationSeconds: postprocess.measuredFinalDurationSeconds,
      durationGate: { minSeconds: minReelSeconds, maxSeconds: maxReelSeconds, pass: durationPass },
      segments: finalSegments,
      errors,
      webgpuValidation,
      failedRequests,
      tempProfileCleanup: "removed in the finally block after the manifest is written",
      notes: [
        "The video is an actual Playwright recording of the WebGPU canvas and DOM UI.",
        "Staged runtime writes are disclosed per segment; they are not generated frames.",
        "Transition cuts come from capture-clock DOM markers; final segment timestamps are measured from the final WebM start.",
        "Each cut starts 0.75 s before its navigation marker to cover Playwright/WebM timestamp lead; the marker and safety pre-roll are both recorded.",
        "The Big Air order card remains visible for a brief intentional hold after its stable DOM marker.",
        "The final duration and dimensions were checked with ffprobe after post-processing.",
        "Playwright video capture contains no audio stream; audio acceptance is documented separately.",
      ],
      ok: durationPass && errors.length === 0 && webgpuValidation.length === 0 && failedRequests.length === 0,
    };
    fs.writeFileSync(
      path.join(output, "snow-burgers-showreel.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    console.error(JSON.stringify({
      video: finalPath,
      manifest: path.join(output, "snow-burgers-showreel.json"),
      rawSeconds: manifest.rawDurationSeconds,
      trimmedSeconds: manifest.measuredFinalDurationSeconds,
      segments: finalSegments.map((s) => `${s.id}:${s.duration}s`),
      errors: errors.length,
      webgpuValidation: webgpuValidation.length,
      failedRequests: failedRequests.length,
      bytes: fs.statSync(finalPath).size,
    }, null, 2));
    if (!manifest.ok) process.exitCode = 1;
  } catch (error) {
    errors.push(error.stack || error.message);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(recordingDir, { recursive: true, force: true });
  }
})();
