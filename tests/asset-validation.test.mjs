import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATOR = path.join(REPO_ROOT, "tools/snow-burgers/validate-assets.mjs");
const HISTORICAL = path.join(REPO_ROOT, "art/source-assets/snow-burgers/VALIDATION.json");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "reports/snow-burgers/runtime-assets-validation.json");

function digest(file) {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function runValidator(args = []) {
    return spawnSync(process.execPath, [VALIDATOR, ...args], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
    });
}

test("default runtime validation writes a safe report and preserves historical audit", () => {
    const historicalBefore = digest(HISTORICAL);
    const previousDefault = existsSync(DEFAULT_OUTPUT) ? readFileSync(DEFAULT_OUTPUT) : null;
    try {
        const result = runValidator();
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /wrote reports\/snow-burgers\/runtime-assets-validation\.json/);
        assert.equal(digest(HISTORICAL), historicalBefore);
        const report = JSON.parse(readFileSync(DEFAULT_OUTPUT, "utf8"));
        assert.equal(report.generatedBy, "tools/snow-burgers/validate-assets.mjs");
        assert.equal(report.assets.length, 7);
    } finally {
        if (previousDefault === null) rmSync(DEFAULT_OUTPUT, { force: true });
        else writeFileSync(DEFAULT_OUTPUT, previousDefault);
    }
});

test("explicit runtime report output preserves historical audit", () => {
    const historicalBefore = digest(HISTORICAL);
    const runtimeOutput = path.join(REPO_ROOT, "reports/snow-burgers/test-runtime-assets-validation.json");
    try {
        const result = runValidator(["--out", runtimeOutput]);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.equal(digest(HISTORICAL), historicalBefore);
        assert.equal(JSON.parse(readFileSync(runtimeOutput, "utf8")).assets.length, 7);
    } finally {
        rmSync(runtimeOutput, { force: true });
    }
});

test("historical validation output is rejected without the archival override", () => {
    const historicalBefore = digest(HISTORICAL);
    const result = runValidator(["--out", HISTORICAL]);
    assert.notEqual(result.status, 0);
    assert.match(
        `${result.stdout}\n${result.stderr}`,
        /Refusing to overwrite immutable historical source audit report/
    );
    assert.equal(digest(HISTORICAL), historicalBefore);
});
