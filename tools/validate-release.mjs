/**
 * Release-gate checks that do not require a browser or a GPU.
 *
 * The hosted GitHub runner is not a WebGPU certification environment, so this
 * file deliberately checks the parts of a release that are deterministic in
 * Node: registry integrity, direct runtime asset references, provenance
 * bookkeeping, and documentation counts derived from the registries.
 *
 * The default command is strict. An unresolved rights record is reported in
 * the JSON result and fails the command; `--report-only` is useful while an
 * asset replacement is being reviewed, but must not be used by deployment.
 *
 *   node tools/validate-release.mjs
 *   node tools/validate-release.mjs --report-only
 *   node tools/validate-release.mjs --check registry
 */

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COURSES } from "../src/game/courses/index.js";
import { EVENTS } from "../src/game/courses/eventRegistry.js";
import { assertTourCoversCourses } from "../src/game/progression.js";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = path.join(REPO_ROOT, "public");
export const STRICT_REPORT_PATH = path.join(REPO_ROOT, "reports", "release-validation-strict.json");
export const REPORT_ONLY_PATH = path.join(REPO_ROOT, "reports", "release-validation-report-only.json");
// Compatibility alias for tools that imported the old name. New runs write
// the explicit strict/report-only artifacts above and never overwrite one
// ambiguous JSON file.
export const REPORT_PATH = STRICT_REPORT_PATH;

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".html"]);
const ASSET_EXTENSIONS = new Set([
    ".glb", ".gltf", ".png", ".jpg", ".jpeg", ".webp", ".hdr", ".env", ".wasm",
]);

/** Required release-package files. Keep this list intentionally explicit so
 * a green local build cannot omit a notice or handoff document. */
export const REQUIRED_RELEASE_DOCS = [
    "README.md",
    "CHANGELOG.md",
    "GAUNTLET_PROGRESS.html",
    "FINAL_POLISH_REPORT.md",
    "PLAYTEST_FINDINGS.md",
    "AUDIO_MIX_REPORT.md",
    "ASSET_LEDGER.md",
    "ASSET_OPTIMIZATION_REPORT.md",
    "ASSETS.md",
    "KNOWN_LIMITATIONS.md",
    "CREDITS.md",
    "PERF.md",
    "docs/CONTROLS.md",
    "docs/SAVE_SCHEMA.md",
    "public/THIRD_PARTY_NOTICES.txt",
    "art/generated-assets/snow-burgers/RUNTIME_MANIFEST.json",
    "reports/final-gauntlet/FINAL_PERFORMANCE_MATRIX.md",
    "reports/final-gauntlet/FINAL_TEST_REPORT.md",
    "reports/final-gauntlet/final-runtime/FINAL_RUNTIME_MATRIX.md",
    "reports/final-gauntlet/final-camera/FINAL_CAMERA_MATRIX.md",
    "reports/final-gauntlet/final-camera/camera-matrix-report.json",
    "reports/final-gauntlet/showreel/snow-burgers-showreel.json",
    "reports/final-gauntlet/showreel/snow-burgers-showreel.webm",
    "screenshots/final-gauntlet/release-ui/release-ui-report.json",
    "screenshots/final-gauntlet/release-evidence/title-1280.webp",
];

/** Product-facing docs carry one exact marker rather than free-form prose.
 * Reports may mention historical baselines and old counts; those numbers are
 * intentionally not parsed as current release claims. */
export const COUNTED_RELEASE_DOCS = [
    "README.md",
    "CHANGELOG.md",
    "FINAL_POLISH_REPORT.md",
    "KNOWN_LIMITATIONS.md",
    "CREDITS.md",
    "PERF.md",
    "docs/CONTROLS.md",
    "docs/SAVE_SCHEMA.md",
];

const RELEASE_COUNT_MARKER = /<!--\s*snow-burgers-release-counts\s+courses=(\d+)\s+events=(\d+)\s+tapes=(\d+)\s*-->/gi;

/**
 * Fixed expected runtime inventory. Dynamic URL assembly in the game uses
 * shared base prefixes plus filenames, so source-literal scanning alone can
 * miss these files. The structured manifest and this list form the release
 * contract for every assembled ingredient, vehicle, camp, dressing, UI image,
 * hero, Big Air venue derivative and site icon.
 */
export const EXPECTED_RUNTIME_ASSET_PATHS = Object.freeze([
    "assets/models/snow-burgers/burger-complete.glb",
    "assets/models/snow-burgers/camp-hut.glb",
    "assets/models/snow-burgers/camp-village.glb",
    "assets/models/snow-burgers/dressing-bush.glb",
    "assets/models/snow-burgers/dressing-firs.glb",
    "assets/models/snow-burgers/dressing-pine.glb",
    "assets/models/snow-burgers/dressing-rock.glb",
    "assets/models/snow-burgers/ingredient-cheese.glb",
    "assets/models/snow-burgers/ingredient-lettuce.glb",
    "assets/models/snow-burgers/ingredient-onion.glb",
    "assets/models/snow-burgers/ingredient-patty.glb",
    "assets/models/snow-burgers/ingredient-tomato.glb",
    "assets/models/snow-burgers/rocket-chair-snowboard.glb",
    "assets/models/rockerkaki.glb",
    "assets/models/rockerkaki-rigged.glb",
    "assets/models/snowboard.glb",
    "assets/models/big-air/venue-bleacher.glb",
    "assets/models/big-air/venue-chairlift.glb",
    "assets/models/big-air/venue-flag.glb",
    "assets/models/big-air/venue-floodlight.glb",
    "assets/models/big-air/venue-judges.glb",
    "assets/models/big-air/venue-scaffold.glb",
    "assets/models/big-air/venue-windsock.glb",
    "assets/ui/snow-burgers/burger.webp",
    "assets/ui/snow-burgers/cheese.webp",
    "assets/ui/snow-burgers/lettuce.webp",
    "assets/ui/snow-burgers/onion.webp",
    "assets/ui/snow-burgers/patty.webp",
    "assets/ui/snow-burgers/social-preview.webp",
    "assets/ui/snow-burgers/tomato.webp",
    "favicon.svg",
]);

export const EXPECTED_RUNTIME_MANIFEST_PATH = path.join(
    REPO_ROOT, "art", "generated-assets", "snow-burgers", "RUNTIME_MANIFEST.json",
);

function makeContext() {
    return { checks: [], errors: [], warnings: [] };
}

function pass(ctx, name, details = {}) {
    // Keep the machine-readable status authoritative even when a check wants
    // to report a field also named `status` (for example asset provenance).
    ctx.checks.push({ name, ...details, status: "pass" });
}

function fail(ctx, name, message, details = {}) {
    ctx.errors.push({ name, message, ...details });
    ctx.checks.push({ name, status: "fail", message, ...details });
}

function warn(ctx, name, message, details = {}) {
    ctx.warnings.push({ name, message, ...details });
    ctx.checks.push({ name, status: "warning", message, ...details });
}

function splitTableRow(line) {
    if (!line.trim().startsWith("|")) return [];
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
}

function plainTableText(value) {
    return value.replaceAll("`", "").replaceAll("**", "").trim();
}

function parseInteger(value) {
    const parsed = Number.parseInt(String(value).replaceAll(",", "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseCandidateLedger(ledger) {
    const start = ledger.indexOf("## Original replacement candidate");
    // Keep the generated 13-GLB candidate table independent from later
    // review-gated artwork inventories.  The social preview is intentionally
    // recorded in this ledger but is not part of VALIDATION.json's candidate
    // set, so a broad "until RockerKaki" slice would compare unrelated rows.
    const endMarkers = ["## Snow-Burgers social preview", "## RockerKaki"]
        .map((marker) => ledger.indexOf(marker))
        .filter((index) => index >= 0);
    const end = endMarkers.length ? Math.min(...endMarkers) : -1;
    if (start < 0 || end <= start) return { rows: [], totalBytes: null };
    const block = ledger.slice(start, end);
    const rows = block.split("\n").map(splitTableRow)
        .filter((columns) => columns.length >= 4 && columns[0] !== "Candidate file" && !columns[0].startsWith("---"))
        .map((columns) => ({
            file: plainTableText(columns[0]),
            bytes: parseInteger(plainTableText(columns[2])),
            sha256: plainTableText(columns[3]).toLowerCase(),
        }));
    const totalMatch = block.match(/Total candidate size:\s*([\d,]+)\s+bytes/i);
    return { rows, totalBytes: totalMatch ? parseInteger(totalMatch[1]) : null };
}

export function sha256(data) {
    return createHash("sha256").update(data).digest("hex");
}

/** Compare candidate manifest facts against the candidate table and files. */
export async function compareCandidateLedger(ledger, candidate, repoRoot = REPO_ROOT) {
    const { rows, totalBytes } = parseCandidateLedger(ledger);
    const manifest = Array.isArray(candidate?.assets) ? candidate.assets : [];
    const problems = [];
    const rowByFile = new Map(rows.map((row) => [row.file, row]));
    const assetByFile = new Map(manifest.map((asset) => [asset.file, asset]));
    const allFiles = new Set([...rowByFile.keys(), ...assetByFile.keys()]);
    let actualTotal = 0;
    for (const file of allFiles) {
        const row = rowByFile.get(file);
        const asset = assetByFile.get(file);
        if (!row) {
            problems.push(`${file}: present in VALIDATION.json but absent from ASSET_LEDGER.md`);
            continue;
        }
        if (!asset) {
            problems.push(`${file}: present in ASSET_LEDGER.md but absent from VALIDATION.json`);
            continue;
        }
        if (row.bytes === null || row.sha256.length !== 64) {
            problems.push(`${file}: ledger bytes/hash fields are malformed`);
        } else {
            if (row.bytes !== asset.bytes) problems.push(`${file}: ledger bytes ${row.bytes} != manifest bytes ${asset.bytes}`);
            if (row.sha256 !== String(asset.sha256 ?? "").toLowerCase()) problems.push(`${file}: ledger SHA-256 does not match manifest`);
        }
        const relativePath = asset.path || path.join(candidate.candidateDirectory ?? "", file);
        const fullPath = path.resolve(repoRoot, relativePath);
        if (!existsSync(fullPath)) {
            problems.push(`${file}: manifest path is missing (${relativePath})`);
        } else {
            const bytes = await readFile(fullPath);
            actualTotal += bytes.length;
            if (bytes.length !== asset.bytes) problems.push(`${file}: manifest bytes ${asset.bytes} != file bytes ${bytes.length}`);
            if (sha256(bytes) !== String(asset.sha256 ?? "").toLowerCase()) problems.push(`${file}: manifest SHA-256 does not match file`);
        }
    }
    if (totalBytes === null) problems.push("ledger is missing the total candidate byte count");
    else if (totalBytes !== actualTotal) problems.push(`ledger total bytes ${totalBytes} != candidate files ${actualTotal}`);
    if (Number.isFinite(candidate?.totalBytes) && candidate.totalBytes !== actualTotal) {
        problems.push(`manifest total bytes ${candidate.totalBytes} != candidate files ${actualTotal}`);
    }
    return { problems, rows, manifest, totalBytes, actualTotal };
}

async function walkFiles(dir) {
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) result.push(...await walkFiles(full));
        else result.push(full);
    }
    return result;
}

function resolvePublicAsset(assetPath) {
    const normalized = assetPath.replace(/^\.\//, "").replace(/^\//, "");
    if (!normalized.startsWith("assets/")) return null;
    return path.join(PUBLIC_DIR, normalized);
}

/** Validate the source-of-truth course/event/tape relationships. */
export function validateRegistry(ctx = makeContext()) {
    const courses = Object.values(COURSES);
    const events = Object.values(EVENTS);
    const eventIds = new Set();
    const courseEventIds = new Set();
    let tapes = 0;

    if (!courses.length) fail(ctx, "registry.courses", "no courses are registered");
    if (!events.length) fail(ctx, "registry.events", "no events are registered");

    for (const course of courses) {
        if (!course?.id || !Array.isArray(course.events)) {
            fail(ctx, "registry.course-shape", `course is missing id/events: ${course?.id ?? "unknown"}`);
            continue;
        }
        tapes += Array.isArray(course.secrets) ? course.secrets.length : 0;
        for (const eventId of course.events) {
            if (courseEventIds.has(eventId)) {
                fail(ctx, "registry.event-unique", `event appears on more than one course: ${eventId}`);
            }
            courseEventIds.add(eventId);
            const event = EVENTS[eventId];
            if (!event) fail(ctx, "registry.event-link", `${course.id} lists missing event ${eventId}`);
            else if (event.courseId !== course.id) {
                fail(ctx, "registry.event-course", `${eventId} points to ${event.courseId}, not ${course.id}`);
            }
        }
    }

    for (const event of events) {
        if (eventIds.has(event.id)) fail(ctx, "registry.event-id", `duplicate event id: ${event.id}`);
        eventIds.add(event.id);
        if (!COURSES[event.courseId]) fail(ctx, "registry.event-course", `${event.id} references missing course ${event.courseId}`);
    }
    if (courseEventIds.size !== events.length) {
        fail(ctx, "registry.event-count", `course lists contain ${courseEventIds.size} events but registry exports ${events.length}`);
    }
    try {
        assertTourCoversCourses(COURSES);
    } catch (error) {
        fail(ctx, "registry.tour-coverage", error.message);
    }

    const counts = { courses: courses.length, events: events.length, tapes };
    if (ctx.errors.length === 0) pass(ctx, "registry", { counts });
    return { ...counts, context: ctx };
}

/** Validate direct source references and prevent a missing runtime asset. */
export async function validateAssetReferences(ctx = makeContext()) {
    const sourceFiles = (await walkFiles(path.join(REPO_ROOT, "src")))
        .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)));
    const referenced = new Set();
    for (const file of sourceFiles) {
        const text = await readFile(file, "utf8");
        // This intentionally only checks complete literal paths. Dynamic base
        // prefixes are handled by the suffix literals and by the runtime tree
        // inventory below; guessing a URL from arbitrary JS would create
        // false positives.
        const matches = text.matchAll(/["'`]([^"'`\r\n]*assets\/(?:[^"'`\r\n]*\.)[^"'`\r\n]+)["'`]/g);
        for (const match of matches) {
            const assetPath = match[1].replace(/^\.\//, "");
            if (!ASSET_EXTENSIONS.has(path.extname(assetPath).toLowerCase())) continue;
            const full = resolvePublicAsset(assetPath);
            if (full) referenced.add(assetPath);
        }
    }

    const missing = [];
    for (const assetPath of referenced) {
        const full = resolvePublicAsset(assetPath);
        if (!full || !existsSync(full)) missing.push(assetPath);
    }
    if (missing.length) fail(ctx, "assets.references", `${missing.length} direct runtime asset reference(s) are missing`, { missing });
    else pass(ctx, "assets.references", { referenced: [...referenced].sort(), count: referenced.size });

    const runtimeFiles = (await walkFiles(path.join(PUBLIC_DIR, "assets")))
        .filter((file) => ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()));
    const empty = [];
    for (const file of runtimeFiles) {
        const info = await stat(file);
        if (info.size === 0) empty.push(path.relative(REPO_ROOT, file));
    }
    if (empty.length) fail(ctx, "assets.nonempty", `${empty.length} runtime asset(s) are empty`, { empty });
    else pass(ctx, "assets.nonempty", { count: runtimeFiles.length });
    return { referenced: [...referenced].sort(), runtimeFiles: runtimeFiles.map((f) => path.relative(REPO_ROOT, f)), context: ctx };
}

function manifestPath(relativePath) {
    if (typeof relativePath !== "string" || relativePath.includes("..")) return null;
    const normalized = relativePath.replace(/^\.\//, "");
    if (!normalized || normalized.startsWith("/") || normalized.includes("\\")) return null;
    return path.join(REPO_ROOT, normalized);
}

function manifestPublicPath(runtimePath) {
    const normalized = typeof runtimePath === "string"
        ? runtimePath.replace(/^\.\//, "") : "";
    if (normalized === "favicon.svg") return path.join(PUBLIC_DIR, normalized);
    if (!normalized.startsWith("assets/") || normalized.includes("..") || normalized.includes("\\")) return null;
    return path.join(PUBLIC_DIR, normalized);
}

function validateManifestTerms(manifest, profile, profileName, ctx) {
    if (!profile || typeof profile !== "object") {
        fail(ctx, "assets.manifest-provenance", `manifest rights profile is missing: ${profileName}`);
        return;
    }
    for (const field of ["category", "status", "disclosure", "ownerReviewState", "generationRecord"]) {
        if (typeof profile[field] !== "string" || !profile[field].trim()) {
            fail(ctx, "assets.manifest-provenance", `${profileName} rights profile is missing ${field}`);
        }
    }
    if (!Array.isArray(profile.terms)) {
        fail(ctx, "assets.manifest-provenance", `${profileName} rights profile terms must be an array`);
        return;
    }
    for (const termId of profile.terms) {
        const term = manifest.terms?.[termId];
        if (!term || typeof term.url !== "string" || !/^https?:\/\//.test(term.url) ||
            typeof term.status !== "string" || !term.status.trim()) {
            fail(ctx, "assets.manifest-provenance", `${profileName} references an incomplete terms record: ${termId}`);
        }
    }
}

/**
 * Validate the fixed expected runtime inventory against a structured manifest.
 * This is intentionally separate from source scanning: a filename assembled
 * from a base URL and suffix is still required to have an exact path, byte
 * count, hash, source relationship and rights/provenance record.
 */
export async function validateExpectedRuntimeManifest(
    ctx = makeContext(),
    { manifestPathOverride = EXPECTED_RUNTIME_MANIFEST_PATH } = {},
) {
    if (!existsSync(manifestPathOverride)) {
        fail(ctx, "assets.expected-manifest", "structured expected runtime asset manifest is missing", {
            path: path.relative(REPO_ROOT, manifestPathOverride),
        });
        return { manifest: null, assets: [] };
    }
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestPathOverride, "utf8"));
    } catch (error) {
        fail(ctx, "assets.expected-manifest", `structured expected runtime asset manifest is invalid JSON: ${error.message}`);
        return { manifest: null, assets: [] };
    }
    if (manifest?.schemaVersion !== 1 || manifest?.manifestType !== "expected-runtime-asset-manifest") {
        fail(ctx, "assets.expected-manifest", "structured runtime manifest has an unsupported schema/type");
    }
    if (!Array.isArray(manifest?.assets)) {
        fail(ctx, "assets.expected-manifest", "structured runtime manifest has no assets array");
        return { manifest, assets: [] };
    }

    const byPath = new Map();
    const duplicatePaths = [];
    for (const asset of manifest.assets) {
        if (!asset || typeof asset !== "object" || typeof asset.runtimePath !== "string") {
            fail(ctx, "assets.expected-manifest", "manifest contains an asset without runtimePath");
            continue;
        }
        if (byPath.has(asset.runtimePath)) duplicatePaths.push(asset.runtimePath);
        byPath.set(asset.runtimePath, asset);
        const profile = manifest.rightsProfiles?.[asset.rightsProfile];
        validateManifestTerms(manifest, profile, asset.rightsProfile ?? "(missing)", ctx);
        if (typeof asset.id !== "string" || !asset.id.trim()) {
            fail(ctx, "assets.manifest-provenance", `${asset.runtimePath} has no stable asset id`);
        }
        if (typeof asset.role !== "string" || !asset.role.trim()) {
            fail(ctx, "assets.manifest-provenance", `${asset.runtimePath} has no role`);
        }
        if (!Number.isInteger(asset.bytes) || asset.bytes < 1 ||
            typeof asset.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(asset.sha256)) {
            fail(ctx, "assets.manifest-entry", `${asset.runtimePath} has malformed bytes or SHA-256 fields`);
        }
        const runtime = manifestPublicPath(asset.runtimePath);
        if (!runtime || asset.repositoryPath !== path.relative(REPO_ROOT, runtime)) {
            fail(ctx, "assets.manifest-entry", `${asset.runtimePath} does not resolve to its declared repositoryPath`, {
                repositoryPath: asset.repositoryPath,
            });
        } else if (!existsSync(runtime)) {
            fail(ctx, "assets.manifest-runtime", `${asset.runtimePath} is missing from the runtime tree`);
        } else {
            const bytes = await readFile(runtime);
            if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256.toLowerCase()) {
                fail(ctx, "assets.manifest-runtime", `${asset.runtimePath} does not match its manifest bytes/SHA-256`, {
                    expectedBytes: asset.bytes, actualBytes: bytes.length,
                    expectedSha256: asset.sha256, actualSha256: sha256(bytes),
                });
            }
        }
        const source = manifestPath(asset.sourcePath);
        if (!source || typeof asset.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(asset.sourceSha256)) {
            fail(ctx, "assets.manifest-source", `${asset.runtimePath} has no valid source path/SHA-256 relationship`);
        } else if (!existsSync(source)) {
            fail(ctx, "assets.manifest-source", `${asset.runtimePath} source path is missing`, { sourcePath: asset.sourcePath });
        } else {
            const sourceBytes = await readFile(source);
            const sourceHash = sha256(sourceBytes);
            if (sourceHash !== asset.sourceSha256.toLowerCase()) {
                fail(ctx, "assets.manifest-source", `${asset.runtimePath} source hash does not match the manifest`, {
                    sourcePath: asset.sourcePath, expectedSha256: asset.sourceSha256, actualSha256: sourceHash,
                });
            }
        }
        const profileRecord = manifest.rightsProfiles?.[asset.rightsProfile]?.generationRecord;
        const profileRecordPath = manifestPath(profileRecord);
        if (profileRecord && (!profileRecordPath || !existsSync(profileRecordPath))) {
            fail(ctx, "assets.manifest-provenance", `${asset.runtimePath} generation record is missing`, {
                generationRecord: profileRecord,
            });
        }
    }
    if (duplicatePaths.length) fail(ctx, "assets.expected-manifest", "structured runtime manifest has duplicate paths", { duplicatePaths });

    const missingExpected = EXPECTED_RUNTIME_ASSET_PATHS.filter((runtimePath) => !byPath.has(runtimePath));
    const unexpected = [...byPath.keys()].filter((runtimePath) => !EXPECTED_RUNTIME_ASSET_PATHS.includes(runtimePath));
    if (missingExpected.length) fail(ctx, "assets.expected-manifest", "expected runtime paths are missing from the manifest", { missingExpected });
    if (unexpected.length) fail(ctx, "assets.expected-manifest", "manifest contains paths outside the fixed expected inventory", { unexpected });

    const social = manifest.socialPreview;
    const socialAsset = byPath.get("assets/ui/snow-burgers/social-preview.webp");
    if (!social || typeof social !== "object" || social.runtimeAssetId !== socialAsset?.id ||
        social.disclosureRequired !== true || typeof social.ownerReviewState !== "string" ||
        !social.ownerReviewState.trim() || !Array.isArray(social.terms) || !social.terms.length ||
        typeof social.generationRecord !== "string" || !manifestPath(social.generationRecord) ||
        !existsSync(manifestPath(social.generationRecord))) {
        fail(ctx, "assets.social-preview", "social preview manifest record is incomplete");
    } else {
        for (const termId of social.terms) {
            const term = manifest.terms?.[termId];
            if (!term || typeof term.url !== "string" || !/^https?:\/\//.test(term.url) ||
                typeof term.status !== "string" || !term.status.trim()) {
                fail(ctx, "assets.social-preview", `social preview terms record is incomplete: ${termId}`);
            }
        }
        for (const [label, sourcePath, expectedSha] of [
            ["original source", social.originalSourcePath, social.originalSourceSha256],
            ["edited source", social.editedSourcePath, social.editedSourceSha256],
        ]) {
            const source = manifestPath(sourcePath);
            if (!source || !existsSync(source) || typeof expectedSha !== "string" || !/^[0-9a-f]{64}$/i.test(expectedSha)) {
                fail(ctx, "assets.social-preview", `social preview ${label} record is incomplete`, { sourcePath });
                continue;
            }
            const actual = sha256(await readFile(source));
            if (actual !== expectedSha.toLowerCase()) {
                fail(ctx, "assets.social-preview", `social preview ${label} SHA-256 does not match`, {
                    sourcePath, expectedSha, actualSha: actual,
                });
            }
        }
        if (!manifestPath(social.derivative?.commandRecord) || !existsSync(manifestPath(social.derivative.commandRecord))) {
            fail(ctx, "assets.social-preview", "social preview derivative command record is missing");
        }
    }

    const failures = ctx.errors.filter((error) => error.name.startsWith("assets.manifest") || error.name.startsWith("assets.expected") || error.name === "assets.social-preview");
    if (!failures.length && missingExpected.length === 0 && unexpected.length === 0) {
        pass(ctx, "assets.expected-manifest", {
            count: EXPECTED_RUNTIME_ASSET_PATHS.length,
            manifest: path.relative(REPO_ROOT, manifestPathOverride),
        });
    }
    return { manifest, assets: manifest.assets, context: ctx };
}

/**
 * Validate the human-readable ledger without pretending unresolved records are
 * licensed. The strict default intentionally blocks a release while any
 * current runtime rights row says "unresolved".
 */
export async function validateAssetLedger(ctx = makeContext(), { strict = true } = {}) {
    const ledgerPath = path.join(REPO_ROOT, "ASSET_LEDGER.md");
    const noticesPath = path.join(PUBLIC_DIR, "THIRD_PARTY_NOTICES.txt");
    if (!existsSync(ledgerPath)) {
        fail(ctx, "assets.ledger", "ASSET_LEDGER.md is missing");
        return { unresolved: [], context: ctx };
    }
    if (!existsSync(noticesPath)) fail(ctx, "assets.notices", "public/THIRD_PARTY_NOTICES.txt is missing");
    const ledger = await readFile(ledgerPath, "utf8");
    const notices = existsSync(noticesPath) ? await readFile(noticesPath, "utf8") : "";
    const assetsDocPath = path.join(REPO_ROOT, "ASSETS.md");
    const assetsDoc = existsSync(assetsDocPath) ? await readFile(assetsDocPath, "utf8") : "";
    const start = ledger.indexOf("## Current runtime supplied files");
    const end = ledger.indexOf("## Original replacement candidate");
    if (start < 0 || end <= start) {
        fail(ctx, "assets.ledger-shape", "ledger is missing its current-runtime table boundary");
        return { unresolved: [], context: ctx };
    }
    const rows = ledger.slice(start, end).split("\n").map(splitTableRow)
        .filter((columns) => columns.length >= 5 && columns[0] !== "Runtime file" && !columns[0].startsWith("---"));
    const records = rows.map((columns) => ({
        file: plainTableText(columns[0]),
        rights: plainTableText(columns[3]),
        modification: plainTableText(columns[4]),
    }));
    const invalidRows = records.filter((row) => !row.file || !row.rights || !row.modification);
    if (invalidRows.length) fail(ctx, "assets.ledger-rows", `${invalidRows.length} current runtime ledger row(s) are incomplete`, { invalidRows });
    const unresolved = records.filter((row) => /unresolved/i.test(row.rights));
    const summaryMatch = ledger.match(/current runtime therefore has \*\*(\d+) unresolved (?:model rights records|historical supplied-model provenance records in active runtime)\*\*/i);
    if (!summaryMatch) fail(ctx, "assets.ledger-summary", "ledger does not state its computed unresolved runtime count");
    else if (Number(summaryMatch[1]) !== unresolved.length) {
        fail(ctx, "assets.ledger-summary", `ledger summary says ${summaryMatch[1]} unresolved records but table has ${unresolved.length}`);
    }

    const currentDir = path.join(PUBLIC_DIR, "assets", "models", "snow-burgers");
    const currentFiles = (await walkFiles(currentDir)).map((file) => path.basename(file));
    const missingRows = records.filter((row) => !currentFiles.includes(row.file));
    const unrecordedFiles = currentFiles.filter((file) => !records.some((row) => row.file === file));
    if (missingRows.length) fail(ctx, "assets.ledger-runtime", "ledger rows point at missing current runtime files", { missingRows });
    if (unrecordedFiles.length) fail(ctx, "assets.ledger-runtime", "current runtime files are absent from the ledger", { unrecordedFiles });

    const bigAirFiles = (await walkFiles(path.join(PUBLIC_DIR, "assets", "models", "big-air")))
        .filter((file) => path.extname(file).toLowerCase() === ".glb");
    const missingNotice = bigAirFiles
        .map((file) => path.basename(file))
        .filter((name) => !notices.includes(name));
    if (missingNotice.length) fail(ctx, "assets.notices", "Big Air runtime derivatives are not named in THIRD_PARTY_NOTICES.txt", { missingNotice });
    else pass(ctx, "assets.notices", { bigAirFiles: bigAirFiles.length });

    let candidate = null;
    const candidateReport = path.join(REPO_ROOT, "art", "generated-assets", "snow-burgers", "VALIDATION.json");
    if (existsSync(candidateReport)) {
        try {
            candidate = JSON.parse(await readFile(candidateReport, "utf8"));
            const bad = (candidate.assets ?? []).filter((asset) => !asset.ok || asset.missing);
            if (bad.length) fail(ctx, "assets.candidate", `${bad.length} candidate asset validation record(s) are not passing`, { bad });
            else {
                const crossCheck = await compareCandidateLedger(ledger, candidate);
                if (crossCheck.problems.length) {
                    fail(ctx, "assets.candidate-ledger", "candidate manifest, ledger, and files disagree", {
                        problems: crossCheck.problems,
                    });
                } else {
                    pass(ctx, "assets.candidate", {
                        count: candidate.assets?.length ?? 0,
                        provenance: candidate.provenanceStatus ?? "unstated",
                        bytes: crossCheck.actualTotal,
                    });
                }
            }
        } catch (error) {
            fail(ctx, "assets.candidate", `candidate VALIDATION.json is not valid JSON: ${error.message}`);
        }
    } else {
        warn(ctx, "assets.candidate", "no generated candidate validation report is present");
    }

    if (unresolved.length) {
        const detail = `${unresolved.length} current runtime provenance record(s) remain unresolved; this is reported, not inferred as licensed`;
        if (strict) fail(ctx, "assets.license", detail, { unresolved: unresolved.map((row) => row.file) });
        else warn(ctx, "assets.license", detail, { unresolved: unresolved.map((row) => row.file) });
    } else pass(ctx, "assets.license", { unresolved: 0 });
    // RockerKaki is not part of the Snow-Burgers GLB table, but its source
    // record has an independent remove.bg commercial-use caveat. Keep that
    // caveat visible to CI until the owner replaces or qualifies the step.
    if (/remove\.bg account\/plan used in the chain could not be recovered/i.test(assetsDoc) ||
        /keeps commercial redistribution\s+gated/i.test(assetsDoc)) {
        const detail = "RockerKaki still has an unresolved remove.bg commercial-use record";
        if (strict) fail(ctx, "assets.hero-provenance", detail);
        else warn(ctx, "assets.hero-provenance", detail);
    } else pass(ctx, "assets.hero-provenance", { unresolved: 0 });
    return { records, unresolved, candidate, context: ctx };
}

function parseReleaseCountMarkers(text) {
    const claims = [];
    RELEASE_COUNT_MARKER.lastIndex = 0;
    for (const match of text.matchAll(RELEASE_COUNT_MARKER)) {
        claims.push({
            courses: Number(match[1]),
            events: Number(match[2]),
            tapes: Number(match[3]),
            index: match.index,
        });
    }
    RELEASE_COUNT_MARKER.lastIndex = 0;
    return claims;
}

export { parseReleaseCountMarkers };

/**
 * Check the release package's current registry-count markers.
 *
 * This deliberately does not search for phrases such as "13 events". A
 * final report is allowed to preserve a baseline observation or explain a
 * rejected design, and free-form number scraping made those honest historical
 * notes look like stale product claims. Only the exact machine-readable marker
 * in counted product docs is authoritative.
 *
 * `documents` is injectable for the unit test; production validation always
 * reads the checked-in files from `repoRoot`.
 */
export async function validateDocumentationCounts(
    ctx = makeContext(),
    counts = null,
    { repoRoot = REPO_ROOT, requiredDocs = REQUIRED_RELEASE_DOCS,
        countedDocs = COUNTED_RELEASE_DOCS, documents = {} } = {},
) {
    const registryCounts = counts ?? validateRegistry(makeContext());
    const missing = requiredDocs.filter((relative) =>
        !existsSync(path.join(repoRoot, relative)) && !(relative in documents));
    if (missing.length) {
        fail(ctx, "docs.required", `${missing.length} required release document(s) are missing`, { missing });
    } else {
        pass(ctx, "docs.required", { files: requiredDocs });
    }

    const expected = {
        courses: registryCounts.courses,
        events: registryCounts.events,
        tapes: registryCounts.tapes,
    };
    const claims = [];
    for (const relative of countedDocs) {
        let text;
        if (relative in documents) text = String(documents[relative]);
        else {
            const full = path.join(repoRoot, relative);
            if (!existsSync(full)) {
                fail(ctx, "docs.counts", `${relative} is missing, so its registry totals cannot be checked`, { file: relative });
                continue;
            }
            text = await readFile(full, "utf8");
        }
        const fileClaims = parseReleaseCountMarkers(text);
        if (fileClaims.length !== 1) {
            fail(ctx, "docs.counts", `${relative} must contain exactly one registry-count marker`, {
                file: relative, markerCount: fileClaims.length, expected,
            });
            continue;
        }
        const claim = fileClaims[0];
        claims.push({ file: relative, ...claim });
        const stale = Object.keys(expected).filter((key) => claim[key] !== expected[key]);
        if (stale.length) {
            fail(ctx, "docs.counts", `${relative} has a stale registry-count marker`, {
                file: relative, expected, claim, stale,
            });
        }
    }
    const countFailures = ctx.errors.filter((error) => error.name === "docs.counts");
    if (!countFailures.length && claims.length === countedDocs.length) {
        pass(ctx, "docs.counts", { expected, documents: claims });
    }
    return { context: ctx, counts: registryCounts, claims };
}

export async function runReleaseValidation({ strict = true, checks = ["registry", "assets", "docs"] } = {}) {
    const ctx = makeContext();
    let registryCounts;
    if (checks.includes("registry")) registryCounts = validateRegistry(ctx);
    if (checks.includes("assets")) {
        await validateAssetReferences(ctx);
        await validateExpectedRuntimeManifest(ctx);
        await validateAssetLedger(ctx, { strict });
    }
    if (checks.includes("docs")) await validateDocumentationCounts(ctx, registryCounts);
    const blockers = ctx.warnings.map((warning) => ({
        name: warning.name,
        message: warning.message,
        unresolved: warning.unresolved,
    }));
    const status = strict
        ? (ctx.errors.length ? "fail" : "pass")
        : (ctx.errors.length ? "report-only-with-errors" : blockers.length ? "report-only-with-blockers" : "report-only-pass");
    const reportPath = strict ? STRICT_REPORT_PATH : REPORT_ONLY_PATH;
    const result = {
        generatedBy: "tools/validate-release.mjs",
        generatedAt: new Date().toISOString(),
        strict,
        checks,
        counts: registryCounts ? { courses: registryCounts.courses, events: registryCounts.events, tapes: registryCounts.tapes } : null,
        status,
        blockers,
        reportPath: path.relative(REPO_ROOT, reportPath),
        checksRun: ctx.checks,
        warnings: ctx.warnings,
        errors: ctx.errors,
    };
    await writeFile(reportPath, JSON.stringify(result, null, 2) + "\n");
    return result;
}

function parseArgs(argv) {
    const reportOnly = argv.includes("--report-only");
    const checks = argv.includes("--check") ? [argv[argv.indexOf("--check") + 1]] : ["registry", "assets", "docs"];
    return { strict: !reportOnly, checks: checks[0] === "all" ? ["registry", "assets", "docs"] : checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runReleaseValidation(parseArgs(process.argv.slice(2))).then((result) => {
        for (const check of result.checksRun) {
            const prefix = check.status === "pass" ? "PASS" : check.status === "warning" ? "WARN" : "FAIL";
            console.error(`${prefix} ${check.name}${check.message ? ` — ${check.message}` : ""}`);
        }
        console.error(`release validation: ${result.status}; report: ${result.reportPath}`);
        if (result.status === "fail" || result.status === "report-only-with-errors") process.exitCode = 1;
    }).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
