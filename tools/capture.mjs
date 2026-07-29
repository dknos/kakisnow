import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const url = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://127.0.0.1:5173";
const output = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "screenshots/_scratch";
const full = process.argv.includes("--full");
const smoke = process.argv.includes("--smoke");

await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/home/nemoclaw/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--use-angle=vulkan",
    "--use-vulkan=swiftshader",
    "--enable-dawn-features=allow_unsafe_apis",
  ],
});

const page = await browser.newPage({
  viewport: full ? { width: 2560, height: 1440 } : { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const errors = [];
const messages = [];
page.on("console", (message) => {
  messages.push(`${message.type()}: ${message.text()}`);
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.stack || error.message));
page.on("requestfailed", (request) => {
  errors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => window.__KAKISNOW__?.ready === true, null, { timeout: 240_000 });
await page.waitForTimeout(1200);

await page.screenshot({ path: path.join(output, "01-foundation.png") });
if (smoke) {
  const snapshot = await page.evaluate(() => ({ ...window.__KAKISNOW__ }));
  console.log(JSON.stringify({ snapshot, errors, messages }, null, 2));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
await page.keyboard.down("KeyW");
await page.waitForTimeout(1200);
await page.keyboard.up("KeyW");
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(output, "02-character-footprints.png") });

await page.mouse.move(full ? 1280 : 640, full ? 720 : 360);
await page.mouse.down({ button: "right" });
for (let i = 0; i < 7; i += 1) {
  await page.mouse.move(
    (full ? 1280 : 640) + i * 34,
    (full ? 720 : 360) + Math.sin(i) * 18,
    { steps: 4 },
  );
  await page.waitForTimeout(220);
}
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(output, "03-snow-surf.png") });
await page.mouse.up({ button: "right" });

for (let spell = 1; spell <= 5; spell += 1) {
  await page.keyboard.press(`Digit${spell}`);
  await page.waitForTimeout(spell === 4 ? 2100 : 1150);
  await page.screenshot({ path: path.join(output, `0${spell + 3}-spell-${spell}.png`) });
}

const adapter = await page.evaluate(async () => {
  const gpuAdapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  return gpuAdapter?.info || null;
});
const snapshot = await page.evaluate(() => ({ ...window.__KAKISNOW__ }));
const report = { url, adapter, snapshot, errors, messages };
await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await browser.close();

if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
