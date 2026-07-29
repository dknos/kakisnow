import { chromium } from "playwright";

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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const events = [];
page.on("console", message => events.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", error => events.push(`pageerror: ${error.stack || error.message}`));
page.on("requestfailed", request => events.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
await page.goto(process.argv[2] || "http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(25_000);
const state = await page.evaluate(() => ({
  qa: window.__KAKISNOW__ || null,
  loading: document.getElementById("loadLabel")?.textContent,
  percent: document.getElementById("loadPercent")?.textContent,
  error: document.body.dataset.error || null,
}));
console.log(JSON.stringify({ state, events }, null, 2));
await browser.close();
