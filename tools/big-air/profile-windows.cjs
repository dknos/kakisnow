/**
 * Centreline profile probe.
 *
 * Big Air Basin has to be authored against the mountain that is actually
 * there, and `terrainMacro` carries no global downhill term — the descent a
 * course rides is whatever the dune and swell noise happens to do along that
 * line. Guessing at it produced, on the first attempt, an "in-run" that ran
 * uphill. So: boot the course, read `terrain.heightAt` along the centreline
 * and a few lateral offsets, and print the real profile with its slope in
 * degrees.
 *
 * This reads the baked heightfield, which means it reports the course's
 * primitives too — run it with the terrain block empty to see the natural
 * mountain, and again afterwards to check what the primitives did to it.
 *
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/big-air/profile-windows.cjs \
 *     --url http://127.0.0.1:5173 --course big-air-basin --from -320 --to 600
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

/** Every capture tool here has to escape the title screen's scrim. */
function freeRide(target, course) {
  const u = new URL(target);
  if (!u.searchParams.has("mode")) u.searchParams.set("mode", "free-ride");
  if (course) u.searchParams.set("course", course);
  return u.toString();
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const course = arg("--course", "big-air-basin");
const url = freeRide(arg("--url", "http://127.0.0.1:5173"), course);
const zFrom = Number(arg("--from", -320));
const zTo = Number(arg("--to", 600));
const step = Number(arg("--step", 2));
const output = path.resolve(arg("--out", "screenshots/big-air/profile"));
const lanes = arg("--lanes", "-40,-24,-12,0,12,24,40").split(",").map(Number);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-profile-"));
fs.mkdirSync(output, { recursive: true });
let context = null;

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ["--no-first-run", "--no-default-browser-check", "--ignore-gpu-blocklist"],
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.stack || e.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.scene),
    null, { timeout: 240_000 },
  );
  await page.waitForTimeout(800);

  const data = await page.evaluate(({ zFrom, zTo, step, lanes }) => {
    const t = window.KAKISNOW.terrain;
    const rows = [];
    for (let z = zFrom; z <= zTo; z += step) {
      rows.push({
        z,
        h: lanes.map(x => Number(t.heightAt(x, z).toFixed(3))),
      });
    }
    return {
      // The heightfield keeps the course it actually baked, which is the one
      // this report is describing — `game.course` is the director's view and
      // was null under `?mode=free-ride`.
      courseId: window.KAKISNOW.terrain.heightfield.course?.id ?? null,
      lanes,
      rows,
      relief: {
        min: t.heightfield.minHeight,
        max: t.heightfield.maxHeight,
      },
    };
  }, { zFrom, zTo, step, lanes });

  fs.writeFileSync(
    path.join(output, `${course}.json`),
    `${JSON.stringify(data, null, 2)}\n`,
  );

  // ------------------------------------------------------------------ report
  const mid = lanes.indexOf(0) >= 0 ? lanes.indexOf(0) : 0;
  const centre = data.rows.map(r => r.h[mid]);
  const zs = data.rows.map(r => r.z);

  const lo = Math.min(...centre);
  const hi = Math.max(...centre);
  const WIDTH = 92;
  const lines = [];
  lines.push(`course=${data.courseId}  z ${zFrom}..${zTo} step ${step}`);
  lines.push(`centreline height ${lo.toFixed(1)} .. ${hi.toFixed(1)} m  ` +
             `(field relief ${data.relief.min.toFixed(1)} .. ${data.relief.max.toFixed(1)})`);
  lines.push("");
  lines.push("     z  height   slope°   " + "-".repeat(WIDTH - 24) + " profile");

  for (let i = 0; i < zs.length; i++) {
    const h = centre[i];
    const dz = i > 0 ? (centre[i] - centre[i - 1]) / step : 0;
    // Positive degrees = downhill in +z, which is the direction of travel.
    const deg = (Math.atan(-dz) * 180) / Math.PI;
    const col = Math.round(((h - lo) / Math.max(1e-6, hi - lo)) * (WIDTH - 26));
    const bar = " ".repeat(col) + "#";
    if (zs[i] % 10 === 0) {
      lines.push(
        `${String(zs[i]).padStart(6)}  ${h.toFixed(1).padStart(6)}  ` +
        `${deg.toFixed(1).padStart(6)}   ${bar}`
      );
    }
  }

  // Sustained-descent summary: mean slope over each 40 m block.
  lines.push("");
  lines.push("mean downhill slope per 40 m block:");
  for (let z = zFrom; z + 40 <= zTo; z += 40) {
    const a = centre[Math.round((z - zFrom) / step)];
    const b = centre[Math.round((z + 40 - zFrom) / step)];
    const deg = (Math.atan((a - b) / 40) * 180) / Math.PI;
    lines.push(`  ${String(z).padStart(5)}..${String(z + 40).padStart(4)}  ` +
               `${(a - b >= 0 ? "-" : "+")}${Math.abs(a - b).toFixed(1).padStart(5)} m  ` +
               `${deg.toFixed(1).padStart(6)}°  ${deg > 0 ? "▼".repeat(Math.min(20, Math.round(deg))) : "UPHILL"}`);
  }

  const text = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(output, `${course}.txt`), text);
  console.log(text);
  if (errors.length) console.log("console errors:\n" + errors.join("\n"));
})()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  });
