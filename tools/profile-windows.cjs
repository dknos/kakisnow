const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function summarize(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  const max = sorted[sorted.length - 1];
  let aboveMedianPlus4 = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > median + 4) aboveMedianPlus4 += 1;
  }
  return {
    samples: values.length,
    mean: total / values.length,
    median,
    p90,
    p99,
    max,
    medianFps: 1000 / median,
    medianPlus4: median + 4,
    aboveMedianPlus4,
  };
}

async function sampleFrames(page, count) {
  return page.evaluate((sampleCount) => new Promise((resolve) => {
    const values = new Array(sampleCount);
    let cursor = 0;
    let previous = 0;
    function frame(now) {
      values[cursor] = now - previous;
      previous = now;
      cursor += 1;
      if (cursor < sampleCount) requestAnimationFrame(frame);
      else resolve(values);
    }
    requestAnimationFrame(now => {
      previous = now;
      requestAnimationFrame(frame);
    });
  }), count);
}

async function setScenario(page, scenario) {
  await page.evaluate((name) => {
    const app = window.KAKISNOW;

    app.set("taa", true);
    app.set("ssr", true);
    app.set("dof", true);
    app.set("bloom", true);
    app.set("grain", true);
    app.set("sharpen", true);
    app.set("showMountains", true);
    app.set("showLightShafts", true);
    app.set("showTerrain", true);
    app.set("heroStyle", "rockerkaki");
    app.set("showCharacter", true);
    app.input.surf = false;
    app.spells.debugRibbon = false;
    app.spells._cancelAll();
    for (let index = 0; index < app.shadows.maps.length; index += 1) {
      app.shadows.maps[index].refreshRate = 1;
    }

    if (name === "terrain-off") {
      app.set("showTerrain", false);
    } else if (name === "mountains-off") {
      app.set("showMountains", false);
    } else if (name === "character-off") {
      app.set("showCharacter", false);
    } else if (name === "shadows-cached") {
      for (let index = 0; index < app.shadows.maps.length; index += 1) {
        app.shadows.maps[index].refreshRate = 0;
      }
    } else if (name === "finishing-off") {
      app.set("taa", false);
      app.set("ssr", false);
      app.set("dof", false);
      app.set("bloom", false);
      app.set("grain", false);
      app.set("sharpen", false);
      app.set("showLightShafts", false);
    } else if (name === "snowbound") {
      app.setHeroStyle("snowbound");
    } else if (name === "surf-active") {
      app.input.surf = true;
      app.rig.yaw = app.character.facing + 0.72;
    } else if (name === "vortex-active") {
      app.spells.cast(5);
    }
  }, scenario);
  await page.waitForTimeout(
    scenario === "surf-active" || scenario === "vortex-active" ? 1450 : 650,
  );
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
const output = path.resolve(readArgument("--out", "screenshots/_scratch/perf-profile.json"));
const frameCount = Number(readArgument("--frames", "480"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-profile-"));

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
      "--disable-frame-rate-limit",
      "--disable-gpu-vsync",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  const validationWarnings = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") errors.push(text);
    if (/GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Destroyed texture|Validation Error/i.test(text)) {
      validationWarnings.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    errors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => window.__KAKISNOW__?.ready === true, null, { timeout: 240_000 });
  await page.waitForTimeout(1800);

  const runtime = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    const info = adapter?.info;
    return {
      userAgent: navigator.userAgent,
      adapter: info ? {
        vendor: info.vendor || "",
        architecture: info.architecture || "",
        device: info.device || "",
        description: info.description || "",
        isFallbackAdapter: info.isFallbackAdapter || false,
      } : null,
      adapterFeatures: adapter ? Array.from(adapter.features).sort() : [],
    };
  });

  const scenarioNames = [
    "baseline",
    "terrain-off",
    "mountains-off",
    "character-off",
    "shadows-cached",
    "finishing-off",
    "snowbound",
    "surf-active",
    "vortex-active",
  ];
  const scenarios = [];
  for (let index = 0; index < scenarioNames.length; index += 1) {
    const name = scenarioNames[index];
    await setScenario(page, name);
    const intervals = await sampleFrames(page, frameCount);
    scenarios.push({ name, ...summarize(intervals) });
  }

  const report = {
    url,
    capturedAt: new Date().toISOString(),
    host: { platform: os.platform(), release: os.release(), arch: os.arch() },
    viewport: { width: 2560, height: 1440 },
    flags: ["disable-frame-rate-limit", "disable-gpu-vsync"],
    runtime,
    scenarios,
    finalStats: await page.evaluate(() => ({ ...window.KAKISNOW.perfStats })),
    errors,
    validationWarnings,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  if (errors.length || validationWarnings.length) process.exitCode = 1;
})()
  .catch((error) => {
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
