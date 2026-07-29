const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:4193";
const output = path.resolve(
  process.argv[3] || "screenshots/_scratch/rocker-turntable",
);
const style = process.argv[4] || "rocker";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-rocker-"));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    args: ["--no-first-run", "--ignore-gpu-blocklist"],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => window.__KAKISNOW__?.ready === true, null, {
    timeout: 240_000,
  });
  await page.evaluate((requestedStyle) => {
    const debug = window.__KAKISNOW_DEBUG__;
    debug.hero.setStyle(requestedStyle);
    debug.controller.cameraDistance = 6.4;
    debug.controller.targetCameraDistance = 6.4;
  }, style);
  const offsets = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  for (let index = 0; index < offsets.length; index += 1) {
    await page.evaluate((offset) => {
      const controller = window.__KAKISNOW_DEBUG__.controller;
      controller.cameraYaw = controller.facing + offset;
    }, offsets[index]);
    await page.waitForTimeout(420);
    await page.screenshot({
      path: path.join(output, `${index}-view.png`),
    });
  }
  await context.close();
})()
  .finally(() => {
    fs.rmSync(profile, { recursive: true, force: true });
  });
