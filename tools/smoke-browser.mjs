/**
 * Portable production-preview boot smoke.
 *
 * This is deliberately a presentation/boot check, not a GPU certification:
 * it accepts either the real KAKISNOW ready marker or the authored WebGPU
 * unavailable screen. A ready result is meaningful only for the browser
 * configuration running the smoke; it does not certify the target discrete
 * GPU, frame budget, or WebGPU validation state.
 *
 * The workflow installs Chromium before invoking this file. Locally, an
 * explicit PLAYWRIGHT_EXECUTABLE_PATH/CHROME_PATH can point to an installed
 * browser, otherwise Playwright's managed browser is used.
 *
 *   node tools/smoke-browser.mjs --url http://127.0.0.1:4173
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { expectedUnavailableError } from "./smoke-browser-logic.mjs";

const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};

const url = arg("--url", "http://127.0.0.1:4173");
const output = path.resolve(arg("--out", "reports/browser-smoke"));
const requestedTimeout = Number(arg("--timeout-ms", "60000"));
const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(120000, Math.max(10000, requestedTimeout))
    : 60000;
const screenshotPath = path.join(output, "boot.png");
const reportPath = path.join(output, "report.json");

await mkdir(output, { recursive: true });

const report = {
    schema: 1,
    generatedBy: "tools/smoke-browser.mjs",
    url,
    timeoutMs,
    scope: "boot/presentation smoke; not hardware or frame-budget certification",
    status: "not-started",
    browser: null,
    state: null,
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
    expectedStartupFailures: [],
    blockingFailures: [],
    runnerError: null,
    screenshot: path.relative(process.cwd(), screenshotPath),
};

let browser;
let page;

function recordConsole(message) {
    if (message.type() === "error") report.consoleErrors.push(message.text());
}


try {
    const explicitExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROME_PATH;
    const localChromium = "/home/nemoclaw/bin/chromium";
    const executablePath = explicitExecutable || (existsSync(localChromium) ? localChromium : undefined);
    browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        timeout: Math.min(timeoutMs, 60000),
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu-sandbox",
            // Do not force Vulkan/SwiftShader here. Some hosted Chromium
            // builds expose navigator.gpu but hard-stall that software path,
            // including page timers. The portable smoke accepts the authored
            // unavailable presentation; real ready/device behavior is covered
            // by the Windows hardware-WebGPU gauntlet.
        ],
    });
    report.browser = { executablePath: executablePath || "playwright-managed", headless: true };
    page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on("console", recordConsole);
    page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));
    page.on("requestfailed", (request) => report.requestFailures.push({
        url: request.url(),
        method: request.method(),
        error: request.failure()?.errorText || "unknown request failure",
    }));
    page.on("response", (response) => {
        if (response.status() >= 400) report.httpFailures.push({
            url: response.url(),
            status: response.status(),
            method: response.request().method(),
        });
    });

    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 30000) });
        await page.waitForFunction(() => (
            window.__KAKISNOW__?.ready === true ||
            document.querySelector("#nogpu.show") !== null
        ), null, { timeout: timeoutMs });
    } catch (error) {
        report.runnerError = error.stack || error.message;
    }

    if (page) {
        report.state = await page.evaluate(() => {
            const unavailable = document.querySelector("#nogpu");
            const boot = document.querySelector("#boot");
            const bootPhase = document.querySelector("#boot-phase");
            const bootBar = document.querySelector("#boot-bar");
            return {
                ready: window.__KAKISNOW__?.ready === true,
                product: window.__KAKISNOW__?.product ?? null,
                hasNavigatorGpu: Boolean(navigator.gpu),
                unavailableVisible: unavailable?.classList.contains("show") ?? false,
                unavailableText: unavailable?.textContent?.replace(/\s+/g, " ").trim() ?? "",
                bootVisible: Boolean(boot && getComputedStyle(boot).display !== "none" && !boot.classList.contains("gone")),
                bootPhase: bootPhase?.textContent?.replace(/\s+/g, " ").trim() ?? "",
                bootProgress: bootBar instanceof HTMLElement ? bootBar.style.width : "",
                title: document.title,
            };
        });
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch (error) {
            report.runnerError ??= error.stack || error.message;
        }
    }

    const state = report.state;
    if (state?.ready) {
        if (state.product !== "KAKISNOW") report.blockingFailures.push("ready marker has unexpected product identity");
        if (state.unavailableVisible) report.blockingFailures.push("ready marker and WebGPU-unavailable screen are both visible");
        report.status = report.blockingFailures.length ? "fail" : "ready";
        report.blockingFailures.push(...report.requestFailures.map((failure) => `request failed: ${failure.url}`));
        report.blockingFailures.push(...report.httpFailures.map((failure) => `HTTP ${failure.status}: ${failure.url}`));
        report.blockingFailures.push(...report.pageErrors.map((failure) => `page error: ${failure}`));
        report.blockingFailures.push(...report.consoleErrors.map((failure) => `console error: ${failure}`));
        if (report.blockingFailures.length) report.status = "fail";
    } else if (state?.unavailableVisible && /webgpu/i.test(state.unavailableText)) {
        // An unavailable adapter is an accepted outcome for this portable
        // smoke. Keep the startup errors visible in the report, but classify
        // only unrelated network/errors as blocking.
        report.status = "webgpu-unavailable";
        report.expectedStartupFailures.push(...report.consoleErrors.filter(expectedUnavailableError));
        report.expectedStartupFailures.push(...report.pageErrors.filter(expectedUnavailableError));
        report.blockingFailures.push(...report.requestFailures.map((failure) => `request failed: ${failure.url}`));
        report.blockingFailures.push(...report.httpFailures.map((failure) => `HTTP ${failure.status}: ${failure.url}`));
        report.blockingFailures.push(...report.consoleErrors.filter((failure) => !expectedUnavailableError(failure)));
        report.blockingFailures.push(...report.pageErrors.filter((failure) => !expectedUnavailableError(failure)));
        if (report.blockingFailures.length) report.status = "fail";
    } else {
        report.status = "fail";
        report.blockingFailures.push(
            "neither window.__KAKISNOW__.ready nor the authored WebGPU-unavailable screen became visible",
        );
    }
} catch (error) {
    report.status = "fail";
    report.runnerError = error.stack || error.message;
    report.blockingFailures.push(report.runnerError);
} finally {
    if (browser) await browser.close().catch(() => {});
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

console.log(JSON.stringify(report, null, 2));
if (report.status === "fail" || report.runnerError) process.exitCode = 1;
