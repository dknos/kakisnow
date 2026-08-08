/**
 * Final responsive-product capture against the real Windows Chrome/WebGPU
 * runtime. This is intentionally a small acceptance harness, not a fixture
 * renderer: every frame boots the production build and uses the shipped UI.
 *
 *   "C:\\Program Files\\nodejs\\node.exe" \
 *     tools/snow-burgers/capture-release-ui-windows.cjs \
 *     --url http://127.0.0.1:5190 \
 *     --out screenshots/final-gauntlet/release-ui
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = arg("--url", "http://127.0.0.1:5173");
const output = path.resolve(arg("--out", "screenshots/final-gauntlet/release-ui"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "snow-burgers-release-ui-"));
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|Validation Error|device lost|Destroyed texture/i;

const viewports = [
  { id: "1280x720", width: 1280, height: 720 },
  { id: "1920x1080", width: 1920, height: 1080 },
  { id: "2560x1440", width: 2560, height: 1440 },
  { id: "3440x1440", width: 3440, height: 1440 },
  // 1280x720 at 125% browser zoom has the same CSS-pixel working area.
  { id: "1280x720-zoom125-equivalent", width: 1024, height: 576 },
];

fs.mkdirSync(output, { recursive: true });
let context = null;

function writeJson(file, value) {
  fs.writeFileSync(path.join(output, file), `${JSON.stringify(value, null, 2)}\n`);
}

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
      "--disable-frame-rate-limit",
      "--disable-gpu-vsync",
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  const webgpuValidation = [];
  const failedRequests = [];
  page.on("console", (message) => {
    const line = `${message.type()}: ${message.text()}`;
    if (message.type() === "error") errors.push(line);
    if (validationPattern.test(line)) webgpuValidation.push(line);
  });
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()} ${request.failure()?.errorText || ""}`.trim());
  });

  async function boot(viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.game),
      null,
      { timeout: 300_000 },
    );
    await page.waitForFunction(
      () => !document.querySelector("#boot") && document.querySelector("#sb-title")?.classList.contains("on"),
      null,
      { timeout: 30_000 },
    );
  }

  async function inspectVisible(screenSelector) {
    return page.evaluate((selector) => {
      const screen = document.querySelector(selector);
      const visible = (element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      };
      const horizontalOverflow = [...screen.querySelectorAll("button, h1, h2, p, strong, span")]
        .filter(visible)
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { text: element.textContent.trim().slice(0, 80), left: box.left, right: box.right };
        })
        .filter((box) => box.left < -1 || box.right > innerWidth + 1);
      return {
        innerWidth,
        innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        screenScrollWidth: screen.scrollWidth,
        screenClientWidth: screen.clientWidth,
        screenScrollHeight: screen.scrollHeight,
        screenClientHeight: screen.clientHeight,
        horizontalOverflow,
      };
    }, screenSelector);
  }

  const checks = [];
  const captures = [];
  function check(name, ok, detail) {
    checks.push({ name, ok: Boolean(ok), detail });
    process.stderr.write(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}\n`);
  }

  for (const viewport of viewports) {
    await boot(viewport);
    const title = await page.evaluate(() => ({
      title: document.title,
      footer: document.querySelector(".sb-credit")?.textContent.trim() ?? "",
      screen: document.querySelector("#sb-title")?.classList.contains("on") ?? false,
    }));
    const titleLayout = await inspectVisible("#sb-title");
    check(`${viewport.id} title ready`, title.screen, JSON.stringify(title));
    check(`${viewport.id} visible version`, /Snow-Burgers v1\.0\.0/.test(title.footer), title.footer);
    check(`${viewport.id} no horizontal title clipping`,
      titleLayout.horizontalOverflow.length === 0 && titleLayout.documentWidth <= viewport.width + 1,
      JSON.stringify(titleLayout.horizontalOverflow.slice(0, 3)));
    const titleFile = `${viewport.id}-title.png`;
    await page.screenshot({ path: path.join(output, titleFile) });
    captures.push(titleFile);

    if (viewport.id === "1280x720" || viewport.id === "1280x720-zoom125-equivalent") {
      await page.click("[data-title-settings]");
      await page.waitForFunction(() => document.querySelector("#sb-settings")?.classList.contains("on"));
      const settingsLayout = await inspectVisible("#sb-settings");
      const back = await page.evaluate(() => {
        const button = document.querySelector('[data-pause="settings-back"]');
        button?.focus();
        const box = button?.getBoundingClientRect();
        return {
          focused: document.activeElement === button,
          top: box?.top ?? null,
          bottom: box?.bottom ?? null,
          label: button?.textContent.trim() ?? "",
        };
      });
      await page.waitForTimeout(80);
      const focusedBack = await page.evaluate(() => {
        const button = document.querySelector('[data-pause="settings-back"]');
        const box = button?.getBoundingClientRect();
        return { top: box?.top ?? null, bottom: box?.bottom ?? null };
      });
      check(`${viewport.id} settings focus reaches Back`,
        back.focused && focusedBack.top >= -1 && focusedBack.bottom <= viewport.height + 1,
        JSON.stringify({ back, focusedBack }));
      check(`${viewport.id} no horizontal settings clipping`,
        settingsLayout.horizontalOverflow.length === 0,
        JSON.stringify(settingsLayout.horizontalOverflow.slice(0, 3)));
      const settingsFile = `${viewport.id}-settings.png`;
      await page.screenshot({ path: path.join(output, settingsFile) });
      captures.push(settingsFile);
    }

    if (viewport.id === "1280x720") {
      await page.click('[data-pause="settings-back"]');
      await page.click('[data-action="credits"]');
      await page.waitForFunction(() => document.querySelector("#sb-credits")?.classList.contains("on"));
      const creditsText = await page.locator("#sb-credits").innerText();
      check("credits expose package version", creditsText.includes("Snow-Burgers v1.0.0"), creditsText.slice(0, 160));
      check("credits expose privacy contract",
        creditsText.includes("No accounts, ads, analytics, or telemetry") && creditsText.includes("Export Save"),
        creditsText.slice(0, 240));
      const creditsFile = "1280x720-credits.png";
      await page.screenshot({ path: path.join(output, creditsFile) });
      captures.push(creditsFile);

      await page.click('[data-action="title"]');
      await page.click("#sb-title-menu [data-event]");
      await page.waitForFunction(() => document.querySelector("#sb-order")?.classList.contains("on"));
      const orderLayout = await inspectVisible("#sb-order");
      check("1280x720 order fits horizontally", orderLayout.horizontalOverflow.length === 0,
        JSON.stringify(orderLayout.horizontalOverflow.slice(0, 3)));
      const orderFile = "1280x720-order.png";
      await page.screenshot({ path: path.join(output, orderFile) });
      captures.push(orderFile);

      await page.click('[data-action="drop-in"]');
      await page.waitForFunction(() => document.querySelector("#sb-hud")?.classList.contains("on"), null, { timeout: 15_000 });
      await page.waitForTimeout(700);
      const hudFile = "1280x720-hud.png";
      await page.screenshot({ path: path.join(output, hudFile) });
      captures.push(hudFile);
    }
  }

  const report = {
    tool: "tools/snow-burgers/capture-release-ui-windows.cjs",
    url,
    viewports,
    checks,
    captures,
    consoleErrors: errors,
    failedRequests,
    webgpuValidation,
    ok: checks.every((entry) => entry.ok) && errors.length === 0 &&
      failedRequests.length === 0 && webgpuValidation.length === 0,
  };
  writeJson("release-ui-report.json", report);
  await context.close();
  context = null;
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(report.ok ? 0 : 1);
})().catch(async (error) => {
  console.error(error);
  if (context) await context.close().catch(() => {});
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
