/**
 * The 100-seed ingredient placement sweep, run against the terrain that ships.
 *
 * `src/game/ingredientPlacement.js` chooses where the four required pickups go,
 * and every rule it applies — slope, local relief, halfpipe walls, jump
 * approaches and landings, the lateral shift a rider can make between two
 * pickups — is a statement about a surface. `tests/ingredient-placement.test.mjs`
 * already exercises all of those rules in Node against a synthetic
 * `RollingCourse`, which is the right way to prove the rules are correct. It
 * cannot prove the course is placeable, because the course is not in the test.
 *
 * ------------------------------------------------- why this is not a unit test
 *
 * The only authoritative heights in this project are read back from the GPU
 * heightfield bake: `Heightfield.bake()` renders the 4096² field and
 * `_readback()` copies R into a Float32Array that `heightAt` then reconstructs
 * with a bicubic B-spline. There is no JavaScript path to those numbers. The
 * header of `ingredientPlacement.js` says why one was never written — f32 GPU
 * maths and f64 JS maths disagree by centimetres, so a pickup placed by a
 * re-implementation floats or sinks against the surface that is drawn — and
 * `DECISIONS.md` records the adjacent fact that `heightAt` reconstructs the
 * macro field only, with `terrainFine`'s 8 cm crests never read back at all.
 * So the real field exists in exactly one place: a running browser that has
 * finished its bake. Getting to it means driving the app.
 *
 * It also means driving *Windows* Chrome. WSL's own headless Chrome resolves
 * WebGPU to SwiftShader at best and usually to nothing, so the bake never
 * happens there and the terrain this tool exists to test is absent. Launch
 * flags, executable path and error plumbing below are copied from
 * `tools/capture-board-windows.cjs` and `tools/smoke-downhill-windows.cjs` for
 * that reason.
 *
 * --------------------------------------------------------- the false green
 *
 * `_readback()` only warns when `readPixels` returns nothing, and `heightAt`
 * answers 0 for every coordinate when the mirror is null. A flat field has no
 * slope and no relief, so every candidate anchor passes every rule, every seed
 * produces a route, and this tool would exit 0 having validated an absence.
 * The heightfield evidence read before the sweep is what makes that impossible:
 * it demands a non-null CPU mirror and real measured relief, and fails the run
 * outright rather than reporting a green sweep over a plane.
 *
 * -------------------------------------------------------- the surface check
 *
 * Comparing each placement's `y` against `terrain.heightAt(x, z)` is not a
 * numerical tolerance test and will not measure float drift: nothing mutates
 * `heightCPU` between the bake and disposal, so re-sampling the same coordinate
 * returns bitwise the same f64 the anchor stored. The residual is 0 or it is a
 * bug, and the bug it catches is a `y` that acquired an offset after selection
 * — a pedestal height folded in, or the sastrugi crest lift that the board
 * needs (DECISIONS.md) applied to a pickup that has not asked for it. The
 * tolerance is there so the check keeps meaning what it says if the placement
 * module ever computes `y` by a different route to the same surface.
 *
 * Usage, from the repo root, with the dev server up on the Windows loopback:
 *
 *   "/mnt/c/Program Files/nodejs/node.exe" \
 *     tools/snow-burgers/validate-placement-windows.cjs \
 *     --url http://127.0.0.1:5173 --seeds 100 \
 *     --out screenshots/snow-burgers/placement-validation.json
 *
 * Exits non-zero if any seed fails, if the browser reported an error, or if the
 * field it ran against was not a real bake, so it can gate a build.
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
const seedCount = Number(arg("--seeds", "100"));
/** Which course to sweep. The page must be booted with the same id. */
const courseId = arg("--course", "summit-line");
const output = path.resolve(
  arg("--out", "screenshots/snow-burgers/placement-validation.json"),
);
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost|Destroyed texture/i;

/** The order a run collects them in; the onion is optional and not routed. */
/** The order swept, downhill order, restated per run of this tool. The
 *  five-ingredient finals pass --required cheese,onion,patty,tomato,lettuce. */
const REQUIRED = arg("--required", "cheese,patty,tomato,lettuce").split(",");

/**
 * The reachability limits, restated here rather than imported.
 *
 * `MAX_LATERAL_RATIO` and the finish gate are not exported by the placement
 * module — but even if they were, importing them would only prove the module
 * agrees with itself. Written out, this file is an independent statement of
 * what the brief asks for. The runtime selector uses 0.66; this independent
 * validator allows 0.70, so the selected route must retain at least 0.04 of
 * harness reserve and 0.14 inside the measured 0.84 physical carve ceiling.
 * A seed sweep that starts failing after someone loosens the selector is the
 * tool working.
 */
const MAX_LATERAL_RATIO = 0.70;
const PHYSICAL_LATERAL_CEILING = 0.84;
/** Slack on the boundary case only; see the surface-check note in the header. */
const LATERAL_EPSILON = 1e-9;
const HEIGHT_TOLERANCE = 1e-6;

/**
 * Seeds per `page.evaluate`.
 *
 * The sweep is pure CPU work on the main thread, and a single call covering a
 * hundred seeds would hold the frame loop for the whole run. Batching hands the
 * page back between chunks so it keeps presenting, and gives the operator
 * progress on a run that takes tens of seconds.
 */
const BATCH = 10;

if (!Number.isInteger(seedCount) || seedCount < 1) {
  // A non-numeric --seeds would otherwise sweep nothing and exit 0, which is
  // the same species of false green as the flat heightfield.
  console.error(`--seeds must be a positive integer, got "${arg("--seeds", "")}"`);
  process.exit(1);
}

// After the argument check, so a usage error exits without leaving a Chrome
// profile behind: the cleanup that removes it belongs to the run below.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-placement-"));
fs.mkdirSync(path.dirname(output), { recursive: true });

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

let context = null;

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-gpu-blocklist",
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  const consoleErrors = [];
  const gpuErrors = [];

  page.on("console", message => {
    const line = `${message.type()}: ${message.text()}`;
    if (message.type() === "error") consoleErrors.push(line);
    if (validationPattern.test(line)) gpuErrors.push(line);
  });
  page.on("pageerror", error => consoleErrors.push(error.stack || error.message));
  page.on("requestfailed", request => {
    consoleErrors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.terrain),
    null,
    { timeout: 300_000 },
  );

  /**
   * Proof that the field about to be swept is the baked one.
   *
   * `ready` only means boot finished, and boot finishes whether or not the
   * readback produced anything. These four numbers are the difference.
   */
  const heightfield = await page.evaluate(() => {
    const hf = window.KAKISNOW.terrain.heightfield;
    return {
      readbackLanded: hf.heightCPU !== null,
      cpuResolution: hf.cpuRes ?? null,
      cpuTexelMetres: hf.cpuTexel ?? null,
      minHeight: hf.minHeight,
      maxHeight: hf.maxHeight,
      // Three points down the Summit Line, as a legible fingerprint of the
      // course this particular report was measured against.
      centreLine: [0, 260, 520].map(z => ({
        z,
        y: Number(window.KAKISNOW.terrain.heightAt(0, z).toFixed(3)),
      })),
    };
  });
  const relief = heightfield.maxHeight - heightfield.minHeight;
  // Measured relief proves the bake landed. The centre-line samples prove the
  // part of it this sweep uses is real: `heightAt` clamps a lookup outside the
  // field to its edge rather than failing, so a course that had drifted off the
  // baked extent would return a plateau, and every check in this tool would
  // still agree with it. Three identical heights down the Summit Line is that
  // case, and it is the one thing a self-consistent sweep cannot see.
  const centreLine = heightfield.centreLine.map(p => p.y);
  if (!heightfield.readbackLanded || !(relief > 1) || new Set(centreLine).size !== 3) {
    throw new Error(
      "the heightfield is not a real bake — " +
      `readback ${heightfield.readbackLanded ? "landed" : "failed"}, ` +
      `relief ${relief.toFixed(3)} m, centre line ${centreLine.join(" / ")} m ` +
      "at z = 0 / 260 / 520. Every anchor would pass against a plane, so the " +
      "sweep is refused rather than reported green.",
    );
  }

  /**
   * Run one batch of seeds inside the page.
   *
   * The placement module is imported by URL because Vite serves it as the same
   * ES module the app itself loaded; the promise is cached on `window` so a
   * hundred seeds cost one import.
   */
  const sweep = (seeds) => page.evaluate(async (batch) => {
    const { seeds, ids, ratio, epsilon, tolerance, courseId } = batch;
    if (!window.__PLACEMENT__) {
      window.__PLACEMENT__ = Promise.all([
        import("/src/game/ingredientPlacement.js"),
        import("/src/game/courses/index.js"),
      ]).catch(err => {
        throw new Error(
          "could not import /src/game/ingredientPlacement.js: " + err.message +
          " — this tool needs the Vite dev server (npm run dev). A built and " +
          "previewed bundle does not serve /src.",
        );
      });
    }
    const [placement, courses] = await window.__PLACEMENT__;
    const { selectRoute, candidatesFor } = placement;
    const course = courses.COURSES[courseId];
    if (!course) throw new Error("unknown course " + courseId);
    const ZONES = course.zones;
    const BASE_CAMP_Z = course.baseCampZ;
    const terrain = window.KAKISNOW.terrain;
    const round = v => Number(v.toFixed(3));

    /**
     * Collapse the numbers out of a rejection message so it can be counted.
     *
     * Only the two messages that interpolate a measurement are rewritten. The
     * protected-span reasons name the lip they belong to, and which lip an
     * anchor fell into is exactly the diagnostic worth keeping.
     */
    const reasonKey = (reason) => reason
      .replace(/slope [\d.]+ rad exceeds [\d.]+/, "slope over the zone limit")
      .replace(/local relief [\d.]+ m.*/, "local relief over the pad limit");

    const results = [];
    for (const seed of seeds) {
      const route = selectRoute(ids, terrain, seed, course);

      /**
       * Candidate pools for the report, one zone at a time.
       *
       * `candidatesFor` derives its generator as `seed ^ hash(zone.id)`, so
       * calling it again here reproduces the very pools `selectRoute` drew
       * from rather than sampling a second, unrelated set. That is what makes
       * the counts below evidence about this seed's route. The onion is
       * included because it is a zone the placement system has to keep viable,
       * even though no route validated here collects it.
       */
      const zones = {};
      for (const id of Object.keys(ZONES)) {
        const { anchors, rejected } = candidatesFor(ZONES[id], terrain, seed, course);
        const byReason = {};
        for (const r of rejected) {
          const key = reasonKey(r.reason);
          byReason[key] = (byReason[key] || 0) + 1;
        }
        zones[id] = { anchors: anchors.length, rejected: rejected.length, byReason };
      }

      const record = {
        seed,
        ok: false,
        reason: null,
        attempts: route.attempts,
        zones,
        placements: [],
      };

      if (!route.ok) {
        record.reason = route.reason || "route selection failed with no reason given";
        results.push(record);
        continue;
      }
      if (route.placements.length !== ids.length) {
        record.reason =
          `placed ${route.placements.length} pickups for ${ids.length} ingredients`;
        results.push(record);
        continue;
      }

      const p = route.placements;
      record.placements = p.map(a => ({
        ingredient: a.ingredient,
        zone: a.zone,
        x: round(a.x),
        y: round(a.y),
        z: round(a.z),
        slope: Number(a.slope.toFixed(4)),
      }));

      let heightError = 0;
      for (const a of p) {
        const surface = terrain.heightAt(a.x, a.z);
        const off = Math.abs(a.y - surface);
        if (off > heightError) heightError = off;
        // Every placement is measured, so the report carries the worst
        // residual, but the reason names the first one that broke — later
        // pickups must not overwrite the account of what went wrong.
        if (!(off <= tolerance) && !record.reason) {
          record.reason =
            `${a.ingredient} sits ${(a.y - surface).toFixed(6)} m off the baked ` +
            `surface at x=${round(a.x)}, z=${round(a.z)}`;
        }
      }
      record.heightError = heightError;

      let minGap = Infinity;
      let tightestLateral = 0;
      for (let i = 1; i < p.length && !record.reason; i++) {
        const a = p[i - 1];
        const b = p[i];
        const dz = b.z - a.z;
        const dx = Math.abs(b.x - a.x);
        if (dz < minGap) minGap = dz;
        if (dz > 0 && dx / dz > tightestLateral) tightestLateral = dx / dz;
        if (!(dz > 0)) {
          record.reason =
            `${a.ingredient} → ${b.ingredient} does not run downhill ` +
            `(dz ${dz.toFixed(2)} m)`;
          break;
        }
        if (dx > dz * ratio + epsilon) {
          record.reason =
            `${a.ingredient} → ${b.ingredient} needs ${dx.toFixed(1)} m of ` +
            `lateral shift in ${dz.toFixed(1)} m of run`;
          break;
        }
      }
      record.minGap = Number.isFinite(minGap) ? round(minGap) : null;
      record.tightestLateral = Number(tightestLateral.toFixed(4));

      const last = p[p.length - 1];
      if (!record.reason && !(last.z < BASE_CAMP_Z)) {
        record.reason =
          `the last pickup sits at z=${round(last.z)}, at or past the ` +
          `finish gate at z=${BASE_CAMP_Z}`;
      }

      record.ok = record.reason === null;
      results.push(record);
    }
    return results;
  }, {
    seeds,
    ids: REQUIRED,
    ratio: MAX_LATERAL_RATIO,
    epsilon: LATERAL_EPSILON,
    tolerance: HEIGHT_TOLERANCE,
    courseId,
  });

  const seedResults = [];
  for (let from = 1; from <= seedCount; from += BATCH) {
    const seeds = [];
    for (let s = from; s < from + BATCH && s <= seedCount; s++) seeds.push(s);
    seedResults.push(...await sweep(seeds));
    process.stderr.write(
      `\rsweeping ${Math.min(from + BATCH - 1, seedCount)}/${seedCount} seeds`,
    );
  }
  process.stderr.write("\r".padEnd(40) + "\r");

  // ------------------------------------------------------------- aggregation
  const zoneIds = Object.keys(seedResults[0].zones);
  const zoneStats = {};
  for (const id of zoneIds) {
    const counts = seedResults.map(r => r.zones[id].anchors);
    const byReason = {};
    let rejected = 0;
    for (const r of seedResults) {
      rejected += r.zones[id].rejected;
      for (const [key, n] of Object.entries(r.zones[id].byReason)) {
        byReason[key] = (byReason[key] || 0) + n;
      }
    }
    zoneStats[id] = {
      routed: REQUIRED.includes(id),
      anchors: {
        min: Math.min(...counts),
        median: median(counts),
        max: Math.max(...counts),
      },
      rejectedTotal: rejected,
      // Descending, because the first line of a zone that has stopped
      // producing anchors is the rule that ate them.
      rejectionsByReason: Object.fromEntries(
        Object.entries(byReason).sort((a, b) => b[1] - a[1]),
      ),
    };
  }

  const failures = seedResults.filter(r => !r.ok);
  const passing = seedResults.filter(r => r.ok);
  const route = {
    // How close the sweep came to the module's own 256-attempt ceiling. A figure
    // that creeps upwards is the geometry becoming infeasible, and it says so
    // well before any seed actually fails.
    maxAttempts: Math.max(...seedResults.map(r => r.attempts || 0)),
    maxHeightError: passing.length ? Math.max(...passing.map(r => r.heightError)) : null,
    minGap: passing.length ? Math.min(...passing.map(r => r.minGap)) : null,
    tightestLateral: passing.length
      ? Math.max(...passing.map(r => r.tightestLateral))
      : null,
  };

  const ok = failures.length === 0 && consoleErrors.length === 0 && gpuErrors.length === 0;

  const report = {
    tool: "tools/snow-burgers/validate-placement-windows.cjs",
    url,
    when: new Date().toISOString(),
    seedCount,
    ingredients: REQUIRED,
    limits: {
      maxLateralRatio: MAX_LATERAL_RATIO,
      physicalLateralCeiling: PHYSICAL_LATERAL_CEILING,
      requiredSelectionReserve: 0.04,
      heightTolerance: HEIGHT_TOLERANCE,
    },
    heightfield,
    ok,
    passed: passing.length,
    failed: failures.length,
    route,
    zones: zoneStats,
    seeds: seedResults.map(r => ({
      seed: r.seed,
      ok: r.ok,
      reason: r.reason,
      attempts: r.attempts,
      placements: r.placements,
    })),
    consoleErrors,
    gpuErrors,
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

  // ---------------------------------------------------------------- summary
  // Everything here also lives in the report; this is the operator's read of
  // it. The nulls are real — with no passing seed there is nothing to have
  // measured — so they are printed as such rather than as a zero.
  const shown = v => (v === null ? "n/a" : v);
  console.error(
    `terrain   ${heightfield.cpuResolution}² readback at ` +
    `${heightfield.cpuTexelMetres?.toFixed(2)} m texels, heights ` +
    `${heightfield.minHeight.toFixed(1)} .. ${heightfield.maxHeight.toFixed(1)} m`,
  );
  console.error("zone      anchors min/med/max   most common rejection");
  for (const id of zoneIds) {
    const z = zoneStats[id];
    const top = Object.entries(z.rejectionsByReason)[0];
    console.error(
      `${id.padEnd(9)} ${String(z.anchors.min).padStart(4)} /` +
      `${String(z.anchors.median).padStart(4)} /${String(z.anchors.max).padStart(4)}   ` +
      (z.routed ? "" : "(not routed) ") +
      (top ? `${top[0]} ×${top[1]}` : "nothing rejected"),
    );
  }
  console.error(
    `route     ${passing.length}/${seedCount} seeds complete · ` +
    `worst |Δy| ${shown(route.maxHeightError)} m · ` +
    `tightest lateral ${shown(route.tightestLateral)} of ${MAX_LATERAL_RATIO} validation ` +
    `(physical ceiling ${PHYSICAL_LATERAL_CEILING}) · ` +
    `most attempts ${route.maxAttempts} of the module's 256`,
  );
  for (const f of failures.slice(0, 10)) {
    console.error(`  FAIL seed ${f.seed}: ${f.reason}`);
  }
  if (failures.length > 10) {
    console.error(`  … and ${failures.length - 10} more failing seeds`);
  }
  for (const line of [...gpuErrors, ...consoleErrors].slice(0, 10)) {
    console.error(`  BROWSER ${line}`);
  }
  console.error(
    `${ok ? "PASS" : "FAIL"}      wrote ${path.relative(process.cwd(), output)}`,
  );

  if (!ok) process.exitCode = 1;
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
