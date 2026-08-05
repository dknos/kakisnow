/**
 * Snow-Burgers asset optimisation — reproducible, offline, one config.
 *
 * Turns the seven supplied source GLBs into the runtime derivatives under
 * `public/assets/models/snow-burgers/`. Nothing about this runs in the browser
 * and nothing about it is manual: the settings that produced a shipped file are
 * in `PROFILES` below, and the report records which ones were used.
 *
 *   node tools/snow-burgers/optimize-assets.mjs                # all assets
 *   node tools/snow-burgers/optimize-assets.mjs cheese burger  # named subset
 *   node tools/snow-burgers/optimize-assets.mjs burger --sweep 0.04,0.08,0.16
 *
 * `--sweep` writes ratio variants to a scratch directory instead of the runtime
 * directory, so the decimation level can be chosen from rendered evidence
 * rather than from a number that looked reasonable. The chosen value then goes
 * into `PROFILES` and the normal run reproduces it exactly.
 *
 * ---------------------------------------------------------------- what and why
 *
 * TANGENT attributes are stripped, not generated. `rocker.fragment.wgsl` builds
 * its tangent frame from screen-space derivatives (`cotangentFrame`), so an
 * authored TANGENT is four floats per vertex that nothing reads.
 *
 * Textures become WebP rather than KTX2. Babylon's KTX2 transcoder defaults to
 * a Babylon CDN URL and would have to be vendored into `public/assets/decoders`
 * alongside Draco; WebP decodes natively in the browser with nothing to ship.
 * The VRAM cost of an uncompressed format is real but irrelevant at these
 * texture sizes, and a GitHub Pages build that silently fetches a decoder from
 * a third-party CDN is a worse trade.
 *
 * Geometry is Draco-compressed because the decoder is already vendored and
 * already loaded for RockerKaki, so it costs no new runtime dependency.
 *
 * Specular-glossiness materials are converted to metallic-roughness. Three of
 * the ingredients arrive as spec-gloss, and the note in `rockerKaki.js` records
 * what that does downstream: Babylon converts the workflow but never populates
 * the metallic-roughness channels the custom shader reads, so the ingredient
 * would light as fully metallic with roughness 1. Converting offline is what
 * makes the tomato read as a tomato.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
    loadGltfTransform, sha256, ASSETS, SOURCE_DIR, RUNTIME_DIR, REPO_ROOT,
} from "./gltf-lib.mjs";

/**
 * The codecs live beside whichever copy of the SDK was resolved.
 *
 * They are resolved through a `require` rooted in that directory rather than by
 * hand-built paths, so each package's own `main`/`exports` decides its entry
 * point — the layouts differ (draco3dgltf is CJS with a non-index main,
 * meshoptimizer is ESM with subpath exports) and hardcoding either is how this
 * breaks on the next version bump.
 */
function codecRequire(sdkRoot) {
    // sdkRoot is `.../node_modules/@gltf-transform`; its parent is the
    // node_modules directory the codecs are installed into.
    const modules = path.dirname(sdkRoot);
    return createRequire(path.join(modules, "_resolver.cjs"));
}

/**
 * Per-asset intent.
 *
 * `target` is the finished world size in metres and `axis` says which
 * measurement it applies to, because "how big is it" means a different span for
 * a wedge of cheese than for a board. Scaling is always uniform: these are
 * physical objects and squashing one axis to hit a number shows immediately.
 *
 * `pivot` is where local origin ends up. `base` puts it on the ground under the
 * centre of the footprint, which is what a pedestal, a shadow and a spin
 * animation all want. The rocket chair uses `base` too — the existing board
 * loader grounds on the lowest point for the same reason.
 *
 * `triangles` is a target, reached by ratio; `null` leaves the mesh alone.
 * Every non-null value here was chosen from rendered comparisons, not from a
 * size goal — see OPTIMIZATION_REPORT.md.
 */
const PROFILES = {
    cheese: {
        target: 1.10, axis: "longest", pivot: "base",
        triangles: null,
        textures: { baseColor: 512, normal: 512, other: 512 },
    },
    patty: {
        target: 1.25, axis: "longest", pivot: "base",
        triangles: null,
        textures: { baseColor: 1024, normal: 1024, other: 512 },
    },
    tomato: {
        target: 1.00, axis: "longest", pivot: "base",
        triangles: null,
        textures: { baseColor: 1024, normal: 1024, other: 512 },
    },
    lettuce: {
        target: 1.25, axis: "longest", pivot: "base",
        triangles: null,
        textures: { baseColor: 512, normal: 512, other: 512 },
    },
    onion: {
        target: 1.05, axis: "longest", pivot: "base",
        triangles: null,
        textures: { baseColor: 1024, normal: 1024, other: 512 },
    },
    burger: {
        // The reward, and the only asset with a scripted close-up. Its sesame
        // seeds and its shredded lettuce are geometry rather than texture, and
        // they are the first thing a decimator throws away — so this keeps far
        // more triangles than a 1 m prop normally would, and the budget is met
        // out of the texture allowance instead.
        target: 1.60, axis: "longest", pivot: "base",
        triangles: 220000,
        textures: { baseColor: 2048, normal: 1024, other: 1024 },
    },
    rocket: {
        // Matched to the classic board's authored length so the vehicle
        // profiles are comparable and `boardSpec.js` proportions stay readable
        // against it. Always on screen and always near the camera, so it keeps
        // a high triangle count; its surfaces are broad and smooth, which is
        // exactly what a quadric simplifier handles well.
        target: 2.524, axis: "z", pivot: "base",
        triangles: 160000,
        textures: { baseColor: 2048, normal: 1024, other: 1024 },
    },
};

/** Draco quantisation. Position bits set per-asset from its physical size. */
function dracoOptions(sizeMetres) {
    // 14 bits over the bounding box of a ~1 m prop is a 0.06 mm grid; 12 is
    // 0.25 mm. Both are far below anything visible, and the difference is
    // several hundred kilobytes on a 200k-triangle mesh. Bigger objects get a
    // bit more so the absolute precision stays comparable.
    const position = sizeMetres > 2 ? 13 : 12;
    return {
        method: "edgebreaker",
        encodeSpeed: 1,
        decodeSpeed: 5,
        quantizePosition: position,
        quantizeNormal: 8,
        quantizeTexcoord: 12,
        quantizeColor: 8,
        quantizeGeneric: 12,
    };
}

async function fileSize(p) {
    return (await stat(p)).size;
}

function countTriangles(doc) {
    let tris = 0;
    let verts = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute("POSITION");
            const idx = prim.getIndices();
            const vcount = pos ? pos.getCount() : 0;
            verts += vcount;
            const icount = idx ? idx.getCount() : vcount;
            if (prim.getMode() === 4) tris += Math.floor(icount / 3);
        }
    }
    return { triangles: tris, vertices: verts };
}

function textureReport(doc, ImageUtils) {
    let bytes = 0;
    const list = [];
    for (const tex of doc.getRoot().listTextures()) {
        const img = tex.getImage();
        const len = img ? img.byteLength : 0;
        bytes += len;
        let size = null;
        try { if (img) size = ImageUtils.getSize(img, tex.getMimeType()); } catch { /* header unreadable */ }
        list.push({
            name: tex.getName() || null,
            mimeType: tex.getMimeType(),
            width: size ? size[0] : null,
            height: size ? size[1] : null,
            bytes: len,
        });
    }
    return { bytes, list };
}

/**
 * Bake every node transform into geometry, then place the asset.
 *
 * Both steps are one concern: after this, the file's own origin and scale are
 * the ones the game wants, so no runtime code carries a magic offset for a
 * particular model. The alternative — a table of per-asset fudge transforms in
 * the placement system — is the thing `boardSpec.js` exists to argue against.
 */
function normalise(doc, sdk, profile) {
    const { core, functions } = sdk;
    const { Document } = core;
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];

    // Bake authored node transforms (the Sketchfab Z-up wrapper, the AI
    // exporter's +90° X) into the vertices.
    functions.clearNodeTransform;
    for (const node of scene.listChildren()) {
        clearRecursive(node, functions);
    }

    const before = functions.getBounds(scene);
    const size = before.max.map((v, i) => v - before.min[i]);

    const measured = profile.axis === "longest"
        ? Math.max(size[0], size[1], size[2])
        : size[{ x: 0, y: 1, z: 2 }[profile.axis]];
    const scale = profile.target / Math.max(measured, 1e-9);

    // Apply scale, then move the pivot. Order matters: the offset is measured
    // on the already-scaled bounds.
    const mat = [
        scale, 0, 0, 0,
        0, scale, 0, 0,
        0, 0, scale, 0,
        0, 0, 0, 1,
    ];
    applyToAllPrimitives(doc, functions, mat);

    const scaled = functions.getBounds(scene);
    const dx = -(scaled.min[0] + scaled.max[0]) / 2;
    const dz = -(scaled.min[2] + scaled.max[2]) / 2;
    const dy = profile.pivot === "base" ? -scaled.min[1]
        : -(scaled.min[1] + scaled.max[1]) / 2;
    applyToAllPrimitives(doc, functions, [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        dx, dy, dz, 1,
    ]);

    const after = functions.getBounds(scene);
    return {
        sourceSize: size.map((v) => +v.toFixed(6)),
        measuredAxis: profile.axis,
        measured: +measured.toFixed(6),
        scaleApplied: +scale.toFixed(8),
        finalMin: after.min.map((v) => +v.toFixed(6)),
        finalMax: after.max.map((v) => +v.toFixed(6)),
        finalSize: after.max.map((v, i) => +(v - after.min[i]).toFixed(6)),
    };
}

function clearRecursive(node, functions) {
    for (const child of [...node.listChildren()]) clearRecursive(child, functions);
    functions.clearNodeTransform(node);
}

/**
 * Apply one matrix to every primitive exactly once.
 *
 * The guard is not paranoia: a mesh referenced by two nodes would otherwise be
 * transformed twice, which scales it by the square and is silent until someone
 * looks at the model.
 */
function applyToAllPrimitives(doc, functions, matrix) {
    const seen = new Set();
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            if (seen.has(prim)) continue;
            seen.add(prim);
            functions.transformPrimitive(prim, matrix);
        }
    }
}

/**
 * Run the pipeline for one asset.
 *
 * @returns {Promise<object>} the report record
 */
async function optimise(asset, sdk, opts = {}) {
    const { core, extensions, functions } = sdk;
    const { NodeIO, ImageUtils } = core;
    const profile = { ...PROFILES[asset.key], ...(opts.profileOverride ?? {}) };
    const steps = [];
    const log = (msg) => { steps.push(msg); process.stderr.write("    " + msg + "\n"); };

    const srcPath = path.join(SOURCE_DIR, asset.source);
    const io = new NodeIO().registerExtensions(extensions.ALL_EXTENSIONS);

    const require = codecRequire(sdk.root);
    const draco3d = require("draco3dgltf");
    io.registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
    });

    const sharpMod = require("sharp");
    const { MeshoptSimplifier } = await import(
        pathToFileURL(require.resolve("meshoptimizer")).href
    );
    await MeshoptSimplifier.ready;

    const originalBytes = await fileSize(srcPath);
    const doc = await io.read(srcPath);
    const beforeGeom = countTriangles(doc);
    const beforeTex = textureReport(doc, ImageUtils);

    // ---------------------------------------------------- material workflow
    const hadSpecGloss = doc.getRoot()
        .listExtensionsUsed()
        .some((e) => e.extensionName === "KHR_materials_pbrSpecularGlossiness");
    if (hadSpecGloss) {
        await doc.transform(functions.metalRough());
        log("converted KHR_materials_pbrSpecularGlossiness → metallic-roughness");
    }

    // Quantised source attributes have to be expanded before anything measures
    // or transforms them.
    await doc.transform(functions.dequantize());

    // ---------------------------------------------------------- housekeeping
    await doc.transform(
        functions.prune({ keepAttributes: false, keepLeaves: false }),
        functions.dedup()
    );
    log("pruned unused nodes/materials/textures and deduplicated");

    // Cameras and lights belong to whoever authored the turntable, not to a
    // pickup in a snow game with its own sun and its own three cascades.
    let removed = 0;
    for (const cam of doc.getRoot().listCameras()) { cam.dispose(); removed++; }
    for (const node of doc.getRoot().listNodes()) {
        const ext = node.listExtensions().find((e) => e.extensionName === "KHR_lights_punctual");
        if (ext) { node.setExtension("KHR_lights_punctual", null); removed++; }
    }
    for (const anim of doc.getRoot().listAnimations()) { anim.dispose(); removed++; }
    if (removed) log(`removed ${removed} camera/light/animation properties`);

    // ------------------------------------------------------------ normalise
    const placement = normalise(doc, sdk, profile);
    log(
        `scaled ×${placement.scaleApplied.toFixed(5)} to ${profile.target} m ` +
        `(${profile.axis}); pivot → ${profile.pivot}`
    );

    // ------------------------------------------------------------- geometry
    await doc.transform(functions.weld());
    let simplifyNote = "not simplified";
    if (profile.triangles && beforeGeom.triangles > profile.triangles) {
        const ratio = profile.triangles / beforeGeom.triangles;
        await doc.transform(functions.simplify({
            simplifier: MeshoptSimplifier,
            ratio,
            // A hard error bound, so the simplifier stops before it starts
            // eating features even if that means missing the triangle target.
            // The target is a budget, not a quota.
            error: 0.0008,
            lockBorder: true,
        }));
        simplifyNote = `simplify ratio ${ratio.toFixed(5)} (error 0.0008, lockBorder)`;
        log(simplifyNote);
    }

    // Normals only where they are missing — an authored normal is better than a
    // recomputed one, and overwriting would flatten deliberate smoothing.
    await doc.transform(functions.normals({ overwrite: false }));

    // Tangents are dead weight: the shader builds its own frame.
    let strippedTangents = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            if (prim.getAttribute("TANGENT")) {
                prim.setAttribute("TANGENT", null);
                strippedTangents++;
            }
            // TEXCOORD_1 has no consumer either; the shader samples vUV only.
            if (prim.getAttribute("TEXCOORD_1")) prim.setAttribute("TEXCOORD_1", null);
        }
    }
    if (strippedTangents) {
        log(`stripped TANGENT from ${strippedTangents} primitive(s) — shader derives TBN`);
    }
    await doc.transform(functions.prune({ keepAttributes: false }));

    // ------------------------------------------------------------- textures
    const slotPlan = [
        [/baseColorTexture/i, profile.textures.baseColor],
        [/normalTexture/i, profile.textures.normal],
        [/(metallicRoughness|occlusion|emissive)Texture/i, profile.textures.other],
    ];
    for (const [slots, max] of slotPlan) {
        await doc.transform(functions.textureCompress({
            encoder: sharpMod,
            targetFormat: "webp",
            slots,
            resize: [max, max],
            resizeFilter: functions.TextureResizeFilter.LANCZOS3,
            // Lossy, but measured against the source renders rather than
            // assumed safe. Normal maps get a higher quality because banding in
            // a normal map reads as faceting on a smooth surface.
            quality: 90,
            effort: 100,
        }));
    }
    // Anything with no material slot at all (an orphaned image) still has to
    // leave PNG behind, or a 4096² source sneaks through unresized.
    await doc.transform(functions.textureCompress({
        encoder: sharpMod,
        targetFormat: "webp",
        resize: [profile.textures.baseColor, profile.textures.baseColor],
        resizeFilter: functions.TextureResizeFilter.LANCZOS3,
        quality: 90,
        effort: 100,
    }));
    log("textures → WebP at " + JSON.stringify(profile.textures));

    // ---------------------------------------------------------------- Draco
    const longest = Math.max(...placement.finalSize);
    await doc.transform(functions.draco(dracoOptions(longest)));
    log("Draco edgebreaker, position " + dracoOptions(longest).quantizePosition + " bits");

    // ---------------------------------------------------------------- write
    const outDir = opts.outDir ?? RUNTIME_DIR;
    await mkdir(outDir, { recursive: true });
    const outName = opts.outName ?? asset.runtime;
    const outPath = path.join(outDir, outName);
    await io.write(outPath, doc);

    const afterGeom = countTriangles(doc);
    const afterTex = textureReport(doc, ImageUtils);
    const optimizedBytes = await fileSize(outPath);

    return {
        key: asset.key,
        role: asset.role,
        source: path.relative(REPO_ROOT, srcPath),
        runtime: path.relative(REPO_ROOT, outPath),
        profile,
        steps,
        simplify: simplifyNote,
        placement,
        original: {
            bytes: originalBytes,
            sha256: await sha256(srcPath),
            triangles: beforeGeom.triangles,
            vertices: beforeGeom.vertices,
            textureBytes: beforeTex.bytes,
            textures: beforeTex.list,
        },
        optimized: {
            bytes: optimizedBytes,
            sha256: await sha256(outPath),
            triangles: afterGeom.triangles,
            vertices: afterGeom.vertices,
            textureBytes: afterTex.bytes,
            textures: afterTex.list,
            extensions: doc.getRoot().listExtensionsUsed().map((e) => e.extensionName),
        },
        budgetBytes: asset.budget,
        withinBudget: optimizedBytes <= asset.budget,
        reduction: +(100 * (1 - optimizedBytes / originalBytes)).toFixed(2),
    };
}

async function main() {
    const argv = process.argv.slice(2);
    const sweepIdx = argv.indexOf("--sweep");
    const sweep = sweepIdx >= 0 ? argv[sweepIdx + 1].split(",").map(Number) : null;
    // The index guard only applies when `--sweep` is actually present; without
    // it `sweepIdx + 1` is 0 and the first positional name is swallowed.
    const names = argv.filter(
        (a, i) => !a.startsWith("--") && !(sweepIdx >= 0 && i === sweepIdx + 1)
    );
    const selected = names.length
        ? ASSETS.filter((a) => names.includes(a.key))
        : ASSETS;

    if (!selected.length) {
        console.error("No matching assets. Known: " + ASSETS.map((a) => a.key).join(", "));
        process.exit(1);
    }

    const sdk = await loadGltfTransform();
    const records = [];

    for (const asset of selected) {
        if (!existsSync(path.join(SOURCE_DIR, asset.source))) {
            console.error(`SKIP ${asset.key}: source missing`);
            continue;
        }
        if (sweep) {
            const outDir = path.join(REPO_ROOT, "screenshots", "snow-burgers", "sweep");
            for (const tri of sweep) {
                console.error(`\n[${asset.key} @ ${tri} tris]`);
                const rec = await optimise(asset, sdk, {
                    outDir,
                    outName: `${asset.key}-${tri}.glb`,
                    profileOverride: { triangles: tri },
                });
                records.push(rec);
                console.error(
                    `  → ${(rec.optimized.bytes / 1048576).toFixed(2)} MB, ` +
                    `${rec.optimized.triangles} tris`
                );
            }
            continue;
        }
        console.error(`\n[${asset.key}]`);
        const rec = await optimise(asset, sdk);
        records.push(rec);
        console.error(
            `  → ${(rec.optimized.bytes / 1048576).toFixed(2)} MB ` +
            `(${rec.reduction}% smaller), ${rec.optimized.triangles} tris, ` +
            (rec.withinBudget ? "within budget" : "OVER BUDGET")
        );
    }

    if (!sweep) {
        const dest = path.join(SOURCE_DIR, "OPTIMIZATION_REPORT.json");
        const total = records.reduce((s, r) => s + r.optimized.bytes, 0);
        await writeFile(dest, JSON.stringify({
            generatedBy: "tools/snow-burgers/optimize-assets.mjs",
            toolVersions: sdk.versions,
            node: process.version,
            totalRuntimeBytes: total,
            preferredTotalBytes: 11 * 1024 * 1024,
            hardCeilingBytes: 15 * 1024 * 1024,
            assets: records,
        }, null, 2) + "\n");
        console.error(
            `\ntotal runtime package: ${(total / 1048576).toFixed(2)} MB` +
            `\nwrote ${path.relative(REPO_ROOT, dest)}`
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
