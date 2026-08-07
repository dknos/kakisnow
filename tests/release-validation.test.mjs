import test from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import {
    validateRegistry,
    validateDocumentationCounts,
    compareCandidateLedger,
    sha256,
    REPO_ROOT,
} from "../tools/validate-release.mjs";
import { expectedUnavailableError } from "../tools/smoke-browser-logic.mjs";

test("release registry validator derives the current course, event, and tape counts", () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    const counts = validateRegistry(ctx);
    assert.deepEqual(
        { courses: counts.courses, events: counts.events, tapes: counts.tapes },
        { courses: 6, events: 12, tapes: 18 },
    );
    assert.equal(ctx.errors.length, 0);
});

test("documentation validator catches a stale numeric claim", async () => {
    const ctx = { checks: [], errors: [], warnings: [] };
    await validateDocumentationCounts(ctx, { courses: 6, events: 12, tapes: 18 });
    assert.ok(ctx.errors.some((error) => error.name === "docs.events"));
    assert.ok(ctx.errors.some((error) => error.name === "docs.courses"));
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

test("WebGPU-unavailable classifier does not hide unrelated device failures", () => {
    assert.equal(expectedUnavailableError("WebGPU is not available in this browser."), true);
    assert.equal(expectedUnavailableError("WebGPU device initialisation failed."), true);
    assert.equal(expectedUnavailableError("No suitable WebGPU adapter was found."), true);
    assert.equal(expectedUnavailableError("fatal device invariant"), false);
    assert.equal(expectedUnavailableError("GPU buffer bounds invariant failed"), false);
});
