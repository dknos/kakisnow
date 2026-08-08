import test from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    validateRegistry,
    validateDocumentationCounts,
    validateExpectedRuntimeManifest,
    runReleaseValidation,
    compareCandidateLedger,
    sha256,
    REPO_ROOT,
    EXPECTED_RUNTIME_MANIFEST_PATH,
} from "../tools/validate-release.mjs";
import { expectedUnavailableError } from "../tools/smoke-browser-logic.mjs";
import { PRODUCT_VERSION } from "../src/ui/snowBurgersUi.js";
import { withTimeout } from "../src/core/gpuUtil.js";

test("player-facing version is derived from the release package", async () => {
    const packageInfo = JSON.parse(await readFile(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(PRODUCT_VERSION, packageInfo.version);
});

test("release registry validator derives the current course, event, and tape counts", () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    const counts = validateRegistry(ctx);
    assert.deepEqual(
        { courses: counts.courses, events: counts.events, tapes: counts.tapes },
        { courses: 6, events: 12, tapes: 18 },
    );
    assert.equal(ctx.errors.length, 0);
});

test("documentation validator accepts current registry markers across release docs", async () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    await validateDocumentationCounts(ctx, { courses: 6, events: 12, tapes: 18 });
    assert.equal(ctx.errors.length, 0);
    assert.ok(ctx.checks.some((check) => check.name === "docs.required" && check.status === "pass"));
    assert.ok(ctx.checks.some((check) => check.name === "docs.counts" && check.status === "pass"));
});

test("documentation counts use the exact marker, not historical prose", async () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    await validateDocumentationCounts(ctx, { courses: 6, events: 12, tapes: 18 }, {
        requiredDocs: [],
        countedDocs: ["README.md"],
        documents: {
            "README.md": [
                "The old baseline mentioned five courses and thirteen events.",
                "<!-- snow-burgers-release-counts courses=6 events=12 tapes=18 -->",
            ].join("\n"),
        },
    });
    assert.equal(ctx.errors.length, 0);
});

test("documentation validator rejects a stale exact marker", async () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    await validateDocumentationCounts(ctx, { courses: 6, events: 12, tapes: 18 }, {
        requiredDocs: [],
        countedDocs: ["README.md"],
        documents: {
            "README.md": "<!-- snow-burgers-release-counts courses=5 events=13 tapes=18 -->",
        },
    });
    assert.ok(ctx.errors.some((error) => error.name === "docs.counts"));
});

test("candidate cross-check rejects a stale ledger hash", async () => {
    const file = "ingredient-cheese.glb";
    const relativePath = "art/generated-assets/snow-burgers/ingredient-cheese.glb";
    const bytes = await readFile(`${REPO_ROOT}/${relativePath}`);
    const hash = sha256(bytes);
    const ledger = [
        "## Original replacement candidate",
        "| Candidate file | Role | Bytes | SHA-256 |",
        "| --- | --- | ---: | --- |",
        `| \`${file}\` | pickup | ${bytes.length.toLocaleString("en-US")} | \`${hash}\` |`,
        `Total candidate size: ${bytes.length.toLocaleString("en-US")} bytes.`,
        "## RockerKaki",
    ].join("\n");
    const candidate = {
        candidateDirectory: "art/generated-assets/snow-burgers",
        totalBytes: bytes.length,
        assets: [{ file, path: relativePath, bytes: bytes.length, sha256: hash, ok: true }],
    };
    const valid = await compareCandidateLedger(ledger, candidate);
    assert.deepEqual(valid.problems, []);

    const stale = await compareCandidateLedger(
        ledger.replace(hash, "0".repeat(64)),
        candidate,
    );
    assert.ok(stale.problems.some((problem) => /SHA-256/.test(problem)));
});

async function validateManifestMutation(mutate) {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "snow-burgers-release-manifest-"));
    const manifestPath = path.join(tempRoot, "RUNTIME_MANIFEST.json");
    try {
        const manifest = JSON.parse(await readFile(EXPECTED_RUNTIME_MANIFEST_PATH, "utf8"));
        await mutate(manifest);
        await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
        const ctx = { checks: [], errors: [], warnings: [] };
        await validateExpectedRuntimeManifest(ctx, { manifestPathOverride: manifestPath });
        return ctx;
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

test("expected runtime manifest accepts all fixed dynamic assets", async () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    const result = await validateExpectedRuntimeManifest(ctx);
    assert.equal(result.assets.length, 31);
    assert.equal(ctx.errors.length, 0);
    assert.ok(ctx.checks.some((check) => check.name === "assets.expected-manifest" && check.status === "pass"));
});

test("expected runtime manifest rejects a missing dynamic asset entry", async () => {
    const ctx = await validateManifestMutation((manifest) => {
        manifest.assets = manifest.assets.filter((asset) =>
            asset.runtimePath !== "assets/models/snow-burgers/ingredient-onion.glb");
    });
    assert.ok(ctx.errors.some((error) => error.name === "assets.expected-manifest" &&
        error.missingExpected?.includes("assets/models/snow-burgers/ingredient-onion.glb")));
});

test("expected runtime manifest rejects a swapped runtime hash", async () => {
    const ctx = await validateManifestMutation((manifest) => {
        const cheese = manifest.assets.find((asset) =>
            asset.runtimePath === "assets/models/snow-burgers/ingredient-cheese.glb");
        const patty = manifest.assets.find((asset) =>
            asset.runtimePath === "assets/models/snow-burgers/ingredient-patty.glb");
        cheese.sha256 = patty.sha256;
    });
    assert.ok(ctx.errors.some((error) => error.name === "assets.manifest-runtime" &&
        error.message.includes("ingredient-cheese.glb")));
});

test("expected runtime manifest rejects a swapped dynamic runtime path", async () => {
    const ctx = await validateManifestMutation((manifest) => {
        const cheese = manifest.assets.find((asset) =>
            asset.runtimePath === "assets/models/snow-burgers/ingredient-cheese.glb");
        cheese.runtimePath = "assets/models/snow-burgers/ingredient-patty.glb";
    });
    assert.ok(ctx.errors.some((error) => error.name === "assets.expected-manifest" &&
        (error.missingExpected?.includes("assets/models/snow-burgers/ingredient-cheese.glb") ||
            error.unexpected?.includes("assets/models/snow-burgers/ingredient-patty.glb"))));
});

test("expected runtime manifest rejects a stale source hash", async () => {
    const ctx = await validateManifestMutation((manifest) => {
        const tomato = manifest.assets.find((asset) =>
            asset.runtimePath === "assets/models/snow-burgers/ingredient-tomato.glb");
        tomato.sourceSha256 = "0".repeat(64);
    });
    assert.ok(ctx.errors.some((error) => error.name === "assets.manifest-source" &&
        error.message.includes("ingredient-tomato.glb")));
});

test("expected runtime manifest rejects stale social source provenance", async () => {
    const ctx = await validateManifestMutation((manifest) => {
        manifest.socialPreview.editedSourceSha256 = "f".repeat(64);
    });
    assert.ok(ctx.errors.some((error) => error.name === "assets.social-preview" &&
        error.message.includes("edited source SHA-256")));
});

test("release reports distinguish report-only blockers from strict failure", async () => {
    const report = await runReleaseValidation({ strict: false });
    assert.equal(report.status, "report-only-with-blockers");
    assert.equal(report.reportPath, "reports/release-validation-report-only.json");
    assert.ok(report.blockers.some((blocker) => blocker.name === "assets.hero-provenance"));

    const strict = await runReleaseValidation({ strict: true });
    assert.equal(strict.status, "fail");
    assert.equal(strict.reportPath, "reports/release-validation-strict.json");
    assert.deepEqual(
        strict.errors.map((error) => error.name),
        ["assets.hero-provenance"],
    );
});

test("WebGPU startup is bounded and its classifier does not hide unrelated failures", async () => {
    assert.equal(await withTimeout(Promise.resolve("ready"), 100, "WebGPU device initialisation failed"), "ready");
    await assert.rejects(
        withTimeout(new Promise(() => {}), 1, "WebGPU device initialisation failed"),
        /WebGPU device initialisation failed.*timeout/i,
    );
    assert.equal(expectedUnavailableError("WebGPU is not available in this browser."), true);
    assert.equal(expectedUnavailableError("WebGPU device initialisation failed."), true);
    assert.equal(expectedUnavailableError("No suitable WebGPU adapter was found."), true);
    assert.equal(expectedUnavailableError("A fatal error occurred during WebGPU creation/initialization."), true);
    assert.equal(expectedUnavailableError("fatal device invariant"), false);
    assert.equal(expectedUnavailableError("GPU buffer bounds invariant failed"), false);
});
