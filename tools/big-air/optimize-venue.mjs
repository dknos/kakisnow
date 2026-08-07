/**
 * Turn the downloaded venue models into runtime assets.
 *
 * Same three facts the snow-burgers pipeline paid for, applied again because
 * they are properties of the renderer, not of those particular files:
 *
 *   - `KHR_materials_pbrSpecularGlossiness` must be converted OFFLINE. Babylon
 *     converts the workflow but never fills the channels the custom `rocker`
 *     shader reads, and the asset lights as fully metallic at roughness 1.
 *   - TANGENT is stripped. `rocker.fragment.wgsl` builds its frame from
 *     screen-space derivatives; an authored tangent is four dead floats.
 *   - Node transforms are baked. Sketchfab's exporter wraps everything in a
 *     Z-up node, and the placement code expects Y-up geometry at the origin.
 *
 * Triangle and texture budgets are set per prop by how close the player gets:
 * the tower and the judges' box are looked AT, the bleachers and flags are
 * repeated a hundred times down a hillside and read as silhouettes.
 *
 *   node tools/big-air/optimize-venue.mjs
 */
import { loadGltfTransform } from "../snow-burgers/gltf-lib.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { statSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SRC = "/home/nemoclaw/kakisnow/art/source-assets/big-air/";
const OUT = "/home/nemoclaw/kakisnow/public/assets/models/big-air/";

const JOBS = [
    // Repeated down both sides of the basin. Silhouette only.
    { in: "bleacher.glb", out: "venue-bleacher.glb", tris: 600, tex: 256 },
    // Repeated along the hill edges; the one spot of colour on the course.
    { in: "flag.glb", out: "venue-flag.glb", tris: 300, tex: 256 },
    { in: "windsock.glb", out: "venue-windsock.glb", tris: 550, tex: 256 },
    // Stands at the outrun; the player comes to rest looking at it.
    { in: "watchtower.glb", out: "venue-judges.glb", tris: 3500, tex: 512 },
    // One bay of scaffolding, stacked into the in-run gantry at runtime.
    { in: "scaffold.glb", out: "venue-scaffold.glb", tris: 4000, tex: 256 },
    { in: "floodlight.glb", out: "venue-floodlight.glb", tris: 900, tex: 256 },
    // Hangs from the lift line above the pipe. Seen from below, far away.
    { in: "chairlift.glb", out: "venue-chairlift.glb", tris: 1500, tex: 256 },
    // NOTE: a race arch (Sketchfab fc6fd6cf) was pulled and then deleted — its
    // texture is covered in real third-party trademarks (KMC Wheels, Rockstar,
    // "Best in the Desert"). Redistributing those in a published game is not a
    // licence question the model's CC-BY answers. The camp builds its own
    // finish arch from primitives; that stays the finish gate.
];

mkdirSync(OUT, { recursive: true });

const sdk = await loadGltfTransform();
const req = createRequire(path.join(path.dirname(sdk.root), "_r.cjs"));
const draco3d = req("draco3dgltf");
const sharp = req("sharp");
const { MeshoptSimplifier } = await import(
    pathToFileURL(req.resolve("meshoptimizer")).href
);
await MeshoptSimplifier.ready;
const f = sdk.functions;

for (const job of JOBS) {
    const io = new sdk.core.NodeIO().registerExtensions(sdk.extensions.ALL_EXTENSIONS);
    io.registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
    });
    const doc = await io.read(SRC + job.in);
    const root = doc.getRoot();

    const hadSpecGloss = root.listExtensionsUsed()
        .some((e) => e.extensionName === "KHR_materials_pbrSpecularGlossiness");
    if (hadSpecGloss) await doc.transform(f.metalRough());
    await doc.transform(f.dequantize());

    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const clear = (n) => {
        for (const c of [...n.listChildren()]) clear(c);
        f.clearNodeTransform(n);
    };
    for (const n of scene.listChildren()) clear(n);

    let before = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        before += Math.floor(
            (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3
        );
    }

    let strippedTangents = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        if (p.getAttribute("TANGENT")) { p.setAttribute("TANGENT", null); strippedTangents++; }
        if (p.getAttribute("TEXCOORD_1")) p.setAttribute("TEXCOORD_1", null);
    }

    const transforms = [f.dedup(), f.weld()];
    // Simplifying a 600-triangle bleacher below its target destroys it; only
    // reduce what is actually over budget.
    if (before > job.tris * 1.15) {
        transforms.push(f.simplify({
            simplifier: MeshoptSimplifier, ratio: job.tris / before, error: 0.05,
        }));
    }
    transforms.push(
        f.normals({ overwrite: false }),
        f.textureCompress({
            encoder: sharp, targetFormat: "webp",
            resize: [job.tex, job.tex], resizeFilter: f.TextureResizeFilter.LANCZOS3,
            quality: 84, effort: 100,
        }),
        f.prune({ keepAttributes: false }),
        f.draco({
            method: "edgebreaker",
            quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 11,
        }),
    );
    await doc.transform(...transforms);

    let after = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        after += Math.floor(
            (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3
        );
    }
    await io.write(OUT + job.out, doc);
    const b = f.getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
    console.log(
        job.out.padEnd(24),
        (statSync(SRC + job.in).size / 1024).toFixed(0) + "kB ->",
        (statSync(OUT + job.out).size / 1024).toFixed(0) + "kB,",
        before + " -> " + after + " tris,",
        root.listMeshes().length + " meshes,",
        (hadSpecGloss ? "specGloss→metalRough, " : "") +
        (strippedTangents ? `-${strippedTangents} tangents, ` : "") +
        "size " + b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join("x")
    );
}
