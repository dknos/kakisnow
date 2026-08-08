/**
 * Validate the deterministic original Snow-Burgers candidate set.
 *
 * The source is the Blender Python generator, not a supplied GLB. This audit
 * makes that distinction machine-readable: every candidate must be a
 * self-contained GLB with no external image or buffer URI, no animations or
 * skins, and zero Khronos error findings. The same command can validate the
 * runtime directory after an approved promotion with `--dir`.
 *
 *   node tools/snow-burgers/validate-original-assets.mjs
 *   node tools/snow-burgers/validate-original-assets.mjs \
 *     --dir public/assets/models/snow-burgers
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadGltfTransform, REPO_ROOT } from "./gltf-lib.mjs";
import { ROCKET_CHAIR } from "../../src/vehicles/vehicleProfiles.js";

const FILES = [
    ["ingredient-cheese.glb", "ingredient"],
    ["ingredient-patty.glb", "ingredient"],
    ["ingredient-tomato.glb", "ingredient"],
    ["ingredient-lettuce.glb", "ingredient"],
    ["ingredient-onion.glb", "ingredient"],
    ["burger-complete.glb", "reward"],
    ["rocket-chair-snowboard.glb", "vehicle"],
    ["dressing-firs.glb", "dressing"],
    ["dressing-pine.glb", "dressing"],
    ["dressing-bush.glb", "dressing"],
    ["dressing-rock.glb", "dressing"],
    ["camp-hut.glb", "camp"],
    ["camp-village.glb", "camp"],
];

const SEVERITY = ["error", "warning", "info", "hint"];

const OPTIMIZATION_NOTES = {
    "ingredient-cheese.glb": "folded/draped cheese slice; no texture",
    "ingredient-patty.glb": "solid patty with recessed dark grill grooves; no texture",
    "ingredient-tomato.glb": "flesh, calyx, and seed cues; no texture",
    "ingredient-lettuce.glb": "three organic layered ruffle discs; no texture",
    "ingredient-onion.glb": "authored low-poly purple onion rings; no texture",
    "burger-complete.glb": "authored stack, ruffles, rings, bun seeds; merged material primitives; no texture",
    "rocket-chair-snowboard.glb": "corrected runtime anchors, board, seat, booster, fins, vents; no texture",
    "dressing-firs.glb": "three tiered branch variants, merged at runtime",
    "dressing-pine.glb": "tiered hero pine silhouette",
    "dressing-bush.glb": "authored clustered shrub and snow caps",
    "dressing-rock.glb": "authored faceted rock cluster",
    "camp-hut.glb": "merged warm lodge with log courses, windows, counter, board, awning",
    "camp-village.glb": "three merged lodge silhouettes with tiered firs",
};

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function sha256(data) {
    return createHash("sha256").update(data).digest("hex");
}

function readGlb(data) {
    if (data.toString("ascii", 0, 4) !== "glTF") throw new Error("not a GLB");
    const jsonLength = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8").trim());
    const binHeader = 20 + jsonLength;
    const binLength = data.readUInt32LE(binHeader);
    return { json, bin: data.subarray(binHeader + 8, binHeader + 8 + binLength) };
}

function accessorValues(doc, bin, accessorIndex) {
    const accessor = doc.accessors[accessorIndex];
    const view = doc.bufferViews[accessor.bufferView];
    if (accessor.componentType !== 5126 || accessor.type !== "VEC3" || view.byteStride) {
        return [];
    }
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const out = [];
    for (let i = 0; i < accessor.count; i++) {
        const off = start + i * 12;
        out.push([bin.readFloatLE(off), bin.readFloatLE(off + 4), bin.readFloatLE(off + 8)]);
    }
    return out;
}

function rocketContract(data) {
    const { json, bin } = readGlb(data);
    const positions = [];
    const byNode = new Map();
    const rotate = (p, q) => {
        const [x, y, z] = p;
        const [qx, qy, qz, qw] = q;
        const tx = 2 * (qy * z - qz * y);
        const ty = 2 * (qz * x - qx * z);
        const tz = 2 * (qx * y - qy * x);
        return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
    };
    const transform = (p, node) => {
        if (node.matrix) {
            const m = node.matrix;
            return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
        }
        const scale = node.scale ?? [1, 1, 1];
        const scaled = [p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]];
        const rotated = rotate(scaled, node.rotation ?? [0, 0, 0, 1]);
        const t = node.translation ?? [0, 0, 0];
        return [rotated[0] + t[0], rotated[1] + t[1], rotated[2] + t[2]];
    };
    const nodeOrigin = (name) => {
        const node = (json.nodes ?? []).find((candidate) => candidate.name === name);
        return node ? transform([0, 0, 0], node) : null;
    };
    for (const node of json.nodes ?? []) {
        const mesh = node.mesh === undefined ? null : json.meshes?.[node.mesh];
        for (const primitive of mesh?.primitives ?? []) {
            const index = primitive.attributes?.POSITION;
            if (index !== undefined) {
                const transformed = accessorValues(json, bin, index).map((p) => transform(p, node));
                positions.push(...transformed);
                byNode.set(node.name, transformed);
            }
        }
    }
    const flat = positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of flat) for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], p[axis]);
        max[axis] = Math.max(max[axis], p[axis]);
    }
    // Read the live profile instead of copying its numbers into this audit.
    // `RocketChair._buildAnchors()` materialises every vector in this object
    // under the loaded GLB, so a profile edit cannot silently leave this
    // validator measuring an obsolete contract.
    const profile = {
        id: ROCKET_CHAIR.id,
        length: ROCKET_CHAIR.length,
        contactY: ROCKET_CHAIR.contactY,
        ...ROCKET_CHAIR.anchors,
    };
    const requiredAnchors = [
        "seatAnchor", "backrestTop", "cameraTarget", "cargoTrayAnchor",
        "frontContact", "rearContact", "leftEdgeContact", "rightEdgeContact",
        "mainNozzle", "leftVent", "rightVent", "exhaustDirection",
    ];
    const runtimeAnchorContract = requiredAnchors.every((name) =>
        Array.isArray(profile[name]) && profile[name].length === 3 && profile[name].every(Number.isFinite));
    const nearZ = (z, tolerance) => flat.filter((p) => Math.abs(p[2] - z) <= tolerance);
    const rangeY = (points) => points.length
        ? { count: points.length, min: Math.min(...points.map((p) => p[1])), max: Math.max(...points.map((p) => p[1])) }
        : { count: 0, min: null, max: null };
    const front = rangeY(nearZ(profile.frontContact[2], 0.12));
    const rear = rangeY(nearZ(profile.rearContact[2], 0.12));
    const deck = rangeY(byNode.get("RocketDeck") ?? []);
    const deckPoints = byNode.get("RocketDeck") ?? [];
    const seat = rangeY(byNode.get("RocketSeatPan") ?? []);
    const back = rangeY(byNode.get("RocketBack") ?? []);
    const distance = (a, b) => a && b
        ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        : Infinity;
    const seatOrigin = nodeOrigin("RocketSeatPan");
    const cargoOrigin = nodeOrigin("RocketCargoTray");
    const leftVentOrigin = nodeOrigin("RocketVent-0.105");
    const rightVentOrigin = nodeOrigin("RocketVent0.105");
    const cameraTargetInsideBounds = profile.cameraTarget.every((value, axis) => value >= min[axis] && value <= max[axis]);
    const edgeInsideDeck = profile.leftEdgeContact[0] >= min[0] && profile.rightEdgeContact[0] <= max[0];
    const deckMinX = Math.min(...deckPoints.map((p) => p[0]));
    const deckMaxX = Math.max(...deckPoints.map((p) => p[0]));
    const backrestTopMeasured = back.max;
    const checks = {
        nonEmpty: flat.length > 0,
        runtimeAnchorContract,
        length: max[2] - min[2] >= 2.48 && max[2] - min[2] <= 2.57,
        width: max[0] - min[0] >= 0.50 && max[0] - min[0] <= 0.80,
        frontContact: deck.count > 0 && Math.abs(deck.min - profile.frontContact[1]) <= 0.025 && deckPoints.some((p) => p[2] > 1.2),
        rearContact: deck.count > 0 && Math.abs(deck.min - profile.rearContact[1]) <= 0.025 && deckPoints.some((p) => p[2] < -1.2),
        seatAnchor: distance(seatOrigin, profile.seatAnchor) <= 0.025,
        backrestTop: back.count > 0 && Math.abs(backrestTopMeasured - profile.backrestTop[1]) <= 0.025,
        cameraTarget: cameraTargetInsideBounds,
        cargoTrayAnchor: distance(cargoOrigin, profile.cargoTrayAnchor) <= 0.010,
        leftEdgeContact: edgeInsideDeck && Math.abs(profile.leftEdgeContact[0]) <= Math.max(Math.abs(deckMinX), Math.abs(deckMaxX)),
        rightEdgeContact: edgeInsideDeck && Math.abs(profile.rightEdgeContact[0]) <= Math.max(Math.abs(deckMinX), Math.abs(deckMaxX)),
        nozzleClearance: min[2] <= profile.mainNozzle[2] + 0.06,
        leftVentAnchor: distance(leftVentOrigin, profile.leftVent) <= 0.010,
        rightVentAnchor: distance(rightVentOrigin, profile.rightVent) <= 0.010,
        exhaustDirection: Math.abs(Math.hypot(...profile.exhaustDirection) - 1) <= 1e-6 && profile.exhaustDirection[2] < 0,
    };
    return {
        profile,
        measured: {
            vertexCount: flat.length,
            bboxMin: min,
            bboxMax: max,
            length: max[2] - min[2],
            width: max[0] - min[0],
            frontContact: front,
            rearContact: rear,
            deck,
            deckMinX,
            deckMaxX,
            seatRegion: seat,
            backrestRegion: back,
            backrestTop: backrestTopMeasured,
            seatAnchorOrigin: seatOrigin,
            cargoTrayOrigin: cargoOrigin,
            leftVentOrigin,
            rightVentOrigin,
            anchorErrors: {
                seat: distance(seatOrigin, profile.seatAnchor),
                cargoTray: distance(cargoOrigin, profile.cargoTrayAnchor),
                leftVent: distance(leftVentOrigin, profile.leftVent),
                rightVent: distance(rightVentOrigin, profile.rightVent),
            },
        },
        checks,
        ok: Object.values(checks).every(Boolean),
    };
}

async function updateOptimizationReport(result) {
    const reportPath = path.join(REPO_ROOT, "ASSET_OPTIMIZATION_REPORT.md");
    if (!existsSync(reportPath)) return;
    const current = await readFile(reportPath, "utf8");
    const startMarker = "<!-- GENERATED:ASSET-MEASUREMENTS:START -->";
    const endMarker = "<!-- GENERATED:ASSET-MEASUREMENTS:END -->";
    const start = current.indexOf(startMarker);
    const end = current.indexOf(endMarker);
    if (start < 0 || end <= start) return;
    const rows = result.assets.map((asset) => {
        const primitives = asset.primitiveCount ?? "?";
        const draws = asset.drawCallCount ?? "?";
        return `| ${asset.file} | ${asset.totalTriangleCount ?? "?"} | ${draws} | ${primitives} | ${asset.materialCount ?? "?"} | ${asset.bytes.toLocaleString("en-US")} | ${OPTIMIZATION_NOTES[asset.file] ?? "candidate geometry; no texture"} |`;
    });
    const focalBytes = result.assets.slice(0, 7).reduce((sum, asset) => sum + asset.bytes, 0);
    const block = [
        startMarker,
        "| File | Triangles | Draw calls | Primitives | Materials | Bytes | Optimization |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
        ...rows,
        "",
        `Total: ${result.totalBytes.toLocaleString("en-US")} bytes and ${result.assets.reduce((sum, asset) => sum + (asset.totalTriangleCount ?? 0), 0).toLocaleString("en-US")} triangles across the candidate set. The original supplied runtime package was 3.31 MB for the seven focal assets before dressing; the candidate focal seven are ${focalBytes.toLocaleString("en-US")} bytes (exact values are machine-readable in \`art/generated-assets/snow-burgers/VALIDATION.json\`).`,
        endMarker,
    ].join("\n");
    const updated = current.slice(0, start) + block + current.slice(end + endMarker.length);
    await writeFile(reportPath, updated);
}

async function main() {
    const sdk = await loadGltfTransform();
    const require = createRequire(path.join(path.dirname(sdk.root), "_original-validator.cjs"));
    const validator = require("gltf-validator");
    const candidateDir = path.resolve(REPO_ROOT, "art/generated-assets/snow-burgers");
    const runtimeDir = path.resolve(REPO_ROOT, "public/assets/models/snow-burgers");
    const dir = path.resolve(REPO_ROOT, arg("--dir", "art/generated-assets/snow-burgers"));
    const validationScope = dir === runtimeDir ? "promoted-runtime" : "candidate-source";
    const out = path.resolve(REPO_ROOT, arg("--out", path.join(path.relative(REPO_ROOT, dir), "VALIDATION.json")));
    const records = [];
    let failures = 0;

    for (const [file, role] of FILES) {
        const full = path.join(dir, file);
        if (!existsSync(full)) {
            failures++;
            records.push({ file, role, missing: true, ok: false });
            console.error(`FAIL ${file}: missing`);
            continue;
        }
        const buf = await readFile(full);
        const report = await validator.validateBytes(new Uint8Array(buf), {
            uri: file,
            externalResourceFunction: (uri) => {
                throw new Error("unexpected external resource: " + uri);
            },
        });
        const counts = Object.fromEntries(SEVERITY.map((s) => [s, 0]));
        for (const msg of report.issues?.messages ?? []) counts[SEVERITY[msg.severity] ?? "info"]++;
        const ok = counts.error === 0 && (report.info?.animationsCount ?? 0) === 0 && (report.info?.skinsCount ?? 0) === 0;
        if (!ok) failures++;
        const record = {
            file,
            role,
            path: path.relative(REPO_ROOT, full),
            origin: "local Blender procedural geometry; no imported model, texture, or network input",
            provenance: "owner-directed AI-assisted Codex session; generator source is retained; no external model, texture, or network input",
            license: "Conditional output basis recorded in ASSET_LEDGER.md; no copyrightability, exclusivity, or blanket commercial-clearance conclusion",
            generatedBy: "tools/snow-burgers/generate-original-assets.py",
            generatedDate: "2026-08-07",
            bytes: buf.length,
            sha256: sha256(buf),
            validator: {
                errors: counts.error,
                warnings: counts.warning,
                infos: counts.info,
                hints: counts.hint,
                messages: (report.issues?.messages ?? [])
                    .filter((m) => m.severity <= 1)
                    .map((m) => ({ severity: SEVERITY[m.severity], code: m.code, message: m.message, pointer: m.pointer })),
            },
            extensionsUsed: report.info?.extensionsUsed ?? [],
            drawCallCount: report.info?.drawCallCount ?? null,
            primitiveCount: (() => {
                try {
                    return readGlb(buf).json.meshes?.reduce((sum, mesh) => sum + (mesh.primitives?.length ?? 0), 0) ?? null;
                } catch {
                    return null;
                }
            })(),
            materialCount: (() => {
                try {
                    return readGlb(buf).json.materials?.length ?? 0;
                } catch {
                    return null;
                }
            })(),
            totalTriangleCount: report.info?.totalTriangleCount ?? null,
            totalVertexCount: report.info?.totalVertexCount ?? null,
            animationsCount: report.info?.animationsCount ?? 0,
            skinsCount: report.info?.skinsCount ?? 0,
            ok,
        };
        if (file === "rocket-chair-snowboard.glb") {
            record.vehicleContract = rocketContract(buf);
            if (!record.vehicleContract.ok) {
                failures++;
                record.ok = false;
            }
        }
        records.push(record);
        console.error(`${record.ok ? "PASS" : "FAIL"} ${file.padEnd(31)} ${(buf.length / 1024).toFixed(1)} kB · ${counts.error} errors · ${record.totalTriangleCount ?? "?"} tris`);
    }

    let sourceRuntimeHashesMatch = null;
    if (validationScope === "promoted-runtime") {
        sourceRuntimeHashesMatch = true;
        for (const record of records) {
            const sourcePath = path.join(candidateDir, record.file);
            if (!existsSync(sourcePath)) {
                sourceRuntimeHashesMatch = false;
                continue;
            }
            const sourceHash = sha256(await readFile(sourcePath));
            if (sourceHash !== record.sha256) sourceRuntimeHashesMatch = false;
        }
        if (!sourceRuntimeHashesMatch) failures++;
    }
    const result = {
        generatedBy: "tools/snow-burgers/validate-original-assets.mjs",
        generatedDate: "2026-08-07",
        validationScope,
        candidateDirectory: path.relative(REPO_ROOT, candidateDir),
        validatedDirectory: path.relative(REPO_ROOT, dir),
        sourceGenerator: "tools/snow-burgers/generate-original-assets.py",
        provenanceStatus: validationScope === "promoted-runtime"
            ? "local-generated-promoted-runtime-conditional-output-basis"
            : "local-generated-candidate-source-conditional-output-basis",
        unresolvedReplaced: FILES.length,
        unresolvedRemainingInCandidateSet: 0,
        rightsConclusion: "The local generator imported no model, texture, or network input. OpenAI Terms of Use (https://openai.com/policies/terms-of-use/) describe user ownership of Output as between OpenAI and user, subject to input rights and non-uniqueness; Service Terms (https://openai.com/policies/service-terms/) warn code-generation output may be subject to third-party licenses. This report does not assert copyrightability, exclusivity, or blanket commercial clearance.",
        runtimePromotion: validationScope === "promoted-runtime" ? {
            promotedDate: "2026-08-07",
            sourceDirectory: path.relative(REPO_ROOT, candidateDir),
            runtimeDirectory: path.relative(REPO_ROOT, runtimeDir),
            sourceRuntimeHashesMatch,
        } : null,
        totalBytes: records.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
        assets: records,
    };
    await writeFile(out, JSON.stringify(result, null, 2) + "\n");
    if (validationScope === "candidate-source") await updateOptimizationReport(result);
    console.error(`wrote ${path.relative(REPO_ROOT, out)}`);
    if (failures) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
