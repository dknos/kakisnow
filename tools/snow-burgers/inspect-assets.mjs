/**
 * Snow-Burgers asset audit — step one of the import pipeline.
 *
 * Reads every supplied source GLB and writes one machine-readable record of
 * what it actually contains, before anything is decimated, rescaled or placed
 * in the world. Nothing here modifies an asset.
 *
 * The point is that the optimisation report has something to be measured
 * against, and that a later claim about an asset can be checked rather than
 * believed. Where a property cannot be determined from the file — an authoring
 * tool's intended forward axis, a licence that was never embedded — this
 * records that it is unknown instead of guessing a plausible value.
 *
 *   node tools/snow-burgers/inspect-assets.mjs
 *   node tools/snow-burgers/inspect-assets.mjs --runtime   # audit the outputs
 *
 * Writes art/source-assets/snow-burgers/IMPORT_AUDIT.json.
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
    loadGltfTransform, sha256, ASSETS, SOURCE_DIR, RUNTIME_DIR, REPO_ROOT,
} from "./gltf-lib.mjs";

/** Extensions the shipped runtime can decode without a network fetch. */
const RUNTIME_SUPPORTED = new Set([
    // Vendored under public/assets/decoders.
    "KHR_draco_mesh_compression",
    // Browser-native decode, nothing to vendor.
    "EXT_texture_webp",
    // Core-adjacent material extensions Babylon's glTF loader handles inline.
    "KHR_materials_unlit",
    "KHR_materials_emissive_strength",
    "KHR_materials_ior",
    "KHR_materials_specular",
    "KHR_materials_clearcoat",
    "KHR_materials_sheen",
    "KHR_materials_transmission",
    "KHR_materials_volume",
    "KHR_texture_transform",
    "KHR_mesh_quantization",
    "KHR_lights_punctual",
    "KHR_materials_pbrSpecularGlossiness",
]);

/**
 * Read one GLB and describe it.
 *
 * @param {string} file absolute path
 * @param {object} sdk resolved glTF-Transform namespaces
 */
async function describe(file, sdk) {
    const { core, extensions } = sdk;
    const { NodeIO, ImageUtils } = core;

    const io = new NodeIO().registerExtensions(extensions.ALL_EXTENSIONS);
    // Draco and meshopt payloads have to be decoded to be counted. If the
    // dependency is missing the file still parses; the counts below then
    // describe the compressed placeholder, which the report must not hide.
    let decodeNote = null;
    try {
        const { default: draco3d } = await import("draco3dgltf").catch(() => ({}));
        if (draco3d) {
            io.registerDependencies({
                "draco3d.decoder": await draco3d.createDecoderModule(),
            });
        }
    } catch (err) {
        decodeNote = "draco3dgltf unavailable: " + err.message;
    }

    const bytes = (await stat(file)).size;
    const hash = await sha256(file);

    let doc;
    try {
        doc = await io.read(file);
    } catch (err) {
        return { file: path.basename(file), bytes, sha256: hash, readError: String(err) };
    }

    const root = doc.getRoot();
    const asset = root.getAsset();

    const scenes = root.listScenes();
    const nodes = root.listNodes();
    const meshes = root.listMeshes();
    const materials = root.listMaterials();
    const textures = root.listTextures();
    const animations = root.listAnimations();
    const skins = root.listSkins();
    const cameras = root.listCameras();

    // ------------------------------------------------------------- geometry
    let primitiveCount = 0;
    let triangles = 0;
    let vertices = 0;
    let morphTargets = 0;
    let withNormals = 0;
    let withTangents = 0;
    let withUV = 0;
    let withColor = 0;
    let withJoints = 0;
    const modes = new Set();
    const semantics = new Set();

    for (const mesh of meshes) {
        for (const prim of mesh.listPrimitives()) {
            primitiveCount++;
            modes.add(prim.getMode());
            const pos = prim.getAttribute("POSITION");
            const idx = prim.getIndices();
            const vcount = pos ? pos.getCount() : 0;
            vertices += vcount;
            const icount = idx ? idx.getCount() : vcount;
            // Mode 4 is TRIANGLES; 5 STRIP and 6 FAN both yield count - 2.
            const mode = prim.getMode();
            if (mode === 4) triangles += Math.floor(icount / 3);
            else if (mode === 5 || mode === 6) triangles += Math.max(0, icount - 2);
            morphTargets += prim.listTargets().length;
            for (const s of prim.listSemantics()) semantics.add(s);
            if (prim.getAttribute("NORMAL")) withNormals++;
            if (prim.getAttribute("TANGENT")) withTangents++;
            if (prim.getAttribute("TEXCOORD_0")) withUV++;
            if (prim.getAttribute("COLOR_0")) withColor++;
            if (prim.getAttribute("JOINTS_0")) withJoints++;
        }
    }

    // -------------------------------------------------------------- bounds
    // Measured over the default scene with world transforms applied, so the
    // numbers describe the asset as it would arrive in the game rather than as
    // it sits in mesh-local space.
    let bbox = null;
    try {
        const getBounds = core.getBounds ?? core.bounds;
        const scene = root.getDefaultScene() ?? scenes[0];
        if (getBounds && scene) {
            const b = getBounds(scene);
            bbox = {
                min: b.min.map((v) => +v.toFixed(6)),
                max: b.max.map((v) => +v.toFixed(6)),
                size: b.max.map((v, i) => +(v - b.min[i]).toFixed(6)),
                centre: b.max.map((v, i) => +((v + b.min[i]) / 2).toFixed(6)),
            };
        }
    } catch (err) {
        bbox = { error: String(err) };
    }

    // ------------------------------------------------------------ textures
    const textureRecords = [];
    let textureBytes = 0;
    let externalTextures = 0;
    for (const tex of textures) {
        const image = tex.getImage();
        const mime = tex.getMimeType();
        let size = null;
        try {
            if (image) size = ImageUtils.getSize(image, mime);
        } catch { /* unreadable header — reported as null */ }
        const len = image ? image.byteLength : 0;
        textureBytes += len;
        if (tex.getURI() && !image) externalTextures++;
        textureRecords.push({
            name: tex.getName() || null,
            uri: tex.getURI() || null,
            embedded: !!image,
            mimeType: mime,
            bytes: len,
            width: size ? size[0] : null,
            height: size ? size[1] : null,
        });
    }

    // ----------------------------------------------------------- materials
    const materialRecords = materials.map((m) => {
        const base = m.getBaseColorTexture();
        return {
            name: m.getName() || null,
            alphaMode: m.getAlphaMode(),
            alphaCutoff: m.getAlphaCutoff(),
            doubleSided: m.getDoubleSided(),
            baseColorFactor: m.getBaseColorFactor().map((v) => +v.toFixed(4)),
            metallic: +m.getMetallicFactor().toFixed(4),
            roughness: +m.getRoughnessFactor().toFixed(4),
            emissive: m.getEmissiveFactor().map((v) => +v.toFixed(4)),
            maps: {
                baseColor: !!base,
                metallicRoughness: !!m.getMetallicRoughnessTexture(),
                normal: !!m.getNormalTexture(),
                occlusion: !!m.getOcclusionTexture(),
                emissive: !!m.getEmissiveTexture(),
            },
            extensions: m.listExtensions().map((e) => e.extensionName),
        };
    });

    // ---------------------------------------------------------- hierarchy
    // The root nodes and their authored transforms are what a placement system
    // inherits, so they are recorded individually rather than summarised.
    const scene = root.getDefaultScene() ?? scenes[0];
    const rootNodes = (scene ? scene.listChildren() : []).map((n) => ({
        name: n.getName() || null,
        translation: n.getTranslation().map((v) => +v.toFixed(6)),
        rotation: n.getRotation().map((v) => +v.toFixed(6)),
        scale: n.getScale().map((v) => +v.toFixed(6)),
        children: n.listChildren().length,
        mesh: n.getMesh() ? (n.getMesh().getName() || "(unnamed)") : null,
    }));

    // A named-node index makes the rocket chair's part search a lookup rather
    // than a second pass over the file.
    const nodeNames = nodes.map((n) => n.getName()).filter(Boolean);

    const used = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    const required = doc.getRoot().listExtensionsRequired().map((e) => e.extensionName);

    return {
        file: path.basename(file),
        bytes,
        sha256: hash,
        decodeNote,
        generator: asset.generator ?? null,
        gltfVersion: asset.version ?? null,
        copyright: asset.copyright ?? null,
        extras: root.getExtras() ?? null,
        extensionsUsed: used,
        extensionsRequired: required,
        extensionsUnsupportedByRuntime: used.filter((e) => !RUNTIME_SUPPORTED.has(e)),
        counts: {
            scenes: scenes.length,
            nodes: nodes.length,
            rootNodes: rootNodes.length,
            meshes: meshes.length,
            primitives: primitiveCount,
            triangles,
            vertices,
            materials: materials.length,
            textures: textures.length,
            animations: animations.length,
            skins: skins.length,
            cameras: cameras.length,
            morphTargets,
        },
        animationNames: animations.map((a) => a.getName() || "(unnamed)"),
        attributes: {
            semantics: [...semantics].sort(),
            primitivesWithNormals: withNormals,
            primitivesWithTangents: withTangents,
            primitivesWithUV0: withUV,
            primitivesWithVertexColor: withColor,
            primitivesWithSkinWeights: withJoints,
            primitiveModes: [...modes].sort(),
        },
        bbox,
        rootNodes,
        nodeNames,
        materials: materialRecords,
        textures: textureRecords,
        textureBytes,
        externalTextures,
        payloadSplit: {
            textureBytes,
            // Everything that is not an image: buffers, JSON, padding.
            nonTextureBytes: bytes - textureBytes,
            texturePercent: bytes > 0 ? +((textureBytes / bytes) * 100).toFixed(1) : 0,
        },
    };
}

async function main() {
    const runtimeMode = process.argv.includes("--runtime");
    const dir = runtimeMode ? RUNTIME_DIR : SOURCE_DIR;
    const sdk = await loadGltfTransform();

    const records = [];
    for (const a of ASSETS) {
        const file = path.join(dir, runtimeMode ? a.runtime : a.source);
        if (!existsSync(file)) {
            records.push({ key: a.key, missing: file });
            console.error(`MISSING  ${a.key}: ${file}`);
            continue;
        }
        process.stderr.write(`inspecting ${a.key} … `);
        const rec = await describe(file, sdk);
        records.push({
            key: a.key,
            role: a.role,
            runtimeName: a.runtime,
            budgetBytes: a.budget,
            originalWindowsPath: runtimeMode ? undefined : a.origin,
            ...rec,
        });
        const c = rec.counts ?? {};
        console.error(
            `${(rec.bytes / 1048576).toFixed(2)} MB · ${c.triangles ?? "?"} tris · ` +
            `${c.textures ?? "?"} tex (${rec.payloadSplit?.texturePercent ?? "?"}% of bytes)`
        );
    }

    const out = {
        generatedBy: "tools/snow-burgers/inspect-assets.mjs",
        target: runtimeMode ? "runtime" : "source",
        directory: path.relative(REPO_ROOT, dir),
        toolVersions: sdk.versions,
        node: process.version,
        runtimeSupportedExtensions: [...RUNTIME_SUPPORTED].sort(),
        provenanceNote:
            "These files were supplied from the project owner's local Downloads " +
            "folder. Nothing in them establishes a licence: `copyright` and " +
            "`extras` are reported exactly as embedded, and where they are null " +
            "the redistribution status is unresolved rather than permissive.",
        assets: records,
    };

    const dest = path.join(
        SOURCE_DIR, runtimeMode ? "RUNTIME_AUDIT.json" : "IMPORT_AUDIT.json"
    );
    await writeFile(dest, JSON.stringify(out, null, 2) + "\n");
    console.error("\nwrote " + path.relative(REPO_ROOT, dest));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
