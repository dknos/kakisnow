/**
 * Big Air Basin showcase — stills from the places the course is about.
 *
 * The profile probe proves the geometry in numbers; this proves it in pixels,
 * which is a separate claim. Every frame here is taken with the rider posed on
 * the real baked terrain at a real point on the course, with the game's own
 * camera rig, so a frame that looks wrong IS wrong.
 *
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/big-air/showcase-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/big-air/showcase
 *
 * `--fly` additionally lets the physics run from the lip and photographs the
 * flight, which is the only way to see whether the takeoff actually launches.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

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
const output = path.resolve(arg("--out", "screenshots/big-air/showcase"));
const doFly = process.argv.includes("--fly");

/** Where to stand, and what the camera should be doing there. */
const SHOTS = [
  { id: "01-drop-in", z: -262, x: 0, yaw: 0, pitch: 0.16, dist: 11,
    note: "the pipe, looking down its length" },
  { id: "02-mid-pipe", z: -60, x: -13, yaw: 0.12, pitch: 0.13, dist: 10.5,
    note: "deep in the pipe, up the wall" },
  { id: "03-pipe-exit", z: 128, x: 0, yaw: 0, pitch: 0.10, dist: 12,
    note: "the walls falling away" },
  { id: "04-inrun", z: 232, x: 0, yaw: 0, pitch: 0.06, dist: 12,
    note: "the iced in-run, hill visible past the lip" },
  { id: "05-lip", z: 296, x: 0, yaw: 0, pitch: 0.02, dist: 9,
    note: "standing on the table" },
  { id: "06-hill-from-below", z: 400, x: 0, yaw: Math.PI, pitch: 0.10, dist: 26,
    note: "looking back up the landing hill at the takeoff" },
  { id: "07-outrun", z: 470, x: 0, yaw: 0, pitch: 0.10, dist: 13,
    note: "the basin floor and the camp" },
  { id: "08-basin-wide", z: 360, x: 96, yaw: -1.15, pitch: 0.22, dist: 42,
    note: "the whole basin from its shoulder" },
];

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-showcase-"));
fs.mkdirSync(output, { recursive: true });
let context = null;

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    args: ["--no-first-run", "--no-default-browser-check", "--ignore-gpu-blocklist"],
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.stack || e.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  try {
    await page.waitForFunction(
      () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.scene),
      null, { timeout: 240_000 },
    );
  } catch (err) {
    // A boot that never finishes is almost always one thrown exception, and
    // the timeout alone does not name it.
    console.error("boot never completed. console said:\n" + errors.join("\n"));
    throw err;
  }
  await page.waitForTimeout(1500);

  const place = (s) => page.evaluate((s) => {
    const app = window.KAKISNOW;
    const ch = app.character;
    const y = app.terrain.heightAt(s.x, s.z);
    ch.position.set(s.x, y, s.z);
    ch.velocity.set(0, 0, s.speed || 0);
    ch.prevVelocity.copyFrom(ch.velocity);
    ch.acceleration.setAll(0);
    ch.facing = 0;
    ch.groundY = y;
    ch.grounded = true;
    ch.airborne = false;
    ch.crashed = false;
    ch.verticalVelocity = 0;
    ch.airTime = 0;
    ch.jumpCount = 0;
    app.input.surf = Boolean(s.speed);
    ch.surf = s.speed ? 1 : 0;
    app.rig._first = true;
    app.rig.groundLift = 0;
    app.rig.yaw = s.yaw ?? 0;
    app.rig.pitch = s.pitch ?? 0.14;
    app.rig.distance = s.dist ?? 11;
    app.rig.distanceTarget = app.rig.distance;
  }, s);

  // What the venue actually built. Prop scale bugs are invisible in a wide
  // shot of a white basin and obvious in a bounding box, so read the numbers
  // before looking at the pixels.
  const venue = await page.evaluate(() => {
    const scene = window.KAKISNOW.scene;
    const rows = [];
    for (const m of scene.meshes) {
      if (!/^venue/.test(m.name)) continue;
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      rows.push({
        name: m.name,
        tris: Math.round(m.getTotalIndices() / 3),
        min: [b.minimumWorld.x, b.minimumWorld.y, b.minimumWorld.z].map(v => +v.toFixed(1)),
        size: [
          b.maximumWorld.x - b.minimumWorld.x,
          b.maximumWorld.y - b.minimumWorld.y,
          b.maximumWorld.z - b.minimumWorld.z,
        ].map(v => +v.toFixed(1)),
      });
    }
    return rows;
  });
  fs.writeFileSync(
    path.join(output, "venue.json"), `${JSON.stringify(venue, null, 2)}\n`,
  );
  const merged = venue.filter(r => r.name.startsWith("venue_"));
  console.log(`venue: ${venue.length} meshes, ${merged.reduce((a, r) => a + r.tris, 0)} tris in ${merged.length} merged families`);
  for (const r of merged) {
    console.log(`  ${r.name.padEnd(34)} ${String(r.tris).padStart(6)} tris  extent ${r.size.join(" x ")}`);
  }

  const report = [];
  for (const s of SHOTS) {
    await place(s);
    await page.waitForTimeout(900);
    const file = path.join(output, `${s.id}.png`);
    await page.screenshot({ path: file });
    const stat = await page.evaluate(({ x, z }) => ({
      ground: Number(window.KAKISNOW.terrain.heightAt(x, z).toFixed(2)),
    }), s);
    report.push({ ...s, ground: stat.ground, file: path.basename(file) });
    console.log(`${s.id}  ground=${stat.ground} m  — ${s.note}`);
  }

  if (doFly) {
    // Let the real physics take the real lip. Nothing is scripted past the
    // push: if this does not leave the ground, the table does not work.
    await place({ x: 0, z: 150, yaw: 0, pitch: 0.10, dist: 12, speed: 26 });
    await page.evaluate(() => {
      const app = window.KAKISNOW;
      app.input.surf = true;
      app.character.surf = 1;
      window.__bigAirTrace = [];
      const trace = () => {
        const c = app.character;
        window.__bigAirTrace.push([
          Number(c.position.z.toFixed(1)), Number(c.position.y.toFixed(2)),
          Number(c.speed.toFixed(1)), c.airborne ? 1 : 0,
          Number(c.airTime.toFixed(2)),
        ]);
        if (window.__bigAirTrace.length < 900) requestAnimationFrame(trace);
      };
      trace();
    });
    for (let i = 0; i < 9; i++) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, `fly-${String(i).padStart(2, "0")}.png`) });
    }
    const trace = await page.evaluate(() => window.__bigAirTrace);
    const air = trace.filter(t => t[3] === 1);
    const summary = {
      samples: trace.length,
      launchedAtZ: air.length ? air[0][0] : null,
      landedAtZ: air.length ? air[air.length - 1][0] : null,
      maxAirTime: Math.max(0, ...trace.map(t => t[4])),
      peakY: Math.max(...trace.map(t => t[1])),
      minY: Math.min(...trace.map(t => t[1])),
      topSpeed: Math.max(...trace.map(t => t[2])),
    };
    fs.writeFileSync(
      path.join(output, "flight.json"),
      `${JSON.stringify({ summary, trace }, null, 2)}\n`,
    );
    console.log("flight: " + JSON.stringify(summary));
  }

  fs.writeFileSync(
    path.join(output, "shots.json"), `${JSON.stringify(report, null, 2)}\n`,
  );
  if (errors.length) console.log("console errors:\n" + errors.join("\n"));
})()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  });
