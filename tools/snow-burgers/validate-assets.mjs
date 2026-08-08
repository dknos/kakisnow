/**
 * Structural validation of the Snow-Burgers runtime assets.
 *
 * Runs the Khronos glTF validator over every optimised derivative and then
 * applies the checks the validator cannot know about: the budgets from the
 * brief, and whether an extension the file requires is one this project's
 * runtime can actually decode without reaching for a CDN.
 *
 * That last check is the one that matters most. A GLB using KHR_texture_basisu
 * validates perfectly and then fails at runtime on GitHub Pages, because
 * Babylon's KTX2 transcoder URL defaults to a Babylon CDN that this project
 * does not vendor. "Valid" and "loadable here" are different questions.
 *
 *   node tools/snow-burgers/validate-assets.mjs
 *   node tools/snow-burgers/validate-assets.mjs \
 *     --out screenshots/final-gauntlet/assets/candidate/runtime-promoted/asset-VALIDATION.json
 *
 * Exits non-zero on any error-severity finding or budget breach, so it can gate
 * a build. The default report is written under reports/snow-burgers; the
 * immutable historical art/source-assets/snow-burgers/VALIDATION.json path is
 * rejected unless the unmistakable --allow-archival-output override is given.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { loadGltfTransform, ASSETS, SOURCE_DIR, RUNTIME_DIR, REPO_ROOT } from "./gltf-lib.mjs";

const DEFAULT_OUTPUT = path.join(REPO_ROOT, "reports", "snow-burgers", "runtime-assets-validation.json");
const HISTORICAL_OUTPUT = path.resolve(SOURCE_DIR, "VALIDATION.json");

function arg(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function outputPath() {
    const requested = path.resolve(REPO_ROOT, arg("--out", DEFAULT_OUTPUT));
    const archivalOverride = process.argv.includes("--allow-archival-output");
    if (requested === HISTORICAL_OUTPUT && !archivalOverride) {
        throw new Error(
            "Refusing to overwrite immutable historical source audit report " +
            `${path.relative(REPO_ROOT, HISTORICAL_OUTPUT)}. ` +
            "Choose --out reports/... or runtime evidence, or supply " +
            "--allow-archival-output only for an intentional archival rewrite."
        );
    }
    return requested;
}

/** Extensions the shipped runtime decodes with no network fetch. */
const DECODABLE_HERE = new Set([
    "KHR_draco_mesh_compression", // vendored under public/assets/decoders
    "EXT_texture_webp",           // browser-native
    "KHR_materials_unlit",
    "KHR_materials_emissive_strength",
    "KHR_materials_ior",
    "KHR_materials_specular",
    "KHR_texture_transform",
    "KHR_mesh_quantization",
]);

const SEVERITY = ["error", "warning", "info", "hint"];

async function main() {
    // Resolve and guard the output before loading the offline glTF SDK. A typo
    // in a report path must fail closed before any validation work or write.
    const out = outputPath();
    const sdk = await loadGltfTransform();
    const require = createRequire(path.join(path.dirname(sdk.root), "_resolver.cjs"));
    const validator = require("gltf-validator");

    const results = [];
    let failures = 0;

    for (const asset of ASSETS) {
        const file = path.join(RUNTIME_DIR, asset.runtime);
        if (!existsSync(file)) {
            console.error(`FAIL ${asset.key}: runtime asset missing (${asset.runtime})`);
            results.push({ key: asset.key, missing: asset.runtime });
            failures++;
            continue;
        }

        const buf = await readFile(file);
        const report = await validator.validateBytes(new Uint8Array(buf), {
            uri: asset.runtime,
            // The validator resolves external resources through this hook. Every
            // runtime asset is expected to be fully self-contained, so a call
            // here is itself the failure: it means an image or buffer did not
            // get embedded.
            externalResourceFunction: (uri) => {
                throw new Error("unexpected external resource: " + uri);
            },
        });

        const issues = report.issues ?? {};
        const counts = {};
        for (const s of SEVERITY) counts[s] = 0;
        for (const m of issues.messages ?? []) {
            counts[SEVERITY[m.severity] ?? "info"]++;
        }

        const used = report.info?.extensionsUsed ?? [];
        const undecodable = used.filter((e) => !DECODABLE_HERE.has(e));

        const bytes = buf.length;
        const overBudget = bytes > asset.budget;

        const ok = counts.error === 0 && undecodable.length === 0 && !overBudget;
        if (!ok) failures++;

        results.push({
            key: asset.key,
            file: asset.runtime,
            bytes,
            budgetBytes: asset.budget,
            overBudget,
            validator: {
                errors: counts.error,
                warnings: counts.warning,
                infos: counts.info,
                hints: counts.hint,
                messages: (issues.messages ?? [])
                    .filter((m) => m.severity <= 1)
                    .map((m) => ({
                        severity: SEVERITY[m.severity],
                        code: m.code,
                        message: m.message,
                        pointer: m.pointer,
                    })),
            },
            extensionsUsed: used,
            undecodableByRuntime: undecodable,
            drawCallCount: report.info?.drawCallCount ?? null,
            totalTriangleCount: report.info?.totalTriangleCount ?? null,
            totalVertexCount: report.info?.totalVertexCount ?? null,
            maxUVTileCount: report.info?.maxUVTileCount ?? null,
            ok,
        });

        console.error(
            `${ok ? "PASS" : "FAIL"} ${asset.key.padEnd(8)} ` +
            `${(bytes / 1048576).toFixed(2)} MB / ${(asset.budget / 1048576).toFixed(2)} MB · ` +
            `${counts.error} err, ${counts.warning} warn · ` +
            `${report.info?.totalTriangleCount ?? "?"} tris` +
            (undecodable.length ? ` · UNDECODABLE: ${undecodable.join(",")}` : "")
        );
        for (const m of (issues.messages ?? []).filter((m) => m.severity === 0)) {
            console.error(`       error ${m.code} at ${m.pointer}: ${m.message}`);
        }
    }

    const total = results.reduce((s, r) => s + (r.bytes ?? 0), 0);
    const preferred = 11 * 1024 * 1024;
    const ceiling = 15 * 1024 * 1024;
    const totalOk = total <= ceiling;
    if (!totalOk) failures++;

    console.error(
        `\ntotal ${(total / 1048576).toFixed(2)} MB ` +
        `(preferred ≤ ${(preferred / 1048576).toFixed(0)} MB, ` +
        `ceiling ${(ceiling / 1048576).toFixed(0)} MB) — ` +
        (total <= preferred ? "within preferred" : totalOk ? "over preferred" : "OVER CEILING")
    );

    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(
        out,
        JSON.stringify({
            generatedBy: "tools/snow-burgers/validate-assets.mjs",
            validatorVersion: require("gltf-validator/package.json").version,
            runtimeDecodableExtensions: [...DECODABLE_HERE].sort(),
            totalRuntimeBytes: total,
            preferredTotalBytes: preferred,
            hardCeilingBytes: ceiling,
            assets: results,
        }, null, 2) + "\n"
    );
    console.error("wrote " + path.relative(REPO_ROOT, out));

    if (failures) {
        console.error(`\n${failures} asset(s) failed validation.`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
