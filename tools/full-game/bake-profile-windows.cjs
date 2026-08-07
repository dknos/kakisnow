/**
 * Fingerprint the baked course.
 *
 * Samples `terrain.heightAt` over a dense grid covering the course and writes
 * the numbers to JSON. Run once before a heightfield-bake refactor and once
 * after: identical numbers prove the refactor produced the identical mountain,
 * which matters because records, ghosts, medal thresholds and the 100-seed
 * placement validation were all measured against this exact terrain.
 *
 * The CPU mirror is bicubic over a 1 m grid, so sampling at 2 m steps
 * fingerprints every texel that matters without a 4-million-line file.
 *
 * Usage:
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/full-game/bake-profile-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/full-game/bake-profile.json
 *
 *   # then, after the change:
 *   ... --out screenshots/full-game/bake-profile-after.json
 *   diff <(jq .samples screenshots/full-game/bake-profile.json) \
 *        <(jq .samples screenshots/full-game/bake-profile-after.json)
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
const output = path.resolve(arg("--out", "screenshots/full-game/bake-profile.json"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-bake-"));

fs.mkdirSync(path.dirname(output), { recursive: true });

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
  page.on("pageerror", (e) => errors.push(e.stack || e.message));

  const u = new URL(url);
  if (!u.searchParams.has("mode")) u.searchParams.set("mode", "free-ride");
  await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true &&
          window.KAKISNOW?.terrain?.heightfield?.heightCPU,
    null,
    { timeout: 300_000 },
  );

  const data = await page.evaluate(() => {
    const t = window.KAKISNOW.terrain;
    // The course plus generous margins: x ±80 covers the lane and its feather,
    // z −120..640 covers the gate run-in, the whole line and the camp.
    const samples = [];
    for (let z = -120; z <= 640; z += 2) {
      const row = [];
      for (let x = -80; x <= 80; x += 2) {
        row.push(+t.heightAt(x, z).toFixed(4));
      }
      samples.push(row);
    }
    return {
      xFrom: -80, xTo: 80, zFrom: -120, zTo: 640, step: 2,
      minHeight: t.heightfield.minHeight,
      maxHeight: t.heightfield.maxHeight,
      samples,
    };
  });

  fs.writeFileSync(output, JSON.stringify(data) + "\n");
  process.stderr.write(
    `${data.samples.length}x${data.samples[0].length} samples · ` +
    `range ${data.minHeight?.toFixed?.(2)}..${data.maxHeight?.toFixed?.(2)} m · ` +
    `${errors.length} page errors\nwrote ${output}\n`,
  );

  await context.close();
  process.exit(errors.length ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  if (context) await context.close().catch(() => {});
  process.exit(1);
});
