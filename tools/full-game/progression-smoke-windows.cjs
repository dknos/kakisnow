/**
 * The tour, proven against real Chrome: locks derive from records, records
 * open mountains, tapes persist, and the whole menu drives from a keyboard.
 *
 * Usage:
 *   npm run dev &
 *   "/mnt/c/Program Files/nodejs/node.exe" tools/full-game/progression-smoke-windows.cjs \
 *     --url http://127.0.0.1:5173 --out screenshots/full-game/progression
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
const output = path.resolve(arg("--out", "screenshots/full-game/progression"));
const viewport = { width: 2560, height: 1440 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-prog-"));
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

  const boot = async (extra = "") => {
    await page.goto(url + extra, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.game),
      null, { timeout: 300_000 });
  };
  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });

  // ------------------------------------------------- fresh book: the locks
  await boot();
  const fresh = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#sb-title-menu .sb-item")];
    return {
      labels: items.map((b) => b.textContent.trim().split("\n")[0].trim()),
      locked: items.filter((b) => b.classList.contains("sb-locked")).length,
      travel: items.filter((b) => b.dataset.course).length,
    };
  });
  check("fresh book locks every other mountain",
    fresh.locked === 4 && fresh.travel === 0, JSON.stringify(fresh));
  await shot("01-title-locked");

  // ------------------------------------- records open mountains, derived
  await page.evaluate(() => {
    // A book that has served the Summit and medalled the forest.
    localStorage.setItem("snow-burgers.book", JSON.stringify({
      version: 2, burgers: 5, runs: 9, seenAssembly: true,
      unlockedCourses: ["summit-line"], secrets: {}, tutorial: {},
      lastSelected: { courseId: "summit-line", eventId: "summit-stack" },
      events: {
        "summit-stack": { completions: 3, bestTime: 39, bestStyle: 40,
          bestIntegrity: 80, bestRocket: 0, bestStars: 4, bestMedal: "silver",
          bestSeed: 1, courseId: "summit-line", courseVersion: 1,
          eventVersion: 1, bestVehicle: "classic-snowboard", bestGhost: null },
        "timber-melt": { completions: 2, bestTime: 44, bestStyle: 50,
          bestIntegrity: 85, bestRocket: 0, bestStars: 4, bestMedal: "gold",
          bestSeed: 2, courseId: "pinecone-pass", courseVersion: 1,
          eventVersion: 1, bestVehicle: "classic-snowboard", bestGhost: null },
      },
    }));
  });
  await boot();
  const opened = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#sb-title-menu .sb-item")];
    return {
      locked: items.filter((b) => b.classList.contains("sb-locked")).length,
      travel: items.filter((b) => b.dataset.course).map((b) => b.dataset.course),
      hasContinue: items.some((b) => b.dataset.continue),
      stars: null,
    };
  });
  // Summit served -> Pinecone open; forest gold -> Glacier open; 8 stars
  // reached (4+4) -> Midnight open; Whiteout still needs blue-plate and
  // night-shift completions.
  check("records open the tour as designed",
    opened.travel.length === 3 && opened.locked === 1 && opened.hasContinue,
    JSON.stringify(opened));
  await shot("02-title-opened");

  // -------------------------------------------------------- keyboard nav
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() =>
    document.activeElement?.textContent?.trim().split("\n")[0].trim() ?? "");
  check("arrows walk the title menu", focused.length > 0, focused);
  // Walk to the first event (Continue is first) and enter it.
  await page.evaluate(() => {
    [...document.querySelectorAll("#sb-title-menu .sb-item")]
      .find((b) => b.dataset.event)?.focus();
  });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const orderUp = await page.evaluate(() =>
    document.querySelector("#sb-order").classList.contains("on"));
  check("enter starts the focused event", orderUp, "order screen not shown");
  await page.evaluate(() => window.KAKISNOW.game.selectMode("title"));

  // -------------------------------------------------- settings from title
  await page.evaluate(() => {
    [...document.querySelectorAll("#sb-title-menu .sb-item")]
      .find((b) => b.dataset.titleSettings)?.click();
  });
  const settingsUp = await page.evaluate(() =>
    document.querySelector("#sb-settings").classList.contains("on"));
  check("settings reachable from title", settingsUp, "panel not shown");
  await shot("03-title-settings");
  await page.evaluate(() => window.KAKISNOW.game.ui.onPauseAction("settings-back"));
  const backToTitle = await page.evaluate(() =>
    document.querySelector("#sb-title").classList.contains("on"));
  check("settings back returns to title", backToTitle, "title not restored");

  // ------------------------------------------------------- recipe tapes
  const tape = await page.evaluate(() => {
    const k = window.KAKISNOW;
    k.game.selectMode("free-ride");
    const t = k.game.director.tapes.tapes[0];
    const c = k.character;
    c.position.set(t.x, t.y, t.z);
    return { id: t.id };
  });
  await page.waitForTimeout(400);
  const found = await page.evaluate(() => ({
    secrets: window.KAKISNOW.game.book.book.secrets,
    noticeUp: document.querySelector("#sb-notice")?.textContent ?? "",
  }));
  check("a tape collects in free ride and persists",
    (found.secrets["summit-line"] ?? []).includes(tape.id),
    JSON.stringify(found));

  // Persists across a reload.
  await boot();
  const persisted = await page.evaluate(() =>
    window.KAKISNOW.game.book.book.secrets["summit-line"] ?? []);
  check("the tape survives a reload", persisted.includes(tape.id),
    JSON.stringify(persisted));

  const report = {
    tool: "tools/full-game/progression-smoke-windows.cjs",
    url, viewport, failures,
    consoleErrors: errors,
    webgpuValidation: validation,
    ok: failures.length === 0 && errors.length === 0 && validation.length === 0,
  };
  fs.writeFileSync(path.join(output, "progression-smoke-report.json"),
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
