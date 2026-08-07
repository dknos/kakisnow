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
export const REPORT_PATH = path.join(REPO_ROOT, "reports", "release-validation.json");

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".html"]);
const ASSET_EXTENSIONS = new Set([
    ".glb", ".gltf", ".png", ".jpg", ".jpeg", ".webp", ".hdr", ".env", ".wasm",
]);

const ENGLISH_NUMBERS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20,
};

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
    const end = ledger.indexOf("## RockerKaki");
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
    const summaryMatch = ledger.match(/current runtime therefore has \*\*(\d+) unresolved model rights records\*\*/i);
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
        const detail = `${unresolved.length} current runtime model rights record(s) remain unresolved; this is reported, not inferred as licensed`;
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

function numericMentions(text, noun) {
    const result = [];
    const re = new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)\\s+${noun}s?\\b`, "gi");
    for (const match of text.matchAll(re)) {
        const raw = match[1].toLowerCase();
        result.push({ raw, value: ENGLISH_NUMBERS[raw] ?? Number(raw), index: match.index });
    }
    return result;
}

/** Check README count claims against the imported registries. */
export async function validateDocumentationCounts(ctx = makeContext(), counts = null) {
    const registryCounts = counts ?? validateRegistry(makeContext());
    const readmePath = path.join(REPO_ROOT, "README.md");
    if (!existsSync(readmePath)) {
        fail(ctx, "docs.readme", "README.md is missing");
        return { context: ctx };
    }
    const readme = await readFile(readmePath, "utf8");
    const checks = [
        ["courses", registryCounts.courses],
        ["events", registryCounts.events],
    ];
    for (const [noun, expected] of checks) {
        const mentions = numericMentions(readme, noun);
        const stale = mentions.filter((mention) => mention.value !== expected);
        if (stale.length) fail(ctx, `docs.${noun}`, `README contains stale ${noun} count(s); registry has ${expected}`, { expected, stale });
        else if (!mentions.length) fail(ctx, `docs.${noun}`, `README does not state the registry-derived ${noun} count`, { expected });
        else pass(ctx, `docs.${noun}`, { expected, mentions });
    }
    return { context: ctx, counts: registryCounts };
}

export async function runReleaseValidation({ strict = true, checks = ["registry", "assets", "docs"] } = {}) {
    const ctx = makeContext();
    let registryCounts;
    if (checks.includes("registry")) registryCounts = validateRegistry(ctx);
    if (checks.includes("assets")) {
        await validateAssetReferences(ctx);
        await validateAssetLedger(ctx, { strict });
    }
    if (checks.includes("docs")) await validateDocumentationCounts(ctx, registryCounts);
    const result = {
        generatedBy: "tools/validate-release.mjs",
        generatedAt: new Date().toISOString(),
        strict,
        checks,
        counts: registryCounts ? { courses: registryCounts.courses, events: registryCounts.events, tapes: registryCounts.tapes } : null,
        status: ctx.errors.length ? "fail" : "pass",
        checksRun: ctx.checks,
        warnings: ctx.warnings,
        errors: ctx.errors,
    };
    await writeFile(REPORT_PATH, JSON.stringify(result, null, 2) + "\n");
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
        console.error(`release validation: ${result.status}; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
        if (result.status === "fail") process.exitCode = 1;
    }).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
