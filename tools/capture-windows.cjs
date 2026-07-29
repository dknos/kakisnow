const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = readArgument("--url", "http://127.0.0.1:5173");
const output = path.resolve(readArgument("--out", "screenshots/milestones"));
const smoke = process.argv.includes("--smoke");
const diagnose = process.argv.includes("--diagnose");
const headed = process.argv.includes("--headed");
const viewport = { width: 2560, height: 1440 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kakisnow-chrome-"));
const validationPattern =
  /GPUValidationError|GPUInternalError|GPUOutOfMemoryError|WebGPU uncaptured error|WebGPU context lost|WebGPU[^:\n]*validation|Validation Error|Destroyed texture|texture[^:\n]*destroyed|device lost|command encoder|swapchain|swap chain/i;
fs.mkdirSync(output, { recursive: true });

function summarizeIntervals(intervals) {
  if (!intervals.length) {
    return {
      samples: 0,
      median: null,
      p95: null,
      p99: null,
      max: null,
      medianPlus4: null,
      aboveMedianPlus4: 0,
    };
  }
  const sorted = intervals.slice().sort((a, b) => a - b);
  const at = quantile => sorted[Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * quantile),
  )];
  const median = at(0.5);
  const medianPlus4 = median + 4;
  let aboveMedianPlus4 = 0;
  for (let i = 0; i < intervals.length; i += 1) {
    if (intervals[i] > medianPlus4) aboveMedianPlus4 += 1;
  }
  return {
    samples: intervals.length,
    median,
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
    medianPlus4,
    aboveMedianPlus4,
  };
}

async function readRuntimeInfo(page) {
  return page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter({
      powerPreference: "high-performance",
    });
    let info = null;
    if (adapter) {
      try {
        info = adapter.info || await adapter.requestAdapterInfo?.();
      } catch {
        info = null;
      }
    }

    const adapterFields = value => value ? {
      vendor: value.vendor || "",
      architecture: value.architecture || "",
      device: value.device || "",
      description: value.description || "",
      subgroupMinSize: value.subgroupMinSize || 0,
      subgroupMaxSize: value.subgroupMaxSize || 0,
      isFallbackAdapter:
        value.isFallbackAdapter || adapter?.isFallbackAdapter || false,
    } : null;

    const limitNames = [
      "maxTextureDimension1D",
      "maxTextureDimension2D",
      "maxTextureDimension3D",
      "maxTextureArrayLayers",
      "maxBindGroups",
      "maxBindingsPerBindGroup",
      "maxBufferSize",
      "maxUniformBufferBindingSize",
      "maxStorageBufferBindingSize",
      "maxComputeWorkgroupStorageSize",
      "maxComputeInvocationsPerWorkgroup",
      "maxComputeWorkgroupSizeX",
      "maxComputeWorkgroupSizeY",
      "maxComputeWorkgroupSizeZ",
      "maxColorAttachments",
    ];
    const limits = {};
    for (let i = 0; i < limitNames.length; i += 1) {
      const name = limitNames[i];
      const value = adapter?.limits?.[name];
      if (typeof value === "number") limits[name] = value;
    }

    const app = window.KAKISNOW;
    const caps = app?.engine?.getCaps?.() || {};
    let engineAdapterInfo = null;
    try {
      engineAdapterInfo =
        app?.engine?._adapterInfo ||
        app?.engine?._adapter?.info ||
        null;
    } catch {
      engineAdapterInfo = null;
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
      crossOriginIsolated,
      devicePixelRatio,
      webgpu: Boolean(navigator.gpu),
      adapter: adapterFields(info),
      engineAdapter: adapterFields(engineAdapterInfo),
      features: adapter ? Array.from(adapter.features).sort() : [],
      limits,
      engine: app ? {
        name: app.engine.name || app.engine.constructor?.name || "",
        version: app.engine.version || "",
        renderWidth: app.engine.getRenderWidth(),
        renderHeight: app.engine.getRenderHeight(),
        hardwareScalingLevel: app.engine.getHardwareScalingLevel(),
        fps: app.engine.getFps(),
        caps: {
          maxTextureSize: caps.maxTextureSize ?? null,
          maxCubemapTextureSize: caps.maxCubemapTextureSize ?? null,
          maxRenderTextureSize: caps.maxRenderTextureSize ?? null,
          maxMSAASamples: caps.maxMSAASamples ?? null,
          textureFloat: caps.textureFloat ?? null,
          textureFloatLinearFiltering: caps.textureFloatLinearFiltering ?? null,
          textureHalfFloat: caps.textureHalfFloat ?? null,
          textureHalfFloatLinearFiltering:
            caps.textureHalfFloatLinearFiltering ?? null,
          parallelShaderCompile: caps.parallelShaderCompile ?? null,
          supportComputeShaders: caps.supportComputeShaders ?? null,
          supportSRGBBuffers: caps.supportSRGBBuffers ?? null,
          timerQuery: caps.timerQuery ?? null,
        },
      } : null,
    };
  });
}

async function installGpuMonitor(page) {
  return page.evaluate(() => {
    const engine = window.KAKISNOW?.engine;
    const candidates = [
      engine?._device,
      engine?._deviceWrapper?.device,
      engine?._renderingDevice,
    ];
    const device = candidates.find(candidate =>
      candidate &&
      typeof candidate.addEventListener === "function" &&
      candidate.lost
    );
    const monitor = {
      installed: Boolean(device),
      uncapturedErrors: [],
      deviceLost: [],
    };
    window.__KAKISNOW_GPU_MONITOR__ = monitor;
    if (!device) return monitor;

    device.addEventListener("uncapturederror", event => {
      monitor.uncapturedErrors.push(
        event.error?.message || String(event.error || "unknown WebGPU error"),
      );
    });
    device.lost.then(info => {
      monitor.deviceLost.push({
        reason: info?.reason || "unknown",
        message: info?.message || "",
      });
    });
    return monitor;
  });
}

async function readGpuMonitor(page) {
  return page.evaluate(() => {
    const monitor = window.__KAKISNOW_GPU_MONITOR__;
    return monitor ? {
      installed: monitor.installed,
      uncapturedErrors: monitor.uncapturedErrors.slice(),
      deviceLost: monitor.deviceLost.slice(),
    } : {
      installed: false,
      uncapturedErrors: [],
      deviceLost: [],
    };
  });
}

async function readLoadingState(page) {
  return page.evaluate(() => ({
    phase: document.getElementById("boot-phase")?.textContent || "",
    progress: document.getElementById("boot-bar")?.style.width || "",
    visible: Boolean(document.getElementById("boot")),
    ready: window.__KAKISNOW__?.ready === true,
  }));
}

async function readCaptureState(page) {
  return page.evaluate(() => {
    const app = window.KAKISNOW;
    if (!app) return null;

    const vector = value => value
      ? [value.x, value.y, value.z].map(number =>
        Number.isFinite(number) ? number : null
      )
      : null;
    const stats = app.perfStats || {};
    const sceneMeshes = app.scene.meshes || [];
    let enabledMeshes = 0;
    let visibleMeshes = 0;
    let totalVertices = 0;
    let totalIndices = 0;
    for (let i = 0; i < sceneMeshes.length; i += 1) {
      const mesh = sceneMeshes[i];
      if (mesh.isEnabled()) enabledMeshes += 1;
      if (mesh.isEnabled() && mesh.isVisible !== false) visibleMeshes += 1;
      totalVertices += mesh.getTotalVertices();
      totalIndices += mesh.getTotalIndices();
    }

    return {
      heroStyle: app.S.heroStyle,
      settings: {
        preset: app.S.preset,
        resolutionScale: app.S.resolutionScale,
        showTerrain: app.S.showTerrain,
        showCharacter: app.S.showCharacter,
        showWake: app.S.showWake,
        showSpells: app.S.showSpells,
        debugView: app.S.debugView,
      },
      character: {
        position: vector(app.character.position),
        velocity: vector(app.character.velocity),
        facing: app.character.facing,
        speed: app.character.speed,
        speed01: app.character.speed01,
        surf: app.character.surf,
        surfActive: app.character.surfActive,
        lean: app.character.lean,
        carve: app.character.carve,
        gaitPhase: app.character.gaitPhase,
      },
      camera: {
        position: vector(app.rig.camera.position),
        yaw: app.rig.yaw,
        pitch: app.rig.pitch,
        distance: app.rig.distance,
        distanceTarget: app.rig.distanceTarget,
        fov: app.rig.fov,
      },
      heroes: {
        snowboundVisible: Boolean(
          app.figure.bodyMesh.isVisible ||
          app.figure.clothMesh.isVisible ||
          app.figure.furMesh.isVisible
        ),
        snowboundTriangles: app.figure.triangles,
        rockerAvailable: app.rocker.available,
        rockerActive: app.rocker.active,
        rockerTriangles: app.rocker.triangles,
      },
      wake: {
        visible: app.wake.mesh.isVisible,
        enabled: app.wake._enabled,
        points: app.wake._count,
        triangles: app.wake.mesh.metadata?.triangles || 0,
      },
      spells: {
        activeCount: app.spells.activeCount,
        active: app.spells.spells.map(spell => Boolean(spell.active)),
        ribbonHeld: app.spells.ribbon.held,
        debugRibbon: app.spells.debugRibbon,
        waterStrands: app.spells.water._live,
        crystalCount: app.spells.crystals.liveCount,
        triangles: app.spells.triangles,
      },
      particles: {
        liveCount: app.spray.liveCount,
      },
      render: {
        width: app.engine.getRenderWidth(),
        height: app.engine.getRenderHeight(),
        fps: app.engine.getFps(),
        sceneMeshes: sceneMeshes.length,
        enabledMeshes,
        visibleMeshes,
        totalVertices,
        totalIndices,
      },
      stats: {
        last: stats.last ?? null,
        median: stats.median ?? null,
        mean: stats.mean ?? null,
        p95: stats.p95 ?? null,
        p99: stats.p99 ?? null,
        max: stats.max ?? null,
        fps: stats.fps ?? null,
        fpsLow: stats.fpsLow ?? null,
        drawCalls: stats.drawCalls ?? null,
        triangles: stats.triangles ?? null,
        gpuMs: stats.gpuMs ?? null,
      },
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null,
    };
  });
}

async function collectDiagnostics(page) {
  return page.evaluate(() => {
    const app = window.KAKISNOW;
    return app.scene.meshes.map(mesh => ({
      name: mesh.name,
      material: mesh.material?.name || null,
      enabled: mesh.isEnabled(),
      visible: mesh.isVisible,
      renderingGroupId: mesh.renderingGroupId,
      vertices: mesh.getTotalVertices(),
      indices: mesh.getTotalIndices(),
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      scaling: [mesh.scaling.x, mesh.scaling.y, mesh.scaling.z],
    }));
  });
}

async function captureMilestone(page, milestones, name, file) {
  await page.screenshot({ path: path.join(output, file) });
  milestones.push({
    name,
    file,
    state: await readCaptureState(page),
  });
}

async function placeHeroOnFlatSnow(page) {
  return page.evaluate(() => {
    const app = window.KAKISNOW;
    let bestX = app.character.position.x;
    let bestZ = app.character.position.z;
    let bestY = app.terrain.heightAt(bestX, bestZ);
    let bestScore = Number.POSITIVE_INFINITY;
    for (let z = -24; z <= 24; z += 3) {
      for (let x = -24; x <= 24; x += 3) {
        const y = app.terrain.heightAt(x, z);
        const sx = Math.abs(
          app.terrain.heightAt(x + 0.6, z) -
          app.terrain.heightAt(x - 0.6, z),
        );
        const sz = Math.abs(
          app.terrain.heightAt(x, z + 0.6) -
          app.terrain.heightAt(x, z - 0.6),
        );
        const score = sx + sz - y * 0.012;
        if (score < bestScore) {
          bestX = x;
          bestY = y;
          bestZ = z;
          bestScore = score;
        }
      }
    }

    const character = app.character;
    character.position.set(bestX, bestY, bestZ);
    character.velocity.set(0, 0, 0);
    character.prevVelocity.set(0, 0, 0);
    character.acceleration.set(0, 0, 0);
    character.facing = 0.35;
    character.gaitPhase = 0;
    app.figure._needSettle = true;
    app.figure.figure._wasStance[0] = false;
    app.figure.figure._wasStance[1] = false;
    app.input.surf = false;
    app.rig._first = true;
    app.rig.groundLift = 0;
    return { x: bestX, y: bestY, z: bestZ, score: bestScore };
  });
}

async function frameIntervals(page, count) {
  return page.evaluate(sampleCount => new Promise(resolve => {
    const intervals = new Array(sampleCount);
    let index = 0;
    let previous = 0;
    function frame(now) {
      intervals[index] = now - previous;
      previous = now;
      index += 1;
      if (index < intervals.length) requestAnimationFrame(frame);
      else resolve(intervals);
    }
    requestAnimationFrame(now => {
      previous = now;
      requestAnimationFrame(frame);
    });
  }), count);
}

async function firstCastIntervals(page, spell, count = 36) {
  await page.evaluate(({ key, sampleCount }) => {
    const sample = {
      spell: key,
      done: false,
      intervals: new Array(sampleCount),
    };
    window.__KAKISNOW_CAST_SAMPLE__ = sample;
    let index = 0;
    let previous = 0;
    function frame(now) {
      sample.intervals[index] = now - previous;
      previous = now;
      index += 1;
      if (index < sample.intervals.length) requestAnimationFrame(frame);
      else sample.done = true;
    }
    const spells = window.KAKISNOW.spells;
    requestAnimationFrame(now => {
      previous = now;
      if (key === 2) spells.debugRibbon = true;
      spells.cast(key);
      requestAnimationFrame(frame);
    });
  }, { key: spell, sampleCount: count });
  await page.waitForFunction(
    () => window.__KAKISNOW_CAST_SAMPLE__?.done === true,
    null,
    { timeout: 5000 },
  );
  return page.evaluate(() =>
    window.__KAKISNOW_CAST_SAMPLE__.intervals.slice()
  );
}

async function clearSpellVisuals(page) {
  await page.evaluate(() => {
    const spells = window.KAKISNOW.spells;
    spells.debugRibbon = false;
    spells.holdRibbon(false);
    for (let i = 0; i < spells.spells.length; i += 1) {
      spells.spells[i].cancel();
    }
    // Crystals outlive the casting state by design. The capture sequence needs
    // each numbered milestone to start without the previous formation occluding it.
    spells.crystals.finishWarmUp();
  });
}

async function writeReport(file, report) {
  fs.writeFileSync(
    path.join(output, file),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

let context = null;

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: !headed,
    viewport,
    deviceScaleFactor: 1,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-gpu-blocklist",
      "--enable-precise-memory-info",
      "--disable-frame-rate-limit",
      "--disable-gpu-vsync",
    ],
  });
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  const errors = [];
  const validationWarnings = [];
  const messages = [];
  const milestones = [];

  page.on("console", message => {
    const entry = `${message.type()}: ${message.text()}`;
    messages.push(entry);
    if (message.type() === "error") errors.push(entry);
    if (validationPattern.test(entry)) validationWarnings.push(entry);
  });
  page.on("pageerror", error => {
    const entry = error.stack || error.message;
    errors.push(entry);
    if (validationPattern.test(entry)) validationWarnings.push(entry);
  });
  page.on("requestfailed", request => {
    errors.push(`${request.url()} ${request.failure()?.errorText || ""}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("#boot", { state: "attached", timeout: 5000 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, "00-loading-1440p.png") });
  milestones.push({
    name: "loading",
    file: "00-loading-1440p.png",
    state: await readLoadingState(page),
  });

  await page.waitForFunction(
    () => window.__KAKISNOW__?.ready === true && Boolean(window.KAKISNOW?.scene),
    null,
    { timeout: 240_000 },
  );
  await installGpuMonitor(page);
  await page.waitForTimeout(1800);
  await captureMilestone(
    page,
    milestones,
    "foundation",
    "01-foundation-1440p.png",
  );

  const runtime = await readRuntimeInfo(page);
  const flatSite = await placeHeroOnFlatSnow(page);
  await page.waitForTimeout(900);

  if (smoke) {
    const gpuMonitor = await readGpuMonitor(page);
    const report = {
      url,
      capturedAt: new Date().toISOString(),
      runtime,
      host: { platform: os.platform(), release: os.release(), arch: os.arch() },
      headed,
      viewport,
      flatSite,
      milestones,
      state: await readCaptureState(page),
      diagnostics: diagnose ? await collectDiagnostics(page) : null,
      errors,
      validationWarnings,
      gpuMonitor,
      messages,
    };
    await writeReport("smoke-report.json", report);
    if (
      errors.length ||
      validationWarnings.length ||
      gpuMonitor.uncapturedErrors.length ||
      gpuMonitor.deviceLost.length
    ) {
      process.exitCode = 1;
    }
    return;
  }

  await page.evaluate(() => {
    const app = window.KAKISNOW;
    app.set("showCharacter", false);
    app.rig.yaw = app.character.facing + 0.22;
    app.rig.pitch = 0.24;
    app.rig.distance = 9.5;
    app.rig.distanceTarget = 9.5;
    app.rig._first = true;
  });
  await page.waitForTimeout(650);
  await captureMilestone(
    page,
    milestones,
    "terrain-only",
    "02-terrain-snow-1440p.png",
  );

  await page.evaluate(() => {
    const app = window.KAKISNOW;
    app.setHeroStyle("snowbound");
    app.set("showCharacter", true);
    app.rig.yaw = app.character.facing + Math.PI - 0.34;
    app.rig.pitch = 0.12;
    app.rig.distance = 5.25;
    app.rig.distanceTarget = 5.25;
    app.rig._first = true;
  });
  await page.waitForTimeout(800);
  await captureMilestone(
    page,
    milestones,
    "snowbound hero",
    "03-character-snowbound-1440p.png",
  );

  const rockerAvailable = await page.evaluate(() => {
    const app = window.KAKISNOW;
    if (!app.rocker.available) return false;
    app.setHeroStyle("rockerkaki");
    app.rig.yaw = app.character.facing + Math.PI - 0.28;
    app.rig.pitch = 0.12;
    app.rig.distance = 6.2;
    app.rig.distanceTarget = 6.2;
    app.rig._first = true;
    return true;
  });
  if (rockerAvailable) {
    await page.waitForTimeout(800);
    await captureMilestone(
      page,
      milestones,
      "RockerKaki",
      "04-character-rockerkaki-1440p.png",
    );
  } else {
    milestones.push({
      name: "RockerKaki",
      file: null,
      skipped: "optional model unavailable",
      state: await readCaptureState(page),
    });
  }

  await page.evaluate(() => {
    const app = window.KAKISNOW;
    app.setHeroStyle("rockerkaki");
    app.set("showCharacter", true);
    app.rig.yaw = app.character.facing;
    app.rig.pitch = 0.36;
    app.rig.distance = 8.8;
    app.rig.distanceTarget = 8.8;
    app.rig._first = true;
    app.input.surf = true;
  });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1150);
  // Mouse-style steering keeps the player centred while forcing a real carve;
  // a long held diagonal eventually becomes straight travel and loses the
  // centrepiece's outboard wall before the screenshot.
  await page.evaluate(() => {
    window.KAKISNOW.rig.yaw += 0.72;
  });
  await page.waitForTimeout(420);
  await captureMilestone(
    page,
    milestones,
    "snow surf",
    "05-snow-surf-1440p.png",
  );
  const surfProof = await readCaptureState(page);

  await page.keyboard.up("KeyW");
  await page.evaluate(() => {
    window.KAKISNOW.input.surf = false;
  });
  await page.waitForTimeout(1450);
  await page.evaluate(() => {
    const app = window.KAKISNOW;
    app.set("showCharacter", false);
    app.set("showWake", false);
    // Put the camera ahead of the stopped player and look back down the run;
    // the normal chase camera faces away from the trail it just made.
    app.rig.yaw = app.character.facing + Math.PI;
    app.rig.pitch = 0.42;
    app.rig.distance = 10.8;
    app.rig.distanceTarget = 10.8;
    app.rig._first = true;
  });
  await page.waitForTimeout(500);
  await captureMilestone(
    page,
    milestones,
    "persistent deformation",
    "06-deformation-1440p.png",
  );

  await page.evaluate(() => {
    const app = window.KAKISNOW;
    app.set("showCharacter", true);
    app.set("showWake", true);
    app.character.velocity.set(0, 0, 0);
    app.character.prevVelocity.set(0, 0, 0);
    app.rig.yaw = app.character.facing;
    app.rig.pitch = 0.24;
    app.rig.distance = 8.6;
    app.rig.distanceTarget = 8.6;
    app.rig._first = true;
  });
  await page.waitForTimeout(650);

  // The sample itself occupies roughly 400 ms at 90 Hz or 600 ms at 60 Hz.
  // These extra waits place each screenshot near its strongest authored phase.
  const castSettleWaits = [300, 650, 400, 650, 150];
  const castNames = ["sweep", "ribbon", "bloom", "crystallize", "vortex"];
  const firstCasts = [];
  for (let spell = 1; spell <= 5; spell += 1) {
    const intervals = await firstCastIntervals(page, spell);
    firstCasts.push({
      spell,
      name: castNames[spell - 1],
      method: spell === 2
        ? "KAKISNOW.spells.cast(2) + debugRibbon"
        : `KAKISNOW.spells.cast(${spell})`,
      intervals,
      summary: summarizeIntervals(intervals),
    });
    await page.waitForTimeout(castSettleWaits[spell - 1]);
    await captureMilestone(
      page,
      milestones,
      `spell ${spell}: ${castNames[spell - 1]}`,
      `${String(spell + 6).padStart(2, "0")}-spell-${spell}-1440p.png`,
    );
    await clearSpellVisuals(page);
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => {
    const overlay = window.KAKISNOW.overlay;
    if (!overlay.visible) overlay.toggle();
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.KAKISNOW.overlay.resetSpikes());
  await page.waitForTimeout(400);
  await captureMilestone(
    page,
    milestones,
    "performance overlay",
    "12-performance-overlay-1440p.png",
  );
  await page.evaluate(() => {
    const overlay = window.KAKISNOW.overlay;
    if (overlay.visible) overlay.toggle();
  });

  const intervals = await frameIntervals(page, 360);
  const state = await readCaptureState(page);
  const gpuMonitor = await readGpuMonitor(page);
  const report = {
    url,
    capturedAt: new Date().toISOString(),
    runtime,
    host: { platform: os.platform(), release: os.release(), arch: os.arch() },
    headed,
    viewport,
    flatSite,
    rockerAvailable,
    surfProof,
    frameIntervals: {
      intervals,
      summary: summarizeIntervals(intervals),
    },
    firstCastIntervals: firstCasts,
    stats: state.stats,
    state,
    milestones,
    diagnostics: diagnose ? await collectDiagnostics(page) : null,
    errors,
    validationWarnings,
    gpuMonitor,
    messages,
  };
  await writeReport("capture-report.json", report);
  if (
    errors.length ||
    validationWarnings.length ||
    gpuMonitor.uncapturedErrors.length ||
    gpuMonitor.deviceLost.length
  ) {
    process.exitCode = 1;
  }
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await context?.close();
    } catch (error) {
      console.error(`Could not close browser context: ${error.message}`);
    }
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      console.error(`Could not remove temporary profile: ${error.message}`);
    }
  });
